"""
stepper_driver.py - Modbus RTU stepper-drive support (PR / path mode)

Mirrors vfd_driver.py's architecture so the two can live under one "MOD Drv"
umbrella: a StepperProfile holds the register map, a StepperController owns one
serial port + drive, and (later) a StepperManager loads config and runs the
background workers.

First profile: DM556RS (STEPPERONLINE / Leadshine-style RS, PR path-mode
protocol). Full register map in DM556RS_MODBUS.md. Two motion modes:
  * Profile Velocity  -> run continuously at an rpm (feed / dosing pump rate)
  * Profile Position  -> move an exact number of steps (a precise dose)

Expression interface (see EXPRESSION_REFERENCE.md, "Stepper Drives (STEP)"):
  read   "STEP:Name".VEL/.POS/.RUNNING/.ENABLED/.COMPLETE/.ALARM
  command "STEP:Name.ENABLE/.VELOCITY/.MOVE/.MOVETO/.STOP/.JOG/.RESET" = value
"""
__version__ = "1.6.2"
__updated__ = "2026-06-20"  # 1.6.2: STEP_LOG_IO defaults OFF now the drive is proven (per-instance "Log IO" override via inst.io_log; connect/setup lines + undelivered-command warnings still always print). 1.6.1: per-instance reliability overrides read in build() from the stepper instance (io_retries, io_gap_ms, io_reply_ms) -> exposed in the Stepper Units editor; fall back to module defaults. 1.6.0: Modbus RTU reliability -- _txn now resends on a lost/garbled reply (timeout/short/CRC, NOT on a Modbus exception reply), enforces a minimum inter-frame gap (RTU 3.5-char silence, stops bus overrun), and uses a short reply timeout (~120ms vs the 0.5s instance timeout) so a miss is caught + resent fast. Knobs: STEP_IO_RETRIES/STEP_IO_RETRY_DELAY/STEP_IO_GAP/STEP_REPLY_TIMEOUT. 1.5.0: Modbus TX/RX console logging -- _txn logs each write/command frame + reply (decoded: 'W 0x6203 = 0xFF38 (-200)') so the ENABLE/VELOCITY/setup exchange is visible; build() prints CONNECTED/setup lines. Writes logged by default (sparse, on-change); STEP_LOG_READS toggles chatty poll-read logging. 1.4.0: presence probe -- StepperController.probe() does a real Modbus read after connect(); build() now reports a drive that doesn't answer as FAILED ("no reply from drive on COMx") instead of "connected" (opening the serial port succeeds with nothing attached). 1.3.0: dropped ml_per_rev (pump cal is handled in expressions, not the generic stepper). 1.2.0: StepperConfig adds full_step_deg for the MOD Drv stepper editor. 1.1.0: StepperWorker + StepperManager (background workers/instances); 1.0.0: DM556RS profile + StepperController

import struct
import time
import json
import queue as _queue
import threading
from pathlib import Path
from dataclasses import dataclass, field
from typing import Optional, List, Dict

try:
    import serial  # type: ignore
    import serial.tools.list_ports  # type: ignore
    _HAVE_SERIAL = True
except Exception:
    _HAVE_SERIAL = False


# ---------------------------------------------------------------------------
#  Modbus RTU helpers
# ---------------------------------------------------------------------------
def modbus_crc16(data: bytes) -> int:
    crc = 0xFFFF
    for b in data:
        crc ^= b
        for _ in range(8):
            if crc & 1:
                crc = (crc >> 1) ^ 0xA001
            else:
                crc >>= 1
    return crc & 0xFFFF


def _u16(v: int) -> int:
    return v & 0xFFFF


def _s16(v: int) -> int:
    v &= 0xFFFF
    return v - 0x10000 if v & 0x8000 else v


def _split32(v: int):
    """signed 32-bit -> (high16, low16)"""
    v &= 0xFFFFFFFF
    return (v >> 16) & 0xFFFF, v & 0xFFFF


def _join32(hi: int, lo: int) -> int:
    v = ((hi & 0xFFFF) << 16) | (lo & 0xFFFF)
    return v - 0x100000000 if v & 0x80000000 else v


class StepperError(Exception):
    pass


class StepperCommError(StepperError):
    pass


class StepperModbusException(StepperError):
    def __init__(self, function: int, code: int):
        self.function, self.code = function, code
        super().__init__(f"Modbus exception fn=0x{function:02X} code=0x{code:02X}")


