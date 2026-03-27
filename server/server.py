# server/server.py
# Python 3.10+

import asyncio, json, time, os, sys
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from mcc_bridge import MCCBridge, AIFrame
from mcc_bridge import BRIDGE_VERSION, HAVE_MCCULW, HAVE_ULDAQ
from pid_core import PIDManager
from filters import OnePoleLPFBank
from logger import SessionLogger
from app_models import (
    AppConfig, get_all_analogs, get_all_digital_outputs,
    get_all_analog_outputs, get_all_thermocouples,
    migrate_config_to_board_centric,
    PIDFile, ScriptFile, MotorFile, default_config
)
from motor_controller import MotorManager, list_serial_ports
from logic_elements import LEManager
from math_ops import MathOpManager, MathOpFile
from app_models import LEFile, LogicElementCfg
from expr_manager import ExpressionManager
from expr_engine import global_vars as expr_global_vars
import logging, os, math

# Version tracking - all in one place
__version__ = "2.8.0"
__updated__ = "2026-03-27"
SERVER_VERSION = __version__  # Versioned DLL files for hot-reload during critical tests!

# DLL versioning for hot-reload
DLL_VERSION = 0
CURRENT_DLL_PATH = None

MCC_TICK_LOG = os.environ.get("MCC_TICK_LOG", "1") == "1"  # print 1 line per second
MCC_DUMP_FIRST = int(os.environ.get("MCC_DUMP_FIRST", "5")) # dump first N ticks fully

# Detect if running as PyInstaller executable
if getattr(sys, 'frozen', False):
    # Running as compiled exe - use exe directory
    ROOT = Path(sys.executable).resolve().parent
else:
    # Running as Python script - use project root
    ROOT = Path(__file__).resolve().parent.parent

# Config/web/logs are in ROOT when frozen, ROOT/server when not
if getattr(sys, 'frozen', False):
    CFG_DIR = ROOT / "config"
    WEB_DIR = ROOT / "web"
    LOGS_DIR = ROOT / "logs"
else:
    CFG_DIR = ROOT / "server/config"
    WEB_DIR = ROOT / "web"
    LOGS_DIR = ROOT / "server" / "logs"

LOGS_DIR.mkdir(parents=True, exist_ok=True)

# env toggles (all optional)
LOG_TICKS = os.environ.get("MCC_TICK_LOG", "0") == "0"          # per-second tick print
LOG_EVERY = max(1, int(os.environ.get("MCC_LOG_EVERY", "1")))   # write CSV every N ticks
BROADCAST_EVERY = max(1, int(os.environ.get("MCC_BROADCAST_EVERY", "2")))  # WS send every N ticks

logging.basicConfig(
    level=os.environ.get("MCC_LOGLEVEL", "INFO"),
    format="%(message)s"
)
log = logging.getLogger("mcc")


print(f"[MCC-Hub] Python {sys.version.split()[0]} on {sys.platform}")
print(f"[MCC-Hub] Server version {__version__} (updated: {__updated__})")
print(f"[MCC-Hub] ROOT={ROOT}")
print(f"[MCC-Hub] CFG_DIR={CFG_DIR} exists={CFG_DIR.exists()}")
print(f"[MCC-Hub] WEB_DIR={WEB_DIR} exists={WEB_DIR.exists()}")
print(f"[MCC-Hub] LOGS_DIR={LOGS_DIR} exists={LOGS_DIR.exists()}")

# Ensure web dir so StaticFiles won't explode on first run
if not WEB_DIR.exists():
    WEB_DIR.mkdir(parents=True, exist_ok=True)
    (WEB_DIR/"index.html").write_text("""
<!doctype html><html><body>
<h1>MCC Hub: Web folder was missing</h1>
<p>This placeholder was created automatically. Copy the /web files here and refresh.</p>
</body></html>
""")

app = FastAPI()

@app.middleware("http")
async def _no_cache(request, call_next):
    resp = await call_next(request)
    # disable caching for our UI assets and APIs
    if request.url.path in ("/", "/index.html", "/app.js", "/styles.css") or request.url.path.startswith("/api/"):
        resp.headers["Cache-Control"] = "no-store, max-age=0"
        resp.headers["Pragma"] = "no-cache"
        resp.headers["Expires"] = "0"
    return resp

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"]
)

# NEW: serve config.json the old way so the existing Config editor works
app.mount("/config", StaticFiles(directory=CFG_DIR), name="config")
#app.mount("/web", StaticFiles(directory=WEB_DIR), name="web")


# ---- Layout save/load ----
LAYOUT_PATH = CFG_DIR / "layout.json"

# diag endpoint MUST be after `app = FastAPI()` (and after MCCBridge import)
@app.get("/api/diag")
def api_diag():
    # Safely pull board numbers if available
    cfg = getattr(mcc, "cfg", None)
    b1608 = getattr(getattr(cfg, "board1608", None), "boardNum", None)
    betc  = getattr(getattr(cfg, "boardetc",  None), "boardNum", None)

    return {
        "server": SERVER_VERSION,
        "bridge": BRIDGE_VERSION,
        "have_mcculw": bool(HAVE_MCCULW),
        "have_uldaq": bool(HAVE_ULDAQ),
        "board1608": b1608,
        "boardetc": betc,
    }

@app.get("/api/version")
def get_version():
    """Get version info for all components"""
    try:
        import expr_engine
        import expr_manager
        expr_engine_ver = getattr(expr_engine, '__version__', 'unknown')
        expr_manager_ver = getattr(expr_manager, '__version__', 'unknown')
    except:
        expr_engine_ver = 'not loaded'
        expr_manager_ver = 'not loaded'
    
    return {
        "server": __version__,
        "updated": __updated__,
        "bridge": BRIDGE_VERSION,
        "expr_engine": expr_engine_ver,
        "expr_manager": expr_manager_ver,
        "python": sys.version.split()[0],
        "platform": sys.platform
    }

@app.get("/api/layout")
def get_layout():
    if LAYOUT_PATH.exists():
        import json
        return json.loads(LAYOUT_PATH.read_text(encoding="utf-8"))
    return {"version": "v1", "pages": []}

@app.put("/api/layout")
def put_layout(body: dict):
    import json
    LAYOUT_PATH.write_text(json.dumps(body, indent=2), encoding="utf-8")
    return {"ok": True}


# ---- Serve index and assets explicitly so /ws is not intercepted ----
from fastapi.responses import FileResponse, HTMLResponse

@app.get("/", response_class=HTMLResponse)
def _root():
    return (WEB_DIR / "index.html").read_text(encoding="utf-8")

@app.get("/index.html", response_class=HTMLResponse)
def _root_index():
    # Serve the same file for /index.html as for /
    return (WEB_DIR / "index.html").read_text(encoding="utf-8")

@app.get("/app.js")
def _app_js():
    return FileResponse(str(WEB_DIR / "app.js"))

@app.get("/styles.css")
def _styles_css():
    return FileResponse(str(WEB_DIR / "styles.css"))

@app.get("/checklist_widget.js")
def _checklist_widget():
    return FileResponse(str(WEB_DIR / "checklist_widget.js"))

@app.get("/api/default_checklist")
def get_default_checklist():
    """Try to serve checklist.txt from the working directory or web dir."""
    from fastapi.responses import PlainTextResponse
    import os
    candidates = [
        Path(os.getcwd()) / "checklist.txt",
        WEB_DIR / "checklist.txt",
        ROOT / "checklist.txt",
    ]
    for p in candidates:
        if p.exists():
            return PlainTextResponse(p.read_text(encoding="utf-8", errors="replace"))
    return PlainTextResponse("", status_code=404)

@app.get("/checklist_editor.js")
def _checklist_editor():
    return FileResponse(str(WEB_DIR / "checklist_editor.js"))

@app.get("/EXPRESSION_REFERENCE.md")
def _expression_reference():
    ref_file = WEB_DIR / "EXPRESSION_REFERENCE.md"
    if ref_file.exists():
        return FileResponse(str(ref_file), media_type="text/markdown")
    # Fallback if file doesn't exist
    return {"error": "EXPRESSION_REFERENCE.md not found in web directory"}

@app.get("/favicon.ico")
def _favicon():
    ico = WEB_DIR / "favicon.ico"
    if ico.exists():
        return FileResponse(str(ico))
    # harmless fallback
    return FileResponse(str(WEB_DIR / "index.html"))

# ---------- Models ----------
class RateReq(BaseModel):
    hz: float

class DOReq(BaseModel):
    index: int
    state: bool
    active_high: bool = True

class BuzzReq(BaseModel):
    index: int
    hz: float
    active_high: bool = True

class AOReq(BaseModel):
    index: int
    volts: float

