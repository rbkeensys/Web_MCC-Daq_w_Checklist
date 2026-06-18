# server/vfd_driver.py
"""
Modbus-RTU driver for Chinese VFD motor drives over RS-485.

Currently supports two drives via per-drive *profiles*:

  * ATO GK3000  (e.g. GK3000-2S0037G, 220 V 1-phase in / 3-phase out, 3.7 kW)
  * QNK  H100   (a.k.a. H100 / V70 family)

Both speak Modbus RTU, but their register maps differ substantially, so each
drive is described by a VFDProfile (addresses, scaling, code maps) and a single
VFDController talks to whichever profile it is handed. Adding a third drive is
just one more profile -- no controller changes.

------------------------------------------------------------------------------
DESIGN NOTES / PROTOCOL FACTS (verified against the manufacturer manuals)
------------------------------------------------------------------------------
GK3000  (manual Ch.9):
  * Function codes: 0x03 read, 0x06 write (volatile), 0x07 write (saved).
  * Param  P<g>.<r>      -> register 0xF0<g><r>   (P0.03 -> 0xF003)
  * Status reads         -> 0x5001 freq, 0x5002 busV, 0x5003 outV,
                            0x5004 current, 0x5005 power, 0x5006 torque
  * Frequency SETPOINT   -> 0x5000, signed, +/-10000 = +/-100.00% of MAX freq
                            (NOT Hz -- a percentage of P0 max frequency!)
  * Control word         -> 0x6000 : 1=fwd run, 2=rev run, 5=free stop,
                            6=decel stop, 7=fault reset
  * Fault code           -> 0x8000 (table below)
  * Current resolution   -> PC.06 (0=0.01 A, 1=0.1 A)
  * REQUIRED SETUP        : P0.03 = 2 (command source = serial), or 0x6000
                            writes are ignored. Default address PC.02 = 0 is
                            BROADCAST -- set it to 1+ for point-to-point.

H100  (manual 6.10):
  * Function codes: 0x01/0x03/0x04 read, 0x05 coil write, 0x06/0x10 reg write.
  * Frequency is DIRECT in 0.1 Hz units (300 -> 30.0 Hz), NOT a percentage.
  * Frequency SETPOINT   -> holding reg 0x0201 (when F002=2; RAM only, no EEPROM)
  * Run control (coils, write 0xFF00 to act):
        0x0049 forward, 0x004A reverse, 0x004B stop,
        0x004E jog-fwd, 0x004F jog-rev
  * Status / monitor (input regs, fn 0x04) at 0x0000+:
        0000 out freq, 0001 set freq, 0002 current, 0003 speed(rpm),
        0004 DC bus V, 0005 AC out V, 0006 temperature, 0009 PID fb,
        000A current fault, 000B run hours, 000C output power
        (also mirror-mapped as holding regs at 0x0220+ for fn 0x03)
  * Run-state coils (fn 0x01) 0x0000+: 0=operation,1=jog,2=fwd/rev,3=in-op...
  * REQUIRED SETUP        : F001=2 (run source = comms), F002=2 (freq source
                            = comms), F169=0 (standard Modbus). Default baud
                            F164=2 is 19200 (NOT 9600).

Both use the standard Modbus CRC-16 (poly 0xA001, init 0xFFFF, low byte first).
"""
from __future__ import annotations

__version__ = "1.1.0"
__updated__ = "2026-06-15"
# 1.1.0: parameter read/write-by-register. param_to_register() per-profile (GK3000
#   P<g>.<r>->0xF0gr, verified vs manual P0.03/P6.10/PB.16; H100 F<nnn>->hex(nnn); raw
#   #0xADDR). read_param / write_param_verified (read-before-write + read-back verify gated
#   by register type -- command/coil regs never verified). write_setup_params +
#   build_gk3000_motor_setup (verified P8 nameplate + P0 freq-limit addresses; H100 returns
#   [] -- no invented addresses). VFDWorker thread owns ALL serial I/O: bounded non-blocking
#   write queue, watch-list snapshot, poll_rate (0=continuous), writes-drained-before-reads,
#   adjacent-address block-read coalescing, every exception contained. VFDManager adds
#   start_workers/stop_workers/set_watch_all/request_write/snapshot_all (snapshot_all is the
#   in-memory, NON-BLOCKING source the acq loop should use instead of status_all).
#   discover_vfd_params() scans expressions to build the watch list. MotorConfig gains
#   rated_kw/rated_voltage_v. Companion vfd_params_gk3000.json describes every GK3000 param.

import time
import struct
import threading
import logging
from dataclasses import dataclass, field
from typing import Optional, Dict, List, Callable, Tuple

try:
    import serial  # pyserial
    import serial.tools.list_ports
    _HAVE_SERIAL = True
except Exception:                       # pragma: no cover - import guard
    serial = None
    _HAVE_SERIAL = False

log = logging.getLogger("vfd")


# ===========================================================================
#  Modbus RTU CRC-16  (standard, poly 0xA001) -- identical result on both drives
# ===========================================================================
def modbus_crc16(data: bytes) -> int:
    """Return the 16-bit Modbus CRC. The on-wire order is low byte first;
    callers append struct.pack('<H', crc)."""
    crc = 0xFFFF
    for b in data:
        crc ^= b
        for _ in range(8):
            if crc & 1:
                crc = (crc >> 1) ^ 0xA001
            else:
                crc >>= 1
    return crc & 0xFFFF


# ===========================================================================
#  Drive profile
# ===========================================================================
# Frequency-setpoint encodings:
FREQ_PERCENT_OF_MAX = "percent_of_max"   # GK3000: +/-10000 = +/-100% of max Hz
FREQ_DIRECT_01HZ    = "direct_0.1hz"     # H100  : value is Hz * 10

# How a "run" command is issued:
RUN_CONTROL_WORD = "control_word"        # GK3000: one reg, coded values
RUN_COILS        = "coils"               # H100  : separate fwd/rev/stop coils


@dataclass
class VFDProfile:
    name: str

    # ---- serial defaults (user-overridable at construction) -------------
    default_baud: int
    default_parity: str          # 'N' | 'E' | 'O'
    default_stopbits: float
    default_address: int

    # ---- frequency setpoint ---------------------------------------------
    freq_setpoint_reg: int
    freq_setpoint_mode: str
    freq_setpoint_fn: int        # write function code (0x06 etc.)

    # ---- run / direction control ----------------------------------------
    run_mode: str
    # control-word style:
    control_reg: int = 0
    control_fn: int = 0x06
    cw_forward: int = 0
    cw_reverse: int = 0
    cw_stop: int = 0
    cw_fault_reset: int = 0
    # coil style:
    coil_forward: int = 0
    coil_reverse: int = 0
    coil_stop: int = 0
    coil_fault_reset: int = 0
    coil_fn: int = 0x05
    coil_on_value: int = 0xFF00

    # ---- monitor / status reads -----------------------------------------
    read_fn: int = 0x03
    reg_out_freq: int = 0
    reg_set_freq: int = -1
    reg_bus_voltage: int = -1
    reg_out_voltage: int = -1
    reg_out_current: int = -1
    reg_out_power: int = -1
    reg_out_torque: int = -1
    reg_out_speed: int = -1          # H100 reports rpm directly here
    reg_temperature: int = -1
    reg_run_hours: int = -1
    reg_fault: int = -1
    reg_runstate: int = -1           # status word (direction/run bits)

    # ---- scaling (raw -> engineering) -----------------------------------
    freq_read_scale: float = 0.01    # GK3000 0x500x freq regs are 0.01 Hz
    current_scale: float = 0.01      # A per count (GK3000 depends on PC.06)
    voltage_scale: float = 1.0       # V per count
    bus_voltage_scale: float = 1.0
    power_scale: float = 1.0
    speed_scale: float = 1.0
    temp_scale: float = 1.0

    # ---- direction / run decode -----------------------------------------
    # Given the raw runstate word, return (enabled: bool, reverse: bool|None)
    decode_runstate: Optional[Callable[[int], Tuple[bool, Optional[bool]]]] = None

    # ---- fault-code text ------------------------------------------------
    fault_text: Dict[int, str] = field(default_factory=dict)

    # ---- required-setup parameters (for setup helper / documentation) ----
    # ---- baud-change feature: param token + baud->code map (from manual) --
    baud_param: str = ""
    baud_code_map: Dict[int, int] = field(default_factory=dict)

    setup_hints: List[str] = field(default_factory=list)

    def fault_to_text(self, code: int) -> str:
        if code in self.fault_text:
            return self.fault_text[code]
        return "no fault" if code == 0 else f"fault 0x{code:04X}"


# ---------------------------------------------------------------------------
#  GK3000 fault table (manual Ch.9, 0x8000)
# ---------------------------------------------------------------------------
_GK3000_FAULTS = {
    0x0000: "no fault",
    0x0001: "accel overcurrent",
    0x0002: "decel overcurrent",
    0x0003: "constant-speed overcurrent",
    0x0004: "accel overvoltage",
    0x0005: "decel overvoltage",
    0x0006: "constant-speed overvoltage",
    0x0007: "contactor fault",
    0x0008: "VFD overheating",
    0x0009: "VFD overload",
    0x000A: "motor overload",
    0x000B: "undervoltage",
    0x000C: "output phase loss",
    0x000D: "external device fault",
    0x000E: "current-detection circuit fault",
    0x000F: "RS232/485 communication fault",
    0x0010: "system interference",
    0x0011: "EEPROM read/write error",
    0x0012: "motor parameter self-learning fault",
    0x0013: "input phase loss",
    0x0014: "short circuit to ground",
    0x0015: "encoder fault",
    0x0016: "control power fault",
    0x0017: "run-time reached",
    0x0018: "power-on time reached",
    0x0019: "motor-switch fault during run",
    0x001A: "wave-by-wave current limit",
    0x001B: "motor over-temperature",
    0x001C: "speed deviation too large",
    0x001D: "motor overspeed",
    0x001E: "offload during operation",
    0x001F: "PID feedback lost",
    0x0020: "user-defined fault 1",
    0x0022: "contactor fault",
    0x0023: "short to ground",
    0x0028: "user-defined fault 2",
}


