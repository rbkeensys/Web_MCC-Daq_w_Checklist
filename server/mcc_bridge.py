# server/mcc_bridge.py
__version__ = "2.6.0"  # RASPBERRY PI / LINUX PORT: full E-1608 uldaq parity -- open via product-name-filtered Ethernet discovery (boardNum = ordinal among E-1608s sorted by unique id), AI a_in (eng volts), AO a_out (volts, +/-10 clamp), DO d_bit_out (first port type, bits pre-configured OUT), CTR c_in/c_clear, DO safe-init. E-TC uldaq open prefers name-filtered ordinal (mixed inventory). close() disconnects everything, no longer references stale single-board attrs (latent AttributeError fixed). All guarded by HAVE_ULDAQ/_ul_1608 -- byte-identical behavior on Windows/mcculw. Prev 2.5.1:  # start_buzz(active_high=None) derives the channel Invert. Prev 2.5.0: DO INVERT: per-channel `invert` from DigitalOutCfg applied in set_do (active_high=None default derives physical = logical XOR invert) -- expression toggle writes AND pwm_step now honor it (both hardcoded active_high=True before, so the config polarity was dead). All DOs driven to logical OFF at open() so an inverted load isn't left energized from board power-up. Prev 2.4.0: E-TC DIGITAL INPUTS: read_etc_dins() reads DIO bits configured as inputs (mcculw ul.d_bit_in on AUXPORT / uldaq dio.d_bit_in), configured at open() from boardsetc[].digitalInputs; returns {static_var: 0/1} which server stamps into statics for a High-Level switch. Prev 2.3.0: CTR is a first-class input: counters read from board.counters[] (CounterCfg) into a dedicated CTR signal array via read_counters() (was apply_counter_rates onto AI). rate|total modes + rollover-safe total kept. Prev 2.2.0: counter 'total' mode on AI; 2.1.0: counter-sourced AI + PWM DOs
BRIDGE_VERSION = "2.0.6"  # Fixed missing imports

import asyncio
from typing import List, Optional


# ---------- Try mcculw (E-1608 AI/AO/DO and optional TCs) ----------
HAVE_MCCULW = False
try:
    from mcculw import ul
    from mcculw.enums import (
        ULRange,
        DigitalPortType,
        AnalogInputMode,
        TempScale as MCCTempScale,
    )
    HAVE_MCCULW = True
except Exception as e:
    ul = None  # type: ignore
    HAVE_MCCULW = False
    print(f"[MCCBridge] mcculw import failed: {e}")

# Digital-input direction enum (mcculw) -- optional so a missing enum can't disable AI/TC
try:
    from mcculw.enums import DigitalIODirection as MCCDigitalDir
except Exception:
    MCCDigitalDir = None

# ---------- Try ULDAQ (E-TC preferred path) ----------
HAVE_ULDAQ = False
HAVE_ULDAQ_CFG = False
try:
    import uldaq
    from uldaq import (
        get_daq_device_inventory,
        DaqDevice,
        InterfaceType,
        TempScale,
    )
    # Name drift across uldaq python releases (never validated before the Pi
    # port -- uldaq could not load on Windows): TInFlags/ThermocoupleType in
    # some builds, TInFlag/TcType in the current pip package. Alias either.
    try:
        from uldaq import TInFlags
    except ImportError:
        from uldaq import TInFlag as TInFlags
    try:
        from uldaq import ThermocoupleType
    except ImportError:
        from uldaq import TcType as ThermocoupleType
    HAVE_ULDAQ = True
    try:
        from uldaq import ConfigItem  # some builds expose this
        HAVE_ULDAQ_CFG = True
    except Exception:
        HAVE_ULDAQ_CFG = False
    # E-1608 support via uldaq (Raspberry Pi / Linux port) -- each optional so a
    # partial uldaq build cannot take down the TC path that already worked
    try:
        from uldaq import AiInputMode as UlAiInputMode, Range as UlRange, \
            AInFlag as UlAInFlag, AOutFlag as UlAOutFlag
    except Exception:
        UlAiInputMode = UlRange = UlAInFlag = UlAOutFlag = None
except Exception as e:
    # On Windows this usually fails because libuldaq.so/.dll isn't present
    HAVE_ULDAQ = False
    HAVE_ULDAQ_CFG = False
    # Define a stub so _TC_MAP_ULDAQ construction doesn't crash
    ThermocoupleType = None  # type: ignore
    UlAiInputMode = UlRange = UlAInFlag = UlAOutFlag = None
    print(f"[MCCBridge] uldaq import failed: {e}")

# Digital direction enum (uldaq) -- optional
try:
    from uldaq import DigitalDirection as UlDigitalDir
except Exception:
    UlDigitalDir = None

# Optional MCC thermocouple enum (not on all installs)
MCCTcType = None
if HAVE_MCCULW:
    try:
        from mcculw.enums import TcType as MCCTcType  # type: ignore
    except Exception:
        MCCTcType = None

from app_models import AppConfig