# ---------- Load config/PID/script ----------
CFG_PATH = CFG_DIR/"config.json"
PID_PATH = CFG_DIR/"pid.json"
SCRIPT_PATH = CFG_DIR/"script.json"

if not CFG_PATH.exists():
    CFG_DIR.mkdir(parents=True, exist_ok=True)
    CFG_PATH.write_text(json.dumps(default_config(), indent=2))
if not PID_PATH.exists():
    PID_PATH.write_text(json.dumps({"loops": []}, indent=2))
if not SCRIPT_PATH.exists():
    SCRIPT_PATH.write_text(json.dumps({"events": []}, indent=2))

# ---- Pydantic v2-friendly loader with legacy script.json migration ----
from typing import Type

def _load_json_model(path: Path, model_cls: Type[BaseModel]):
    try:
        txt = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        txt = "{}"
    # First try fast path (JSON text)
    try:
        return model_cls.model_validate_json(txt)
    except Exception:
        pass
    # Fallback: parse into Python, fix legacy shapes, then validate
    try:
        data = json.loads(txt) if txt.strip() else {}
    except Exception as e:
        print(f"[MCC-Hub] JSON load failed for {path.name}: {e}; using defaults")
        data = {}
    # Legacy script.json was a top-level list -> wrap into {"events": [...]} and rewrite
    if model_cls.__name__ == "ScriptFile" and isinstance(data, list):
        print("[MCC-Hub] Migrating legacy script.json (list) -> {events:[...]}")
        data = {"events": data}
        try:
            path.write_text(json.dumps(data, indent=2))
        except Exception:
            pass
    try:
        return model_cls.model_validate(data)
    except Exception as e:
        print(f"[MCC-Hub] Validation failed for {path.name}: {e}; using defaults")
        # Minimal safe defaults per model
        if model_cls.__name__ == "AppConfig":
            return AppConfig.model_validate(default_config())
        if model_cls.__name__ == "PIDFile":
            return PIDFile.model_validate({"loops": []})
        if model_cls.__name__ == "ScriptFile":
            return ScriptFile.model_validate({"events": []})
        if model_cls.__name__ == "MotorFile":
            return MotorFile.model_validate({"motors": []})
        return model_cls.model_validate({})

app_cfg = _load_json_model(CFG_PATH, AppConfig)
print(f"[DEBUG] BEFORE migration: boards1608={app_cfg.boards1608 is not None}, board1608={app_cfg.board1608 is not None}")
app_cfg = migrate_config_to_board_centric(app_cfg)  # Auto-migrate old configs
print(f"[DEBUG] AFTER migration: boards1608={app_cfg.boards1608 is not None}, num_boards={len(app_cfg.boards1608) if app_cfg.boards1608 else 0}")
print(f"[DEBUG] After migration: {len(get_all_analogs(app_cfg))} AI channels, {len(get_all_thermocouples(app_cfg))} TC channels")
if app_cfg.boards1608:
    for i, board in enumerate(app_cfg.boards1608):
        print(f"[DEBUG] E-1608 board {i}: boardNum={board.boardNum}, enabled={board.enabled}, AI={len(board.analogs)}, DO={len(board.digitalOutputs)}, AO={len(board.analogOutputs)}")
pid_file = _load_json_model(PID_PATH, PIDFile)
script_file = _load_json_model(SCRIPT_PATH, ScriptFile)
MOTOR_PATH = CFG_DIR / "motor.json"
motor_file = _load_json_model(MOTOR_PATH, MotorFile)
print("[MCC-Hub] Loaded config / pid / script / motor")

mcc = MCCBridge()
bridge = mcc  # alias for older handlers that still say 'bridge'

pid_mgr = PIDManager()
pid_mgr.load(pid_file)

motor_mgr = MotorManager()

# Logic Elements
le_mgr = LEManager()
LE_PATH = CFG_DIR / "logic_elements.json"

def load_le():
    global le_mgr
    if LE_PATH.exists():
        try:
            data = json.loads(LE_PATH.read_text())
            le_mgr.load(data)
            log.info(f"[LE] Loaded {len(le_mgr.elements)} logic elements")
        except Exception as e:
            log.error(f"[LE] Failed to load: {e}")
            le_mgr = LEManager()
    else:
        log.info("[LE] No logic_elements.json found, creating default")
        LE_PATH.write_text(json.dumps({"elements": []}, indent=2))

load_le()

# Math Operators
math_mgr = MathOpManager()
MATH_PATH = CFG_DIR / "math_operators.json"

def load_math():
    global math_mgr
    if MATH_PATH.exists():
        try:
            data = json.loads(MATH_PATH.read_text())
            math_file = MathOpFile.model_validate(data)
            math_mgr.load(math_file)
            log.info(f"[MathOps] Loaded {len(math_mgr.operators)} math operators")
        except Exception as e:
            log.error(f"[MathOps] Failed to load: {e}")
            import traceback
            traceback.print_exc()
            math_mgr = MathOpManager()
    else:
        log.info("[MathOps] No math_operators.json found, creating default")
        MATH_PATH.write_text(json.dumps({"operators": []}, indent=2))

# Expression Manager
expr_mgr = ExpressionManager(filepath=str(CFG_DIR / "expressions.json"))
log.info(f"[EXPR] Loaded {len(expr_mgr.expressions)} expressions")

# ============================================================================
# C++ EXPRESSION AUTO-COMPILATION
# ============================================================================
import subprocess

def should_recompile_cpp_expressions():
    """Check if C++ expressions need recompilation"""
    expr_json = CFG_DIR / "expressions.json"
    cpp_file = Path("compiled/expressions.cpp")
    dll_file = Path("compiled/expressions.dll")
    
    if not expr_json.exists():
        return False
    
    if not dll_file.exists():
        log.info("[CPP-EXPR] DLL not found, will compile")
        return True
    
    if not cpp_file.exists():
        log.info("[CPP-EXPR] C++ source not found, will generate")
        return True
    
    expr_mtime = expr_json.stat().st_mtime
    dll_mtime = dll_file.stat().st_mtime
    
    # Also check PID file
    pid_mtime = PID_PATH.stat().st_mtime if PID_PATH.exists() else 0
    
    if expr_mtime > dll_mtime:
        log.info("[CPP-EXPR] expressions.json modified, will recompile")
        return True
    
    if pid_mtime > dll_mtime:
        log.info("[CPP-EXPR] pid.json modified, will recompile")
        return True
    
    return False