def _gk3000_decode_runstate(_word: int):
    # GK3000 has no single tidy run/dir status word at 0x500x in the same way;
    # run/dir is inferred from output frequency sign + last command instead.
    # We return (None-ish) and let the controller fall back to its own state.
    return (None, None)


# ---------------------------------------------------------------------------
#  H100 fault table (manual 6.10 "Fault code", decimal codes).
#  Suffix S/A/d/n = +0/+1/+2/+3 (manual Note 2). Base names below; the +1..+3
#  variants are generated programmatically.
# ---------------------------------------------------------------------------
def _build_h100_faults() -> Dict[int, str]:
    bases = {
        64:  ("E.OC", "overcurrent"),
        80:  ("E.oU", "overvoltage"),
        88:  ("E.Lu", "undervoltage"),
        92:  ("E.oH", "overheat"),
        96:  ("E.oL", "overload"),
        100: ("E.oA", "drive overload"),
        104: ("E.oT", "over-torque"),
    }
    suffixes = ["S", "A", "d", "n"]
    out = {0: "no fault"}
    for base, (code_name, desc) in bases.items():
        for i, suf in enumerate(suffixes):
            out[base + i] = f"{code_name}.{suf} ({desc})"
    return out


def _h100_decode_runstate(word: int):
    # H100 0x0210 main control/state bits mirror parameter addresses 0x0000+:
    #   bit0 = operation (1=running), bit2 = fwd/rev (1=reverse)
    enabled = bool(word & 0x0001)
    reverse = bool(word & 0x0004)
    return (enabled, reverse)


# ---------------------------------------------------------------------------
#  The two shipped profiles
# ---------------------------------------------------------------------------
GK3000 = VFDProfile(
    name="ATO GK3000",
    default_baud=9600, default_parity="N", default_stopbits=2, default_address=1,
    freq_setpoint_reg=0x5000, freq_setpoint_mode=FREQ_PERCENT_OF_MAX, freq_setpoint_fn=0x06,
    run_mode=RUN_CONTROL_WORD,
    control_reg=0x6000, control_fn=0x06,
    cw_forward=0x0001, cw_reverse=0x0002, cw_stop=0x0005, cw_fault_reset=0x0007,
    read_fn=0x03,
    reg_out_freq=0x5001, reg_bus_voltage=0x5002, reg_out_voltage=0x5003,
    reg_out_current=0x5004, reg_out_power=0x5005, reg_out_torque=0x5006,
    reg_fault=0x8000,
    freq_read_scale=0.01, current_scale=0.01, voltage_scale=1.0,
    bus_voltage_scale=1.0, power_scale=0.1,
    decode_runstate=_gk3000_decode_runstate,
    baud_param="PC.00",
    baud_code_map={300:0, 600:1, 1200:2, 2400:3, 4800:4, 9600:5, 19200:6, 38400:7, 57600:8, 115200:9},
    fault_text=_GK3000_FAULTS,
    setup_hints=[
        "P0.03 = 2  (command source = serial; else 0x6000 writes are ignored)",
        "PC.02 = 1+ (local address; default 0 = broadcast = no reply)",
        "PC.00 = 5  (9600 bps) to match default_baud",
        "PC.01 = 0  (8-N-2) to match default parity/stop",
        "PC.05 = 1  (standard Modbus) recommended",
        "Read PC.06 to know current resolution (0=0.01A, 1=0.1A).",
    ],
)

H100 = VFDProfile(
    name="QNK H100",
    default_baud=19200, default_parity="N", default_stopbits=1, default_address=1,
    freq_setpoint_reg=0x0201, freq_setpoint_mode=FREQ_DIRECT_01HZ, freq_setpoint_fn=0x06,
    run_mode=RUN_COILS,
    coil_forward=0x0049, coil_reverse=0x004A, coil_stop=0x004B,
    coil_fault_reset=0x0000, coil_fn=0x05, coil_on_value=0xFF00,
    read_fn=0x04,                      # input registers at 0x0000+
    reg_out_freq=0x0000, reg_set_freq=0x0001, reg_out_current=0x0002,
    reg_out_speed=0x0003, reg_bus_voltage=0x0004, reg_out_voltage=0x0005,
    reg_temperature=0x0006, reg_run_hours=0x000B, reg_out_power=0x000C,
    reg_fault=0x000A, reg_runstate=0x0210,
    freq_read_scale=0.1, current_scale=0.1, voltage_scale=1.0,
    bus_voltage_scale=1.0, power_scale=0.1, speed_scale=1.0, temp_scale=1.0,
    decode_runstate=_h100_decode_runstate,
    baud_param="F164",
    baud_code_map={4800:0, 9600:1, 19200:2, 38400:3},
    fault_text=_build_h100_faults(),
    setup_hints=[
        "F001 = 2  (run command source = communication)",
        "F002 = 2  (frequency source = communication; setpoint reg 0x0201)",
        "F163 = 1+ (communication address)",
        "F164 = 1  (9600) if you prefer; default 2 = 19200",
        "F165 = 3  (8-N-1 RTU)",
        "F169 = 0  (Standard Modbus protocol)",
    ],
)

PROFILES: Dict[str, VFDProfile] = {
    "gk3000": GK3000,
    "h100":   H100,
}


# ===========================================================================
#  Motor configuration (for RPM <-> Hz conversion)
# ===========================================================================
@dataclass
class MotorConfig:
    """Nameplate data needed to convert between RPM and Hz and to clamp safely.

    RPM and Hz relate by  Hz = rpm * poles / 120  (synchronous; slip ignored).
    If you give rated_rpm + rated_hz instead of poles, the synchronous speed
    and pole count are inferred from those.
    """
    poles: int = 4
    rated_hz: float = 50.0
    rated_rpm: float = 1440.0       # nameplate (already includes slip)
    rated_current_a: float = 0.0
    rated_kw: float = 0.0           # nameplate power (for P8.01 motor setup)
    rated_voltage_v: float = 0.0    # nameplate voltage (for P8.02 motor setup)
    max_hz: float = 50.0            # drive max output freq (GK3000 % base)
    min_hz: float = 0.0
    accel_s: float = 10.0
    decel_s: float = 10.0

    def sync_rpm_at(self, hz: float) -> float:
        return 120.0 * hz / max(1, self.poles)

    def hz_for_rpm(self, rpm: float) -> float:
        """Convert a desired shaft RPM to a commanded Hz. Uses the nameplate
        rated_rpm/rated_hz ratio when available (accounts for slip), else the
        synchronous relation from pole count."""
        if self.rated_rpm > 0 and self.rated_hz > 0:
            return rpm * (self.rated_hz / self.rated_rpm)
        return rpm * self.poles / 120.0

    def rpm_for_hz(self, hz: float) -> float:
        if self.rated_rpm > 0 and self.rated_hz > 0:
            return hz * (self.rated_rpm / self.rated_hz)
        return 120.0 * hz / max(1, self.poles)


# ===========================================================================
#  Exceptions
# ===========================================================================
class VFDError(Exception):
    pass


class VFDCommError(VFDError):
    pass


class VFDModbusException(VFDError):
    """Drive returned a Modbus exception response (function | 0x80)."""
    def __init__(self, function: int, code: int):
        self.function = function
        self.code = code
        super().__init__(f"Modbus exception fn=0x{function:02X} code=0x{code:02X}")


