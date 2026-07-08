# server/app_models.py
"""
Board-Centric Configuration Models v2.0.0

BREAKING CHANGE: Channels are now owned by boards instead of flat arrays.

NEW STRUCTURE:
- boards1608[].analogs[] instead of cfg.analogs[]
- boards1608[].digitalOutputs[] instead of cfg.digitalOutputs[]
- boards1608[].analogOutputs[] instead of cfg.analogOutputs[]
- boardsetc[].thermocouples[] instead of cfg.thermocouples[]

This allows multiple E-1608 and E-TC boards, each with their own channels.
"""

__version__ = "2.4.2"  # pad_board_channels(): pad boards to physical channel counts (8 AI/8 DO/2 AO/8 TC) with include=False spares so the editor shows every pin. Prev 2.4.1: DigitalOutCfg.invert (drive pin 1 for logical 0; normallyOpen deprecated -- it never reached the hardware). Prev 2.4.0: E-TC DIGITAL INPUTS: DigitalInCfg (name/bit/static_var/invert) + BoardEtcCfg.digitalInputs + get_all_etc_dins() -> (board_num, din) tuples. Read via mcc_bridge.read_etc_dins() (mcculw d_bit_in primary / uldaq dio.d_bit_in), stamped into the named static var each tick for a High-Level float switch (yEvapHigh). Prev 2.3.1: FIX migrate_counters_to_ctr keeps the counter's AI slot as a spare (include=False) instead of deleting it -- deleting shrank the AI read/LPF below the 8 physical E-1608 pins and crashed the acq loop (CTR0 is a separate terminal, not an AI pin). Prev 2.3.0: COUNTER (CTR) is now a first-class signal type: new CounterCfg model + boards1608[].counters[], get_all_counters(), and migrate_counters_to_ctr() which auto-moves legacy AnalogCfg.counter_num channels into board.counters. The E-1608 32-bit event counter (CTR0) is addressed as "CTR:Name" in expressions, separate from AI. AnalogCfg.counter_* fields kept ONLY for that migration read. Prev 2.2.0: AnalogCfg.counter_mode; 2.1.0: counter-sourced AI fields

from pydantic import BaseModel
from typing import List, Optional

# ==================== CHANNEL CONFIGS ====================

class AnalogCfg(BaseModel):
    name: str = "AI"
    slope: float = 1.0
    offset: float = 0.0
    cutoffHz: float = 0.0
    units: str = ""
    include: bool = True
    # Counter-sourced channel: if counter_num is set, this AI's value is the
    # E-1608 hardware counter CTR<n> read as a rate (engineering units / minute),
    # not its physical AI pin. Used for pulse flow meters.
    # DEPRECATED: counters are now first-class (CounterCfg). These fields are kept
    # only so migrate_counters_to_ctr() can read a legacy config and move the
    # channel into board.counters[]. Do not use for new channels.
    counter_num: Optional[int] = None
    pulses_per_unit: float = 1.0       # K-factor, pulses per engineering unit (e.g. 22000 pulses/L)
    counter_window_s: float = 1.0      # rate averaging window, seconds
    counter_mode: str = "rate"         # 'rate' = eng-units/min (windowed); 'total' = cumulative eng-units (rollover-safe)

class CounterCfg(BaseModel):
    """E-1608 hardware event counter (CTR). A first-class input type, separate from
    AI -- the E-1608 has one 32-bit counter (CTR0, <=10 MHz TTL) on its own terminal.
    Referenced in expressions as "CTR:Name"."""
    name: str = "CTR0"
    include: bool = True
    ctr_num: int = 0                   # which hardware counter (E-1608 has CTR0)
    pulses_per_unit: float = 1.0       # K-factor, pulses per engineering unit (e.g. 22000 pulses/L)
    window_s: float = 1.0              # rate averaging window, seconds (for mode='rate')
    mode: str = "rate"                 # 'rate' = eng-units/min (windowed); 'total' = cumulative eng-units (rollover-safe)
    units: str = ""