# ---------- TC type maps ----------
_TC_MAP_ULDAQ = {
    "J": ThermocoupleType.J if HAVE_ULDAQ and ThermocoupleType else None,
    "K": ThermocoupleType.K if HAVE_ULDAQ and ThermocoupleType else None,
    "T": ThermocoupleType.T if HAVE_ULDAQ and ThermocoupleType else None,
    "E": ThermocoupleType.E if HAVE_ULDAQ and ThermocoupleType else None,
    "N": ThermocoupleType.N if HAVE_ULDAQ and ThermocoupleType else None,
    "B": ThermocoupleType.B if HAVE_ULDAQ and ThermocoupleType else None,
    "R": ThermocoupleType.R if HAVE_ULDAQ and ThermocoupleType else None,
    "S": ThermocoupleType.S if HAVE_ULDAQ and ThermocoupleType else None,
}

_TC_MAP_MCC = {
    "J": getattr(MCCTcType, "J", None) if MCCTcType else None,
    "K": getattr(MCCTcType, "K", None) if MCCTcType else None,
    "T": getattr(MCCTcType, "T", None) if MCCTcType else None,
    "E": getattr(MCCTcType, "E", None) if MCCTcType else None,
    "N": getattr(MCCTcType, "N", None) if MCCTcType else None,
    "B": getattr(MCCTcType, "B", None) if MCCTcType else None,
    "R": getattr(MCCTcType, "R", None) if MCCTcType else None,
    "S": getattr(MCCTcType, "S", None) if MCCTcType else None,
}


class AIFrame:
    def __init__(self, vals: List[float]):
        self.vals = vals