# ===========================================================================
#  Controller
# ===========================================================================
class VFDController:
    """Owns the serial port and talks to one VFD via its profile.

    Safety model:
      * Writes are refused until at least one successful read has happened
        (proves we are talking to the right device on the right port).
      * set_rpm / set_frequency clamp to the configured min/max Hz.
      * A comms watchdog can auto-stop the drive if polling stops (call
        poke_watchdog() from your acquisition loop; start_watchdog() arms it).
    """

    def __init__(self, profile: VFDProfile, port: str,
                 baud: Optional[int] = None, parity: Optional[str] = None,
                 stopbits: Optional[float] = None, address: Optional[int] = None,
                 timeout: float = 0.5, motor: Optional[MotorConfig] = None):
        if not _HAVE_SERIAL:
            raise VFDError("pyserial is not available; cannot open a VFD port")
        self.profile = profile
        self.port = port
        self.baud = baud if baud is not None else profile.default_baud
        self.parity = (parity or profile.default_parity).upper()
        self.stopbits = stopbits if stopbits is not None else profile.default_stopbits
        self.address = address if address is not None else profile.default_address
        self.timeout = timeout
        self.motor = motor or MotorConfig()

        self.ser: Optional["serial.Serial"] = None
        self.connected = False
        self._io_lock = threading.RLock()
        self._proved_read = False         # gate writes until a read succeeds
        self._last_write_fault = None      # most recent failed param write
        self._last_dir_reverse = False     # remembered commanded direction
        self._enabled = False              # remembered commanded enable

        # watchdog
        self._wd_timeout = 0.0
        self._wd_last = 0.0
        self._wd_thread: Optional[threading.Thread] = None
        self._wd_stop = threading.Event()

    # ---- connection ------------------------------------------------------
    def connect(self, quiet: bool = False) -> bool:
        sb = {1: serial.STOPBITS_ONE, 2: serial.STOPBITS_TWO}.get(
            int(self.stopbits), serial.STOPBITS_ONE)
        par = {"N": serial.PARITY_NONE, "E": serial.PARITY_EVEN,
               "O": serial.PARITY_ODD}.get(self.parity, serial.PARITY_NONE)
        try:
            self.ser = serial.Serial(
                port=self.port, baudrate=self.baud, bytesize=serial.EIGHTBITS,
                parity=par, stopbits=sb, timeout=self.timeout,
                write_timeout=self.timeout)
            self.connected = True
            # NOTE: opening the port proves nothing about the drive -- it only
            # means the OS handed us the COM port. "Verified" status comes from a
            # successful probe/read (see _probe / check_drives), which checks CRC
            # and slave address. Keep this log honest so a baud scan does not look
            # like four successful connections.
            if quiet:
                log.debug("VFD %s opened %s @ %d %s%d (unverified)",
                          self.profile.name, self.port, self.baud,
                          self.parity, int(self.stopbits))
            else:
                log.info("VFD %s opened serial port %s @ %d %s%d "
                         "(Modbus not yet verified)", self.profile.name,
                         self.port, self.baud, self.parity, int(self.stopbits))
            return True
        except Exception as e:
            self.connected = False
            log.error("VFD connect failed on %s: %s", self.port, e)
            return False

    def disconnect(self):
        self.stop_watchdog()
        if self.ser and self.ser.is_open:
            try:
                self.ser.close()
            except Exception:
                pass
        self.connected = False

    @staticmethod
    def list_ports() -> List[str]:
        if not _HAVE_SERIAL:
            return []
        return [p.device for p in serial.tools.list_ports.comports()]

    # ---- low-level Modbus -----------------------------------------------
    def _txn(self, request_pdu: bytes, expected_len: int) -> bytes:
        """Send addr+PDU+CRC, read a full reply, verify CRC, return the reply
        WITHOUT the trailing CRC. Raises VFDModbusException / VFDCommError."""
        if not self.ser or not self.ser.is_open:
            raise VFDCommError("serial port not open")
        frame = bytes([self.address]) + request_pdu
        frame += struct.pack("<H", modbus_crc16(frame))
        with self._io_lock:
            self.ser.reset_input_buffer()
            self.ser.write(frame)
            # Read address+function first to detect exception responses early.
            head = self.ser.read(2)
            if len(head) < 2:
                raise VFDCommError("no response (timeout)")
            addr, fn = head[0], head[1]
            if fn & 0x80:
                code = self.ser.read(1)
                self.ser.read(2)   # consume CRC
                ex = code[0] if code else 0
                raise VFDModbusException(fn & 0x7F, ex)
            rest = self.ser.read(expected_len - 2 + 2)  # remainder + CRC
            reply = head + rest
        if len(reply) < expected_len + 2:
            raise VFDCommError(
                f"short reply: got {len(reply)} want {expected_len + 2}")
        body, crc_rx = reply[:-2], struct.unpack("<H", reply[-2:])[0]
        if modbus_crc16(body) != crc_rx:
            raise VFDCommError("CRC mismatch")
        if body[0] != self.address:
            raise VFDCommError(
                f"address mismatch: got {body[0]} want {self.address}")
        return body

    def read_registers(self, start: int, count: int,
                        fn: Optional[int] = None) -> List[int]:
        """Read `count` 16-bit registers. fn defaults to the profile read fn
        (0x03 holding for GK3000, 0x04 input for H100)."""
        fn = fn if fn is not None else self.profile.read_fn
        pdu = bytes([fn, (start >> 8) & 0xFF, start & 0xFF,
                     (count >> 8) & 0xFF, count & 0xFF])
        # reply: addr, fn, bytecount, data(2*count)
        expected = 3 + 2 * count
        body = self._txn(pdu, expected)
        nbytes = body[2]
        data = body[3:3 + nbytes]
        regs = [struct.unpack(">H", data[i:i + 2])[0]
                for i in range(0, len(data), 2)]
        self._proved_read = True
        self._wd_last = time.time()
        return regs

    def read_register(self, addr: int, fn: Optional[int] = None) -> int:
        return self.read_registers(addr, 1, fn=fn)[0]

    def write_register(self, addr: int, value: int,
                       fn: Optional[int] = None) -> None:
        """Write a single holding register (fn 0x06 by default) OR a coil
        (fn 0x05) -- both are 'addr, hi, lo' on the wire and echo the request."""
        if not self._proved_read:
            raise VFDError(
                "refusing to write before a successful read "
                "(call read_status() first to confirm the link)")
        fn = fn if fn is not None else 0x06
        v = value & 0xFFFF
        pdu = bytes([fn, (addr >> 8) & 0xFF, addr & 0xFF,
                     (v >> 8) & 0xFF, v & 0xFF])
        expected = 6   # addr, fn, ahi, alo, vhi, vlo
        self._txn(pdu, expected)

    # ---- write API -------------------------------------------------------
    def _apply_run(self, reverse: bool):
        p = self.profile
        if p.run_mode == RUN_CONTROL_WORD:
            self.write_register(p.control_reg,
                                p.cw_reverse if reverse else p.cw_forward,
                                fn=p.control_fn)
        else:  # RUN_COILS
            coil = p.coil_reverse if reverse else p.coil_forward
            self.write_register(coil, p.coil_on_value, fn=p.coil_fn)

    def enable(self, reverse: Optional[bool] = None):
        """Start the drive (in the last/!given direction)."""
        if reverse is None:
            reverse = self._last_dir_reverse
        self._apply_run(reverse)
        self._enabled = True
        self._last_dir_reverse = reverse

    def disable(self):
        """Stop the drive."""
        p = self.profile
        if p.run_mode == RUN_CONTROL_WORD:
            self.write_register(p.control_reg, p.cw_stop, fn=p.control_fn)
        else:
            self.write_register(p.coil_stop, p.coil_on_value, fn=p.coil_fn)
        self._enabled = False

    def set_direction(self, reverse: bool):
        """Set rotation direction. If running, re-issues run in the new
        direction; if stopped, just remembers it for the next enable()."""
        self._last_dir_reverse = reverse
        if self._enabled:
            self._apply_run(reverse)

    def set_frequency(self, hz: float):
        """Command an output frequency in Hz (clamped to motor min/max)."""
        p = self.profile
        hz = max(self.motor.min_hz, min(self.motor.max_hz, float(hz)))
        if p.freq_setpoint_mode == FREQ_DIRECT_01HZ:
            raw = int(round(hz * 10.0)) & 0xFFFF
        elif p.freq_setpoint_mode == FREQ_PERCENT_OF_MAX:
            base = self.motor.max_hz if self.motor.max_hz > 0 else p_default_max(p)
            pct = 0.0 if base <= 0 else (hz / base) * 10000.0
            pct = max(-10000.0, min(10000.0, pct))
            raw = int(round(pct)) & 0xFFFF       # signed stored as two's comp
        else:
            raise VFDError(f"unknown setpoint mode {p.freq_setpoint_mode}")
        self.write_register(p.freq_setpoint_reg, raw, fn=p.freq_setpoint_fn)

    def set_rpm(self, rpm: float):
        """Command a shaft speed in RPM (converted to Hz via MotorConfig)."""
        self.set_frequency(self.motor.hz_for_rpm(float(rpm)))

    def fault_reset(self):
        p = self.profile
        if p.run_mode == RUN_CONTROL_WORD:
            self.write_register(p.control_reg, p.cw_fault_reset, fn=p.control_fn)
        elif p.coil_fault_reset:
            self.write_register(p.coil_fault_reset, p.coil_on_value, fn=p.coil_fn)
        else:
            # H100 clears faults via F172=1 (a parameter write).
            self.write_drive_param(0x00AC, 1)   # F172 -> 0x00AC

    def set_motor_config(self, motor: MotorConfig):
        self.motor = motor

    def write_drive_param(self, register: int, value: int, save: bool = False):
        """Guarded raw parameter write (for setup registers like P0.03/F001).
        `save` selects GK3000's 0x07 (persist) where supported."""
        fn = 0x06
        if save and self.profile.run_mode == RUN_CONTROL_WORD:
            fn = 0x07
        self.write_register(register, value, fn=fn)

    # ---- parameter read / write by NAME ("P0.03", "F100", "#0x5004") -----
    def read_param(self, token: str) -> int:
        """Read a parameter by its drive-native token. Returns the raw 16-bit
        register value. Raises VFDParamError for a bad token, VFDError on I/O.

        Param registers are read with fn 0x03 (holding) on both drives -- even
        on the H100, whose *status* regs are input regs (0x04) but whose F-code
        parameters are holding regs (0x03)."""
        addr, _is_raw = param_to_register(self.profile, token)
        return self.read_register(addr, fn=0x03)

    def write_param_verified(self, token: str, value: int, save: bool = False,
                             verify: "Optional[bool]" = None) -> "Dict[str, object]":
        """Read-before-write + optional read-back confirm for a named param.

        Behavior (matches the agreed safety model):
          1. Translate the token to a Modbus address (per-profile).
          2. READ the current value. If it already equals `value`, do nothing
             (protects EEPROM / avoids bus traffic) and report unchanged.
          3. Otherwise WRITE it.
          4. If verify is enabled AND the register is verifiable (a real
             parameter, not a command/coil register), READ it back and compare.
             Mismatch is reported (and logged) but not raised -- the caller can
             branch on the returned status.

        `verify` default: True for named params, never for raw #ADDR (those may
        be command registers that don't read back what you wrote).

        Returns a status dict:
          {token, address, requested, before, after, changed, verified,
           ok, error}
        """
        result = {
            "token": token, "requested": int(value),
            "before": None, "after": None, "changed": False,
            "verified": False, "ok": False, "error": None,
        }
        try:
            addr, is_raw = param_to_register(self.profile, token)
            result["address"] = addr
            if verify is None:
                verify = not is_raw          # verify named params, not raw addr
            target = int(value) & 0xFFFF

            # 1) read-before-write
            try:
                before = self.read_register(addr, fn=0x03)
                result["before"] = before
            except VFDError:
                before = None                 # some write-only regs won't read

            # 2) skip if already at target (only when we could read it)
            if before is not None and before == target:
                result["changed"] = False
                result["after"] = before
                result["ok"] = True
                return result

            # 3) write
            fn = 0x06
            if save and self.profile.run_mode == RUN_CONTROL_WORD:
                fn = 0x07
            self.write_register(addr, target, fn=fn)
            result["changed"] = True

            # 4) verify (only verifiable registers)
            if verify and _param_is_verifiable(self.profile, addr, is_raw):
                try:
                    after = self.read_register(addr, fn=0x03)
                    result["after"] = after
                    result["verified"] = True
                    if after != target:
                        result["ok"] = False
                        result["error"] = (
                            f"verify mismatch: wrote {target} to 0x{addr:04X}, "
                            f"read back {after}")
                        self._note_write_fault(token, result["error"])
                        log.warning("VFD %s param %s: %s",
                                    self.profile.name, token, result["error"])
                        return result
                except VFDError as e:
                    # write echoed OK but read-back failed -- report, don't raise
                    result["error"] = f"verify read failed: {e}"
                    log.warning("VFD %s param %s verify read failed: %s",
                                self.profile.name, token, e)
            result["ok"] = True
            return result
        except VFDError as e:
            result["error"] = str(e)
            self._note_write_fault(token, str(e))
            return result

    def _note_write_fault(self, token: str, msg: str):
        """Record the most recent failed write so it is visible to status/
        expressions (e.g. "VFD:Name".WRITEFAULT)."""
        self._last_write_fault = {"token": token, "error": msg, "t": time.time()}

    def write_setup_params(self, params, save: bool = True) -> "List[Dict]":
        """Apply a list of setup parameters at enable time, idempotently.

        Each entry is a dict with EITHER a native token or a raw register:
            {"name": "...", "token": "P0.03", "value": 2}
            {"name": "...", "register": 0xF003, "value": 2}   # explicit address
        All writes go through write_param_verified (read-before-write + verify),
        so re-running is a no-op when the drive already matches. Returns a list
        of per-param status dicts. Never raises -- failures are reported.

        IMPORTANT: this only writes addresses that are explicitly provided
        (a token this drive understands, or an explicit register). It does NOT
        invent motor-nameplate register addresses; supply them in config with a
        verified address from YOUR drive's manual.
        """
        results = []
        # Serial-link params (baud / data format / protocol) define the very
        # link we are talking over. Re-writing them during routine setup is at
        # best a no-op and at worst catastrophic: writing the baud param flips
        # the drive to a new baud mid-setup (garbled ACK + every later param
        # times out) AND silently undoes a change_baud. The config may specify
        # these by TOKEN ("PC.00") or by explicit "register" (0xFC00), so match
        # on the resolved ADDRESS, which covers both. Owned by the instance baud
        # + change_baud().
        skip_addrs = set()
        _link_tokens = []
        _bp = getattr(self.profile, "baud_param", "")
        if _bp:
            _link_tokens.append(_bp)
        if self.profile.run_mode == RUN_CONTROL_WORD:
            _link_tokens += ["PC.00", "PC.01", "PC.05"]   # baud / 8-N-2 / protocol
        for _t in _link_tokens:
            try:
                _a, _ = param_to_register(self.profile, _t)
                skip_addrs.add(_a)
            except Exception:
                pass
        # open the write gate with a read
        try:
            self.read_status()
        except Exception:
            pass
        for sp in (params or []):
            name = sp.get("name", "?")
            value = sp.get("value")
            # Resolve this param's address (token OR explicit register) and skip
            # it if it is one of the serial-link params above.
            _addr = None
            try:
                if "token" in sp:
                    _addr, _ = param_to_register(self.profile, str(sp["token"]))
                elif "register" in sp:
                    _addr = int(sp["register"])
            except Exception:
                _addr = None
            if _addr is not None and _addr in skip_addrs:
                results.append({"name": name, "ok": True, "changed": False,
                                "skipped": True})
                log.info("VFD %s setup %s skipped (serial-link param 0x%04X; "
                         "defines the active link, managed by instance baud / "
                         "change_baud)", self.profile.name, name, _addr)
                continue
            if value is None:
                results.append({"name": name, "ok": False,
                                "error": "no value"})
                continue
            try:
                if "token" in sp:
                    res = self.write_param_verified(
                        str(sp["token"]), int(value), save=save)
                elif "register" in sp:
                    res = self.write_param_verified(
                        f"#0x{int(sp['register']):04X}", int(value),
                        save=save, verify=sp.get("verify", True))
                else:
                    res = {"ok": False, "error": "need 'token' or 'register'"}
                res["name"] = name
                results.append(res)
                if res.get("ok"):
                    log.info("VFD %s setup %s = %s (%s)", self.profile.name,
                             name, value,
                             "changed" if res.get("changed") else "already set")
                else:
                    log.warning("VFD %s setup %s failed: %s", self.profile.name,
                                name, res.get("error"))
            except Exception as e:
                results.append({"name": name, "ok": False, "error": str(e)})
                log.warning("VFD %s setup %s raised: %s",
                            self.profile.name, name, e)
        return results

    # ---- read API --------------------------------------------------------
    def _read_one(self, reg: int) -> Optional[int]:
        if reg is None or reg < 0:
            return None
        try:
            return self.read_register(reg)
        except VFDError as e:
            log.debug("read 0x%04X failed: %s", reg, e)
            return None

    @staticmethod
    def _signed16(v: int) -> int:
        return v - 0x10000 if v >= 0x8000 else v

    # ---- comm-speed (baud) change ---------------------------------------
    def _reopen_at(self, baud: int) -> bool:
        try: self.disconnect()
        except Exception: pass
        self.baud = int(baud)
        return self.connect(quiet=True)
    def _probe(self) -> bool:
        """True ONLY if the drive returns two consecutive valid Modbus replies
        at the current baud. _txn already rejects bad CRC and wrong slave
        address, so a single pass is already hard to spoof; requiring two
        independent CRC-checked reads makes a chance valid decode at a wrong or
        harmonic baud effectively impossible. This is the real 'connected' test
        -- opening the port (connect()) does not qualify."""
        try:
            reg = self.profile.reg_out_freq
            a = self.read_register(reg, fn=self.profile.read_fn)
            b = self.read_register(reg, fn=self.profile.read_fn)
            return a is not None and b is not None
        except Exception:
            return False

    def _fire_and_forget_write(self, addr: int, value: int, fn: int = 0x06) -> None:
        """Send a single-register write WITHOUT reading or validating the reply.
        Used only for the baud-rate parameter: the drive adopts the new baud the
        instant it receives the frame, so any ACK comes back at the NEW baud and
        is unreadable at the OLD one (that misframed reply is exactly the
        'Modbus exception fn=0x6C code=0xFE' garbage). Success is confirmed
        afterwards by reopening at the target baud and probing -- never by this
        frame's ACK."""
        if not self.ser or not self.ser.is_open:
            raise VFDCommError("serial port not open")
        v = int(value) & 0xFFFF
        pdu = bytes([fn, (addr >> 8) & 0xFF, addr & 0xFF, (v >> 8) & 0xFF, v & 0xFF])
        frame = bytes([self.address]) + pdu
        frame += struct.pack("<H", modbus_crc16(frame))
        with self._io_lock:
            try: self.ser.reset_input_buffer()
            except Exception: pass
            self.ser.write(frame)
            try: self.ser.flush()              # push the bytes out before baud flips
            except Exception: pass
            time.sleep(0.10)                   # let the drive receive + switch
            try: self.ser.reset_input_buffer() # discard the garbled ACK, if any
            except Exception: pass

    def change_baud(self, target_baud: int, save: bool = True,
                    settle_s: float = 0.4) -> Dict[str, object]:
        """Change the drive's Modbus baud, then reopen the PC port. DRIVE MUST
        BE IDLE. Reverts to a reachable baud on failure. Holds _io_lock."""
        prof = self.profile
        res = {"ok": False, "old_baud": self.baud, "target_baud": int(target_baud),
               "current_baud_detected": None, "wrote_param": False,
               "verified": False, "error": None, "detail": ""}
        cmap = getattr(prof, "baud_code_map", {}) or {}
        if not getattr(prof, "baud_param", "") or int(target_baud) not in cmap:
            res["error"] = (f"{prof.name} has no baud code for {target_baud} "
                            f"(supported: {sorted(cmap)})")
            return res
        target_code = cmap[int(target_baud)]
        with self._io_lock:
            cands = [self.baud] + [b for b in sorted(cmap, reverse=True) if b != self.baud]
            cur = None
            for b in cands:
                opened = self._reopen_at(b)
                ok = opened and self._probe()
                log.info("VFD %s baud probe @ %d: %s", prof.name, b,
                         "VERIFIED (drive answered)" if ok else
                         ("opened but NO valid reply" if opened else "port would not open"))
                if ok:
                    cur = b; break
            if cur is None:
                self._reopen_at(res["old_baud"])
                res["error"] = "drive did not respond at any supported baud; aborted"
                return res
            res["current_baud_detected"] = cur
            if cur == int(target_baud):
                res["ok"] = True; res["detail"] = "already at target baud"
                log.info("VFD %s already at %d baud", prof.name, target_baud)
                return res
            try:
                baud_addr, _is_raw = param_to_register(prof, prof.baud_param)
                # GK3000 uses fn 0x07 for an EEPROM-saving write, else 0x06.
                wfn = 0x07 if (save and prof.run_mode == RUN_CONTROL_WORD) else 0x06
                log.info("VFD %s writing baud code %d (->%d baud) at %d baud, "
                         "fire-and-forget", prof.name, target_code, target_baud, cur)
                self._fire_and_forget_write(baud_addr, target_code, fn=wfn)
                res["wrote_param"] = True
            except Exception as e:
                res["error"] = f"baud param write exception: {e}"
                self._reopen_at(cur); return res
            self._reopen_at(int(target_baud))
            if settle_s: time.sleep(settle_s)
            if self._probe():
                res["ok"] = True; res["verified"] = True
                res["detail"] = f"baud changed {cur} -> {target_baud}"
                log.info("VFD %s baud change VERIFIED: %d -> %d",
                         prof.name, cur, target_baud)
                return res
            self._reopen_at(cur)
            res["error"] = (f"wrote baud code {target_code} but no reply at {target_baud}; "
                            f"reverted port to {cur}. Drive may require a power cycle.")
            log.warning("VFD %s %s", prof.name, res["error"])
            return res

    def read_status(self) -> Dict[str, object]:
        """Read and decode the drive's live status into a friendly dict.
        Missing registers come back as None rather than raising."""
        p = self.profile
        out: Dict[str, object] = {"drive": p.name, "ok": True}

        f = self._read_one(p.reg_out_freq)
        out["output_hz"] = round(f * p.freq_read_scale, 2) if f is not None else None

        cur = self._read_one(p.reg_out_current)
        out["output_current_a"] = round(cur * p.current_scale, 2) if cur is not None else None

        ov = self._read_one(p.reg_out_voltage)
        out["output_voltage_v"] = round(ov * p.voltage_scale, 1) if ov is not None else None

        bv = self._read_one(p.reg_bus_voltage)
        out["bus_voltage_v"] = round(bv * p.bus_voltage_scale, 1) if bv is not None else None

        pw = self._read_one(p.reg_out_power)
        out["output_power_w"] = round(pw * p.power_scale, 1) if pw is not None else None

        tq = self._read_one(p.reg_out_torque)
        out["output_torque"] = tq if tq is not None else None

        tmp = self._read_one(p.reg_temperature)
        out["drive_temp_c"] = round(tmp * p.temp_scale, 1) if tmp is not None else None

        rh = self._read_one(p.reg_run_hours)
        out["run_hours"] = rh if rh is not None else None

        fault = self._read_one(p.reg_fault)
        if fault is not None:
            out["fault_code"] = fault
            out["fault_text"] = p.fault_to_text(fault)
            out["faulted"] = fault != 0
        else:
            out["fault_code"] = None
            out["fault_text"] = None
            out["faulted"] = None

        # rpm: prefer a drive-reported speed reg, else derive from output Hz
        spd = self._read_one(p.reg_out_speed) if p.reg_out_speed >= 0 else None
        if spd is not None:
            out["rpm"] = round(spd * p.speed_scale, 1)
        elif out["output_hz"] is not None:
            out["rpm"] = round(self.motor.rpm_for_hz(out["output_hz"]), 1)
        else:
            out["rpm"] = None

        # enable / direction: decode a status word if the profile has one,
        # else fall back to our remembered commanded state.
        enabled, reverse = (None, None)
        if p.reg_runstate >= 0 and p.decode_runstate:
            w = self._read_one(p.reg_runstate)
            if w is not None:
                enabled, reverse = p.decode_runstate(w)
        if enabled is None:
            enabled = self._enabled
        if reverse is None:
            reverse = self._last_dir_reverse
        out["enabled"] = bool(enabled)
        out["direction"] = "reverse" if reverse else "forward"

        # at-speed: |out - commanded| small (best-effort)
        out["at_speed"] = None
        return out

    # ---- watchdog --------------------------------------------------------
    def start_watchdog(self, timeout_s: float):
        """Auto-stop the drive if no successful read happens within timeout_s.
        Call poke_watchdog() (or just read_status()) periodically to feed it."""
        self.stop_watchdog()
        self._wd_timeout = float(timeout_s)
        self._wd_last = time.time()
        self._wd_stop.clear()
        self._wd_thread = threading.Thread(target=self._wd_run, daemon=True)
        self._wd_thread.start()

    def stop_watchdog(self):
        self._wd_stop.set()
        if self._wd_thread and self._wd_thread.is_alive():
            self._wd_thread.join(timeout=1.0)
        self._wd_thread = None

    def poke_watchdog(self):
        self._wd_last = time.time()

    def _wd_run(self):
        while not self._wd_stop.wait(0.25):
            if self._wd_timeout <= 0:
                continue
            if self._enabled and (time.time() - self._wd_last) > self._wd_timeout:
                log.warning("VFD watchdog timeout -- commanding stop")
                try:
                    self.disable()
                except Exception as e:
                    log.error("watchdog stop failed: %s", e)
                # one shot per lapse: reset the clock so we don't spam
                self._wd_last = time.time()