class DigitalOutCfg(BaseModel):
    name: str = "DO"
    invert: bool = False       # True = drive the PHYSICAL pin 1 when the logical command is 0 (and vice versa). Applies to expression writes, PWM, and the logical-OFF safe state.
    normallyOpen: bool = True  # DEPRECATED -- never affected the hardware; kept only so old configs load. Use `invert`.
    momentary: bool = False
    actuationTime: float = 0.0
    include: bool = True
    logicElement: Optional[int] = None  # Index of LE that gates this DO (None = no gating)
    mode: str = "toggle"  # 'toggle', 'momentary', 'buzz', 'pwm'
    pwmPeriodMs: float = 1000.0  # PWM-mode period (ms); duty set by writing 0..1 to the DO

class AnalogOutCfg(BaseModel):
    name: str = "AO"
    minV: float = 0.0
    maxV: float = 10.0
    startupV: float = 0.0
    include: bool = True
    enable_gate: bool = False  # Whether to gate this AO with a DO/LE
    enable_kind: str = "do"    # 'do' or 'le'
    enable_index: int = 0      # Which DO/LE to use as enable

class ThermocoupleCfg(BaseModel):
    include: bool = True
    ch: int = 0
    name: str = "TC"
    type: str = "K"
    offset: float = 0.0
    cutoffHz: float = 0.0  # Low-pass filter cutoff frequency (0 = disabled)

class DigitalInCfg(BaseModel):
    """E-TC digital input (DIO bit configured as INPUT). Wet/dry-style 0/5V sensors
    (e.g. a High-Level float switch). Each read bit (0/1) is stamped into the named
    static var before eval, so expressions read it as static.<static_var>."""
    include: bool = True
    name: str = "DIN"
    bit: int = 0                       # DIO bit number on the board's AUXPORT (0..7)
    static_var: str = "dinEvapHigh"    # expression static var to receive the 0/1 read
    invert: bool = False               # True if the switch is active-low (0V=wet)

# ==================== BOARD CONFIGS ====================

class Board1608Cfg(BaseModel):
    """E-1608 Board Configuration (AI/DO/AO)"""
    boardNum: int = 0
    sampleRateHz: float = 100.0
    blockSize: int = 128
    aiMode: str = "SE"
    enabled: bool = True
    # Each board owns its channels (8 AI, 8 DO, 2 AO, 1 CTR per E-1608)
    analogs: List[AnalogCfg] = []
    digitalOutputs: List[DigitalOutCfg] = []
    analogOutputs: List[AnalogOutCfg] = []
    counters: List[CounterCfg] = []

class BoardEtcCfg(BaseModel):
    """E-TC Board Configuration (Thermocouples)"""
    boardNum: int = 1
    sampleRateHz: float = 10.0
    blockSize: int = 1
    enabled: bool = True
    # Each board owns its channels (8 TC per E-TC, plus 8 DIO lines)
    thermocouples: List[ThermocoupleCfg] = []
    digitalInputs: List[DigitalInCfg] = []

# ==================== APP CONFIG ====================

class AppConfig(BaseModel):
    """
    Application Configuration
    
    Supports BOTH old (flat arrays) and new (board-centric) formats for migration.
    Helper functions below will automatically flatten from boards when needed.
    """
    # New board-centric format (preferred)
    boards1608: Optional[List[Board1608Cfg]] = None
    boardsetc: Optional[List[BoardEtcCfg]] = None
    
    # Old flat-array format (for backward compatibility)
    board1608: Optional[Board1608Cfg] = None
    boardetc: Optional[BoardEtcCfg] = None
    analogs: Optional[List[AnalogCfg]] = None
    digitalOutputs: Optional[List[DigitalOutCfg]] = None
    analogOutputs: Optional[List[AnalogOutCfg]] = None
    thermocouples: Optional[List[ThermocoupleCfg]] = None

# ==================== HELPER FUNCTIONS ====================

def get_all_analogs(cfg: AppConfig) -> List[AnalogCfg]:
    """Get all analog channels from all enabled E-1608 boards"""
    channels = []
    if cfg.boards1608:
        for board in cfg.boards1608:
            if board.enabled:
                channels.extend(board.analogs)
    elif cfg.board1608 and cfg.analogs:
        # Old format fallback
        channels = cfg.analogs
    return channels