# ---------------------------------------------------------------------------
#  Drive profile (register map)
# ---------------------------------------------------------------------------
# PR0 path-mode register operations (Pr9.00 mode word). These are the
# best-known Leadshine-RS encodings; verify on the bench against the manual's
# "PR mode bits" table -- they are isolated here so a fix is one line.
MODE_VELOCITY = 0x0002      # Profile Velocity
MODE_POS_ABS = 0x0001       # Profile Position, absolute
MODE_POS_REL = 0x0041       # Profile Position, relative (bit6 = relative)


@dataclass
class StepperProfile:
    name: str
    # comms defaults
    default_baud: int = 38400
    default_parity: str = "N"
    default_stopbits: float = 1
    default_address: int = 1
    read_fn: int = 0x03

    # enable (Pr0.07 forced enable over comms)
    enable_reg: int = 0x000F
    enable_value: int = 1
    disable_value: int = 0

    # control word (0x1801) one-shot actions
    control_word_reg: int = 0x1801
    cw_alarm_reset: int = 0x1111
    cw_save_eeprom: int = 0x2211

    # PR trigger register (0x6002) + values
    trigger_reg: int = 0x6002
    trig_run_pr0: int = 0x10        # run path 0 (path N = 0x10 + N)
    trig_estop: int = 0x40          # quick stop

    # PR0 path block (Pr9.00..9.05)
    pr0_mode_reg: int = 0x6200
    pr0_pos_hi_reg: int = 0x6201
    pr0_pos_lo_reg: int = 0x6202
    pr0_vel_reg: int = 0x6203
    pr0_acc_reg: int = 0x6204
    pr0_dec_reg: int = 0x6205

    # status / feedback
    motion_state_reg: int = 0x1003   # bit0 fault,1 enabled,2 running,4 cmd done,5 path done,6 home done
    fb_vel_hi_reg: int = 0x1046      # feedback velocity (rpm, signed 32-bit)
    fb_vel_lo_reg: int = 0x1047
    fb_pos_hi_reg: int = 0x1014      # feedback position (steps, signed 32-bit)
    fb_pos_lo_reg: int = 0x1015
    alarm_reg: int = 0x2203          # current alarm code

    # setup params
    microstep_reg: int = 0x0001      # Pr0.00 pulses/rev
    direction_reg: int = 0x0007      # Pr0.03
    peak_current_reg: int = 0x0191   # Pr5.00 (unit 0.1 A)

    # per-group (base, stride) for the "Pr<g>.<r>" token -> register translation.
    # Confirmed groups; others fall through to raw "#0xADDR".
    pr_group_map: Dict[int, tuple] = field(default_factory=lambda: {
        0: (0x0001, 2),   # Pr0.r = 0x0001 + 2r
        4: (0x0141, 2),   # Pr4.r = 0x0141 + 2r  (Pr4.02 -> 0x0145)
        5: (0x0191, 2),   # Pr5.r = 0x0191 + 2r
        6: (0x01E1, 2),   # Pr6.r = 0x01E1 + 2r
        8: (0x6000, 1),   # Pr8.r = 0x6000 + r
        9: (0x6200, 1),   # Pr9.r = 0x6200 + r
    })

    def param_to_register(self, token: str) -> int:
        """Translate 'Pr<g>.<r>' (or 'P<g>.<r>') to a Modbus address."""
        t = token.strip().upper().lstrip("P").lstrip("R")
        if "." not in t:
            raise StepperError(f"bad parameter token {token!r}")
        g_s, r_s = t.split(".", 1)
        g, r = int(g_s), int(r_s)
        if g not in self.pr_group_map:
            raise StepperError(f"Pr group {g} not mapped; use raw #0xADDR")
        base, stride = self.pr_group_map[g]
        return base + stride * r


DM556RS = StepperProfile(name="STEPPERONLINE DM556RS")


# ---------------------------------------------------------------------------
#  Stepper (motor) configuration
# ---------------------------------------------------------------------------
@dataclass
class StepperConfig:
    name: str = "Stepper"
    steps_per_rev: int = 10000      # Pr0.00 microstep (pulses/rev the driver commands)
    full_step_deg: float = 1.8      # motor native step angle (informational; 1.8 = 200 steps/rev)
    peak_current_a: float = 2.0     # -> Pr5.00 in 0.1 A units
    reverse: bool = False           # Pr0.03 direction
    max_rpm: float = 3000.0         # clamp for set_velocity
    accel: int = 100                # ms / 1000 rpm
    decel: int = 100                # ms / 1000 rpm