def p_default_max(profile: VFDProfile) -> float:
    """Fallback max frequency when MotorConfig.max_hz is unset (GK3000 % mode)."""
    return 50.0


# ===========================================================================
#  Config-driven manager: loads drives / motors / instances from JSON and
#  builds a VFDController per included instance. This is what the server uses.
# ===========================================================================
import json as _json
from pathlib import Path as _Path


def _profile_from_drive_cfg(dcfg: dict) -> "VFDProfile":
    """Clone a built-in protocol profile and overlay the drive's serial
    defaults from JSON. The 'profile' key selects which built-in map (the
    register/scaling facts) to use; everything else (baud/parity/label) is
    data."""
    base = PROFILES.get(str(dcfg.get("profile", "")).lower())
    if base is None:
        raise VFDError(f"unknown drive profile '{dcfg.get('profile')}' "
                       f"(known: {', '.join(PROFILES)})")
    # shallow copy via dataclass replace-like: build a new VFDProfile sharing
    # the protocol fields but with this drive's serial defaults + label.
    import copy
    p = copy.copy(base)
    p.name = dcfg.get("label", base.name)
    p.default_baud = int(dcfg.get("default_baud", base.default_baud))
    p.default_parity = str(dcfg.get("default_parity", base.default_parity)).upper()
    p.default_stopbits = float(dcfg.get("default_stopbits", base.default_stopbits))
    p.default_address = int(dcfg.get("default_address", base.default_address))
    return p