def get_all_digital_outputs(cfg: AppConfig) -> List[DigitalOutCfg]:
    """Get all digital output channels from all enabled E-1608 boards"""
    channels = []
    if cfg.boards1608:
        for board in cfg.boards1608:
            if board.enabled:
                channels.extend(board.digitalOutputs)
    elif cfg.board1608 and cfg.digitalOutputs:
        # Old format fallback
        channels = cfg.digitalOutputs
    return channels

def get_all_analog_outputs(cfg: AppConfig) -> List[AnalogOutCfg]:
    """Get all analog output channels from all enabled E-1608 boards"""
    channels = []
    if cfg.boards1608:
        for board in cfg.boards1608:
            if board.enabled:
                channels.extend(board.analogOutputs)
    elif cfg.board1608 and cfg.analogOutputs:
        # Old format fallback
        channels = cfg.analogOutputs
    return channels

def get_all_thermocouples(cfg: AppConfig) -> List[ThermocoupleCfg]:
    """Get all thermocouple channels from all enabled E-TC boards"""
    channels = []
    if cfg.boardsetc:
        for board in cfg.boardsetc:
            if board.enabled:
                channels.extend(board.thermocouples)
    elif cfg.boardetc and cfg.thermocouples:
        # Old format fallback
        channels = cfg.thermocouples
    return channels

def pad_board_channels(cfg: AppConfig) -> AppConfig:
    """Pad every board's channel lists out to the PHYSICAL channel counts (E-1608:
    8 AI / 8 DO / 2 AO; E-TC: 8 TC) with include=False spares, so the config editor
    always shows every available pin even if unused. Never removes or reorders --
    only appends, so existing signal indices are untouched."""
    if cfg.boards1608:
        for b in cfg.boards1608:
            while len(b.analogs) < 8:
                b.analogs.append(AnalogCfg(name=f"AI{len(b.analogs)}", include=False))
            while len(b.digitalOutputs) < 8:
                b.digitalOutputs.append(DigitalOutCfg(name=f"DO{len(b.digitalOutputs)}", include=False))
            while len(b.analogOutputs) < 2:
                b.analogOutputs.append(AnalogOutCfg(name=f"AO{len(b.analogOutputs)}", include=False))
    if cfg.boardsetc:
        for b in cfg.boardsetc:
            while len(b.thermocouples) < 8:
                b.thermocouples.append(ThermocoupleCfg(ch=len(b.thermocouples), name=f"TC{len(b.thermocouples)}", include=False))
    return cfg

def get_all_etc_dins(cfg: AppConfig):
    """Get all E-TC digital-input channels (DIO-as-input) from all enabled E-TC boards
    as (board_num, DigitalInCfg) tuples so the bridge knows which board each is on."""
    channels = []
    if cfg.boardsetc:
        for board in cfg.boardsetc:
            if board.enabled:
                for din in (getattr(board, "digitalInputs", None) or []):
                    channels.append((board.boardNum, din))
    return channels

def get_all_counters(cfg: AppConfig) -> List["CounterCfg"]:
    """Get all hardware counter (CTR) channels from all enabled E-1608 boards."""
    channels = []
    if cfg.boards1608:
        for board in cfg.boards1608:
            if board.enabled:
                channels.extend(getattr(board, "counters", None) or [])
    return channels