# ---------------------------------------------------------------------------
#  Controller (one serial port, one drive)
# ---------------------------------------------------------------------------
_STEP_CMD_ALIASES = {
    "RUN": "ENABLE", "DISABLE": "STOP", "VEL": "VELOCITY", "RPM": "VELOCITY",
    "RESET": "ALARM_RESET", "FAULT_RESET": "ALARM_RESET",
}

# Console logging of the Modbus exchange. OFF by default now that the drive is
# proven -- flip the per-instance "Log IO" checkbox in the Stepper Units editor
# (or STEP_LOG_IO here) to see each ENABLE/VELOCITY/setup frame + reply when
# debugging. STEP_LOG_READS additionally includes the (chatty) polling reads.
# NOTE: connect/setup status lines + undelivered-command warnings always print
# regardless of these flags.
STEP_LOG_IO = False
STEP_LOG_READS = False

# --- Modbus RTU reliability ---
# RS-485 frames occasionally drop (overrun / noise). These make a single lost
# frame self-heal instead of aborting a whole move.
STEP_IO_RETRIES = 2          # extra attempts on a lost/garbled reply (0 = off)
STEP_IO_RETRY_DELAY = 0.01   # s between attempts
STEP_IO_GAP = 0.003          # s minimum silence between transactions (RTU 3.5-char)
STEP_REPLY_TIMEOUT = 0.12    # s to wait for a reply (capped by the instance timeout);
                             # a Modbus reply is ~ms, so this catches a miss fast
                             # instead of stalling on the full 0.5 s instance timeout