def _motor_from_cfg(mcfg: dict) -> "MotorConfig":
    return MotorConfig(
        poles=int(mcfg.get("poles", 4)),
        rated_hz=float(mcfg.get("rated_hz", 50.0)),
        rated_rpm=float(mcfg.get("rated_rpm", 1440.0)),
        rated_current_a=float(mcfg.get("rated_current_a", 0.0)),
        max_hz=float(mcfg.get("max_hz", 50.0)),
        min_hz=float(mcfg.get("min_hz", 0.0)),
        accel_s=float(mcfg.get("accel_s", 10.0)),
        decel_s=float(mcfg.get("decel_s", 10.0)),
    )



# ===========================================================================
#  Parameter name <-> Modbus register translation  (per-profile, verified)
# ===========================================================================
#  GK3000 (ATO):  P<group>.<reg>  -> 0xF0 << 8 | (group<<? ) ... verified rule:
#                 register = 0xF000 + group*0x100 + reg
#                 e.g. P0.03 -> 0xF003 ; PA.06 -> group 0xA -> 0xFA06
#                 (manual Ch.9: "P<g>.<r> -> 0xF0<g><r>")
#                 Param write fn 0x06 (RAM) or 0x07 (saved/EEPROM).
#  H100 (QNK):    F<nnn>         -> address = decimal nnn as hex
#                 e.g. F100 -> 0x0064 ; F002 -> 0x0002
#                 (manual: "communication address of F100 is 0064H")
#                 Param write fn 0x06.  F013/F172 support ONLY 0x06.
#  Raw escape:    #0xADDR or #DDDD -> that literal Modbus address (any drive).
# ===========================================================================

import re as _re_param


class VFDParamError(VFDError):
    """Raised when a parameter token cannot be translated for this drive."""
    pass


# Matches GK3000 group.reg: an optional letter+digit group, a dot, two digits.
#   P0.03  -> grouptoken '0', reg '03'
#   PA.06  -> grouptoken 'A', reg '06'
#   P10.02 (rare) -> grouptoken '10'
_GK_PARAM_RE = _re_param.compile(r'^[Pp]?([0-9A-Fa-f]{1,2})\.([0-9]{1,2})$')
# Matches H100 F-codes:  F100, F002, f13
_H100_PARAM_RE = _re_param.compile(r'^[Ff]([0-9]{1,3})$')
# Raw address escape:  #0x5004  or  #20484
_RAW_RE = _re_param.compile(r'^#(0[xX][0-9A-Fa-f]+|[0-9]+)$')


def param_to_register(profile: "VFDProfile", token: str):
    """Translate a parameter token to (modbus_address, is_raw) for this drive.

    token examples:
        "P0.03", "PA.06"   (GK3000 style)
        "F100", "F002"     (H100 style)
        "#0x5004", "#1234" (raw address, any drive)

    Returns (address:int, is_raw:bool). Raises VFDParamError if the token does
    not match this drive's parameter scheme.

    is_raw is True for the #ADDR escape so callers can decide whether to apply
    read-back verification (raw addresses may be command/coil registers that do
    not read back what was written).
    """
    token = (token or "").strip()

    # Raw address escape works on any drive.
    m = _RAW_RE.match(token)
    if m:
        body = m.group(1)
        addr = int(body, 16) if body.lower().startswith("0x") else int(body)
        return addr & 0xFFFF, True

    mode = profile.run_mode
    is_gk = (mode == RUN_CONTROL_WORD)   # GK3000-family uses control word
    is_h100 = (mode == RUN_COILS)        # H100-family uses coils

    if is_gk:
        m = _GK_PARAM_RE.match(token)
        if m:
            group = int(m.group(1), 16)   # group nibble (0..F)
            # The DISPLAYED register digits go into the low byte LITERALLY (BCD):
            # P0.12 -> 0xF012, P0.13 -> 0xF013, P0.21 -> 0xF021. NOT decimal-12
            # (=0x0C). Using base-16 on the decimal-digit string gives that BCD
            # value, and is identical to decimal for single-digit regs (<.10),
            # which is why params below .10 (P0.05, PC.00, P8.xx) were always
            # correct and only .10+ (accel/decel P0.12/P0.13, P0.14) were wrong.
            # Verified on the GK3000: accel time reads at 0xF012 (keypad 20.0 s).
            reg = int(m.group(2), 16)     # displayed reg digits as the low byte
            if group > 0xFF or reg > 0xFF:
                raise VFDParamError(f"GK3000 param out of range: {token}")
            # (0xF0 | group) << 8 | reg   (P0.03 -> 0xF003, PA.06 -> 0xFA06, P0.12 -> 0xF012)
            return (0xF000 + (group << 8) + reg) & 0xFFFF, False
        raise VFDParamError(
            f"'{token}' is not a GK3000 parameter (expected P<g>.<r>, e.g. P0.03)")

    if is_h100:
        m = _H100_PARAM_RE.match(token)
        if m:
            num = int(m.group(1), 10)     # F100 -> 100 -> 0x0064
            return num & 0xFFFF, False
        raise VFDParamError(
            f"'{token}' is not an H100 parameter (expected F<nnn>, e.g. F100)")

    raise VFDParamError(f"unknown drive run_mode '{mode}' for param '{token}'")