def migrate_counters_to_ctr(cfg: AppConfig) -> AppConfig:
    """Move legacy counter-sourced AI channels (AnalogCfg.counter_num set) into the
    first-class board.counters[] list. The counter lives on the E-1608's SEPARATE
    CTR0 terminal -- NOT an AI pin -- so the AI slot it used to occupy is converted
    to a spare (include=False) analog rather than deleted. Removing it would shrink
    the AI read / LPF below the 8 physical pins and crash the acquisition loop.
    Idempotent. Run AFTER migrate_config_to_board_centric."""
    if not cfg.boards1608:
        return cfg
    for board in cfg.boards1608:
        analogs = board.analogs or []
        if not any(getattr(a, "counter_num", None) is not None for a in analogs):
            continue
        existing = {c.name for c in (board.counters or [])}
        kept, moved = [], list(board.counters or [])
        for a in analogs:
            cnum = getattr(a, "counter_num", None)
            if cnum is None:
                kept.append(a)
                continue
            if a.name not in existing:
                moved.append(CounterCfg(
                    name=a.name, include=getattr(a, "include", True),
                    ctr_num=int(cnum),
                    pulses_per_unit=float(getattr(a, "pulses_per_unit", 1.0) or 1.0),
                    window_s=float(getattr(a, "counter_window_s", 1.0) or 1.0),
                    mode=str(getattr(a, "counter_mode", "rate") or "rate"),
                    units=getattr(a, "units", "") or "",
                ))
            # keep the physical AI pin as a spare so the AI count stays at 8
            kept.append(AnalogCfg(
                name=f"AI{len(kept)}", slope=float(getattr(a, "slope", 1.0) or 1.0),
                offset=float(getattr(a, "offset", 0.0) or 0.0),
                cutoffHz=float(getattr(a, "cutoffHz", 0.0) or 0.0),
                units="", include=False,
            ))
        board.counters = moved
        board.analogs = kept
        print(f"[CONFIG] Migrated {len(moved)} counter channel(s) AI->CTR on board #{board.boardNum} "
              f"({len(kept)} AI pins kept)")
    return cfg

def migrate_config_to_board_centric(cfg: AppConfig) -> AppConfig:
    """
    Migrate old flat-array config to new board-centric config.
    
    Detects old format (cfg.board1608, cfg.analogs[]) and converts to new format
    (cfg.boards1608[0].analogs[]). Idempotent - safe to call multiple times.
    
    Returns: Migrated AppConfig (modifies in place and returns same object)
    """
    # Check if already using new format
    if cfg.boards1608 is not None or cfg.boardsetc is not None:
        return cfg  # Already migrated
    
    # Check if using old format
    if cfg.board1608 is None and cfg.boardetc is None:
        # No boards at all - initialize defaults
        cfg.boards1608 = [Board1608Cfg(boardNum=0)]
        cfg.boardsetc = [BoardEtcCfg(boardNum=1)]
        print("[CONFIG] Initialized default board configuration")
        return cfg
    
    print("[CONFIG] Migrating from flat arrays to board-centric structure...")
    
    # Migrate E-1608
    if cfg.board1608:
        board = Board1608Cfg(
            boardNum=cfg.board1608.boardNum,
            sampleRateHz=cfg.board1608.sampleRateHz,
            blockSize=cfg.board1608.blockSize,
            aiMode=cfg.board1608.aiMode,
            enabled=True,
            analogs=cfg.analogs or [],
            digitalOutputs=cfg.digitalOutputs or [],
            analogOutputs=cfg.analogOutputs or []
        )
        cfg.boards1608 = [board]
        print(f"  ✓ Migrated E-1608 board #{board.boardNum}: "
              f"{len(board.analogs)} AI, {len(board.digitalOutputs)} DO, {len(board.analogOutputs)} AO")
    
    # Migrate E-TC
    if cfg.boardetc:
        board = BoardEtcCfg(
            boardNum=cfg.boardetc.boardNum,
            sampleRateHz=cfg.boardetc.sampleRateHz,
            blockSize=cfg.boardetc.blockSize,
            enabled=True,
            thermocouples=cfg.thermocouples or []
        )
        cfg.boardsetc = [board]
        print(f"  ✓ Migrated E-TC board #{board.boardNum}: {len(board.thermocouples)} TC")
    
    # Clear old fields to save space
    cfg.board1608 = None
    cfg.boardetc = None
    cfg.analogs = None
    cfg.digitalOutputs = None
    cfg.analogOutputs = None
    cfg.thermocouples = None
    
    print("[CONFIG] Migration complete - using board-centric structure")
    return cfg

# ==================== PID CONFIG ====================