class StepperController:
    """Owns the serial port and talks to one stepper drive via its profile.
    Writes are gated until a read succeeds (proves we are on the right device)."""

    def __init__(self, profile: StepperProfile, port: str,
                 baud: Optional[int] = None, parity: Optional[str] = None,
                 stopbits: Optional[float] = None, address: Optional[int] = None,
                 timeout: float = 0.5, config: Optional[StepperConfig] = None):
        self.profile = profile
        self.port = port
        self.baud = baud if baud is not None else profile.default_baud
        self.parity = (parity or profile.default_parity).upper()
        self.stopbits = stopbits if stopbits is not None else profile.default_stopbits
        self.address = address if address is not None else profile.default_address
        self.timeout = timeout
        self.config = config or StepperConfig()

        self.name = port                 # overwritten with the instance name by build()
        self.log_io = STEP_LOG_IO         # log Modbus writes/commands
        self.log_reads = STEP_LOG_READS   # also log polling reads (chatty)

        # Modbus RTU reliability knobs
        self.io_retries = STEP_IO_RETRIES
        self.io_retry_delay = STEP_IO_RETRY_DELAY
        self.io_gap = STEP_IO_GAP
        self.reply_timeout = min(self.timeout, STEP_REPLY_TIMEOUT)
        self._last_txn_t = 0.0

        self.ser = None
        self.connected = False
        self._io_lock = threading.RLock()
        self._proved_read = False
        self._enabled = False
        self._last_write_fault = None

    # ---- connection ------------------------------------------------------
    def connect(self, quiet: bool = False) -> bool:
        if not _HAVE_SERIAL:
            raise StepperError("pyserial not available; cannot open stepper port")
        sb = {1: serial.STOPBITS_ONE, 2: serial.STOPBITS_TWO}.get(
            int(self.stopbits), serial.STOPBITS_ONE)
        par = {"N": serial.PARITY_NONE, "E": serial.PARITY_EVEN,
               "O": serial.PARITY_ODD}.get(self.parity, serial.PARITY_NONE)
        try:
            self.ser = serial.Serial(
                port=self.port, baudrate=self.baud, bytesize=serial.EIGHTBITS,
                parity=par, stopbits=sb, timeout=self.reply_timeout,
                write_timeout=self.timeout)
            self.connected = True
            return True
        except Exception:
            self.connected = False
            return False

    def disconnect(self):
        if self.ser and getattr(self.ser, "is_open", False):
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

    # ---- low-level Modbus ------------------------------------------------
    @staticmethod
    def _hex(frame: bytes) -> str:
        return " ".join("%02X" % b for b in frame) if frame else "(none)"

    @staticmethod
    def _decode_req(frame: bytes) -> str:
        """Human-readable summary of an outgoing request frame
        [addr, fn, hi, lo, ...]."""
        if len(frame) < 4:
            return ""
        fn = frame[1]
        try:
            if fn == 0x06 and len(frame) >= 6:           # write single
                addr = (frame[2] << 8) | frame[3]
                val = (frame[4] << 8) | frame[5]
                sval = val - 0x10000 if val >= 0x8000 else val
                return "W 0x%04X = 0x%04X (%d)" % (addr, val, sval)
            if fn == 0x10 and len(frame) >= 6:           # write multiple
                addr = (frame[2] << 8) | frame[3]
                cnt = (frame[4] << 8) | frame[5]
                return "W* 0x%04X x%d" % (addr, cnt)
            if fn == 0x03 and len(frame) >= 6:           # read
                addr = (frame[2] << 8) | frame[3]
                cnt = (frame[4] << 8) | frame[5]
                return "R 0x%04X x%d" % (addr, cnt)
        except Exception:
            pass
        return "fn 0x%02X" % fn

    def _iolog(self, tag: str, frame: bytes, note: str = ""):
        try:
            print("[STEP %s %s] %s%s" % (
                self.name, tag, self._hex(frame),
                ("   " + note) if note else ""), flush=True)
        except Exception:
            pass

    def _txn(self, pdu: bytes, expected_len: int) -> bytes:
        """One Modbus transaction with automatic resend on a lost/garbled reply.

        A timeout / short frame / CRC / address mismatch is retried up to
        io_retries times -- those mean the request or its reply was dropped on
        the wire, so re-sending is the right move (every register write here is
        idempotent; NOTE: a *relative* position-move trigger would double-move
        if its reply were lost, so use absolute moves for dosing). A Modbus
        *exception* reply is NOT retried -- the drive answered, so it's a real
        error. A minimum inter-frame gap is enforced first to honor RTU 3.5-char
        silence and stop overrunning the drive (the usual cause of the drops)."""
        if not self.ser or not getattr(self.ser, "is_open", False):
            raise StepperCommError("serial port not open")
        frame = bytes([self.address]) + pdu
        frame += struct.pack("<H", modbus_crc16(frame))
        req_fn = pdu[0] if pdu else 0
        do_log = self.log_io and (req_fn in (0x06, 0x10) or self.log_reads)
        attempts = 1 + max(0, int(self.io_retries))
        last_err = None
        for attempt in range(attempts):
            try:
                return self._txn_once(frame, expected_len, do_log, attempt, attempts)
            except StepperModbusException:
                raise                       # drive answered with an error -> real
            except StepperCommError as e:
                last_err = e
                if attempt + 1 < attempts:
                    time.sleep(self.io_retry_delay)
                    continue
                raise
        raise last_err or StepperCommError("transaction failed")

    def _txn_once(self, frame: bytes, expected_len: int,
                  do_log: bool, attempt: int, attempts: int) -> bytes:
        # Enforce minimum silence before keying the bus (RTU inter-frame gap).
        if self.io_gap > 0:
            wait = self.io_gap - (time.time() - self._last_txn_t)
            if wait > 0:
                time.sleep(wait)
        note = self._decode_req(frame) + ("" if attempt == 0 else " (retry %d)" % attempt)
        try:
            with self._io_lock:
                self.ser.reset_input_buffer()
                if do_log:
                    self._iolog("TX", frame, note)
                self.ser.write(frame)
                head = self.ser.read(2)
                if len(head) < 2:
                    raise StepperCommError("no response (timeout)")
                fn = head[1]
                if fn & 0x80:
                    code = self.ser.read(1)
                    self.ser.read(2)
                    raise StepperModbusException(fn & 0x7F, code[0] if code else 0)
                rest = self.ser.read(expected_len - 2 + 2)
                reply = head + rest
            if len(reply) < expected_len + 2:
                raise StepperCommError(f"short reply: got {len(reply)} want {expected_len + 2}")
            body, crc_rx = reply[:-2], struct.unpack("<H", reply[-2:])[0]
            if modbus_crc16(body) != crc_rx:
                raise StepperCommError("CRC mismatch")
            if body[0] != self.address:
                raise StepperCommError(f"address mismatch: got {body[0]} want {self.address}")
            if do_log:
                self._iolog("RX", reply)
            return body
        except StepperCommError as e:
            if do_log:
                self._iolog("RX", b"", "ERROR: %s%s" % (
                    e, " -- resending" if attempt + 1 < attempts else " -- gave up"))
            raise
        finally:
            self._last_txn_t = time.time()

    def read_registers(self, start: int, count: int, fn: Optional[int] = None) -> List[int]:
        fn = fn if fn is not None else self.profile.read_fn
        pdu = bytes([fn, (start >> 8) & 0xFF, start & 0xFF, (count >> 8) & 0xFF, count & 0xFF])
        body = self._txn(pdu, 3 + 2 * count)
        nbytes = body[2]
        data = body[3:3 + nbytes]
        regs = [struct.unpack(">H", data[i:i + 2])[0] for i in range(0, len(data), 2)]
        self._proved_read = True
        return regs

    def read_register(self, addr: int, fn: Optional[int] = None) -> int:
        return self.read_registers(addr, 1, fn=fn)[0]

    def read_register32(self, hi_addr: int) -> int:
        regs = self.read_registers(hi_addr, 2)
        return _join32(regs[0], regs[1])

    def write_register(self, addr: int, value: int) -> None:
        if not self._proved_read:
            raise StepperError("refusing to write before a successful read")
        v = _u16(value)
        pdu = bytes([0x06, (addr >> 8) & 0xFF, addr & 0xFF, (v >> 8) & 0xFF, v & 0xFF])
        self._txn(pdu, 6)

    def write_registers(self, start: int, values: List[int]) -> None:
        """FC 0x10 write-multiple (used for 32-bit position pairs)."""
        if not self._proved_read:
            raise StepperError("refusing to write before a successful read")
        n = len(values)
        data = b"".join(struct.pack(">H", _u16(v)) for v in values)
        pdu = bytes([0x10, (start >> 8) & 0xFF, start & 0xFF,
                     (n >> 8) & 0xFF, n & 0xFF, 2 * n]) + data
        self._txn(pdu, 6)   # echo: addr,fn,shi,slo,nhi,nlo

    # ---- commands --------------------------------------------------------
    def enable(self):
        self.write_register(self.profile.enable_reg, self.profile.enable_value)
        self._enabled = True

    def disable(self):
        # quick-stop then drop enable
        try:
            self.write_register(self.profile.trigger_reg, self.profile.trig_estop)
        except StepperError:
            pass
        self.write_register(self.profile.enable_reg, self.profile.disable_value)
        self._enabled = False

    def stop(self):
        self.write_register(self.profile.trigger_reg, self.profile.trig_estop)

    def set_velocity(self, rpm: float):
        """Profile Velocity: run continuously at rpm (sign = direction)."""
        p = self.profile
        rpm = max(-self.config.max_rpm, min(self.config.max_rpm, float(rpm)))
        if abs(rpm) < 1e-6:
            self.stop()
            return
        self.write_register(p.pr0_mode_reg, MODE_VELOCITY)
        self.write_register(p.pr0_vel_reg, _u16(int(round(rpm))))   # signed rpm
        self.write_register(p.pr0_acc_reg, _u16(self.config.accel))
        self.write_register(p.pr0_dec_reg, _u16(self.config.decel))
        self.write_register(p.trigger_reg, p.trig_run_pr0)

    def move(self, steps: int, rpm: Optional[float] = None, absolute: bool = False):
        """Profile Position: move `steps` (relative unless absolute)."""
        p = self.profile
        vel = self.config.max_rpm if rpm is None else min(abs(float(rpm)), self.config.max_rpm)
        hi, lo = _split32(int(steps))
        self.write_register(p.pr0_mode_reg, MODE_POS_ABS if absolute else MODE_POS_REL)
        self.write_registers(p.pr0_pos_hi_reg, [hi, lo])
        self.write_register(p.pr0_vel_reg, _u16(int(round(vel))))
        self.write_register(p.pr0_acc_reg, _u16(self.config.accel))
        self.write_register(p.pr0_dec_reg, _u16(self.config.decel))
        self.write_register(p.trigger_reg, p.trig_run_pr0)

    def move_to(self, steps: int, rpm: Optional[float] = None):
        self.move(steps, rpm=rpm, absolute=True)

    def jog(self, direction: float):
        """Jog via Profile Velocity at the config jog/typical rate. 0 = stop.
        (Uses velocity mode, so no <50 ms keep-alive is needed.)"""
        if abs(direction) < 1e-6:
            self.stop()
        else:
            self.set_velocity(self.config.max_rpm * (1.0 if direction > 0 else -1.0))

    def alarm_reset(self):
        self.write_register(self.profile.control_word_reg, self.profile.cw_alarm_reset)

    def apply_setup(self):
        """Write microstep, peak current, direction from the StepperConfig."""
        p, c = self.profile, self.config
        self.write_register(p.microstep_reg, _u16(c.steps_per_rev))
        self.write_register(p.peak_current_reg, _u16(int(round(c.peak_current_a * 10))))
        self.write_register(p.direction_reg, 1 if c.reverse else 0)

    # ---- params / raw registers -----------------------------------------
    def read_param(self, token: str) -> int:
        if token.startswith("#"):
            return self.read_register(int(token[1:], 0))
        return self.read_register(self.profile.param_to_register(token))

    def write_param(self, token: str, value: int) -> None:
        if token.startswith("#"):
            self.write_register(int(token[1:], 0), value)
        else:
            self.write_register(self.profile.param_to_register(token), value)

    # ---- status / snapshot ----------------------------------------------
    def read_status(self) -> dict:
        p = self.profile
        st = self.read_register(p.motion_state_reg)
        snap = {
            "fault": bool(st & 0x01),
            "enabled": bool(st & 0x02),
            "running": bool(st & 0x04),
            "cmd_complete": bool(st & 0x10),
            "path_complete": bool(st & 0x20),
            "homing_complete": bool(st & 0x40),
            "velocity": float(self.read_register32(p.fb_vel_hi_reg)),
            "position": float(self.read_register32(p.fb_pos_hi_reg)),
            "alarm": int(self.read_register(p.alarm_reg)),
            "write_fault": bool(self._last_write_fault),
        }
        return snap

    def probe(self) -> bool:
        """Presence check. Opening the serial port succeeds even with nothing
        attached (serial has no device handshake), so connect()==True does NOT
        mean a drive is there. Issue one real Modbus read: a normal reply OR a
        Modbus exception reply both prove the drive answered (it's present); a
        timeout / CRC error / no-reply means absent. Used by build() so a
        missing or unpowered drive is reported FAILED instead of 'connected'."""
        try:
            self.read_register(self.profile.motion_state_reg)
            return True
        except StepperModbusException:
            # The drive answered with an exception code -> it's on the bus
            # (the register/map may just be off; DM556RS map is bench-unverified).
            return True
        except Exception:
            return False

    # ---- command dispatch (mirrors VFD request_command) ------------------
    def request_command(self, cmd: str, value: float) -> bool:
        c = cmd.strip().upper()
        c = _STEP_CMD_ALIASES.get(c, c)
        try:
            if c == "ENABLE":
                self.enable() if float(value) >= 1.0 else self.disable()
            elif c == "VELOCITY":
                self.set_velocity(float(value))
            elif c == "MOVE":
                self.move(int(value))
            elif c == "MOVETO":
                self.move_to(int(value))
            elif c == "STOP":
                self.stop()
            elif c == "JOG":
                self.jog(float(value))
            elif c == "ALARM_RESET":
                if float(value) >= 1.0:
                    self.alarm_reset()
            else:
                return False
            self._last_write_fault = None
            return True
        except StepperError as e:
            self._last_write_fault = str(e)
            return False