def compile_cpp_expressions(dll_name: str = "compiled/expressions.dll"):
    """Generate C++ code and compile to versioned DLL"""
    global DLL_VERSION, CURRENT_DLL_PATH
    
    try:
        # Increment DLL version for hot-reload
        DLL_VERSION += 1
        versioned_dll = f"compiled/expressions_v{DLL_VERSION}.dll"
        
        log.info("[CPP-EXPR] ========== COMPILING EXPRESSIONS ==========")
        log.info(f"[CPP-EXPR] Target: {versioned_dll}")
        log.info("[CPP-EXPR] Generating C++ code from expressions...")
        
        try:
            import expr_to_cpp
            success = expr_to_cpp.compile_all_expressions(
                str(CFG_DIR / "expressions.json"),
                str(CFG_PATH),
                "compiled"
            )
            
            if not success:
                log.error("[CPP-EXPR] Failed to generate C++ code")
                DLL_VERSION -= 1  # Revert version
                return False
            
            log.info("[CPP-EXPR] ✓ C++ code generated")
            
        except Exception as e:
            log.error(f"[CPP-EXPR] Error generating C++ code: {e}")
            DLL_VERSION -= 1  # Revert version
            import traceback
            traceback.print_exc()
            return False
        
        # Compile using compile_cpp module
        log.info("[CPP-EXPR] Compiling C++ to DLL...")
        import compile_cpp
        success = compile_cpp.compile_expressions(versioned_dll)
        
        if not success:
            log.error("[CPP-EXPR] Compilation failed")
            DLL_VERSION -= 1  # Revert version
            return False
        
        # Load new DLL first
        new_dll_path = versioned_dll
        log.info(f"[CPP-EXPR] Loading new DLL: {new_dll_path}")
        
        # Store old DLL path for cleanup
        old_dll_path = CURRENT_DLL_PATH
        
        # Update current DLL path BEFORE deleting old one
        CURRENT_DLL_PATH = versioned_dll
        
        # Now delete old DLL (after new one is set as current)
        if old_dll_path and old_dll_path != new_dll_path and Path(old_dll_path).exists():
            try:
                Path(old_dll_path).unlink()
                log.info(f"[CPP-EXPR] ✓ Deleted old DLL: {old_dll_path}")
            except Exception as e:
                log.warning(f"[CPP-EXPR] Could not delete old DLL: {e}")
        
        log.info(f"[CPP-EXPR] ✓ Compilation complete: {versioned_dll}")
        log.info("[CPP-EXPR] ========== COMPILATION COMPLETE ==========")
        return True
        
    except Exception as e:
        log.error(f"[CPP-EXPR] Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        DLL_VERSION -= 1  # Revert version on error
        return False

def load_cpp_backend(dll_path: str = "compiled/expressions.dll"):
    """Try to load the C++ expression backend"""
    try:
        from cpp_expr_backend import CPPExpressionBackend
        backend = CPPExpressionBackend(dll_path=dll_path)
        
        if backend:
            log.info(f"[CPP-EXPR] ✓ C++ expression backend loaded from {dll_path}")
            log.info(f"[CPP-EXPR] ✓ Loaded metadata: {backend.num_expressions} expressions")
            for idx, var_names in backend.local_var_names.items():
                if var_names:
                    log.info(f"[CPP-EXPR]   Expr {idx}: {len(var_names)} local vars: {var_names}")
            return backend
        else:
            log.info("[CPP-EXPR] C++ backend not available, using Python")
            return None
            
    except Exception as e:
        log.warning(f"[CPP-EXPR] Could not load C++ backend: {e}")
        return None

# Auto-compile if needed
cpp_backend = None
if should_recompile_cpp_expressions():
    if compile_cpp_expressions():
        # Load the versioned DLL we just compiled
        cpp_backend = load_cpp_backend(CURRENT_DLL_PATH if CURRENT_DLL_PATH else "compiled/expressions.dll")
else:
    # Find the latest versioned DLL
    compiled_dir = Path("compiled")
    if compiled_dir.exists():
        dll_files = list(compiled_dir.glob("expressions_v*.dll"))
        if dll_files:
            # Get highest version number
            latest_dll = max(dll_files, key=lambda p: int(p.stem.split('_v')[1]))
            CURRENT_DLL_PATH = str(latest_dll)
            DLL_VERSION = int(latest_dll.stem.split('_v')[1])
            cpp_backend = load_cpp_backend(CURRENT_DLL_PATH)
            log.info(f"[CPP-EXPR] Using existing DLL: {CURRENT_DLL_PATH}")
        else:
            # No versioned DLL, try old format
            cpp_backend = load_cpp_backend("compiled/expressions.dll")
    else:
        cpp_backend = load_cpp_backend("compiled/expressions.dll")

USE_CPP_EXPRESSIONS = cpp_backend is not None

if USE_CPP_EXPRESSIONS:
    log.info("[CPP-EXPR] ✓✓✓ USING C++ EXPRESSIONS (50-500× faster!) ✓✓✓")
else:
    log.info("[EXPR] Using Python expression evaluator")
# ============================================================================

# Button variables storage (synchronized from frontend)
button_vars: Dict[str, float] = {}

load_math()

# AO Enable Gate Tracking
# Track desired values separately from what's actually written to hardware
ao_desired_values = [0.0, 0.0]  # Desired voltage for each AO
ao_last_gate_state = [True, True]  # Track if gate was enabled last tick

# Initialize motors from config
for idx, motor_cfg in enumerate(motor_file.motors):
    if motor_cfg.include:
        motor_mgr.add_motor(idx, motor_cfg.model_dump())

# Filters per AI ch (configured by config.json -> analogs[i].cutoffHz)
lpf = OnePoleLPFBank()
# Filters per TC ch (configured by config.json -> thermocouples[i].cutoffHz)
lpf_tc = OnePoleLPFBank()

ws_clients: List[WebSocket] = []
session_logger: Optional[SessionLogger] = None
run_task: Optional[asyncio.Task] = None
# Get acquisition rate from first enabled E-1608 board
acq_rate_hz: float = 100.0  # Default
if app_cfg.boards1608:
    for board in app_cfg.boards1608:
        if board.enabled:
            acq_rate_hz = max(1.0, board.sampleRateHz)
            break
_need_reconfig_filters = False

@app.on_event("startup")
def _on_startup():
    print("[MCC-Hub] FastAPI startup")
    # Print versions for verification
    import app_models
    import mcc_bridge
    print(f"[VERSIONS] server.py: {SERVER_VERSION}")
    print(f"[VERSIONS] app_models.py: {getattr(app_models, '__version__', 'unknown')}")
    print(f"[VERSIONS] mcc_bridge.py: {getattr(mcc_bridge, '__version__', 'unknown')}")

@app.on_event("shutdown")
def _on_shutdown():
    print("[MCC-Hub] FastAPI shutdown")
    motor_mgr.disconnect_all()
    print("[MCC-Hub] Motors disconnected")

async def broadcast(msg: dict):
    try:
        txt = json.dumps(msg, separators=(",", ":"))  # pre-encode once
    except Exception as e:
        print(f"[WS] JSON serialization failed: {e}")
        print(f"[WS] Message type: {msg.get('type')}")
        import traceback
        traceback.print_exc()
        return
    
    living = []
    sent_count = 0
    for ws in ws_clients:
        try:
            await ws.send_text(txt)
            living.append(ws)
            sent_count += 1
        except Exception as e:
            # Client disconnected
            print(f"[WS] Client send failed: {e}")
            pass
    ws_clients[:] = living
    if sent_count == 0 and len(ws_clients) > 0:
        print(f"[WS] WARNING: Had {len(ws_clients)} clients but sent to 0!")

async def acq_loop():
    """
    Main acquisition loop.

    - Samples the hardware at acq_rate_hz (AI).
    - Samples thermocouples at a much lower fixed rate (TC_RATE_HZ).
    - Runs scaling, LPF, and PIDs on every AI sample.
    - Logs every LOG_EVERY samples.
    - Broadcasts to the browser at a lower fixed UI rate (~TARGET_UI_HZ),
      regardless of acq_rate_hz, to avoid overloading the websocket/JS.
    """
    global session_logger, _need_reconfig_filters

    # Target UI update rate (for charts/widgets)
    TARGET_UI_HZ = 25.0
    # Max TC read rate; TCs are slow, don't hammer them every AI sample
    TC_RATE_HZ = 10.0

    ticks = 0
    log_ctr = 0
    bcast_ctr = 0

    print(f"[MCC-Hub] Acquisition loop starting @ {acq_rate_hz} Hz")
    last = time.perf_counter()

    # Prepare filters from config
    all_analogs = get_all_analogs(app_cfg)
    cutoff_list = [a.cutoffHz for a in all_analogs]
    print(f"[DEBUG] Configuring LPF: {len(all_analogs)} channels, cutoffs={cutoff_list}")
    lpf.configure(
        rate_hz=acq_rate_hz,
        cutoff_list=cutoff_list,
    )
    lpf_tc.configure(
        rate_hz=acq_rate_hz,
        cutoff_list=[tc.cutoffHz for tc in get_all_thermocouples(app_cfg)],
    )

    # Start session logging folder
    session_dir = LOGS_DIR / datetime.now().strftime("%Y%m%d_%H%M%S")
    session_dir.mkdir(parents=True, exist_ok=True)
    session_logger = SessionLogger(session_dir)
    await broadcast({"type": "session", "dir": session_dir.name})
    print(f"[MCC-Hub] Logging to {session_dir}")

    # Start hardware
    try:
        mcc.open(app_cfg)
        print("[MCC-Hub] Hardware open() complete")
        
        # Initialize analog outputs to startup values
        # Set multiple times because hardware may reset to default (often 1V for AO0)
        print("[MCC-Hub] Initializing AOs to startup values...")
        for attempt in range(3):  # Try 3 times
            for i, ao_cfg in enumerate(get_all_analog_outputs(app_cfg)):
                if ao_cfg.include:
                    try:
                        mcc.set_ao(i, ao_cfg.startupV)
                        if attempt == 0:
                            print(f"[MCC-Hub]   AO{i} -> {ao_cfg.startupV}V (startup)")
                    except Exception as e:
                        if attempt == 0:
                            print(f"[MCC-Hub]   AO{i} FAILED: {e}")
            await asyncio.sleep(0.05)  # Small delay between attempts
        
        print("[MCC-Hub] AO initialization complete")
        
    except Exception as e:
        print(f"[MCC-Hub] Hardware open() failed: {e}")

    # TC throttling state
    last_tc_vals: List[float] = []
    last_tc_time = time.perf_counter()
    min_tc_interval = 1.0 / max(1.0, TC_RATE_HZ)
    
    # PID telemetry from previous cycle (for cascade control)
    last_pid_telemetry: List[Dict] = []
    math_tel: List[Dict] = []  # Math telemetry for current cycle
    last_expr_outputs: List[float] = []  # Expression outputs from previous cycle
    expr_tel: List[Dict] = []  # Expression telemetry for current cycle

    try:
        while True:
            # Pacing from current acquisition rate (responds to /api/acq/rate)
            dt = 1.0 / max(1.0, acq_rate_hz)
            now = time.perf_counter()
            to_sleep = dt - (now - last)
            if to_sleep > 0:
                await asyncio.sleep(to_sleep)
            last = time.perf_counter()

            # Reconfigure LPF if rate changed
            if _need_reconfig_filters:
                lpf.configure(
                    rate_hz=acq_rate_hz,
                    cutoff_list=[a.cutoffHz for a in get_all_analogs(app_cfg)],
                )
                lpf_tc.configure(
                    rate_hz=acq_rate_hz,
                    cutoff_list=[tc.cutoffHz for tc in get_all_thermocouples(app_cfg)],
                )
                _need_reconfig_filters = False
                print(f"[MCC-Hub] Reconfigured LPF for rate {acq_rate_hz} Hz")

            # --- Read AI every tick ---
            try:
                ai_raw = mcc.read_ai_all()
            except Exception as e:
                print(f"[MCC-Hub] AI read failed: {e}")
                ai_raw = [0.0] * 8

            # --- Read TCs at a much lower rate ---
            now_tc = time.perf_counter()
            if now_tc - last_tc_time >= min_tc_interval:
                try:
                    last_tc_vals = mcc.read_tc_all()
                except Exception as e:
                    print(f"[MCC-Hub] TC read failed: {e}")
                    # keep last_tc_vals as-is on failure
                last_tc_time = now_tc
            
            # Apply offset and LPF to TC values
            tc_vals: List[float] = []
            for i, raw in enumerate(last_tc_vals):
                try:
                    offset = get_all_thermocouples(app_cfg)[i].offset if i < len(get_all_thermocouples(app_cfg)) else 0.0
                    val = raw + offset
                    val = lpf_tc.apply(i, val)
                    tc_vals.append(val)
                except Exception:
                    tc_vals.append(raw)

            # --- Scale + LPF AI values ---
            ai_scaled: List[float] = []
            for i, raw in enumerate(ai_raw):
                try:
                    m = get_all_analogs(app_cfg)[i].slope
                    b = get_all_analogs(app_cfg)[i].offset
                except Exception:
                    m, b = 1.0, 0.0
                y = m * raw + b
                y = lpf.apply(i, y)
                ai_scaled.append(y)

            # Get DO/AO snapshot BEFORE PID and LE evaluation
            # (needed for both LE inputs and PID gate checking)
            ao = mcc.get_ao_snapshot()
            do = mcc.get_do_snapshot()

            # --- Math Operators ---
            # Evaluate first so LEs can use math outputs
            # Use previous cycle's PID data (avoids circular dependency)
            math_tel = math_mgr.evaluate_all({
                "ai": ai_scaled,
                "ao": ao,
                "tc": tc_vals,
                "pid": last_pid_telemetry,  # Previous cycle PID data
                "le": []    # LEs haven't been evaluated with math yet
            }, bridge=mcc)

            # --- Logic Elements ---
            # Evaluate AFTER Math but BEFORE PIDs so PIDs can use LE outputs as enable gates
            le_outputs = le_mgr.evaluate_all({
                "ai": ai_scaled,
                "ao": ao,
                "do": do,
                "tc": tc_vals,
                "pid": [],  # PIDs haven't run yet
                "math": math_tel  # Now LEs can use math outputs
            })
            le_tel = le_mgr.get_telemetry()

            # --- PIDs (may drive DO/AO) ---
            # Pass DO/LE/Math/Expr state so PIDs can use them
            # Pass previous cycle's PID and Expr telemetry for inputs/gates
            telemetry = pid_mgr.step(
                ai_vals=ai_scaled,
                tc_vals=tc_vals,
                bridge=mcc,
                do_state=do,
                le_state=le_tel,  # Now has updated LE state with math
                pid_prev=last_pid_telemetry,
                math_outputs=[m.get("output", 0.0) for m in math_tel],
                expr_outputs=last_expr_outputs,  # Previous cycle's expression outputs
                sample_rate_hz=acq_rate_hz
            )
            
            # Store for next cycle
            last_pid_telemetry = telemetry

            # --- Logic Elements (Re-evaluation) ---
            # Re-evaluate LEs after PIDs so LEs can use PID outputs as inputs
            le_outputs = le_mgr.evaluate_all({
                "ai": ai_scaled,
                "ao": ao,
                "do": do,
                "tc": tc_vals,
                "pid": telemetry,
                "math": math_tel  # Keep math available
            })
            le_tel = le_mgr.get_telemetry()

            # --- Expressions ---
            # Evaluate expressions after everything else so they can see all signal states
            try:
                tc_count = len(get_all_thermocouples(app_cfg)) if get_all_thermocouples(app_cfg) else 0
                
                if USE_CPP_EXPRESSIONS and cpp_backend is not None:
                    # Use C++ backend (FAST! 50-500× speedup)
                    cpp_results = cpp_backend.evaluate(
                        ai_vals=ai_scaled,
                        ao_vals=ao,
                        tc_vals=tc_vals,
                        do_vals=do,
                        pid_vals=[tel.get('output', 0.0) for tel in telemetry],
                        button_vars=button_vars  # CRITICAL: Pass buttonVars!
                    )
                    
                    # DEBUG: Check after evaluate
                    if 'pressureSetPoint' in cpp_backend.staticvar_map:
                        idx = cpp_backend.staticvar_map['pressureSetPoint']
                        if ticks < 3:  # Only first 3 ticks
                            log.info(f"[DEBUG-EVAL] AFTER evaluate: pressureSetPoint index={idx} value={cpp_backend.static_vars[idx]}")
                            log.info(f"[DEBUG-LOCALS] local_vars_per_expr keys: {list(cpp_results.get('local_vars_per_expr', {}).keys())}")
                            if 0 in cpp_results.get('local_vars_per_expr', {}):
                                log.info(f"[DEBUG-LOCALS] Expr 0 locals: {cpp_results['local_vars_per_expr'][0]}")
                    
                    # Convert to same format as Python evaluator
                    expr_tel = []
                    for i in range(len(expr_mgr.expressions)):
                        expr_tel.append({
                            'name': expr_mgr.expressions[i].name,
                            'output': cpp_results['results'][i],
                            'enabled': expr_mgr.expressions[i].enabled,
                            'error': None,
                            'locals': cpp_results.get('local_vars_per_expr', {}).get(i, {}),  # Get locals for this expr
                            'hw_writes': cpp_results['hw_writes_per_expr'][i],
                            'branches': {},
                            'executed_lines': [],  # Empty list (not set!) for JSON
                            'do_writes': cpp_results['do_writes'],  # Correct!
                            'ao_writes': cpp_results['ao_writes']   # Correct!
                        })
                    
                    # Apply hardware writes from C++ - only write what changed
                    # Track last DO state to avoid redundant writes
                    if not hasattr(cpp_backend, '_last_do_state'):
                        cpp_backend._last_do_state = {}
                    
                    for ch, val in cpp_results['do_writes'].items():
                        try:
                            # Only write if value changed
                            if cpp_backend._last_do_state.get(ch) != val:
                                do[ch] = val
                                mcc.set_do(ch, bool(val), active_high=True)
                                cpp_backend._last_do_state[ch] = val
                        except Exception as e:
                            print(f"[CPP-DO] Failed to write DO{ch}={val}: {e}")
                    
                    for ch, val in cpp_results['ao_writes'].items():
                        try:
                            ao[ch] = val
                            mcc.set_ao(ch, val)
                        except Exception as e:
                            print(f"[CPP-AO] Failed to write AO{ch}={val}: {e}")
                else:
                    # Use Python evaluator (slower but always works)
                    expr_tel = expr_mgr.evaluate_all({
                        "ai": ai_scaled,
                        "ao": ao,
                        "do": do,
                        "tc": tc_vals,
                        "pid": telemetry,
                        "math": math_tel,
                        "le": le_tel,
                        "expr": last_expr_outputs,
                        "buttonVars": button_vars,
                        "ai_list": [{"name": ch.name} for ch in get_all_analogs(app_cfg)],
                        "ao_list": [{"name": ch.name} for ch in get_all_analog_outputs(app_cfg)],
                        "tc_list": [{"name": ch.name} for ch in get_all_thermocouples(app_cfg)],
                        "do_list": [{"name": ch.name} for ch in get_all_digital_outputs(app_cfg)],
                        "pid_list": [{"name": loop.name} for loop in pid_mgr.meta],
                        "math_list": [{"name": op.name} for op in math_mgr.operators],
                        "le_list": [{"name": elem.name} for elem in le_mgr.elements],
                        "expr_list": [{"name": expr.name} for expr in expr_mgr.expressions]
                    }, bridge=mcc, sample_rate_hz=acq_rate_hz)
                
                # Extract expr outputs for use in PID gates and other systems
                expr_outputs = [e.get("output", 0.0) for e in expr_tel]
                
                # Store for next cycle (PIDs will use these as gates/inputs)
                last_expr_outputs = expr_outputs
                
            except Exception as e:
                print(f"[EXPR] Evaluation error: {e}")
                import traceback
                traceback.print_exc()
                # Keep previous values on error
                expr_outputs = last_expr_outputs if last_expr_outputs else [0.0] * len(expr_mgr.expressions)
            
            # --- Logic Elements (Third pass - can now see expressions) ---
            # Re-evaluate LEs one more time so they can use expression outputs
            le_outputs = le_mgr.evaluate_all({
                "ai": ai_scaled,
                "ao": ao,
                "do": do,
                "tc": tc_vals,
                "pid": telemetry,
                "math": math_tel,
                "expr": expr_outputs  # Now LEs can see current cycle expressions
            })
            le_tel = le_mgr.get_telemetry()

            # --- AO Enable Gating ---
            # Check gates and apply/restore values as needed
            global ao_desired_values, ao_last_gate_state
            
            for i, ao_cfg in enumerate(get_all_analog_outputs(app_cfg)):
                if not ao_cfg.include:
                    continue
                    
                if ao_cfg.enable_gate:
                    # Check the enable signal
                    enable_signal = False
                    
                    if ao_cfg.enable_kind == "do":
                        if ao_cfg.enable_index < len(do):
                            enable_signal = bool(do[ao_cfg.enable_index])
                    elif ao_cfg.enable_kind == "le":
                        if ao_cfg.enable_index < len(le_tel):
                            enable_signal = le_tel[ao_cfg.enable_index].get("output", False)
                    elif ao_cfg.enable_kind == "math":
                        if ao_cfg.enable_index < len(math_tel):
                            enable_signal = math_tel[ao_cfg.enable_index].get("output", 0.0) >= 1.0
                    elif ao_cfg.enable_kind == "expr":
                        if ao_cfg.enable_index < len(expr_outputs):
                            enable_signal = expr_outputs[ao_cfg.enable_index] >= 1.0
                    
                    # Check for state transitions
                    was_enabled = ao_last_gate_state[i] if i < len(ao_last_gate_state) else True
                    
                    if enable_signal and not was_enabled:
                        # Transition: disabled -> enabled
                        # Restore the desired value
                        try:
                            mcc.set_ao(i, ao_desired_values[i])
                        except Exception as e:
                            print(f"[AO] Failed to restore AO{i} to {ao_desired_values[i]}V: {e}")
                    elif not enable_signal and was_enabled:
                        # Transition: enabled -> disabled
                        # Force to 0V
                        try:
                            mcc.set_ao(i, 0.0)
                        except Exception as e:
                            print(f"[AO] Failed to gate AO{i} to 0V: {e}")
                    # If state hasn't changed, don't write (avoid unnecessary traffic)
                    
                    # Update last state
                    if i < len(ao_last_gate_state):
                        ao_last_gate_state[i] = enable_signal

            # --- Motor Controllers ---
            # Update each enabled motor based on its input source
            motor_status = []
            for idx, motor_cfg in enumerate(motor_file.motors):
                if not motor_cfg.enabled or not motor_cfg.include:
                    continue
                
                try:
                    # Get input value
                    input_val = 0.0
                    if motor_cfg.input_source == "ai" and motor_cfg.input_channel < len(ai_scaled):
                        input_val = ai_scaled[motor_cfg.input_channel]
                    elif motor_cfg.input_source == "ao" and motor_cfg.input_channel < len(ao):
                        input_val = ao[motor_cfg.input_channel]
                    elif motor_cfg.input_source == "tc" and motor_cfg.input_channel < len(tc_vals):
                        input_val = tc_vals[motor_cfg.input_channel]
                    elif motor_cfg.input_source == "pid" and motor_cfg.input_channel < len(telemetry):
                        # Get PID U (output) value
                        pid_info = telemetry[motor_cfg.input_channel]
                        # Use lowercase 'u' which is standard in telemetry
                        input_val = pid_info.get('u', 0.0)
                    
                    # Clamp input to input range (bounds checking)
                    input_val = max(motor_cfg.input_min, min(motor_cfg.input_max, input_val))
                    
                    # Calculate RPM: RPM = input * scale + offset
                    # Direct multiplication (no normalization)
                    # Example: input=-240, scale=1000, offset=0 -> RPM=-240000
                    rpm = input_val * motor_cfg.scale_factor + motor_cfg.offset
                    
                    # Update motor
                    success = motor_mgr.set_motor_rpm(idx, rpm, motor_cfg.cw_positive)
                    
                    motor_status.append({
                        "index": idx,
                        "input": input_val,
                        "rpm_cmd": rpm,
                        "success": success
                    })
                except Exception as e:
                    log.error(f"Motor {idx} update failed: {e}")
                    motor_status.append({
                        "index": idx,
                        "input": 0.0,
                        "rpm_cmd": 0.0,
                        "success": False,
                        "error": str(e)
                    })

            # Convert NaN/Infinity to None for JSON serialization
            def clean_for_json(obj):
                if isinstance(obj, float):
                    return None if not math.isfinite(obj) else obj
                elif isinstance(obj, list):
                    return [clean_for_json(item) for item in obj]
                elif isinstance(obj, dict):
                    return {k: clean_for_json(v) for k, v in obj.items()}
                return obj

            frame = {
                "type": "tick",
                "t": time.time(),
                "ai": clean_for_json(ai_scaled),
                "ao": clean_for_json(ao),
                "do": do,
                "tc": clean_for_json(tc_vals),
                "pid": clean_for_json(telemetry),
                "motors": clean_for_json(motor_status),
                "le": clean_for_json(le_tel),
                "math": clean_for_json(math_tel),
                "expr": clean_for_json(expr_tel),
                # Global/static variables from expression engine (static.name = ...)
                "global_vars": clean_for_json(expr_global_vars.list_all()),
                # buttonVars synchronized from the frontend
                "button_vars": clean_for_json(dict(button_vars)),
                # Static vars from C++ backend (for runtime editing)
                "static_vars": {}
            }
            
            # Populate static_vars from C++ backend
            if cpp_backend and hasattr(cpp_backend, 'staticvar_map') and hasattr(cpp_backend, 'static_vars'):
                for name, index in cpp_backend.staticvar_map.items():
                    frame['static_vars'][name] = float(cpp_backend.static_vars[index])
                
                # Debug first 3 ticks
                if ticks < 3:
                    log.info(f"[DEBUG] Tick #{ticks+1} static_vars in telemetry: {frame['static_vars']}")

            ticks += 1
            log_ctr += 1
            bcast_ctr += 1

            # --- Logging: at full acq rate (or LOG_EVERY) ---
            if log_ctr >= LOG_EVERY and session_logger is not None:
                session_logger.write(frame)
                log_ctr = 0

            # --- Websocket broadcast: auto-decimated to ~TARGET_UI_HZ ---
            # Base decimation from env (if you want it coarser)
            env_bcast_every = BROADCAST_EVERY  # usually 1
            # Automatic decimation for UI smoothness
            auto_bcast_every = max(
                1,
                int(round(acq_rate_hz / max(1.0, TARGET_UI_HZ))),
            )
            effective_bcast_every = max(env_bcast_every, auto_bcast_every)

            if bcast_ctr >= effective_bcast_every:
                if ticks <= 5:
                    print(f"[DBG] Broadcasting tick {ticks}, clients={len(ws_clients)}")
                await broadcast(frame)
                bcast_ctr = 0

            # Debug for first few ticks
            if ticks <= MCC_DUMP_FIRST:
                try:
                    ai_str = ["%.3f" % v for v in ai_scaled]
                    ao_str = ["%.3f" % v for v in ao]
                    tc_str = [
                        ("%.1f" % v) if v is not None else "nan"
                        for v in (tc_vals or [])
                    ]
                    print(
                        f"[DBG] tick#{ticks} ai={ai_str}  ao={ao_str}  do={do}  tc={tc_str}"
                    )
                except Exception:
                    # Don't let formatting kill the loop
                    pass

    except asyncio.CancelledError:
        pass  # Normal shutdown — WebSocket client disconnected
    except Exception as e:
        print(f"[MCC-Hub] ACQUISITION LOOP ERROR: {e}")
        import traceback
        traceback.print_exc()
    finally:
        print("[MCC-Hub] Acquisition loop stopping")



@app.get("/api/config")
def get_config():
    # read latest from disk so external edits are visible
    cfg = _load_json_model(CFG_PATH, AppConfig)
    return cfg.model_dump()

@app.put("/api/config")
def put_config(body: dict):
    global app_cfg, _need_reconfig_filters
    app_cfg = AppConfig.model_validate(body)
    CFG_PATH.write_text(json.dumps(app_cfg.model_dump(), indent=2))
    _need_reconfig_filters = True
    print("[MCC-Hub] Config updated")
    return {"ok": True}

@app.get("/api/pid")
def get_pid():
    return _load_json_model(PID_PATH, PIDFile).model_dump()

@app.put("/api/pid")
def put_pid(body: dict):
    global pid_file, cpp_backend, USE_CPP_EXPRESSIONS, CURRENT_DLL_PATH
    pid_file = PIDFile.model_validate(body)
    PID_PATH.write_text(json.dumps(pid_file.model_dump(), indent=2))
    pid_mgr.load(pid_file)
    print("[MCC-Hub] PID file updated")
    
    # Recompile expressions + PIDs
    if USE_CPP_EXPRESSIONS:
        try:
            print("[MCC-Hub] Recompiling with new PID configuration...")
            success = compile_cpp_expressions()
            if success:
                # Reload C++ backend with new versioned DLL
                new_backend = load_cpp_backend(CURRENT_DLL_PATH)
                if new_backend:
                    cpp_backend = new_backend
                    USE_CPP_EXPRESSIONS = True
                    print("[MCC-Hub] ✓ C++ backend reloaded with new PIDs")
                else:
                    print("[MCC-Hub] ✗ Backend reload failed")
                    USE_CPP_EXPRESSIONS = False
                    cpp_backend = None
            else:
                print("[MCC-Hub] ✗ Compilation failed, using old DLL")
        except Exception as e:
            print(f"[MCC-Hub] Compilation error: {e}")
            import traceback
            traceback.print_exc()
    
    return {"ok": True}

@app.get("/api/math_operators")
def get_math_operators():
    return _load_json_model(MATH_PATH, MathOpFile).model_dump()

@app.put("/api/math_operators")
def put_math_operators(body: dict):
    global math_mgr
    math_file = MathOpFile.model_validate(body)
    MATH_PATH.write_text(json.dumps(math_file.model_dump(), indent=2))
    load_math()
    return {"ok": True}

@app.get("/api/expressions")
def get_expressions():
    """Get all expressions"""
    return expr_mgr.to_dict()

@app.put("/api/expressions")
def put_expressions(body: dict):
    """Save expressions and auto-recompile C++ if enabled"""
    global cpp_backend, USE_CPP_EXPRESSIONS, CURRENT_DLL_PATH
    
    try:
        expr_mgr.from_dict(body)
        
        # Auto-recompile C++ if it was being used
        if USE_CPP_EXPRESSIONS or cpp_backend is not None:
            log.info("[CPP-EXPR] Expressions saved, recompiling...")
            
            # CRITICAL: Temporarily disable C++ to stop DAQ loop from calling it
            old_backend = cpp_backend
            USE_CPP_EXPRESSIONS = False
            cpp_backend = None  # Clear immediately so DAQ loop can't use it
            
            # Give the DAQ loop time to stop using C++
            import time
            time.sleep(0.2)
            
            # Now safe to unload old DLL
            if old_backend is not None:
                try:
                    # Close the DLL handle
                    if hasattr(old_backend, 'dll') and old_backend.dll is not None:
                        import ctypes
                        # Free the library on Windows
                        if hasattr(ctypes, 'windll'):
                            ctypes.windll.kernel32.FreeLibrary.argtypes = [ctypes.c_void_p]
                            ctypes.windll.kernel32.FreeLibrary(old_backend.dll._handle)
                        old_backend.dll = None
                    log.info("[CPP-EXPR] ✓ Unloaded old DLL")
                except Exception as e:
                    log.warning(f"[CPP-EXPR] Failed to unload DLL: {e}")
            
            # Compile to new versioned DLL (compile_cpp_expressions handles versioning)
            if compile_cpp_expressions():
                # Reload the backend with new versioned DLL
                new_backend = load_cpp_backend(dll_path=CURRENT_DLL_PATH)
                if new_backend:
                    # Atomically swap both backend and flag
                    cpp_backend = new_backend
                    time.sleep(0.05)  # Small delay for backend to settle
                    USE_CPP_EXPRESSIONS = True
                    log.info(f"[CPP-EXPR] ✓ Recompiled to {CURRENT_DLL_PATH} and reloaded successfully!")
                else:
                    log.warning("[CPP-EXPR] Recompilation succeeded but reload failed, falling back to Python")
                    USE_CPP_EXPRESSIONS = False
                    cpp_backend = None
            else:
                log.warning("[CPP-EXPR] Recompilation failed, falling back to Python expressions")
                USE_CPP_EXPRESSIONS = False
                cpp_backend = None
        
        return {"ok": True}
    except Exception as e:
        log.error(f"[EXPR] Failed to save expressions: {e}")
        return {"ok": False, "error": str(e)}

@app.post("/api/expressions/check")
def check_expression_syntax(body: dict):
    """Check expression syntax"""
    expression = body.get('expression', '')
    
    # Build test signal state with current config
    test_state = {
        'ai_list': [{'name': ch.name} for ch in get_all_analogs(app_cfg)],
        'ai': [0.0] * len(get_all_analogs(app_cfg)),
        'ao_list': [{'name': ch.name} for ch in (get_all_analog_outputs(app_cfg) or [])],
        'ao': [0.0] * len(get_all_analog_outputs(app_cfg) or []),
        'tc_list': [{'name': tc.name} for tc in (get_all_thermocouples(app_cfg) or [])],
        'tc': [0.0] * len(get_all_thermocouples(app_cfg) or []),
        'do_list': [{'name': ch.name} for ch in (get_all_digital_outputs(app_cfg) or [])],
        'do': [0] * len(get_all_digital_outputs(app_cfg) or []),
        'pid_list': [{'name': loop.name} for loop in (pid_mgr.meta if pid_mgr else [])],
        'pid': [{'out': 0, 'u': 0, 'pv': 0, 'target': 0, 'err': 0}] * len(pid_mgr.meta if pid_mgr else []),
        'math_list': [{'name': op.name} for op in math_mgr.operators],
        'math': [0.0] * len(math_mgr.operators),
        'le_list': [{'name': elem.name} for elem in le_mgr.elements],
        'le': [0] * len(le_mgr.elements),
        'expr_list': [{'name': expr.name} for expr in expr_mgr.expressions],
        'expr': [0.0] * len(expr_mgr.expressions),
        'time': 0.0,
        'sample': 0
    }
    
    return expr_mgr.check_syntax(expression, test_state)

@app.get("/api/expressions/globals")
def get_expression_globals():
    """Get all global variables (from C++ or Python)"""
    if USE_CPP_EXPRESSIONS and cpp_backend:
        # Return C++ static vars
        static_dict = {}
        if hasattr(cpp_backend, 'staticvar_map') and hasattr(cpp_backend, 'static_vars'):
            log.info(f"[GLOBALS-API] staticvar_map: {cpp_backend.staticvar_map}")
            for name, index in cpp_backend.staticvar_map.items():
                value = float(cpp_backend.static_vars[index])
                static_dict[name] = value
                log.info(f"[GLOBALS-API] {name} (index {index}) = {value}")
        else:
            log.warning("[GLOBALS-API] cpp_backend missing staticvar_map or static_vars")
        log.info(f"[GLOBALS-API] Returning {len(static_dict)} static variables")
        return {"globals": static_dict}
    else:
        # Return Python global vars
        log.info("[GLOBALS-API] Using Python global vars")
        return {"globals": expr_global_vars.list_all()}

@app.delete("/api/expressions/globals")
def delete_expression_global(body: dict):
    """Delete a specific global variable"""
    name = body.get('name')
    if name and name in expr_global_vars._vars:
        del expr_global_vars._vars[name]
        return {"ok": True}
    return {"ok": False, "error": "Variable not found"}

@app.post("/api/expressions/globals/clear")
def clear_expression_globals():
    """Clear all global variables"""
    expr_global_vars.clear()
    return {"ok": True}

@app.post("/api/button_vars")
def update_button_vars(body: dict):
    """Update button variable states from frontend"""
    global button_vars
    vars_dict = body.get('vars', {})
    button_vars.update(vars_dict)
    return {"ok": True}

@app.get("/api/button_vars")
def get_button_vars():
    """Get current button variable states"""
    return {"vars": button_vars}

@app.post("/api/static_vars")
def update_static_var(body: dict):
    """Update static variable value at runtime (no recompile needed!)"""
    global cpp_backend
    
    var_name = body.get('name')
    var_value = float(body.get('value', 0))
    
    if not var_name:
        return {"ok": False, "error": "Variable name required"}
    
    # Try C++ backend first
    if cpp_backend and hasattr(cpp_backend, 'staticvar_map') and hasattr(cpp_backend, 'static_vars'):
        if var_name in cpp_backend.staticvar_map:
            index = cpp_backend.staticvar_map[var_name]
            old_value = cpp_backend.static_vars[index]
            cpp_backend.static_vars[index] = var_value
            log.info(f"[STATIC-VAR] Updated {var_name} = {var_value} (was {old_value}, index {index})")
            log.info(f"[STATIC-VAR] Verified: cpp_backend.static_vars[{index}] = {cpp_backend.static_vars[index]}")
            return {"ok": True, "old_value": old_value, "new_value": var_value}
    
    # Fall back to Python global vars
    if var_name in expr_global_vars._vars:
        old_value = expr_global_vars._vars[var_name]
        expr_global_vars._vars[var_name] = var_value
        log.info(f"[STATIC-VAR] Updated Python global {var_name} = {var_value} (was {old_value})")
        return {"ok": True, "old_value": old_value, "new_value": var_value, "backend": "python"}
    
    # Variable not found
    if cpp_backend and hasattr(cpp_backend, 'staticvar_map'):
        available = list(cpp_backend.staticvar_map.keys())
    else:
        available = list(expr_global_vars._vars.keys())
    
    log.warning(f"[STATIC-VAR] Variable '{var_name}' not found. Available: {available}")
    return {"ok": False, "error": f"Variable '{var_name}' not found", "available": available}

@app.get("/api/static_vars")
def get_static_vars():
    """Get current static variable values"""
    global cpp_backend
    
    if cpp_backend and hasattr(cpp_backend, 'staticvar_map') and hasattr(cpp_backend, 'static_vars'):
        vars_dict = {}
        for name, index in cpp_backend.staticvar_map.items():
            vars_dict[name] = float(cpp_backend.static_vars[index])
        return {"ok": True, "vars": vars_dict}
    else:
        return {"ok": False, "error": "C++ backend not available", "vars": {}}

@app.get("/api/script")
def get_script():
    return _load_json_model(SCRIPT_PATH, ScriptFile).model_dump()

@app.put("/api/script")
def put_script(body: dict):
    global script_file
    # accept legacy list payload as well and wrap
    if isinstance(body, list):
        body = {"events": body}
    script_file = ScriptFile.model_validate(body)
    SCRIPT_PATH.write_text(json.dumps(script_file.model_dump(), indent=2))
    print("[MCC-Hub] Script updated")
    return {"ok": True}

# ---------- REST: motors ----------

@app.get("/api/motors")
def get_motors():
    return _load_json_model(MOTOR_PATH, MotorFile).model_dump()

@app.put("/api/motors")
def put_motors(body: dict):
    global motor_file, motor_mgr
    motor_file = MotorFile.model_validate(body)
    MOTOR_PATH.write_text(json.dumps(motor_file.model_dump(), indent=2))
    
    # Reinitialize motor manager with new config
    motor_mgr.disconnect_all()
    for idx, motor_cfg in enumerate(motor_file.motors):
        if motor_cfg.include:
            motor_mgr.add_motor(idx, motor_cfg.model_dump())
    
    print("[MCC-Hub] Motors updated")
    return {"ok": True}

@app.get("/api/motors/ports")
def get_serial_ports():
    """List available COM ports"""
    return {"ports": list_serial_ports()}


@app.get("/api/logic_elements")
def get_logic_elements():
    """Get logic element configuration"""
    if LE_PATH.exists():
        try:
            return json.loads(LE_PATH.read_text())
        except:
            pass
    return {"elements": []}

@app.put("/api/logic_elements")
def put_logic_elements(data: LEFile):
    """Update logic element configuration"""
    try:
        LE_PATH.write_text(json.dumps(data.dict(), indent=2))
        load_le()
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": str(e)}

@app.post("/api/motors/{index}/rpm")
def set_motor_rpm(index: int, body: dict):
    """Manually set motor RPM"""
    rpm = body.get("rpm", 0.0)
    success = motor_mgr.set_motor_rpm(index, rpm)
    return {"ok": success}

@app.post("/api/motors/{index}/enable")
def enable_motor(index: int):
    """Enable motor"""
    global motor_file
    
    if index >= len(motor_file.motors):
        return {"ok": False, "error": "Motor index out of range"}
    
    # Update the enabled flag in config
    motor_file.motors[index].enabled = True
    MOTOR_PATH.write_text(json.dumps(motor_file.model_dump(), indent=2))
    
    # Enable hardware if motor is in manager
    if index in motor_mgr.motors:
        success = motor_mgr.motors[index].enable_motor()
        return {"ok": success, "enabled": True}
    
    return {"ok": True, "enabled": True, "note": "Config updated, motor not initialized (check include)"}

@app.post("/api/motors/{index}/disable")
def disable_motor(index: int):
    """Disable motor"""
    global motor_file
    
    if index >= len(motor_file.motors):
        return {"ok": False, "error": "Motor index out of range"}
    
    # Update the enabled flag in config
    motor_file.motors[index].enabled = False
    MOTOR_PATH.write_text(json.dumps(motor_file.model_dump(), indent=2))
    
    # Disable hardware and stop motor
    if index in motor_mgr.motors:
        # Send stop command (0 RPM)
        motor_mgr.set_motor_rpm(index, 0, motor_file.motors[index].cw_positive)
        success = motor_mgr.motors[index].disable_motor()
        return {"ok": success, "enabled": False}
    
    return {"ok": True, "enabled": False, "note": "Config updated, motor not initialized (check include)"}

@app.get("/api/motors/{index}/status")
def get_motor_status(index: int):
    """Get motor status"""
    status = motor_mgr.get_motor_status(index)
    if status:
        return status
    return {"error": "Motor not found"}

# ---------- REST: control ----------

@app.post("/api/acq/rate")
def set_rate(req: RateReq):
    global acq_rate_hz, _need_reconfig_filters, app_cfg
    acq_rate_hz = max(1.0, float(req.hz))
    _need_reconfig_filters = True

    # Save rate to config for all enabled boards
    if app_cfg.boards1608:
        for board in app_cfg.boards1608:
            if board.enabled:
                board.sampleRateHz = acq_rate_hz
        
        # Save config to disk
        try:
            CFG_PATH.write_text(json.dumps(app_cfg.model_dump(), indent=2))
            print(f"[MCC-Hub] Rate set to {acq_rate_hz} Hz and saved to config")
        except Exception as e:
            print(f"[MCC-Hub] Rate set to {acq_rate_hz} Hz but failed to save: {e}")
    else:
        print(f"[MCC-Hub] Rate set to {acq_rate_hz} Hz (not saved - no boards)")

    # Reconfigure the E-1608 AI block scan to match the new acquisition rate.
    # This keeps the hardware sampling in sync with the logical acq_rate_hz,
    # while still using block-based reads under the hood for performance.
    try:
        # Get blockSize from first enabled E-1608 board
        blockSize = 128  # Default
        if app_cfg.boards1608:
            for board in app_cfg.boards1608:
                if board.enabled:
                    blockSize = board.blockSize
                    break
        # Note: configure_ai_scan not needed for individual channel reads
    except Exception as e:
        print(f"[MCC-Hub] AI scan reconfig warn: {e}")

    return {"ok": True, "hz": acq_rate_hz}

@app.post("/api/do/set")
def set_do(req: DOReq):
    idx = req.index
    target_state = req.state
    active_high = req.active_high
    #print(f"[CMD] DO{idx} <- {target_state} (active_high={active_high})")
    
    # Check if this DO is gated by a logic element
    try:
        cfg = mcc.cfg
        if cfg is not None:
            all_dos = get_all_digital_outputs(cfg)
            if idx < len(all_dos):
                do_cfg = all_dos[idx]
                le_index = getattr(do_cfg, "logicElement", None)
                
                if le_index is not None and 0 <= le_index < len(le_mgr.outputs):
                    le_output = le_mgr.get_output(le_index)
                    if not le_output:
                        log.info(f"[DO] DO{idx} blocked by LE{le_index} (LE output is False)")
                        return {"ok": False, "reason": f"Blocked by LE{le_index}"}
    except Exception as e:
        log.error(f"[DO] Error checking LE gate: {e}")
    
    mcc.set_do(idx, target_state, active_high=active_high)
    return {"ok": True}

class BuzzStart(BaseModel):
    index: int
    hz: float
    active_high: bool = True

class BuzzStop(BaseModel):
    index: int

@app.post("/api/do/buzz/start")
async def api_buzz_start(req: BuzzStart):
    await mcc.start_buzz(int(req.index), float(req.hz), bool(req.active_high))
    return {"ok": True}

@app.post("/api/do/buzz/stop")
async def api_buzz_stop(req: BuzzStop):
    await mcc.stop_buzz(int(req.index))
    return {"ok": True}

@app.post("/api/ao/set")
def set_ao(req: AOReq):
    global ao_desired_values
    
    # Always update the desired value
    if 0 <= req.index < len(ao_desired_values):
        ao_desired_values[req.index] = req.volts
    
    # Check if this AO has enable gating
    ao_cfg = get_all_analog_outputs(app_cfg)[req.index] if req.index < len(get_all_analog_outputs(app_cfg)) else None
    
    if ao_cfg and ao_cfg.enable_gate:
        # Check the gate signal
        enable_signal = False
        
        if ao_cfg.enable_kind == "do":
            do_snapshot = mcc.get_do_snapshot()
            if ao_cfg.enable_index < len(do_snapshot):
                enable_signal = bool(do_snapshot[ao_cfg.enable_index])
        elif ao_cfg.enable_kind == "le":
            le_tel = le_mgr.get_telemetry()
            if ao_cfg.enable_index < len(le_tel):
                enable_signal = le_tel[ao_cfg.enable_index].get("output", False)
        
        # Only write to hardware if enabled
        if enable_signal:
            mcc.set_ao(req.index, req.volts)
        else:
            # Gate is disabled - don't write, keep at 0V
            mcc.set_ao(req.index, 0.0)
    else:
        # No gating, write directly
        mcc.set_ao(req.index, req.volts)
    
    return {"ok": True}

@app.post("/api/zero_ai")
async def zero_ai_channels(req: dict):
    """Zero/balance AI channels by averaging and adjusting offsets"""
    channels = req.get("channels", [])
    averaging_period = req.get("averaging_period", 1.0)
    balance_to_value = req.get("balance_to_value", 0.0)
    
    if not channels:
        return {"ok": False, "error": "No channels specified"}
    
    # Validate channels
    for ch in channels:
        if ch < 0 or ch >= len(get_all_analogs(app_cfg)):
            return {"ok": False, "error": f"Invalid channel index: {ch}"}
    
    # Collect samples at 100Hz for averaging_period
    sample_rate = 100.0  # Hz
    num_samples = int(averaging_period * sample_rate)
    samples = {ch: [] for ch in channels}
    
    print(f"[Zero AI] Collecting {num_samples} samples for channels {channels}...")
    
    for _ in range(num_samples):
        ai_raw = mcc.read_ai_all()
        
        for ch in channels:
            if ch < len(ai_raw):
                # Apply current slope and offset to get scaled value
                cfg = get_all_analogs(app_cfg)[ch]
                scaled = cfg.slope * ai_raw[ch] + cfg.offset
                samples[ch].append(scaled)
        
        await asyncio.sleep(1.0 / sample_rate)
    
    # Calculate averages and update offsets in actual board structure
    offsets_list = []
    for ch in channels:
        if not samples[ch]:
            return {"ok": False, "error": f"No valid samples for channel {ch}"}
        
        avg = sum(samples[ch]) / len(samples[ch])
        
        # Find which board and channel this global index maps to
        global_idx = ch
        found = False
        for board in app_cfg.boards1608:
            if not board.enabled:
                continue
            if global_idx < len(board.analogs):
                # Found it! Update offset in the actual board structure
                old_offset = board.analogs[global_idx].offset
                new_offset = old_offset - (avg - balance_to_value)
                board.analogs[global_idx].offset = new_offset
                
                offsets_list.append({
                    "channel": ch,
                    "old": old_offset,
                    "new": new_offset,
                    "avg": avg
                })
                print(f"[Zero AI] CH{ch} (board #{board.boardNum}, ch{global_idx}): avg={avg:.6f}, old_offset={old_offset:.6f}, new_offset={new_offset:.6f}")
                found = True
                break
            else:
                global_idx -= len(board.analogs)
        
        if not found:
            print(f"[Zero AI] WARNING: Could not find board for channel {ch}")
    
    # Debug: Check if changes are in the model
    print(f"[Zero AI] Before save - checking offsets in app_cfg:")
    for ch in channels:
        global_idx = ch
        for board in app_cfg.boards1608:
            if not board.enabled:
                continue
            if global_idx < len(board.analogs):
                print(f"  CH{ch} -> board #{board.boardNum}, analog[{global_idx}].offset = {board.analogs[global_idx].offset}")
                break
            else:
                global_idx -= len(board.analogs)
    
    # Save config
    config_dict = app_cfg.model_dump()
    CFG_PATH.write_text(json.dumps(config_dict, indent=2))
    print(f"[Zero AI] Config saved to {CFG_PATH}")
    
    # Verify save
    saved_text = CFG_PATH.read_text()
    print(f"[Zero AI] Saved config size: {len(saved_text)} bytes")
    
    return {"ok": True, "offsets": offsets_list}

# ---------- REST: logs ----------
@app.get("/api/logs")
def list_logs():
    return sorted([p.name for p in LOGS_DIR.glob("*") if p.is_dir()])

@app.post("/api/check_events")
async def post_check_events(req: Request):
    """Receive checklist check events from frontend and write to current log."""
    global session_logger
    try:
        data = await req.json()
        events = data.get("events", [])
        if session_logger and events:
            session_logger.write_check_events(events)
        return {"ok": True, "count": len(events)}
    except Exception as e:
        return {"ok": False, "error": str(e)}

@app.post("/api/logs/close")
def close_log():
    """Close current log and start a new one"""
    global session_logger
    if session_logger:
        session_logger.close()
        session_logger = None
        
        # Create new session
        session_id = datetime.now().strftime("%Y%m%d_%H%M%S")
        session_dir = LOGS_DIR / session_id
        session_dir.mkdir(parents=True, exist_ok=True)
        session_logger = SessionLogger(session_dir)
        
        return {"ok": True, "message": f"Log closed and new session started: {session_id}", "session_id": session_id}
    else:
        return {"ok": False, "message": "No active log to close"}

@app.get("/api/logs/{session}/csv")
def download_csv(session: str):
    path = LOGS_DIR/session/"session.csv"
    return FileResponse(str(path), filename=f"{session}.csv")

# @app.get("/api/diag")
# def diag():
#     from mcc_bridge import HAVE_MCCULW, HAVE_ULDAQ
#     return {
#         "mcculw": HAVE_MCCULW,
#         "uldaq": HAVE_ULDAQ,
#         "board1608": app_cfg.board1608.model_dump(),
#         "boardetc": app_cfg.boardetc.model_dump(),
#     }

# ---------- WebSocket ----------
@app.websocket("/ws")
async def ws(ws: WebSocket):
    await ws.accept()
    ws_clients.append(ws)
    print(f"[WS] client connected; total={len(ws_clients)}")

    # If this is the first client, start acquisition
    global run_task
    if run_task is None or run_task.done():
        print("[WS] starting acquisition task")
        run_task = asyncio.create_task(acq_loop())

    try:
        while True:
            _ = await ws.receive_text()  # keepalive or client cmds in future
    except WebSocketDisconnect:
        print("[WS] disconnect")
    finally:
        if ws in ws_clients:
            ws_clients.remove(ws)
        if not ws_clients and run_task:
            print("[WS] no clients; stopping acquisition task")
            run_task.cancel()
            try:
                await run_task
            except asyncio.CancelledError:
                pass  # Expected — task was cancelled above
            except Exception as e:
                print(f"[WS] task exit: {e}")
            run_task = None

# app.mount("/", StaticFiles(directory=str(WEB_DIR), html=True), name="static")

if __name__ == "__main__":
    import uvicorn, os
    port = int(os.environ.get("PORT", "8000"))
    # Quieter defaults; allow overrides via env if needed
    uv_level = os.environ.get("UVICORN_LEVEL", "warning").lower()  # "info" or "warning"
    access = os.environ.get("UVICORN_ACCESS", "0") == "0"       # set to 1 to re-enable

    print(f"[MCC-Hub] Starting Uvicorn on http://127.0.0.1:{port}")
    uvicorn.run(app, host="0.0.0.0", port=port, log_level=uv_level, access_log=access)