class MCCBridge:
    def __init__(self):
        self.cfg: Optional[AppConfig] = None

        # Multi-board support: store all enabled boards
        self._boards_1608 = []  # List of E-1608 board numbers
        self._boards_etc_uldaq = []  # List of (board_num, dev, tdev) tuples for ULDAQ
        self._boards_etc_mcc = []  # List of E-TC board numbers for mcculw
        self._etc_dins = []  # E-TC digital-input read specs (dicts): static_var, lib, ...

        # AO/DO soft mirrors - sized dynamically based on board count
        self._do_bits = []  # num_1608_boards * 8
        self._ao_vals = []  # num_1608_boards * 2
        self._do_active_high = []
        self._buzz_tasks = {}

        # Counter-sourced AI channels (pulse flow meters on CTR<n>)
        self._counters = []  # list of dicts: index/board/ctr/K/window/prev_count/prev_t/rate
        # uldaq-opened E-1608s (Raspberry Pi / Linux): boardNum -> subsystem handles
        self._ul_1608 = {}
        self._ul_inventory = None
        # Legacy single-board attrs still referenced by close()/_set_tc_type guards
        self._etc_uldaq_ok = False
        self._etc_uldaq_dev = None
        self._etc_uldaq_tdev = None
        self._etc_mcc_board = None
        # PWM-mode digital outputs: global DO index -> {period_s, duty}
        self._pwm = {}

        # TC type cache - now indexed by global channel index
        self._tc_type_set_cache = {}  # global_ch -> "K"/"J"/...
        # AUTO-DETECTION
        self._tc_detected = False
        self._tc_runtime_include = {}  # global_ch -> bool

    # ---------------- Lifecycle ----------------
    def open(self, cfg: AppConfig):
        """Open and configure ALL enabled boards"""
        self.cfg = cfg
        
        # Clear previous board lists
        self._boards_1608 = []
        self._boards_etc_uldaq = []
        self._boards_etc_mcc = []
        self._etc_dins = []

        # === Configure ALL E-1608 boards ===
        if cfg.boards1608:
            for board_cfg in cfg.boards1608:
                if not board_cfg.enabled:
                    continue
                    
                board_num = board_cfg.boardNum
                self._boards_1608.append(board_num)
                
                if not HAVE_MCCULW and HAVE_ULDAQ:
                    # ---- Raspberry Pi / Linux: open the E-1608 via uldaq ----
                    # boardNum = ordinal among E-1608s found (sorted by unique id
                    # for stability), NOT an InstaCal number (no InstaCal on Linux).
                    try:
                        desc = self._ul_find_descriptor("E-1608", board_num)
                        if desc is None:
                            raise RuntimeError("no E-1608 descriptor at ordinal %d" % board_num)
                        dev = DaqDevice(desc)
                        dev.connect()
                        h = {"dev": dev,
                             "ai": dev.get_ai_device(),
                             "ao": dev.get_ao_device(),
                             "dio": dev.get_dio_device(),
                             "ctr": dev.get_ctr_device(),
                             "port": None,
                             "ai_mode": (UlAiInputMode.SINGLE_ENDED
                                         if (UlAiInputMode and str(board_cfg.aiMode).upper().startswith("SE"))
                                         else (UlAiInputMode.DIFFERENTIAL if UlAiInputMode else None))}
                        if h["dio"] is not None:
                            h["port"] = h["dio"].get_info().get_port_types()[0]
                            if UlDigitalDir is not None:
                                for _b in range(8):
                                    try:
                                        h["dio"].d_config_bit(h["port"], _b, UlDigitalDir.OUTPUT)
                                    except Exception:
                                        pass
                        self._ul_1608[board_num] = h
                        print(f"[MCCBridge] E-1608 #{board_num}: opened via ULDAQ ({desc.product_name} {getattr(desc,'unique_id','')})")
                    except Exception as e:
                        print(f"[MCCBridge] E-1608 #{board_num}: ULDAQ open failed: {e}")

                if HAVE_MCCULW:
                    try:
                        # DIO: AUXPORT -> OUT (8 bits)
                        ul.d_config_port(board_num, DigitalPortType.AUXPORT, 1)
                        print(f"[MCCBridge] E-1608 #{board_num}: DIO configured AUXPORT -> OUT")
                    except Exception as e:
                        print(f"[MCCBridge] E-1608 #{board_num}: DIO config warn: {e}")
                    
                    try:
                        mode = (
                            AnalogInputMode.SINGLE_ENDED
                            if str(board_cfg.aiMode).upper().startswith("SE")
                            else AnalogInputMode.DIFFERENTIAL
                        )
                        ul.a_input_mode(board_num, mode)
                        print(f"[MCCBridge] E-1608 #{board_num}: AI mode -> {mode.name}")
                    except Exception as e:
                        print(f"[MCCBridge] E-1608 #{board_num}: AI mode warn: {e}")
        
        num_1608 = len(self._boards_1608)
        print(f"[MCCBridge] Configured {num_1608} E-1608 board(s)")

        # === Hardware counters (CTR) -- a first-class input type, separate from AI. ===
        # The E-1608 has one 32-bit event counter (CTR0). Each included CounterCfg in
        # board.counters[] maps to a slot in the CTR signal array, in flatten order
        # (== get_all_counters()). read_counters() fills that array each tick.
        self._counters = []
        cidx = 0
        if cfg.boards1608:
            for board_cfg in cfg.boards1608:
                if not board_cfg.enabled:
                    continue
                for ch in (getattr(board_cfg, "counters", None) or []):
                    if not getattr(ch, "include", True):
                        continue
                    cnum = int(getattr(ch, "ctr_num", 0) or 0)
                    self._counters.append({
                        "index": cidx, "board": board_cfg.boardNum, "ctr": cnum,
                        "K": float(getattr(ch, "pulses_per_unit", 1.0) or 1.0),
                        "window": float(getattr(ch, "window_s", 1.0) or 1.0),
                        "mode": str(getattr(ch, "mode", "rate") or "rate"),
                        "prev_count": None, "prev_t": None, "rate": 0.0, "cum": 0,
                    })
                    if board_cfg.boardNum in self._ul_1608:
                        try:
                            _cd = self._ul_1608[board_cfg.boardNum]["ctr"]
                            if _cd is not None:
                                _cd.c_clear(cnum)
                                print(f"[MCCBridge] CTR[{cidx}] '{ch.name}' <- CTR{cnum} (uldaq) cleared")
                        except Exception as e:
                            print(f"[MCCBridge] CTR{cnum} uldaq clear warn: {e}")
                    if HAVE_MCCULW:
                        try:
                            ul.c_clear(board_cfg.boardNum, cnum)
                            print(f"[MCCBridge] CTR[{cidx}] '{ch.name}' <- CTR{cnum} "
                                  f"(board {board_cfg.boardNum}) cleared; K={getattr(ch,'pulses_per_unit',1.0)}/unit mode={getattr(ch,'mode','rate')}")
                        except Exception as e:
                            print(f"[MCCBridge] CTR{cnum} clear warn: {e}")
                    cidx += 1
        
        # Initialize DO/AO mirrors for all boards
        self._do_bits = [0] * (num_1608 * 8)
        self._ao_vals = [0.0] * (num_1608 * 2)
        self._do_active_high = [True] * (num_1608 * 8)
        # Per-DO INVERT (config `invert`): physical pin = logical XOR invert. Flatten
        # order matches get_all_digital_outputs() == the set_do index.
        self._do_invert = [False] * (num_1608 * 8)
        _gi = 0
        if cfg.boards1608:
            for board_cfg in cfg.boards1608:
                if not board_cfg.enabled:
                    continue
                for d in board_cfg.digitalOutputs:
                    if _gi < len(self._do_invert):
                        self._do_invert[_gi] = bool(getattr(d, "invert", False))
                        if self._do_invert[_gi]:
                            print(f"[MCCBridge] DO[{_gi}] '{d.name}' INVERTED (logical 1 -> pin 0)")
                    _gi += 1
        
        # === PWM digital outputs (mode 'pwm' -> tick-rate software PWM) ===
        # Global DO index matches get_all_digital_outputs() flatten order (== set_do index).
        self._pwm = {}
        gidx = 0
        if cfg.boards1608:
            for board_cfg in cfg.boards1608:
                if not board_cfg.enabled:
                    continue
                for d in board_cfg.digitalOutputs:
                    if getattr(d, "mode", "") == "pwm":
                        per = float(getattr(d, "pwmPeriodMs", 1000.0) or 1000.0) / 1000.0
                        self._pwm[gidx] = {"period_s": max(1e-3, per), "duty": 0.0}
                        print(f"[MCCBridge] DO[{gidx}] '{d.name}' PWM period={per*1000:.0f}ms")
                    gidx += 1

        # Drive every DO to its LOGICAL OFF state now that polarity is known: an
        # inverted channel's off = physical 1, and the pins power up 0 -- without this
        # an inverted load would sit energized from board power-up until the first write.
        if HAVE_MCCULW or self._ul_1608:
            for _i in range(len(self._do_bits)):
                try:
                    self.set_do(_i, False)
                except Exception:
                    pass

        # === Configure ALL E-TC boards ===
        if cfg.boardsetc:
            for board_cfg in cfg.boardsetc:
                if not board_cfg.enabled:
                    continue
                
                board_num = board_cfg.boardNum
                
                # Try ULDAQ first
                opened_uldaq = False
                if HAVE_ULDAQ:
                    try:
                        # Prefer product-name-filtered ordinal (Linux: inventory mixes
                        # E-1608s and E-TCs); fall back to the raw-index legacy behavior.
                        desc = self._ul_find_descriptor("E-TC", board_num)
                        if desc is None:
                            inv = get_daq_device_inventory(InterfaceType.ETHERNET)
                            if not inv:
                                inv = get_daq_device_inventory(InterfaceType.ANY)
                            if inv and 0 <= board_num < len(inv):
                                desc = inv[board_num]
                        if desc is not None:
                            dev = DaqDevice(desc)
                            dev.connect()
                            tdev = dev.get_temp_device()
                            if tdev is not None:
                                self._boards_etc_uldaq.append((board_num, dev, tdev))
                                print(f"[MCCBridge] E-TC #{board_num}: opened via ULDAQ")
                                opened_uldaq = True
                    except Exception as e:
                        print(f"[MCCBridge] E-TC #{board_num}: ULDAQ failed: {e}")
                
                # Fallback to mcculw if ULDAQ didn't work
                if not opened_uldaq and HAVE_MCCULW:
                    try:
                        # Smoke test
                        try:
                            _ = ul.t_in(board_num, 0, MCCTempScale.CELSIUS)
                        except Exception as e:
                            err_str = str(e).lower()
                            if "open connection" not in err_str and "open circuit" not in err_str:
                                raise
                        self._boards_etc_mcc.append(board_num)
                        print(f"[MCCBridge] E-TC #{board_num}: opened via mcculw")
                    except Exception as e:
                        print(f"[MCCBridge] E-TC #{board_num}: mcculw failed: {e}")
        
        total_etc = len(self._boards_etc_uldaq) + len(self._boards_etc_mcc)
        print(f"[MCCBridge] Configured {total_etc} E-TC board(s)")

        # === Configure E-TC DIGITAL INPUTS (DIO bits as input; e.g. High-Level switch) ===
        # mcculw is the Windows path; uldaq is the Linux path. Each read bit is stamped
        # into its named static var each tick (see server.py) so an expression reads it.
        for board_cfg in (cfg.boardsetc or []):
            if not board_cfg.enabled:
                continue
            board_num = board_cfg.boardNum
            for din in (getattr(board_cfg, "digitalInputs", None) or []):
                if not getattr(din, "include", True):
                    continue
                bit = int(getattr(din, "bit", 0))
                sv = getattr(din, "static_var", None)
                inv = bool(getattr(din, "invert", False))
                if not sv:
                    continue
                uldev = next((d for (bn, d, td) in self._boards_etc_uldaq if bn == board_num), None)
                if uldev is not None:
                    try:
                        dio = uldev.get_dio_device()
                        if dio is None:
                            print(f"[MCCBridge] E-TC #{board_num}: no DIO subsystem (DIN '{din.name}' skipped)")
                            continue
                        port = dio.get_info().get_port_types()[0]
                        if UlDigitalDir is not None:
                            dio.d_config_bit(port, bit, UlDigitalDir.INPUT)
                        self._etc_dins.append({"static_var": sv, "lib": "uldaq", "dio": dio,
                                               "port": port, "bit": bit, "invert": inv, "name": din.name})
                        print(f"[MCCBridge] E-TC #{board_num}: DIN '{din.name}' bit{bit} -> static.{sv} (uldaq)")
                    except Exception as e:
                        print(f"[MCCBridge] E-TC #{board_num}: DIN '{din.name}' uldaq config failed: {e}")
                elif board_num in self._boards_etc_mcc:
                    try:
                        if MCCDigitalDir is not None:
                            ul.d_config_bit(board_num, DigitalPortType.AUXPORT, bit, MCCDigitalDir.IN)
                        self._etc_dins.append({"static_var": sv, "lib": "mcculw", "board": board_num,
                                               "bit": bit, "invert": inv, "name": din.name})
                        print(f"[MCCBridge] E-TC #{board_num}: DIN '{din.name}' bit{bit} -> static.{sv} (mcculw)")
                    except Exception as e:
                        print(f"[MCCBridge] E-TC #{board_num}: DIN '{din.name}' mcculw config failed: {e}")
                else:
                    print(f"[MCCBridge] E-TC #{board_num}: DIN '{din.name}' -- board not open, skipped")
        if self._etc_dins:
            print(f"[MCCBridge] Configured {len(self._etc_dins)} E-TC digital input(s)")

    def _ul_find_descriptor(self, product_substr, ordinal):
        """uldaq device discovery for the Linux port: return the Nth descriptor
        whose product name contains product_substr (e.g. E-1608 / E-TC), sorted by
        unique id so ordinals are stable across boots. Inventory cached per open()."""
        if not HAVE_ULDAQ:
            return None
        inv = getattr(self, "_ul_inventory", None)
        if inv is None:
            try:
                inv = get_daq_device_inventory(InterfaceType.ETHERNET) or []
                if not inv:
                    inv = get_daq_device_inventory(InterfaceType.ANY) or []
            except Exception as e:
                print(f"[MCCBridge] uldaq inventory failed: {e}")
                inv = []
            self._ul_inventory = inv
        matches = sorted((d for d in inv if product_substr.lower() in str(getattr(d, "product_name", "")).lower()),
                         key=lambda d: str(getattr(d, "unique_id", "")))
        return matches[ordinal] if 0 <= ordinal < len(matches) else None

    def read_etc_dins(self):
        """Read the configured E-TC digital inputs. Returns {static_var: 0.0/1.0}.
        mcculw (Windows) primary; uldaq (Linux) if that opened the board. On any read
        error the bit reads 0. `invert` flips active-low switches to 1=wet."""
        out = {}
        for spec in (self._etc_dins or []):
            v = 0
            try:
                if spec["lib"] == "uldaq":
                    v = int(spec["dio"].d_bit_in(spec["port"], spec["bit"]))
                elif spec["lib"] == "mcculw":
                    v = int(ul.d_bit_in(spec["board"], DigitalPortType.AUXPORT, spec["bit"]))
            except Exception:
                v = 0
            if spec.get("invert"):
                v = 0 if v else 1
            out[spec["static_var"]] = float(v)
        return out

    def read_counters(self, ctr_out, now):
        """Fill the CTR signal array from the E-1608 hardware counters. Each slot is
        either a rate (engineering units/min, windowed) or a rollover-safe cumulative
        total, per the counter's mode. `now` is a monotonic timestamp
        (time.perf_counter()). No-op if no counters configured."""
        for c in (self._counters or []):
            idx = c["index"]
            if idx >= len(ctr_out):
                continue
            count = None
            # Only touch the counter if its E-1608 actually opened -- a configured
            # counter on an absent board would otherwise stall/raise every tick.
            if c["board"] in self._ul_1608:
                try:
                    _cd = self._ul_1608[c["board"]]["ctr"]
                    count = int(_cd.c_in(c["ctr"])) if _cd is not None else None
                except Exception:
                    count = None
            elif HAVE_MCCULW and c["board"] in self._boards_1608:
                try:
                    count = ul.c_in_32(c["board"], c["ctr"])
                except Exception:
                    count = None
            mode = c.get("mode", "rate")
            if count is None:                    # hold last good value on read failure
                ctr_out[idx] = (c["cum"] / c["K"]) if mode == "total" else c["rate"]
                continue
            if c["prev_count"] is None:          # prime on first read
                c["prev_count"] = count
                c["prev_t"] = now
                ctr_out[idx] = 0.0
                continue
            # rollover-safe pulse delta since the last read (32-bit hardware counter)
            dcount = (count - c["prev_count"]) & 0xFFFFFFFF
            if mode == "total":
                # accumulate every read into a Python big-int -> never overflows,
                # survives any number of 32-bit wraps. Report cumulative eng units.
                c["cum"] += dcount
                c["prev_count"] = count
                ctr_out[idx] = c["cum"] / c["K"]
            else:
                dt = now - c["prev_t"]
                if dt >= c["window"] and dt > 0:
                    c["rate"] = (dcount / dt) * 60.0 / c["K"]     # units per minute
                    c["prev_count"] = count
                    c["prev_t"] = now
                ctr_out[idx] = c["rate"]

    # ---------------- PWM digital outputs ----------------
    def is_pwm(self, index) -> bool:
        return index in self._pwm

    def set_pwm_duty(self, index, duty):
        """Set a PWM-mode DO's duty (0..1). No-op for non-PWM channels."""
        p = self._pwm.get(index)
        if p is None:
            return
        try:
            d = float(duty)
        except (TypeError, ValueError):
            d = 0.0
        p["duty"] = 0.0 if d < 0.0 else (1.0 if d > 1.0 else d)

    def pwm_step(self, now):
        """Drive PWM-mode DOs from their duty at the tick rate. `now` = monotonic seconds.
        set_do applies the channel's configured invert (was hardcoded active_high=True,
        which made the config polarity flag dead for PWM channels)."""
        for ch, p in self._pwm.items():
            per = p["period_s"]
            on = ((now % per) / per) < p["duty"]
            self.set_do(ch, on)

    def close(self):
        # Disconnect every uldaq device we opened (E-TC list + E-1608 map).
        for (_bn, _dev, _td) in (getattr(self, "_boards_etc_uldaq", None) or []):
            try:
                _dev.disconnect()
            except Exception:
                pass
        for _bn, _h in (getattr(self, "_ul_1608", None) or {}).items():
            try:
                _h["dev"].disconnect()
            except Exception:
                pass
        self._ul_1608 = {}
        self._ul_inventory = None
        if getattr(self, "_etc_uldaq_ok", False) and getattr(self, "_etc_uldaq_dev", None):
            try:
                self._etc_uldaq_dev.disconnect()
            except Exception:
                pass
        self._etc_uldaq_ok = False
        self._etc_uldaq_dev = None
        self._etc_uldaq_tdev = None
        self._etc_mcc_board = None

    # ---------------- Analog Inputs (E-1608) ----------------
    def read_ai_all(self):
        """Read AI from ALL E-1608 boards, return concatenated list"""
        all_values = []
        
        for board_num in self._boards_1608:
            board_values = [0.0] * 8  # Default if read fails
            
            if board_num in self._ul_1608:
                # Raspberry Pi / Linux: uldaq a_in returns engineering volts directly
                h = self._ul_1608[board_num]
                try:
                    for ch in range(8):
                        board_values[ch] = float(h["ai"].a_in(ch, h["ai_mode"], UlRange.BIP10VOLTS,
                                                              UlAInFlag.DEFAULT if UlAInFlag else 0))
                except Exception as e:
                    print(f"[MCCBridge] E-1608 #{board_num} uldaq AI read FAILED: {e}")
            elif HAVE_MCCULW:
                try:
                    # Read all 8 channels from this board
                    for ch in range(8):
                        raw = ul.a_in(board_num, ch, ULRange.BIP10VOLTS)  # Raw counts
                        val = ul.to_eng_units(board_num, ULRange.BIP10VOLTS, raw)  # Convert to volts
                        board_values[ch] = val
                    # Debug first read only
                    if not hasattr(self, '_ai_debug_done'):
                        print(f"[MCCBridge] Board #{board_num} AI read OK: {board_values[:4]}...")
                        self._ai_debug_done = True
                except Exception as e:
                    print(f"[MCCBridge] E-1608 #{board_num} AI read FAILED: {e}")
            else:
                if not hasattr(self, '_mcculw_warn_done'):
                    print(f"[MCCBridge] WARNING: HAVE_MCCULW=False, returning zeros!")
                    self._mcculw_warn_done = True
            
            all_values.extend(board_values)
        
        # Returns [board0_ch0-7, board1_ch0-7, board2_ch0-7, ...]
        return all_values

    def _set_tc_type(self, ch: int, typ: str):
        """Set TC type for channel. ULDAQ only - mcculw uses InstaCal configuration."""
        t = (typ or "K").upper()
        
        # ULDAQ path (if config API present)
        if (
            self._etc_uldaq_ok
            and HAVE_ULDAQ
            and HAVE_ULDAQ_CFG
            and self._etc_uldaq_dev is not None
        ):
            try:
                tc_enum = _TC_MAP_ULDAQ.get(t)
                if tc_enum is not None:
                    # ConfigItem name varies across builds
                    try:
                        self._etc_uldaq_dev.get_config().set_cfg(
                            ConfigItem.TEMP_SENSOR_TYPE, ch, tc_enum
                        )  # type: ignore
                    except Exception:
                        self._etc_uldaq_dev.get_config().set_cfg(
                            ConfigItem.TEMPERATURE_SENSOR_TYPE, ch, tc_enum
                        )  # type: ignore
                    self._tc_type_set_cache[ch] = t
                    print(f"[MCCBridge] TC{ch} type SET to '{t}' via ULDAQ")
                    return True
            except Exception as e:
                print(f"[MCCBridge] ULDAQ set TC{ch} type '{t}' FAILED: {e}")
                return False

        # mcculw path: TC types are configured in InstaCal, not via API
        # We just cache the expected type for reference but don't set it
        if HAVE_MCCULW and self._etc_mcc_board is not None:
            self._tc_type_set_cache[ch] = t
            # Don't print warning every time - just note it once during init
            return True
        
        # No TC hardware available
        return False

    def read_tc_all(self):
        """Read TC from ALL E-TC boards, return concatenated list"""
        all_values = []
        
        # Get TC configs from all boards
        tc_configs = []
        if self.cfg and self.cfg.boardsetc:
            for board in self.cfg.boardsetc:
                if board.enabled:
                    tc_configs.extend(board.thermocouples)
        
        # Read from ULDAQ boards
        for board_num, dev, tdev in self._boards_etc_uldaq:
            board_values = [float('nan')] * 8
            try:
                # Get which TCs are configured for this board
                board_tcs = []
                if self.cfg and self.cfg.boardsetc:
                    for b in self.cfg.boardsetc:
                        if b.boardNum == board_num and b.enabled:
                            board_tcs = b.thermocouples
                            break
                
                # Read each configured TC
                configured_channels = {int(rec.ch): rec for rec in board_tcs}
                for ch in range(8):
                    if ch in configured_channels and configured_channels[ch].include:
                        rec = configured_channels[ch]
                        tc_type_str = rec.type.upper()
                        tc_type_enum = getattr(TcType, tc_type_str, TcType.K)
                        temp_val = tdev.t_in(ch, TempScale.CELSIUS, tc_type_enum)
                        board_values[ch] = temp_val
            except Exception as e:
                print(f"[MCCBridge] E-TC #{board_num} ULDAQ read failed: {e}")
            
            all_values.extend(board_values)
        
        # Read from mcculw boards
        for board_num in self._boards_etc_mcc:
            board_values = [float('nan')] * 8
            try:
                # Get which TCs are configured for this board
                board_tcs = []
                if self.cfg and self.cfg.boardsetc:
                    for b in self.cfg.boardsetc:
                        if b.boardNum == board_num and b.enabled:
                            board_tcs = b.thermocouples
                            break
                
                # Read each configured TC
                for rec in board_tcs:
                    if rec.include:
                        ch = int(rec.ch)
                        if 0 <= ch < 8:
                            try:
                                temp_val = ul.t_in(board_num, ch, MCCTempScale.CELSIUS)
                                board_values[ch] = temp_val
                            except Exception:
                                # Open circuit is common, leave as nan
                                pass
            except Exception as e:
                print(f"[MCCBridge] E-TC #{board_num} mcculw read failed: {e}")
            
            all_values.extend(board_values)
        
        # Returns [board0_ch0-7, board1_ch0-7, ...]
        return all_values

    def set_do(self, index: int, state: bool, active_high=None):
        """Set DO channel - routes to correct board based on index.
        active_high=None (the default) applies the channel's configured `invert`
        (physical = logical XOR invert) -- what expression/PWM writes use. Manual
        endpoints (DO buttons / buzz) may still pass an explicit active_high."""
        if active_high is None:
            inv = self._do_invert[index] if index < len(getattr(self, "_do_invert", [])) else False
            active_high = not inv
        # Safety check
        if self.cfg is None:
            return
        
        # Calculate which board and channel
        board_idx = index // 8  # Which board (0, 1, 2...)
        channel = index % 8     # Which channel on that board (0-7)
        
        # Bounds check
        if board_idx >= len(self._boards_1608):
            print(f"[MCCBridge] DO{index}: board index {board_idx} out of range")
            return
        
        board_num = self._boards_1608[board_idx]
        
        # Update mirror
        if index < len(self._do_bits):
            self._do_bits[index] = 1 if state else 0
        if index < len(self._do_active_high):
            self._do_active_high[index] = bool(active_high)
        
        # Write to hardware
        logical = bool(state)
        phys = 1 if (logical == bool(active_high)) else 0
        
        if board_num in self._ul_1608:
            h = self._ul_1608[board_num]
            try:
                if h["dio"] is not None and h["port"] is not None:
                    h["dio"].d_bit_out(h["port"], channel, int(phys))
            except Exception as e:
                print(f"[MCCBridge] DO{index} (uldaq board #{board_num}, ch{channel}) write failed: {e}")
        elif HAVE_MCCULW:
            try:
                ul.d_bit_out(board_num, DigitalPortType.AUXPORT, channel, phys)
            except Exception as e:
                print(f"[MCCBridge] DO{index} (board #{board_num}, ch{channel}) write failed: {e}")

    async def start_buzz(self, index: int, hz: float, active_high=None):
        # active_high=None -> the channel's configured invert applies (set_do derives it)
        if active_high is not None:
            self._do_active_high[index] = bool(active_high)
        _ah = active_high
        await self.stop_buzz(index)  # cancel any prior
        period = 1.0 / max(0.1, float(hz))

        async def _worker():
            on = False
            try:
                while True:
                    on = not on
                    self.set_do(index, on, active_high=_ah)
                    await asyncio.sleep(period / 2.0)
            except asyncio.CancelledError:
                # guarantee OFF on cancel
                self.set_do(index, False, active_high=self._do_active_high[index])
                raise

        self._buzz_tasks[index] = asyncio.create_task(_worker())

    async def stop_buzz(self, index: int):
        t = self._buzz_tasks.pop(index, None)
        if t:
            t.cancel()
            try:
                await t
            except asyncio.CancelledError:
                pass
            except Exception:
                pass
        # double-ensure OFF in case there was no task
        self.set_do(index, False, active_high=self._do_active_high[index])

    def get_do_snapshot(self):
        return list(self._do_bits)

    # ---------------- Analog Outputs (E-1608) ----------------
    @property
    def ao_cache(self):
        """Expose AO values for PID feedback"""
        return self._ao_vals

    def _dac_counts(self, volts: float, board_num: int) -> int:
        """Convert volts to 16-bit DAC code for ±10 V range (BIP10V).
        Clamps to [-10.0, +10.0], returns integer in [0, 65535].
        """
        try:
            v = float(volts)
        except Exception:
            v = 0.0
        # Clamp to device range
        if v < -10.0:
            v = -10.0
        if v > +10.0:
            v = +10.0

        # Preferred: library conversion (handles calibration)
        if HAVE_MCCULW and ul is not None:
            try:
                return int(
                    ul.from_eng_units(
                        board_num,
                        ULRange.BIP10VOLTS,
                        v,
                    )
                )
            except Exception as e:
                print(f"[MCCBridge] from_eng_units failed, using math: {e}")

        # Fallback math: map [-10, +10] -> [0, 65535]
        # LSB ≈ 20 V / 65535 ≈ 0.000305 V
        code = int(round((v + 10.0) * (65535.0 / 20.0)))
        if code < 0:
            code = 0
        if code > 65535:
            code = 65535
        return code

    def set_ao(self, index: int, voltage: float):
        """Set AO channel - routes to correct board based on index"""
        # Safety check
        if self.cfg is None:
            return
        
        # Calculate which board and channel
        board_idx = index // 2  # Which board (each E-1608 has 2 AO)
        channel = index % 2     # Which channel on that board (0 or 1)
        
        # Bounds check
        if board_idx >= len(self._boards_1608):
            print(f"[MCCBridge] AO{index}: board index {board_idx} out of range")
            return
        
        board_num = self._boards_1608[board_idx]
        voltage = float(voltage)
        
        # Update mirror
        if index < len(self._ao_vals):
            self._ao_vals[index] = voltage
        
        if board_num in self._ul_1608:
            # Raspberry Pi / Linux: uldaq a_out takes engineering volts directly
            h = self._ul_1608[board_num]
            try:
                if h["ao"] is not None:
                    v = max(-10.0, min(10.0, voltage))
                    h["ao"].a_out(channel, UlRange.BIP10VOLTS,
                                  UlAOutFlag.DEFAULT if UlAOutFlag else 0, v)
            except Exception as e:
                print(f"[MCCBridge] AO{index} (uldaq board #{board_num}, ch{channel}) write failed: {e}")
            return

        # Convert to DAC counts
        code = self._dac_counts(voltage, board_num)
        
        # Write to hardware
        if HAVE_MCCULW:
            try:
                ul.a_out(board_num, channel, ULRange.BIP10VOLTS, int(code))
            except Exception as e:
                print(f"[MCCBridge] AO{index} (board #{board_num}, ch{channel}) write failed: {e}")

    def get_ao_snapshot(self):
        return list(self._ao_vals)

    def get_tc_configuration_status(self) -> List[dict]:
        """
        Check TC configuration status and return information for UI.
        For mcculw: We can't read the InstaCal TC type directly, so we return
        the expected types from config and note they need to be verified in InstaCal.
        For ULDAQ: We can verify the actual configured types.
        """
        if self.cfg is None:
            return []
        
        results = []
        
        # Check each configured TC channel
        for rec in self.cfg.thermocouples:
            ch = int(rec.ch)
            expected_type = (rec.type or "K").upper()
            
            status = {
                "channel": ch,
                "name": rec.name or f"TC{ch}",
                "expected_type": expected_type,
                "actual_type": None,  # Can't read from mcculw
                "detected": self._tc_runtime_include.get(ch, False),
                "needs_config": False,
                "config_method": None,
                "include_in_config": rec.include
            }
            
            # ULDAQ path - we can verify the type was set
            if self._etc_uldaq_ok and HAVE_ULDAQ:
                cached = self._tc_type_set_cache.get(ch)
                status["actual_type"] = cached
                status["config_method"] = "ULDAQ API"
                if cached != expected_type:
                    status["needs_config"] = True
            
            # mcculw path - we can't read the type, just inform user
            elif HAVE_MCCULW and self._etc_mcc_board is not None:
                status["actual_type"] = "Unknown (set in InstaCal)"
                status["config_method"] = "InstaCal"
                # Flag detected channels as needing verification since we can't read the type
                status["needs_config"] = status["detected"]
            
            results.append(status)
        
        return results


if __name__ == "__main__":
    # Offline sanity check for E-1608 AO code mapping (±10 V -> 0..65535).
    def to_code(v):
        v = max(-10.0, min(10.0, float(v)))
        return int(round((v + 10.0) * (65535.0 / 20.0)))

    for val in [-12, -10, -5, 0, 5, 10, 12]:
        code = to_code(val)
        print(f"{val:>6.2f} V -> code {code:5d}")