# ---------------------------------------------------------------------------
#  Worker (background serial I/O per drive) — mirrors VFDWorker
# ---------------------------------------------------------------------------
class StepperWorker:
    def __init__(self, name: str, ctrl: StepperController,
                 poll_period: float = 0.1, write_queue_max: int = 256):
        self.name = name
        self.ctrl = ctrl
        self.poll_period = max(0.0, float(poll_period))   # 0 == continuous
        self._watch: Dict[str, int] = {}                  # token -> Modbus addr
        self._snapshot: dict = {}
        self._snap_lock = threading.Lock()
        self._wq = _queue.Queue(maxsize=int(write_queue_max))
        self._stop = threading.Event()
        self._thread = None
        self._overflow = 0

    def set_watch(self, tokens):
        watch = {}
        for tok in tokens or []:
            try:
                watch[tok] = int(tok[1:], 0) if tok.startswith("#") \
                    else self.ctrl.profile.param_to_register(tok)
            except Exception:
                pass
        self._watch = watch

    def request_write(self, token: str, value: float, save=False, verify=None) -> bool:
        try:
            self._wq.put_nowait(("w", token, int(round(float(value)))))
            return True
        except _queue.Full:
            self._overflow += 1
            return False

    def request_command(self, cmd: str, value: float) -> bool:
        try:
            self._wq.put_nowait(("c", str(cmd).upper(), float(value)))
            return True
        except _queue.Full:
            self._overflow += 1
            return False

    def _drain_writes(self):
        while True:
            try:
                kind, a, b = self._wq.get_nowait()
            except _queue.Empty:
                return
            try:
                if kind == "c":
                    self.ctrl.request_command(a, b)
                else:
                    self.ctrl.write_param(a, int(b))
            except Exception:
                pass

    def snapshot(self) -> dict:
        with self._snap_lock:
            return dict(self._snapshot)

    def get_value(self, token: str):
        with self._snap_lock:
            return self._snapshot.get(token)

    def start(self):
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(
            target=self._run, name=f"stepper-worker-{self.name}", daemon=True)
        self._thread.start()

    def stop(self, join_timeout: float = 2.0):
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=join_timeout)

    def _run(self):
        while not self._stop.is_set():
            t0 = time.time()
            self._drain_writes()                       # writes first -> responsive
            snap = {}
            try:
                snap.update(self.ctrl.read_status())
                snap["ok"] = True
            except Exception as e:
                snap["ok"] = False
                snap["error"] = str(e)
            for tok, addr in list(self._watch.items()):
                try:
                    snap[tok] = self.ctrl.read_register(addr)
                except Exception:
                    pass
            # carry forward last-good for readings missed this cycle (avoid 0-glitch)
            prev = self._snapshot or {}
            for k, pv in prev.items():
                if k in ("ok", "error") or pv is None:
                    continue
                if snap.get(k) is None:
                    snap[k] = pv
            with self._snap_lock:
                self._snapshot = snap
            dt = self.poll_period - (time.time() - t0)
            if dt > 0:
                self._stop.wait(dt)