def _param_is_verifiable(profile: "VFDProfile", addr: int, is_raw: bool) -> bool:
    """Should a write to this address be read-back verified?

    Verify true parameter/holding registers; do NOT verify command/coil/action
    registers (run word, run coils) -- those don't read back what you wrote, so
    a strict verify would always 'fail'. Raw #ADDR writes are not verified by
    default (we can't know if the address is a command register).
    """
    if is_raw:
        return False
    p = profile
    # Known command/action registers per profile -> never verify.
    command_addrs = set()
    if p.run_mode == RUN_CONTROL_WORD:
        command_addrs.add(p.control_reg & 0xFFFF)
        command_addrs.add(p.freq_setpoint_reg & 0xFFFF)   # setpoint, not a param
    else:  # coils
        for c in (p.coil_forward, p.coil_reverse, p.coil_stop,
                  p.coil_fault_reset):
            command_addrs.add(c & 0xFFFF)
        command_addrs.add(p.freq_setpoint_reg & 0xFFFF)
    return (addr & 0xFFFF) not in command_addrs



# ===========================================================================
#  VFDWorker -- the ONLY thread that touches a controller's serial port.
# ===========================================================================
#  Timing contract (critical): the acquisition loop, expression engine, PID
#  loops and display updates must NEVER block on VFD serial I/O. They only ever:
#     * read the in-memory snapshot()  (an O(1) dict copy)
#     * enqueue a write via request_write()  (non-blocking queue put)
#  All serial latency (5-20ms per txn, up to the full timeout on a fault) is
#  absorbed here, on this worker thread.
#
#  Each cycle the worker:
#     1. drains the write queue FIRST (control stays responsive -- a queued
#        state-machine write isn't delayed behind a long read sweep), doing
#        read-before-write + verify per write;
#     2. reads the standard status set + the discovered watch-list params,
#        coalescing adjacent addresses into block reads where possible;
#     3. publishes a fresh snapshot;
#     4. sleeps poll_period (0 = no sleep => as fast as the bus allows).
#  Data is therefore at most ONE poll period stale.
# ===========================================================================

import queue as _queue


class VFDWorker:
    def __init__(self, name: str, ctrl: "VFDController",
                 poll_period: float = 0.25, write_queue_max: int = 256):
        self.name = name
        self.ctrl = ctrl
        self.poll_period = max(0.0, float(poll_period))   # 0 == continuous
        self._watch = {}            # token -> Modbus addr (discovered params)
        self._snapshot = {}         # published values (status + params)
        self._snap_lock = threading.Lock()
        # Zero-glitch rejection state: while the drive is commanded ON, hold the
        # last-good rpm/output_hz across a spurious drop to 0 (a contended read
        # during a write burst) for up to _ZERO_HOLD_SEC of WALL-CLOCK time --
        # independent of the poll rate. DISABLED by default (= 0): the dropouts
        # this was chasing turned out to be an expression-layer bug, so the
        # snapshot itself is honest and holding would only mask real brief zeros.
        # Set _ZERO_HOLD_SEC > 0 (e.g. 1.0) to re-enable the glitch hold.
        self._ZERO_HOLD_SEC = 0.0         # 0 = disabled; >0 = max wall-clock hold
        self._zero_since = {}              # reading key -> monotonic time 0 began
        self._wq = _queue.Queue(maxsize=int(write_queue_max))
        self._stop = threading.Event()
        self._thread = None
        self._overflow_count = 0
        self._last_write_results = {}   # token -> last write status dict

    # ---- public, hot-path-safe API --------------------------------------
    def set_watch(self, tokens):
        """Set the list of param tokens to keep polled (discovered from
        expressions). Bad tokens are dropped with a logged warning. Safe to
        call from any thread."""
        watch = {}
        for tok in tokens or []:
            try:
                addr, _is_raw = param_to_register(self.ctrl.profile, tok)
                watch[tok] = addr
            except VFDError as e:
                log.warning("VFD %s watch token '%s' ignored: %s",
                            self.name, tok, e)
        self._watch = watch

    def request_write(self, token: str, value: float, save: bool = False,
                      verify=None) -> bool:
        """Enqueue a parameter write. NON-BLOCKING. Returns False (and logs)
        if the queue is full -- never blocks the caller. Safe from any thread."""
        try:
            self._wq.put_nowait((token, int(round(float(value))), save, verify))
            return True
        except _queue.Full:
            self._overflow_count += 1
            if self._overflow_count % 100 == 1:
                log.warning("VFD %s write queue full; dropping write %s=%s "
                            "(overflow #%d)", self.name, token, value,
                            self._overflow_count)
            return False

    def request_command(self, cmd: str, value: float) -> bool:
        """Enqueue a high-level command (ENABLE/RPM/HZ/DIR/STOP/FAULT_RESET)."""
        try:
            self._wq.put_nowait(("__cmd__:" + str(cmd).upper(), float(value), None, None))
            return True
        except _queue.Full:
            self._overflow_count += 1
            return False
    def _apply_command(self, cmd: str, value: float):
        c = self.ctrl; v = float(value); cmd = str(cmd).upper()
        if cmd in ("ENABLE", "RUN"):
            c.enable() if v >= 1 else c.disable()
        elif cmd in ("DISABLE", "STOP"):
            c.disable()
        elif cmd == "RPM":
            c.set_rpm(v)
        elif cmd in ("HZ", "FREQ"):
            c.set_frequency(v)
        elif cmd in ("DIR", "DIRECTION", "REVERSE", "REV"):
            c.set_direction(v >= 1)
        elif cmd in ("FORWARD", "FWD"):
            c.set_direction(False)
        elif cmd in ("FAULT_RESET", "RESET"):
            c.fault_reset()
        else:
            log.warning("VFD %s: unknown command '%s'", self.name, cmd)

    def snapshot(self) -> dict:
        """Return the latest published values. O(1)-ish copy; never does I/O."""
        with self._snap_lock:
            return dict(self._snapshot)

    def get_value(self, token: str):
        """Latest snapshot value for one param token (None if not polled yet)."""
        with self._snap_lock:
            return self._snapshot.get(token)

    # ---- lifecycle ------------------------------------------------------
    def start(self):
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(
            target=self._run, name=f"vfd-worker-{self.name}", daemon=True)
        self._thread.start()

    def stop(self, join_timeout: float = 2.0):
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=join_timeout)

    # ---- the worker loop ------------------------------------------------
    def _run(self):
        log.info("VFD worker '%s' started (poll_period=%.3fs%s)", self.name,
                 self.poll_period, ", continuous" if self.poll_period == 0 else "")
        while not self._stop.is_set():
            t0 = time.time()
            # 1) writes first -- keep control responsive
            self._drain_writes()
            # 2) status + watched params -> new snapshot
            snap = {}
            try:
                snap.update(self.ctrl.read_status())
            except Exception as e:
                snap["ok"] = False
                snap["error"] = str(e)
            self._read_watch_into(snap)
            # Carry forward the last-good value for any reading that MISSED this
            # cycle (None) or whose whole read_status() threw (key absent). A
            # missed Modbus read -- common while the bus is busy draining a burst
            # of rpm-command writes from an AO slider -- otherwise surfaces as
            # None -> 0.0 downstream and drops the chart trace to zero for a
            # frame. Holding the least-stale sample keeps the trace continuous.
            # A genuine reading of 0 is a real 0 (not None) and is preserved, so
            # this never fabricates motion. Meta flags reflect THIS cycle.
            _prev = self._snapshot or {}
            _META = ("ok", "error", "write_fault", "write_fault_token", "drive", "stale")
            for _k, _pv in _prev.items():
                if _k in _META or _pv is None:
                    continue
                if snap.get(_k) is None:        # None this cycle, or key absent
                    snap[_k] = _pv
                    snap["stale"] = True         # at least one reading held over
            # Zero-glitch rejection: while the drive is commanded ON, a single-
            # cycle drop to 0 on a continuous "running" reading (rpm and its
            # source output_hz) is almost always a contended/garbled Modbus read
            # during a write burst, NOT a real stop. A real stop comes from a
            # disable -> enabled=False, where 0 is accepted immediately (below).
            # Hold the prior value for up to _ZERO_HOLD_MAX cycles; if 0 persists
            # past that while still enabled, accept it as genuine. This catches
            # the contended valid-frame 0 that the None carry-forward above
            # cannot (0 is not None), without ever masking a commanded stop.
            if self._ZERO_HOLD_SEC > 0 and bool(snap.get("enabled")):
                _now = time.monotonic()
                for _zk in ("rpm", "output_hz"):
                    _v = snap.get(_zk); _pv = _prev.get(_zk)
                    if (_v is not None and _pv is not None
                            and _v == 0 and _pv != 0):
                        _t0 = self._zero_since.get(_zk)
                        if _t0 is None:               # first 0 of this burst
                            _t0 = _now
                            self._zero_since[_zk] = _t0
                        if (_now - _t0) <= self._ZERO_HOLD_SEC:
                            snap[_zk] = _pv           # within window: hold (glitch)
                            snap["stale"] = True
                        else:
                            self._zero_since.pop(_zk, None)  # persisted -> accept 0
                    else:
                        self._zero_since.pop(_zk, None)      # recovered / nonzero
            elif self._zero_since:
                self._zero_since.clear()             # disabled: 0 is real, reset
            # surface last write fault for expressions
            if self.ctrl._last_write_fault:
                snap["write_fault"] = self.ctrl._last_write_fault.get("error")
                snap["write_fault_token"] = self.ctrl._last_write_fault.get("token")
            with self._snap_lock:
                self._snapshot = snap
            # 3) pace
            if self.poll_period > 0:
                dt = self.poll_period - (time.time() - t0)
                if dt > 0:
                    self._stop.wait(dt)
            elif not self._wq.qsize():
                # continuous mode: a tiny yield so we don't 100% spin a core
                # when there is nothing queued; reads still run back-to-back.
                self._stop.wait(0.001)
        log.info("VFD worker '%s' stopped", self.name)

    def _drain_writes(self):
        """Apply all queued writes (read-before-write + verify in the
        controller). Each is contained: a failure is logged, never escapes."""
        drained = 0
        while True:
            try:
                token, value, save, verify = self._wq.get_nowait()
            except _queue.Empty:
                break
            if isinstance(token, str) and token.startswith("__cmd__:"):
                cmd = token.split(":", 1)[1]
                try:
                    self._apply_command(cmd, value)
                except Exception as e:
                    log.warning("VFD %s command %s=%s raised: %s", self.name, cmd, value, e)
                drained += 1
                if drained > 64: break
                continue
            try:
                res = self.ctrl.write_param_verified(
                    token, value, save=save, verify=verify)
                self._last_write_results[token] = res
                if not res.get("ok"):
                    log.warning("VFD %s write %s=%s not ok: %s",
                                self.name, token, value, res.get("error"))
            except Exception as e:
                log.warning("VFD %s write %s=%s raised: %s",
                            self.name, token, value, e)
            drained += 1
            if drained > 64:        # safety: don't starve reads on a flood
                break

    def _read_watch_into(self, snap: dict):
        """Read each watched param into the snapshot under its token. Adjacent
        addresses are coalesced into block reads to cut transactions."""
        if not self._watch:
            return
        # group tokens by contiguous address runs
        items = sorted(self._watch.items(), key=lambda kv: kv[1])
        i = 0
        while i < len(items):
            run = [items[i]]
            j = i + 1
            while j < len(items) and items[j][1] == run[-1][1] + 1 and len(run) < 16:
                run.append(items[j]); j += 1
            start = run[0][1]
            count = len(run)
            try:
                if count == 1:
                    vals = [self.ctrl.read_register(start, fn=0x03)]
                else:
                    vals = self.ctrl.read_registers(start, count, fn=0x03)
                for (tok, _addr), v in zip(run, vals):
                    snap[tok] = v
            except Exception as e:
                for tok, _addr in run:
                    snap[tok] = None
                log.debug("VFD %s watch read 0x%04X x%d failed: %s",
                          self.name, start, count, e)
            i = j