class PIDRec(BaseModel):
    enabled: bool = False
    kind: str = "analog"
    src: str = "ai"
    ai_ch: int = 0
    out_ch: int = 0
    # Setpoint configuration
    target: float = 0.0  # Legacy/default fixed setpoint value
    sp_source: str = "fixed"  # "fixed", "ao", "math"
    sp_channel: int = 0  # For "ao" or "math" sources
    kp: float = 0.0
    ki: float = 0.0
    kd: float = 0.0
    d_filter_hz: Optional[float] = None  # Derivative low-pass cutoff (Hz); None/0 = off (raw first-difference)
    # Output limits - can be fixed or dynamic
    out_min: Optional[float] = None  # Fixed min value
    out_max: Optional[float] = None  # Fixed max value
    out_min_source: str = "fixed"  # "fixed" or "math"
    out_min_channel: int = 0  # Math channel if out_min_source = "math"
    out_max_source: str = "fixed"  # "fixed" or "math"
    out_max_channel: int = 0  # Math channel if out_max_source = "math"
    err_min: Optional[float] = None
    err_max: Optional[float] = None
    i_min: Optional[float] = None
    i_max: Optional[float] = None
    name: str = ""  # PID name
    enable_gate: bool = False
    enable_kind: str = "do"
    enable_index: int = 0
    execution_rate_hz: Optional[float] = None  # None = run at sample rate

class PIDConfig(BaseModel):
    pids: List[PIDRec]


# ==================== OTHER CONFIG FILES ====================

class PIDFile(BaseModel):
    loops: List[PIDRec] = []

class ScriptFile(BaseModel):
    events: List[dict] = []

class MotorControllerCfg(BaseModel):
    name: str = "Motor"
    port: str = "COM1"
    baudrate: int = 9600
    address: int = 1
    min_rpm: float = 0.0
    max_rpm: float = 2500.0
    input_source: str = "ai"  # "ai" or "ao"
    input_channel: int = 0
    input_min: float = 0.0
    input_max: float = 10.0
    scale_factor: float = 250.0  # default: 0-10 -> 0-2500 RPM
    offset: float = 0.0
    cw_positive: bool = True
    enabled: bool = False
    include: bool = True
    logicElement: Optional[int] = None  # NEW: Index of LE that enables this motor (None = no gating)

class MotorFile(BaseModel):
    motors: List[MotorControllerCfg] = []

# NEW: Logic Element models
class LEInputCfg(BaseModel):
    kind: str = "do"  # "do", "ai", "ao", "tc", "pid_u", "le", "math"
    index: int = 0
    # For analog values:
    comparison: Optional[str] = None  # "lt", "eq", "gt"
    compare_to_type: Optional[str] = None  # "value" or "signal"
    compare_value: Optional[float] = None
    compare_to_kind: Optional[str] = None  # "ai", "ao", "tc", "pid_u", "math"
    compare_to_index: Optional[int] = None

class LogicElementCfg(BaseModel):
    enabled: bool = True
    name: str = "LE"
    # Variable inputs (1-8)
    inputs: List[LEInputCfg] = [LEInputCfg(), LEInputCfg()]  # Default to 2 inputs
    # Legacy fields for backward compatibility
    input_a: Optional[LEInputCfg] = None
    input_b: Optional[LEInputCfg] = None
    operation: str = "and"  # "and", "or", "xor", "nand", "nor", "nxor"

class LEFile(BaseModel):
    elements: List[LogicElementCfg] = []

# sensible defaults mirroring your previous app
def default_config():
    """Generate default board-centric config"""
    return {
        "boards1608": [
            {
                "boardNum": 0,
                "sampleRateHz": 100.0,
                "blockSize": 128,
                "aiMode": "SE",
                "enabled": True,
                "analogs": [{"name": f"AI{i}", "slope": 1.0, "offset": 0.0, "cutoffHz": 0.0, "units": "", "include": True} for i in range(8)],
                "digitalOutputs": [{"name": f"DO{i}", "normallyOpen": True, "momentary": False, "actuationTime": 0.0, "include": True, "logicElement": None, "mode": "toggle"} for i in range(8)],
                "analogOutputs": [{"name": f"AO{i}", "minV": 0, "maxV": 10, "startupV": 0, "include": True, "enable_gate": False, "enable_kind": "do", "enable_index": 0} for i in range(2)]
            }
        ],
        "boardsetc": [
            {
                "boardNum": 1,
                "sampleRateHz": 10.0,
                "blockSize": 1,
                "enabled": True,
                "thermocouples": [{"include": True, "ch": i, "name": f"TC{i}", "type": "K", "offset": 0.0, "cutoffHz": 0.0} for i in range(8)]
            }
        ]
    }