# ---------------------------------------------------------------------------
#  Manager (loads config, owns controllers + workers) — mirrors VFDManager
# ---------------------------------------------------------------------------
STEPPER_PROFILES = {"dm556rs": DM556RS}   # drive_key -> code-defined profile


def _config_from_cfg(d: dict) -> StepperConfig:
    if not d:
        return StepperConfig()
    return StepperConfig(
        name=d.get("name", "Stepper"),
        steps_per_rev=int(d.get("steps_per_rev", 10000)),
        full_step_deg=float(d.get("full_step_deg", 1.8)),
        peak_current_a=float(d.get("peak_current_a", 2.0)),
        reverse=bool(d.get("reverse", False)),
        max_rpm=float(d.get("max_rpm", 3000.0)),
        accel=int(d.get("accel", 100)),
        decel=int(d.get("decel", 100)),
    )


class StepperManager:
    """Loads stepper_configs.json / stepper_instances.json and owns one
    StepperController + StepperWorker per included instance, keyed by name.
    Drive *profiles* are code-defined (STEPPER_PROFILES) and chosen by drive_key."""

    def __init__(self, cfg_dir):
        self.cfg_dir = Path(cfg_dir)
        self.configs: dict = {}       # key -> stepper config dict
        self.instances: list = []
        self.controllers: dict = {}   # name -> StepperController
        self.workers: dict = {}       # name -> StepperWorker

    def load_files(self):
        def _read(name, default):
            p = self.cfg_dir / name
            if not p.exists():
                return default
            try:
                return json.loads(p.read_text(encoding="utf-8"))
            except Exception:
                return default
        cfgs = _read("stepper_configs.json", {"configs": []})
        inst = _read("stepper_instances.json", {"instances": []})
        self.configs = {x["key"]: x for x in cfgs.get("configs", []) if "key" in x}
        self.instances = inst.get("instances", [])

    def disconnect_all(self):
        self.stop_workers()
        for c in self.controllers.values():
            try:
                c.disconnect()
            except Exception:
                pass
        self.controllers = {}

    def build(self, connect: bool = True, do_setup: bool = True):
        """(Re)build controllers from the included instances. One instance per
        serial port. Returns list of (name, ok, error)."""
        self.disconnect_all()
        results = []
        seen_ports = {}
        for inst in self.instances:
            if not inst.get("include"):
                continue
            name = inst.get("name", "Stepper")
            port = inst.get("port", "COM1")
            if port in seen_ports:
                results.append((name, False,
                                f"port {port} already used by '{seen_ports[port]}'"))
                continue
            seen_ports[port] = name
            try:
                profile = STEPPER_PROFILES.get((inst.get("drive_key") or "").lower())
                if profile is None:
                    raise StepperError(f"drive_key '{inst.get('drive_key')}' not found")
                config = _config_from_cfg(self.configs.get(inst.get("config_key"), {}))
                ctrl = StepperController(
                    profile, port, baud=inst.get("baud"), parity=inst.get("parity"),
                    stopbits=inst.get("stopbits"), address=inst.get("address"),
                    timeout=float(inst.get("timeout", 0.5)), config=config)
                ctrl.name = name
                # Per-instance Modbus-reliability overrides (UI: Stepper Units
                # editor). Fall back to the module defaults when unset.
                # reply_timeout must be applied BEFORE connect() (it sets the
                # serial read timeout).
                if inst.get("io_log") is not None:
                    ctrl.log_io = bool(inst["io_log"])
                if inst.get("io_retries") is not None:
                    ctrl.io_retries = max(0, int(inst["io_retries"]))
                if inst.get("io_gap_ms") is not None:
                    ctrl.io_gap = max(0.0, float(inst["io_gap_ms"])) / 1000.0
                if inst.get("io_reply_ms") is not None:
                    ctrl.reply_timeout = max(0.005, float(inst["io_reply_ms"]) / 1000.0)
                ok = ctrl.connect() if connect else True
                if ok and connect:
                    # Port opened but no drive answered -> report absent rather
                    # than silently reporting "connected" (serial open alone is
                    # not proof a device is present).
                    if not ctrl.probe():
                        ctrl.disconnect()
                        print("[STEP %s] connect FAILED: no Modbus reply on %s @ %s"
                              % (name, port, ctrl.baud), flush=True)
                        results.append((name, False, f"no reply from drive on {port}"))
                        continue
                    print("[STEP %s] CONNECTED on %s @ %s %s%d1 addr=%d -- drive answered"
                          % (name, port, ctrl.baud, ctrl.parity,
                             8, ctrl.address), flush=True)
                if ok and connect and do_setup and inst.get("auto_setup"):
                    print("[STEP %s] applying setup: microstep=%d, peak=%.1fA, reverse=%s"
                          % (name, ctrl.config.steps_per_rev,
                             ctrl.config.peak_current_a, ctrl.config.reverse), flush=True)
                    try:
                        ctrl.read_status()
                        ctrl.apply_setup()
                    except Exception as _se:
                        print("[STEP %s] setup warning: %s" % (name, _se), flush=True)
                self.controllers[name] = ctrl
                results.append((name, ok, None if ok else "connect failed"))
            except Exception as e:
                results.append((name, False, str(e)))
        return results

    def get(self, name):
        return self.controllers.get(name)

    def start_workers(self, poll_period: float = 0.1):
        self.stop_workers()
        for name, ctrl in self.controllers.items():
            inst = next((i for i in self.instances if i.get("name") == name), {})
            pr = inst.get("poll_rate_ms", None)
            period = (float(pr) / 1000.0) if pr is not None else poll_period
            w = StepperWorker(name, ctrl, poll_period=period)
            self.workers[name] = w
            w.start()

    def stop_workers(self):
        for w in self.workers.values():
            try:
                w.stop()
            except Exception:
                pass
        self.workers = {}

    def set_watch_all(self, tokens_by_drive: dict):
        for name, toks in (tokens_by_drive or {}).items():
            w = self.workers.get(name)
            if w:
                w.set_watch(toks)

    def request_command(self, name: str, cmd: str, value: float) -> bool:
        w = self.workers.get(name)
        return w.request_command(cmd, value) if w else False

    def request_write(self, name: str, token: str, value: float,
                      save=False, verify=None) -> bool:
        w = self.workers.get(name)
        return w.request_write(token, value, save=save, verify=verify) if w else False

    def snapshot_all(self) -> dict:
        return {name: w.snapshot() for name, w in self.workers.items()}