class VFDManager:
    """Loads vfd_drives.json / vfd_motors.json / vfd_instances.json and owns
    one VFDController per *included* instance, keyed by instance name.

    The three files are deliberately separate libraries:
      * drives   : protocol + serial defaults for each drive MODEL
      * motors   : nameplate data for each MOTOR
      * instances: bind one drive + one motor + a COM port (the live units)
    so you can have several motors and several drives and mix them.
    """

    def __init__(self, cfg_dir):
        self.cfg_dir = _Path(cfg_dir)
        self.drives: dict = {}       # key -> drive cfg dict
        self.motors: dict = {}       # key -> motor cfg dict
        self.instances: list = []    # list of instance cfg dicts
        self.controllers: dict = {}  # instance name -> VFDController

    # ---- file IO ---------------------------------------------------------
    def _path(self, name): return self.cfg_dir / name

    def load_files(self):
        def _read(name, default):
            p = self._path(name)
            if not p.exists():
                return default
            try:
                return _json.loads(p.read_text(encoding="utf-8"))
            except Exception as e:
                log.error("VFD config %s parse failed: %s", name, e)
                return default
        d = _read("vfd_drives.json", {"drives": []})
        m = _read("vfd_motors.json", {"motors": []})
        i = _read("vfd_instances.json", {"instances": []})
        self.drives = {x["key"]: x for x in d.get("drives", []) if "key" in x}
        self.motors = {x["key"]: x for x in m.get("motors", []) if "key" in x}
        self.instances = i.get("instances", [])

    # ---- build controllers ----------------------------------------------
    def disconnect_all(self):
        for c in self.controllers.values():
            try:
                c.disconnect()
            except Exception:
                pass
        self.controllers = {}

    def build(self, connect: bool = True, do_setup: bool = True):
        """(Re)build controllers from the loaded instance list. Only
        instances with include=true are built. Returns list of (name, ok,
        error)."""
        self.disconnect_all()
        results = []
        seen_ports = {}
        for inst in self.instances:
            if not inst.get("include"):
                continue
            name = inst.get("name", "VFD")
            # A serial COM port is exclusive: a second instance on the same port
            # will fail to open (PermissionError on Windows). Catch the
            # misconfiguration here with a clear message instead of letting two
            # controllers fight over one port. (Multiple drives on a single
            # RS-485 bus would be one port with distinct addresses -- not the
            # one-controller-per-port model used here.)
            _port = inst.get("port", "COM1")
            if _port in seen_ports:
                msg = (f"port {_port} is already used by instance "
                       f"'{seen_ports[_port]}'; only one instance per serial "
                       f"port is supported (this one skipped)")
                log.error("VFD instance '%s' not built: %s", name, msg)
                results.append((name, False, msg))
                continue
            seen_ports[_port] = name
            try:
                dcfg = self.drives.get(inst.get("drive_key"))
                if dcfg is None:
                    raise VFDError(f"drive_key '{inst.get('drive_key')}' not found")
                mcfg = self.motors.get(inst.get("motor_key"), {})
                profile = _profile_from_drive_cfg(dcfg)
                motor = _motor_from_cfg(mcfg)
                ctrl = VFDController(
                    profile, inst.get("port", "COM1"),
                    baud=inst.get("baud"), parity=inst.get("parity"),
                    stopbits=inst.get("stopbits"), address=inst.get("address"),
                    timeout=float(inst.get("timeout", 0.5)), motor=motor)
                ok = ctrl.connect() if connect else True
                if ok and connect:
                    wd = float(inst.get("watchdog_s", 0) or 0)
                    if wd > 0:
                        ctrl.start_watchdog(wd)
                    if do_setup and inst.get("auto_setup"):
                        self._apply_setup(ctrl, dcfg)
                self.controllers[name] = ctrl
                results.append((name, ok, None if ok else "connect failed"))
            except Exception as e:
                log.error("VFD instance '%s' build failed: %s", name, e)
                results.append((name, False, str(e)))
        return results

    def _apply_setup(self, ctrl: "VFDController", dcfg: dict):
        """Apply the drive's documented setup_params (comms + command/frequency
        source) AND the motor-derived frequency limits (P0.05/06/07 from the motor's
        max_hz/min_hz), all idempotently (read-before-write -> EEPROM only written
        when a value differs). Returns combined per-param result dicts."""
        results = []
        try:
            results += ctrl.write_setup_params(dcfg.get("setup_params", []), save=True) or []
        except Exception as e:
            log.warning("VFD setup failed: %s", e)
        # Frequency limits from the motor nameplate (max_hz includes allowed
        # overspeed). The GK3000 0x5000 setpoint is a %% of P0.05, so P0.05 MUST
        # equal motor.max_hz or commanded Hz/RPM mis-scale.
        try:
            lim = build_freq_limit_setup(ctrl.profile, ctrl.motor)
            if lim:
                results += ctrl.write_setup_params(lim, save=True) or []
        except Exception as e:
            log.warning("VFD freq-limit setup failed: %s", e)
        return results

    def check_drives(self, do_setup: bool = True) -> list:
        """Probe each included+connected drive to confirm Modbus comms (identify),
        and -- if do_setup -- (re)apply its documented setup params idempotently
        (read-before-write, so already-stored values are not rewritten). Returns a
        health list and stores it as self.last_health. Call at startup BEFORE
        start_workers() (serial runs directly on the controller here)."""
        health = []
        for inst in self.instances:
            if not inst.get("include"):
                continue
            name = inst.get("name", "VFD")
            ctrl = self.controllers.get(name)
            h = {"name": name,
                 "drive": (ctrl.profile.name if ctrl else inst.get("drive_key")),
                 "port": inst.get("port"), "baud": inst.get("baud"),
                 "address": inst.get("address"),
                 "connected": bool(getattr(ctrl, "connected", False)) if ctrl else False,
                 "comms_ok": False, "error": None, "setup": []}
            if ctrl is None:
                h["error"] = "controller not built (check include / config)"
                health.append(h); continue
            if not h["connected"]:
                h["error"] = f"serial port {inst.get('port')} did not open"
                health.append(h); continue
            try:
                h["comms_ok"] = bool(ctrl._probe())
                if not h["comms_ok"]:
                    h["error"] = ("no Modbus reply -- check wiring, baud "
                                  f"({inst.get('baud')}) and node address "
                                  f"({inst.get('address')})")
            except Exception as e:
                h["error"] = f"probe error: {e}"
            if h["comms_ok"] and do_setup:
                dcfg = self.drives.get(inst.get("drive_key"), {}) or {}
                try:
                    h["setup"] = self._apply_setup(ctrl, dcfg)
                except Exception as e:
                    h["error"] = f"setup error: {e}"
            health.append(h)
        self.last_health = health
        return health

    def get(self, name) -> "Optional[VFDController]":
        return self.controllers.get(name)

    # ---- worker threads (off-hot-path serial I/O) -----------------------
    def start_workers(self, poll_period: float = 0.25):
        """Spin up one VFDWorker per controller. The workers own all serial
        I/O from here on; the acquisition loop reads snapshot_all() (in-memory)
        and enqueues writes via request_write() -- neither blocks on serial."""
        self.workers = getattr(self, "workers", {})
        self.stop_workers()
        for name, ctrl in self.controllers.items():
            inst = next((i for i in self.instances
                         if i.get("name") == name), {})
            pr = inst.get("poll_rate_ms", None)
            period = (float(pr) / 1000.0) if pr is not None else poll_period
            w = VFDWorker(name, ctrl, poll_period=period)
            self.workers[name] = w
            w.start()

    def stop_workers(self):
        for w in getattr(self, "workers", {}).values():
            try:
                w.stop()
            except Exception:
                pass
        self.workers = {}

    def set_watch_all(self, tokens_by_drive: dict):
        """tokens_by_drive: {instance_name: [param_token, ...]} discovered from
        expressions. Tokens for unknown drives are ignored."""
        for name, toks in (tokens_by_drive or {}).items():
            w = getattr(self, "workers", {}).get(name)
            if w:
                w.set_watch(toks)

    def request_write(self, name: str, token: str, value: float,
                      save: bool = False, verify=None) -> bool:
        """Enqueue a param write to a drive's worker. Non-blocking. Returns
        False if the drive is unknown or its queue is full."""
        w = getattr(self, "workers", {}).get(name)
        if not w:
            return False
        return w.request_write(token, value, save=save, verify=verify)

    def request_command(self, name: str, cmd: str, value: float) -> bool:
        w = getattr(self, "workers", {}).get(name)
        if not w:
            return False
        return w.request_command(cmd, value)

    def change_baud(self, name: str, target_baud: int, save: bool = True) -> dict:
        ctrl = self.controllers.get(name)
        if not ctrl:
            return {"ok": False, "error": f"unknown drive '{name}'"}
        w = getattr(self, "workers", {}).get(name)
        if w: w.stop()
        try:
            res = ctrl.change_baud(int(target_baud), save=save)
        finally:
            if w: w.start()
        return res

    def snapshot_all(self) -> dict:
        """Latest published snapshot for every drive -- in-memory, NO serial
        I/O. This is what the acquisition loop / expression signal_state should
        use (NOT status_all, which blocks on serial)."""
        out = {}
        for name, w in getattr(self, "workers", {}).items():
            out[name] = w.snapshot()
        return out

    def status_all(self) -> dict:
        out = {}
        for name, c in self.controllers.items():
            try:
                out[name] = c.read_status()
            except Exception as e:
                out[name] = {"ok": False, "error": str(e), "drive": c.profile.name}
        return out


# ===========================================================================
#  Expression scanning -- discover which VFD params each drive must poll.
# ===========================================================================
import re as _re_discover

# Matches a VFD reference inside expression quotes:
#   "VFD:BlowerDrive.P0.03"   -> name 'BlowerDrive', token 'P0.03'
#   "VFD:BlowerDrive.F100"    -> token 'F100'
#   "VFD:BlowerDrive#0x5004"  -> token '#0x5004'
# The status props (.RPM/.HZ/...) are handled elsewhere; here we only want the
# param/register references (a dotted token that isn't a known status prop, or
# a #addr). We capture the raw remainder and let the caller decide.
_VFD_REF_RE = _re_discover.compile(
    r'"VFD:([A-Za-z0-9_\- ]+?)(\.[A-Za-z0-9_.]+|#0[xX][0-9A-Fa-f]+|#[0-9]+)"')

# Status properties that are NOT params (read from the live status snapshot).
_VFD_STATUS_PROPS = {
    "RPM", "HZ", "FREQ", "CURRENT", "AMPS", "I", "VOLTAGE", "V",
    "BUS", "BUSV", "DC", "POWER", "W", "TORQUE", "TQ", "NM", "TEMP", "TEMPERATURE",
    "ENABLED", "RUNNING", "REVERSE", "REV", "FAULT", "FAULTCODE",
    "WRITEFAULT",
}

# Command write-targets ("VFD:Name.ENABLE"=1 etc.) -- these are NOT pollable
# parameters; exclude them from the read/watch list.
_VFD_CMD_TOKENS = {"ENABLE", "DISABLE", "RUN", "STOP", "RPM", "HZ", "FREQ",
                  "DIR", "DIRECTION", "REVERSE", "REV", "FORWARD", "FWD",
                  "FAULT_RESET", "RESET"}


def discover_vfd_params(expressions) -> dict:
    """Scan expression texts for VFD param/register references and return
    {drive_name: [token, ...]} of params that must be polled.

    `expressions` may be a list of dicts with an 'expression' key, or a list of
    raw strings. Status-prop references (.RPM etc.) are excluded -- those come
    from the live status read, not the watch list.
    """
    out = {}
    for e in (expressions or []):
        text = e.get("expression", "") if isinstance(e, dict) else str(e)
        for m in _VFD_REF_RE.finditer(text or ""):
            name = m.group(1).strip()
            ref = m.group(2)
            if ref.startswith("#"):
                token = ref                      # raw address
            else:
                token = ref[1:]                  # strip leading dot
                # skip status props (.RPM etc., from the live status read) and
                # command targets (.ENABLE/.RPM/.DIR etc.) -- neither is pollable
                if token.upper() in _VFD_STATUS_PROPS or token.upper() in _VFD_CMD_TOKENS:
                    continue
            out.setdefault(name, [])
            if token not in out[name]:
                out[name].append(token)
    return out


# ===========================================================================
#  Motor-setup parameter builder (GK3000)
# ===========================================================================
#  Turns a MotorConfig nameplate into the list of setup-param writes that tell
#  the drive what motor is connected. ALL addresses here are verified from the
#  GK3000 manual's P8 (Motor Parameters) and P0 (frequency limits) tables:
#     P8.00 motor type        0xF800
#     P8.01 rated power kW     0xF801   (x10:  3.7kW -> 37)
#     P8.02 rated voltage V    0xF802
#     P8.03 rated current A    0xF803   (x100: 1.50A -> 150, see PC.06 res)
#     P8.04 rated frequency Hz 0xF804   (x100: 60.00Hz -> 6000)
#     P8.05 rated rpm          0xF805   (x1:   3450)
#     P0.05 max frequency Hz   0xF005   (x100)
#     P0.06 freq upper lim Hz  0xF006   (x100)
#     P0.07 freq lower lim Hz  0xF007   (x100)
#  Scaling follows each param's "Minimum Unit" column in the manual.
#
#  NOTE: the GK3000 has NO pole-count parameter -- it derives the motor from
#  rated frequency + rated rpm (exactly how MotorConfig.hz_for_rpm works), so
#  we write those two rather than a pole count.
# ===========================================================================

def build_gk3000_motor_setup(motor: "MotorConfig", include_limits: bool = True):
    """Return a list of {name, token, value} setup writes for a GK3000 from a
    MotorConfig nameplate. Only includes fields that are set (> 0). Values are
    scaled to the drive's integer register units. Use with
    VFDController.write_setup_params().

    include_limits: also write P0.05/06/07 max/upper/lower frequency limits
    from motor.max_hz / motor.min_hz (upper limit defaults to max).
    """
    out = []
    def put(name, token, value):
        out.append({"name": name, "token": token, "value": int(round(value))})

    # Motor type: 0 = common asynchronous (safe default for an induction motor)
    put("Motor type (P8.00=async)", "P8.00", 0)
    if getattr(motor, "rated_kw", 0):
        put("Rated power (P8.01)", "P8.01", motor.rated_kw * 10)      # 0.1kW unit
    if getattr(motor, "rated_voltage_v", 0):
        put("Rated voltage (P8.02)", "P8.02", motor.rated_voltage_v) # 1V unit
    if getattr(motor, "rated_current_a", 0):
        put("Rated current (P8.03)", "P8.03", motor.rated_current_a * 100)  # 0.01A
    if motor.rated_hz > 0:
        put("Rated frequency (P8.04)", "P8.04", motor.rated_hz * 100)       # 0.01Hz
    if motor.rated_rpm > 0:
        put("Rated rpm (P8.05)", "P8.05", motor.rated_rpm)                  # 1rpm

    if include_limits:
        if motor.max_hz > 0:
            put("Max frequency (P0.05)", "P0.05", motor.max_hz * 100)
            put("Freq upper limit (P0.06)", "P0.06", motor.max_hz * 100)
        if motor.min_hz >= 0:
            put("Freq lower limit (P0.07)", "P0.07", motor.min_hz * 100)
    return out


# Map drive run_mode -> motor-setup builder. H100 nameplate params are not in
# the partial manual pages on hand, so it has no verified builder yet (returns
# []); supply explicit setup_params in config for H100 motor setup.
def build_motor_setup(profile: "VFDProfile", motor: "MotorConfig",
                      include_limits: bool = True):
    if profile.run_mode == RUN_CONTROL_WORD:   # GK3000 family
        return build_gk3000_motor_setup(motor, include_limits=include_limits)
    return []   # H100: no verified nameplate-address map from the pages on hand


def build_freq_limit_setup(profile: "VFDProfile", motor: "MotorConfig"):
    """Motor-derived setup params: frequency max/upper/lower limits (P0.05/06/07)
    from max_hz/min_hz so the drive's max output frequency tracks vfd_motors.json
    (including any allowed overspeed), PLUS accel/decel ramp times (P0.12/P0.13)
    from accel_s/decel_s. GK3000 family only (verified addresses); other drives
    return [] -- supply explicit setup_params in config.
    The GK3000 0x5000 setpoint is a percentage of P0.05, so this keeps P0.05 ==
    motor.max_hz, which set_frequency() also uses as its percent base."""
    if profile.run_mode != RUN_CONTROL_WORD:
        return []
    out = []
    if getattr(motor, "max_hz", 0) and motor.max_hz > 0:
        out.append({"name": "Max frequency (P0.05)", "token": "P0.05",
                    "value": int(round(motor.max_hz * 100))})
        out.append({"name": "Freq upper limit (P0.06)", "token": "P0.06",
                    "value": int(round(motor.max_hz * 100))})
    if getattr(motor, "min_hz", None) is not None and motor.min_hz >= 0:
        out.append({"name": "Freq lower limit (P0.07)", "token": "P0.07",
                    "value": int(round(motor.min_hz * 100))})
    # Accel / decel ramp times from the motor config. GK3000 P0.12 / P0.13 are
    # the active "accel/decel time 0" pair; the time unit is selected by P0.14,
    # which we DELIBERATELY leave untouched and instead write in the drive's
    # CURRENT unit. Verified on this drive: 0.1 s per count (P0.12 read raw 200
    # == 20.0 s on the keypad), so register = seconds * 10. If P0.14 is ever
    # changed from its present setting, this scale must be revisited.
    ACCEL_COUNTS_PER_S = 10.0   # 0.1 s / count (P0.14 = current unit)
    if getattr(motor, "accel_s", 0) and motor.accel_s > 0:
        out.append({"name": "Accel time 0 (P0.12)", "token": "P0.12",
                    "value": int(round(motor.accel_s * ACCEL_COUNTS_PER_S))})
    if getattr(motor, "decel_s", 0) and motor.decel_s > 0:
        out.append({"name": "Decel time 0 (P0.13)", "token": "P0.13",
                    "value": int(round(motor.decel_s * ACCEL_COUNTS_PER_S))})
    return out
