# server/server.py
# Python 3.10+

import asyncio, json, math, time, os, sys

# ----------------------------- crash dump hook ----------------------------
# Installed as the very FIRST thing so module-import-time crashes don't
# silently kill a frozen PyInstaller EXE. Without this, any exception that
# escapes the main script (including one raised by an `import x` line near
# the top of this file) causes the bootloader to close the console window
# without giving the user a chance to read the error message.
#
# The hook does three things:
#   1. Writes the traceback to mcc_startup.log next to the EXE.
#   2. Writes the traceback to sys.__stderr__ (the original stderr).
#   3. If running as a frozen EXE, calls input() so the console window
#      stays open until the user reads the error.
def _crash_excepthook(exc_type, exc_value, exc_tb):
    import traceback as _tb
    try:
        # Use original stderr in case anything has been redirected.
        target = sys.__stderr__ or sys.stderr
        if target is not None:
            target.write("\n========== MCC-Hub unhandled exception ==========\n")
            _tb.print_exception(exc_type, exc_value, exc_tb, file=target)
            target.write("=================================================\n")
            try: target.flush()
            except Exception: pass
    except Exception:
        pass
    try:
        with open("mcc_startup.log", "a", encoding="utf-8") as f:
            f.write("\n========== MCC-Hub unhandled exception ==========\n")
            _tb.print_exception(exc_type, exc_value, exc_tb, file=f)
            f.write("=================================================\n")
    except Exception:
        pass
    # Pause in frozen mode so the user can read the error.
    if getattr(sys, 'frozen', False):
        try:
            tgt = sys.__stdout__ or sys.stdout
            if tgt is not None:
                tgt.write("\n[ Crash — Press Enter to close (see mcc_startup.log) ]\n")
                tgt.flush()
            try:
                input()
            except EOFError:
                pass
        except Exception:
            pass

sys.excepthook = _crash_excepthook

# ------------------- Windows proactor noise suppression -------------------
# On Windows, asyncio Proactor transports raise
#     ConnectionResetError: [WinError 10054]
# inside _call_connection_lost whenever a peer (a browser tab) drops its
# TCP connection abruptly: page refresh, tab close, machine sleep. The
# connection is already dead and fully cleaned up; the exception fires in
# a loop callback where no application code can catch it, so asyncio
# prints a traceback to stderr. One per refresh, pure noise -- and since
# the console fd-capture mirrors stderr into the browser console widget,
# it pollutes that too. We wrap that ONE callback and swallow ONLY
# ConnectionResetError; every other exception still surfaces normally.
if sys.platform == "win32":
    try:
        from asyncio.proactor_events import _ProactorBasePipeTransport
        _orig_call_connection_lost = _ProactorBasePipeTransport._call_connection_lost

        def _quiet_call_connection_lost(self, exc):
            try:
                _orig_call_connection_lost(self, exc)
            except ConnectionResetError:
                pass   # peer already gone -- nothing to do, nothing to report

        _ProactorBasePipeTransport._call_connection_lost = _quiet_call_connection_lost
    except Exception:
        pass   # internals moved in some future Python -- noise returns, harmless


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
try:
    from vfd_driver import VFDManager
    _HAVE_VFD = True
except Exception as _vfd_err:
    VFDManager = None
    _HAVE_VFD = False
    print(f"[MCC-Hub] vfd_driver unavailable: {_vfd_err}")
from logic_elements import LEManager
from math_ops import MathOpManager, MathOpFile
from app_models import LEFile, LogicElementCfg
from expr_manager import ExpressionManager
from expr_engine import global_vars as expr_global_vars
import logging, os, math

# Version tracking - all in one place
__version__ = "2.11.7"
__updated__ = "2026-06-22"  # 2.11.7: session CSV header now uses friendly channel/expression names (EvapPress, MakeupHtr, FeedTemp, MakeupControl, ...) instead of ai0/ao0/do0/tc0/expr0 -- _collect_log_col_names() feeds SessionLogger(col_names=...). 2.11.6: POST /api/stepper/{name}/zero_position (drive widget Reset zeroes the step count). 2.11.5: stepper re-trigger safety in _apply_vfd_write -- a stepper STOP/disable now drops the cached VELOCITY so a re-run re-sends + re-fires the move instead of being deduped (a stepper velocity is a trigger, not a held register). Pairs with FeedwaterControl rewritten to velocity-as-level. 2.11.4: drive-write robustness -- _apply_vfd_write warns ONCE when an expression drive command isn't delivered (worker not running), and _clear_drive_write_cache('stepper') drops stale on-change history on stepper rebuild so a re-connected drive actually gets re-sent the commands that start it (fixes 'expression runs but stepper does nothing, no debug'). 2.11.3: manual stepper control endpoints POST /api/stepper/{name}/{enable,disable,velocity,stop,alarm_reset} for the unified drive widget -- queued via step_mgr.request_command (serialized on the worker thread, not the request thread). 2.11.2: /api/stepper/instances PUT now normalizes build() (name,ok,error) tuples to {name,ok,error} dicts, matching /api/vfd/instances, so the MOD Drv editor reads results uniformly. 2.11.1: FREEZE FIX -- broadcast() now scrubs NaN/Inf via clean_for_json + json.dumps(allow_nan=False). The tick frame's static_vars field (built post-scrub from the C++ backend, line ~1850) shipped raw NaN for any unfilled MVR static (superheatIn/deltaT/evapTsat init to NaN); default allow_nan=True emitted a bare `NaN` token -> browser JSON.parse rejected the whole frame -> charts froze. Same NaN reached the static-var PUT endpoint as np.float64(nan) in old_value -> 500. Both return sites now clean_for_json'd. 2.11.0: PWM-mode DOs -- pwm_step() each tick; expression DO writes route by mcc.is_pwm (set_pwm_duty as 0..1 duty) else threshold (val>=1.0). 2.10.0: stepper REST endpoints (/api/stepper/{drives,configs,instances,status}) for the MOD Drv editor (stepper library + units, mirrors /api/vfd/*). 2.9.0: STEP: stepper-drive support wired (approach B; reuses vfd_in[]/vfd_out[] with a manager='stepper' tag, NO DLL signature change). StepperManager built/polled alongside vfd_mgr; _vfd_in_vals/_apply_vfd_write route by manager; signal_state + tick frame carry a "stepper" snapshot. 2.8.35: VFD watch/poll list is now refreshed on expression recompile (previously only at boot + VFD-instance save), so a VFD param or #register read newly added to an expression starts polling immediately instead of silently reading 0 until restart. 2.8.34: VFD status-prop ".TORQUE" (also .TQ/.NM) added -- maps to snapshot output_torque (GK3000 0x5006); use the dot-prop form "VFD:Name".TORQUE like .VOLTAGE/.CURRENT/.POWER (the b0.nn keypad form is NOT a 0xF0xx param and does not translate). 2.8.33: startup VFD comms check + idempotent init -- build(do_setup=False) then vfd_mgr.check_drives() probes each drive (identify/verify Modbus reply) and re-applies documented setup params via read-before-write (no EEPROM hammer); GET /api/vfd/health exposes per-drive status for a UI popup; discover_vfd_params no longer lists command tokens (ENABLE/DIR/...) as watch params. 2.8.32: semantic VFD command write-targets in expressions -- "VFD:Name.ENABLE"=1/0, ".RPM"=rpm, ".HZ"=hz, ".DIR"=0/1 (also DIRECTION/REVERSE/STOP/FAULT_RESET) route via vfd_mgr.request_command() -> worker -> controller.enable/disable/set_rpm/set_frequency/set_direction (same logic as the REST buttons), on-change. Raw #regs/params still go to request_write. Both C++ and Python eval paths share _apply_vfd_write(). No DLL-signature change (reuses vfd_out[]); recompile to emit the new command metadata. 2.8.31: VFD comm-speed change -- POST /api/vfd/{name}/baud calls vfd_mgr.change_baud() (stops worker, finds current baud by scan if needed, writes the baud param at the current speed, reopens the PC port at the target, verifies, reverts on failure) and persists baud into vfd_instances.json. Python fallback path now also drains expr_mgr.last_vfd_writes -> request_write (matches the C++ branch). 2.8.30: expression-driven VFD reads/writes wired (approach B) -- vfd_in[] filled from snapshot per cpp_backend.vfd_read_refs and passed to evaluate(); cpp_results['vfd_writes'] drained to vfd_mgr.request_write() on-change (raw #regs skip read-back verify); set_watch_all(discover_vfd_params(expressions.json)) after start_workers at boot + instance rebuild so param/#addr reads get polled. Requires the 18-arg DLL (delete stale compiled/expressions.dll). 2.8.29: VFD serial moved entirely onto per-drive worker threads -- start_workers() is called after build and after instance rebuild; the acquisition loop and the /api/vfd/status endpoint now read snapshot_all() (in-memory, no serial) instead of status_all(), so RS-485 latency no longer stalls the 50 Hz acq/control loop (fixes the periodic stutter that tracked the dongle TX/RX LEDs). REST command endpoints still call the controller directly -- safe because every transaction is serialized by VFDController._io_lock. stop_workers() on shutdown. 2.8.28: VFD support -- new vfd_driver.VFDManager loads three JSON libraries (vfd_drives.json protocol+serial per drive model, vfd_motors.json nameplates, vfd_instances.json binding drive+motor+port) and builds a controller per included instance. REST: GET/PUT /api/vfd/{drives,motors,instances} (+rebuild on instance save), GET /api/vfd/status, POST /api/vfd/{name}/{enable,disable,rpm,direction,fault_reset}. 2.8.27: checklist host arbitration -- one browser can host its checklist for all others (claim/respond/cancel/release endpoints + WS cl_host messages). Live hosts are asked to relinquish (30s expiry denies); disconnected hosts are replaced instantly and hosting auto-releases when the host browser drops. WS hello now carries a per-connection client_id. 2.8.26: silenced the benign Windows-only ConnectionResetError [WinError 10054] tracebacks that the asyncio Proactor transport prints whenever a browser drops its connection (refresh/close/sleep). Only that specific error in that one cleanup callback is swallowed; all other exceptions surface as before. 2.8.25: optional HTTPS — if CFG_DIR/ssl/cert.pem + key.pem exist (e.g. generated with mkcert), uvicorn serves TLS automatically; removes the browser "Not secure" warning and makes remote origins proper secure contexts. 2.8.24: layout endpoints hardened + instrumented — PUT mkdirs the config dir, writes atomically, and returns {ok:false,error} instead of a bare 500; both GET and PUT print one console line per request so a broken remote layout-sync is diagnosable from the server window. 2.8.23: WS clients now receive a {type:hello} message with hardware status on every (re)connect, so button colorization no longer depends on a single boot-time /api/diag fetch that could fail transiently and stick a client in the un-connected look forever. 2.8.22: check events now relay over the WebSocket to ALL clients (type=check_event) -- checklist on one computer marks charts on every computer. New /api/check_events/uncheck removes the event from the logger accumulator and relays the removal. 2.8.21: launch bundle now includes names + charted lists alongside scales (single _viewer_scales.json). 2.8.20: /api/log_viewer/launch now accepts a "scales" map from the browser ({csvCol:{scale,offset,label}}), writes it to LOGS_DIR/_viewer_scales.json, and passes --scales to the viewer so it can render data with the in-app charts' display scale/offset. 2.8.19: POST /api/log_viewer/launch spawns the standalone log_viewer.py app (huge-file chart viewer). New chk.json merge tool: GET /api/chk_merge/candidates lists sessions with chk.json + their embed status; POST /api/chk_merge/{session} streams the events into the CSV's chk_events column with sanity checks (identical = no-op, different = requires force, event times outside CSV range = requires force, active session = refused). Merge is a streaming copy + atomic os.replace, so memory stays flat on multi-GB files.
import csv  # used by the chk-merge helpers below
SERVER_VERSION = __version__  # Versioned DLL files for hot-reload during critical tests!

# ============================ console capture =============================
# A bounded in-memory buffer of recent stdout/stderr lines, populated by a
# pair of background reader threads that drain the OS file descriptors 1
# and 2 (after we redirect them onto internal pipes — see
# _install_console_fd_capture below). The browser's console widget reads
# the buffer via /api/console/snapshot and the live WS stream.
#
# fd-level capture (vs a Python sys.stdout wrapper) is important because
# it catches output from EVERYTHING that writes to those file descriptors:
# Python print(), uvicorn logging, AND C-runtime printf() — the latter is
# how the compiled expression DLL emits its print() output.
#
# Lines are stored as (seq, stream_label, text) tuples; `seq` is a
# monotonic counter so clients can request "everything after sequence N"
# on reconnect. The buffer is capped at CONSOLE_BUF_MAX entries; older
# lines are evicted.
import threading
from collections import deque

CONSOLE_BUF_MAX = 1000      # ~last 1000 lines retained — plenty for casual scrollback
_console_buf: "deque[tuple]" = deque(maxlen=CONSOLE_BUF_MAX)
_console_seq: int = 0
_console_lock = threading.Lock()
# Highest sequence already broadcast to clients. The acq loop only sends
# lines with seq > this counter, so re-sending is avoided.
_console_last_bcast_seq: int = 0

def _console_append(label: str, line: str):
    """Thread-safe push of a single line into the buffer. Used by the
    background reader threads that drain the OS pipes."""
    global _console_seq
    with _console_lock:
        _console_seq += 1
        _console_buf.append((_console_seq, label, line))

# ----- OS-fd-level capture ------------------------------------------------
# A simple Python tee on sys.stdout/sys.stderr would miss anything that
# writes directly to file descriptors 1 and 2 — most importantly, printf()
# calls from the compiled C++ expression DLL. We capture at the fd level
# instead by dup2-ing pipes onto fd 1 and 2, then running a background
# reader thread that:
#   1) appends each complete line to _console_buf, and
#   2) writes everything back out to the ORIGINAL saved fds so the user's
#      terminal/PyCharm output is unchanged.
#
# This catches: Python print(), uvicorn logging, C runtime printf() from
# the DLL, any subprocess child output inherited on these fds, etc.
#
# Caveats:
#   * Buffering: applications expect line buffering on a terminal but
#     block buffering on a pipe. We force flushing on the Python side and
#     accept that C runtime prints may pool until the C side flushes. The
#     expr_print.cpp_printf_call() helper already appends fflush(stdout)
#     to keep expression prints prompt.
#   * Windows: os.pipe() and os.dup2() work for fds 1/2. The pipe ends
#     are inheritable by default on POSIX but not on Windows; the
#     duplicated fds 1/2 are visible to C extensions either way.

def _install_console_fd_capture():
    """Redirect OS fd 1 (stdout) and fd 2 (stderr) into background reader
    threads, while preserving the original output so the terminal still
    sees everything.

    On Windows, the existing sys.stdout / sys.stderr are TextIOWrappers
    that use WriteConsoleW on the underlying console handle. If we just
    swap fd 1 to a pipe and leave the wrapper alone, the wrapper will
    keep calling WriteConsoleW on what's now a pipe fd, raising
    "OSError: [WinError 1] Incorrect function". So we must replace the
    wrappers themselves with fresh ones built for a pipe.

    The safe order to do this (cribbed from the well-known gist
    https://gist.github.com/natedileas/8eb31dc03b76183c0211cdde57791005):
      1. Duplicate fd 1 / fd 2 to save the originals (terminal handles).
      2. Flush + close the current sys.stdout / sys.stderr — this closes
         BOTH the wrapper and its underlying fd, freeing fd 1 / fd 2.
      3. Create pipes; dup2 the pipe write-ends onto the freed fd 1/2.
      4. Build fresh TextIOWrapper objects around the new fd 1/2 and
         assign them to sys.stdout / sys.stderr.
      5. Spawn reader threads on the pipe read-ends; they echo back to
         the saved originals so the terminal display is unchanged.

    On any failure the function raises and the caller treats capture as
    optional — the server still runs without it.
    """
    import io

    # ---- 1. Save originals so we can still write to the actual terminal.
    saved_out = os.dup(1)
    try:
        saved_err = os.dup(2)
    except OSError:
        os.close(saved_out)
        raise

    # ---- 2. Flush + close current sys.stdout / sys.stderr.
    # The .close() closes the underlying fd too (releasing fd 1 / 2 for
    # reuse by step 3). This is the critical step — without it, the old
    # wrapper keeps referencing a (now-pipe) fd and tries to use console
    # APIs on it, raising "Incorrect function" on the next print.
    for stream_name in ('stdout', 'stderr'):
        s = getattr(sys, stream_name, None)
        if s is None:
            continue
        try: s.flush()
        except Exception: pass
        try: s.close()
        except Exception: pass

    # ---- 3. Create pipes; redirect fd 1 / fd 2 to the pipe write-ends.
    r_out, w_out = os.pipe()
    r_err, w_err = os.pipe()
    # After close() above, fd 1 / 2 are free. dup2 puts the pipe write-end
    # there. (dup2 also closes the destination fd if it's still open, so
    # this is robust even if some weird code path skipped the close.)
    os.dup2(w_out, 1)
    os.dup2(w_err, 2)
    os.close(w_out)
    os.close(w_err)

    # ---- 4. Build fresh sys.stdout / sys.stderr around the new fds.
    # closefd=False means the wrapper does NOT own fd 1 / fd 2; closing
    # the wrapper won't close the pipe. We want the reader thread to
    # control pipe lifetime, not the wrappers.
    try:
        sys.stdout = io.TextIOWrapper(
            io.BufferedWriter(io.FileIO(1, mode='w', closefd=False)),
            encoding='utf-8', errors='replace',
            line_buffering=True, write_through=True,
        )
    except Exception:
        # If we can't build a new wrapper, leave sys.stdout as None and
        # hope nothing tries to use it. Better than leaving the broken
        # old wrapper in place.
        sys.stdout = None
    try:
        sys.stderr = io.TextIOWrapper(
            io.BufferedWriter(io.FileIO(2, mode='w', closefd=False)),
            encoding='utf-8', errors='replace',
            line_buffering=True, write_through=True,
        )
    except Exception:
        sys.stderr = None

    def _reader(read_fd, label, saved_fd):
        """Background thread: read from the pipe, echo to the saved
        terminal fd, append each line to the buffer."""
        # Use os.fdopen so we get a proper Python file object that
        # handles encoding and line splitting for us.
        try:
            f = os.fdopen(read_fd, 'r', buffering=1, encoding='utf-8', errors='replace')
        except Exception:
            return
        partial = ''
        while True:
            try:
                # readline() blocks until a newline or EOF. EOF (empty
                # string) means the write end was closed (shutdown).
                chunk = f.readline()
                if not chunk:
                    break
                # Echo to the original terminal so the user's normal
                # output stream is preserved.
                try:
                    os.write(saved_fd, chunk.encode('utf-8', errors='replace'))
                except Exception:
                    pass
                # Split into complete lines. readline() returns one line
                # at a time including the trailing \n, but we may also
                # get a partial last line on EOF — handle that.
                text = partial + chunk
                if text.endswith('\n'):
                    lines = text[:-1].split('\n')
                    partial = ''
                else:
                    *lines, partial = text.split('\n')
                for line in lines:
                    _console_append(label, line)
            except Exception:
                # Never let a capture error kill the thread. If something
                # really pathological happens, the loop continues; worst
                # case we lose one line.
                continue

    threading.Thread(target=_reader, args=(r_out, 'stdout', saved_out),
                     daemon=True, name='console-stdout-reader').start()
    threading.Thread(target=_reader, args=(r_err, 'stderr', saved_err),
                     daemon=True, name='console-stderr-reader').start()
    return (saved_out, saved_err)

# Install the capture immediately, before any other module imports — we
# want every print and every printf, from startup onward, to be visible.
# Capture is a nice-to-have, not a requirement: if anything goes wrong
# (PyInstaller frozen mode quirks, restricted fd environment, etc.) we
# print the failure to whatever stderr we still have and continue without
# capture. The server itself runs fine; the console widget just won't
# show any output.
_CONSOLE_CAPTURE_OK = False
try:
    _install_console_fd_capture()
    _CONSOLE_CAPTURE_OK = True
    print(f"[MCC-Hub] Console fd-capture installed; buffer={CONSOLE_BUF_MAX} lines. (Includes DLL printf output.)")
except Exception as _cap_err:
    # Use sys.__stderr__ which is the *original* stderr — survives even
    # if sys.stderr has been mucked with above.
    try:
        (sys.__stderr__ or sys.stderr).write(
            f"[MCC-Hub] WARNING: console fd-capture failed ({_cap_err!r}); "
            f"server will run without console widget data.\n"
        )
    except Exception:
        pass

def _console_snapshot(since_seq: int = 0, limit: int = CONSOLE_BUF_MAX):
    """Return up to `limit` console lines with sequence > since_seq.
    Returns a list of (seq, stream_label, text) tuples in chronological
    order. Thread-safe.
    """
    with _console_lock:
        # The deque is in insertion order; just filter and copy.
        out = [t for t in _console_buf if t[0] > since_seq]
    return out[-limit:] if len(out) > limit else out

# ============================ end console capture =========================

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

def clean_for_json(obj):
    """
    Recursively scrub NaN / Inf out of a value tree so it can be passed to
    json.dumps (which rejects them by default and would otherwise crash the
    HTTP response). NaN and Inf become None (→ JSON null on the wire).

    Handles:
      - Python float (NaN/Inf → None)
      - numpy scalars (numpy.float64 etc. — these are float subclasses, so
        the isinstance(float) check covers them)
      - dict / list / tuple (recursed)
      - everything else passed through unchanged

    This used to be a nested function inside the WS telemetry loop. It now
    lives at module scope so REST endpoints that return expression-derived
    values (locals, static vars, syntax-check results) can use it too — any
    one of those can produce NaN if a user expression does 0/0 etc.
    """
    if isinstance(obj, float):
        return None if not math.isfinite(obj) else obj
    if isinstance(obj, list):
        return [clean_for_json(item) for item in obj]
    if isinstance(obj, tuple):
        return [clean_for_json(item) for item in obj]
    if isinstance(obj, dict):
        return {k: clean_for_json(v) for k, v in obj.items()}
    return obj


app = FastAPI()

@app.middleware("http")
async def _no_cache(request, call_next):
    resp = await call_next(request)
    # disable caching for our UI assets and APIs
    if request.url.path in (
        "/", "/index.html", "/app.js", "/styles.css", "/popout.html",
        "/checklist_widget.js", "/checklist_editor.js",
    ) or request.url.path.startswith("/api/"):
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

@app.get("/api/console/snapshot")
def get_console_snapshot(since: int = 0, limit: int = CONSOLE_BUF_MAX):
    """Return buffered stdout/stderr lines for the console widget.

    Newly-mounted console widgets call this to populate themselves with
    history; the WS push only delivers lines that arrive AFTER mount.
    """
    snap = _console_snapshot(since_seq=since, limit=limit)
    return {
        "lines": snap,                # [[seq, stream_label, text], ...]
        "latest": _console_seq,       # so client knows where to resume
    }

@app.post("/api/console/test")
def post_console_test():
    """Force a few diagnostic prints so the console widget can verify the
    live WS stream is delivering. Hit by the widget's "Test" button.

    We print to BOTH stdout and stderr so the user can see the red stderr
    styling at the same time as the regular stdout color.
    """
    import datetime as _dt
    ts = _dt.datetime.now().strftime("%H:%M:%S.%f")[:-3]
    print(f"[CONSOLE-TEST] stdout ping @ {ts}")
    print(f"[CONSOLE-TEST] stderr ping @ {ts}", file=sys.stderr)
    return {"ok": True, "ts": ts}

@app.get("/api/layout")
def get_layout():
    """Serve the shared layout. Prints a console line per request so the
    layout-sync chain is diagnosable from the server window: if a remote
    machine's auto-load isn't working, this line tells you whether the
    request arrived and what was served."""
    try:
        if LAYOUT_PATH.exists():
            obj = json.loads(LAYOUT_PATH.read_text(encoding="utf-8"))
            n = len(obj.get("pages", []) or [])
            print(f"[MCC-Hub] GET /api/layout -> {n} page(s) from {LAYOUT_PATH}")
            return obj
        print(f"[MCC-Hub] GET /api/layout -> NO FILE at {LAYOUT_PATH}")
    except Exception as e:
        print(f"[MCC-Hub] GET /api/layout FAILED: {e}")
    return {"version": "v1", "pages": []}

@app.put("/api/layout")
def put_layout(body: dict):
    """Store the shared layout. Hardened: ensures the config directory
    exists (a frozen-EXE install can be missing it), writes atomically
    (temp file + os.replace, so a crash mid-write can't truncate the
    layout), and reports failure as JSON instead of an opaque 500."""
    try:
        LAYOUT_PATH.parent.mkdir(parents=True, exist_ok=True)
        tmp = LAYOUT_PATH.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(body, indent=2), encoding="utf-8")
        os.replace(tmp, LAYOUT_PATH)
        n = len(body.get("pages", []) or [])
        print(f"[MCC-Hub] PUT /api/layout -> wrote {n} page(s) to {LAYOUT_PATH}")
        return {"ok": True, "pages": n, "path": str(LAYOUT_PATH)}
    except Exception as e:
        print(f"[MCC-Hub] PUT /api/layout FAILED: {e}")
        return {"ok": False, "error": str(e)}


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

@app.get("/popout.html", response_class=HTMLResponse)
def _popout_html():
    """
    The popout window template. Renders a single widget chromeless and
    full-bleed, using ?popout=<id> to identify which widget belongs to it.
    See app.js POPOUT_ID detection for the rest of the flow.
    """
    return (WEB_DIR / "popout.html").read_text(encoding="utf-8")

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
CFG_PATH    = CFG_DIR/"config.json"
PID_PATH    = CFG_DIR/"pid.json"
SCRIPT_PATH = CFG_DIR/"script.json"
SCALES_PATH = CFG_DIR/"scales.json"
VFD_DRIVES_PATH    = CFG_DIR / "vfd_drives.json"
VFD_MOTORS_PATH    = CFG_DIR / "vfd_motors.json"
VFD_INSTANCES_PATH = CFG_DIR / "vfd_instances.json"

# VFD manager (config-driven; loads the three JSON libraries and builds a
# controller per included instance). Built lazily after the app starts.
vfd_mgr = None
if _HAVE_VFD:
    try:
        vfd_mgr = VFDManager(CFG_DIR)
        vfd_mgr.load_files()
        vfd_mgr.build(connect=True, do_setup=False)
        print(f"[MCC-Hub] VFD instances built: {len(vfd_mgr.controllers)}")
        # Verify Modbus comms (identify each drive) + idempotently initialize its
        # documented setup params (read-before-write -> EEPROM only written when a
        # value actually differs). Runs before the workers start.
        try:
            for _h in vfd_mgr.check_drives(do_setup=True):
                if _h.get("comms_ok"):
                    print(f"[MCC-Hub] VFD '{_h['name']}' OK on {_h.get('port')} ({_h.get('drive')})")
                else:
                    print(f"[MCC-Hub] *** VFD '{_h['name']}' COMMS FAILED: {_h.get('error')}")
        except Exception as _e:
            print(f"[MCC-Hub] VFD comms check failed: {_e}")
        # Serial I/O now runs ONLY on per-drive worker threads. The acq loop
        # reads snapshot_all() (in-memory) and never touches the RS-485 port,
        # so serial latency cannot stall the 50 Hz acquisition/control loop.
        vfd_mgr.start_workers()
        print(f"[MCC-Hub] VFD workers started: {len(getattr(vfd_mgr, 'workers', {}))}")
        try:
            import json as _json
            from vfd_driver import discover_vfd_params
            _exprs = _json.load(open(str(CFG_DIR / "expressions.json"))).get("expressions", [])
            vfd_mgr.set_watch_all(discover_vfd_params(_exprs))
            print(f"[MCC-Hub] VFD watch list set for {len(_exprs)} expressions")
        except Exception as _e:
            print(f"[MCC-Hub] VFD watch-list setup failed: {_e}")
    except Exception as _e:
        print(f"[MCC-Hub] VFD manager init failed: {_e}")

# Stepper-drive manager (Modbus PR-mode; e.g. DM556RS feedwater pump). Mirrors
# vfd_mgr: config-driven, one controller + worker per included instance.
step_mgr = None
try:
    from stepper_driver import StepperManager
    step_mgr = StepperManager(CFG_DIR)
    step_mgr.load_files()
    step_mgr.build(connect=True, do_setup=True)
    step_mgr.start_workers()
    print(f"[MCC-Hub] Stepper instances built: {len(step_mgr.controllers)}; "
          f"workers: {len(getattr(step_mgr, 'workers', {}))}")
except Exception as _e:
    print(f"[MCC-Hub] Stepper manager init failed: {_e}")

# VFD status is polled on a slower cadence than the acq loop (serial is slow);
# the most recent decoded status per instance is cached here and folded into
# both the tick frame (for the widget) and the expression signal_state.
_vfd_status_cache = {}
_step_status_cache = {}   # latest stepper snapshot per instance (for STEP: reads)

# Stepper status props -> live snapshot keys (parallels _VFD_PROP_KEY)
_STEP_PROP_KEY = {'VEL':'velocity','RPM':'velocity','SPEED':'velocity','POS':'position',
 'POSITION':'position','RUNNING':'running','ENABLED':'enabled','COMPLETE':'cmd_complete',
 'DONE':'cmd_complete','PATHCOMPLETE':'path_complete','HOMED':'homing_complete',
 'ALARM':'alarm','FAULT':'alarm','FAULTCODE':'alarm','WRITEFAULT':'__wf__'}

# --- VFD expression read mapping (approach B): status props -> live snapshot keys ---
_VFD_PROP_KEY = {'RPM':'rpm','HZ':'output_hz','FREQ':'output_hz','CURRENT':'output_current_a',
 'AMPS':'output_current_a','I':'output_current_a','VOLTAGE':'output_voltage_v','V':'output_voltage_v',
 'BUS':'bus_voltage_v','BUSV':'bus_voltage_v','DC':'bus_voltage_v','POWER':'output_power_w','W':'output_power_w',
 'TEMP':'drive_temp_c','TEMPERATURE':'drive_temp_c','ENABLED':'enabled','RUNNING':'enabled',
 'TORQUE':'output_torque','TQ':'output_torque','NM':'output_torque',
 'REVERSE':'__rev__','REV':'__rev__','FAULT':'faulted','FAULTCODE':'fault_code','WRITEFAULT':'__wf__'}
_last_vfd_write = {}   # (manager, drive, token) -> last value sent (on-change gating)
_drive_write_warned = {}   # same key -> True once we've warned a command went nowhere

def _clear_drive_write_cache(manager=None):
    """Drop on-change history so the next expression write is RE-SENT to the
    drive. Called when a manager (re)builds its workers: the controllers are
    fresh (drive may have been power-cycled / re-homed) but _last_vfd_write
    still thinks the old values are in effect, which would suppress the
    commands that actually start the drive. manager=None clears everything."""
    for k in [k for k in _last_vfd_write if manager is None or k[0] == manager]:
        _last_vfd_write.pop(k, None)
        _drive_write_warned.pop(k, None)
def _vfd_in_vals(backend, cache, step_cache=None):
    """Build vfd_in[] (ordered per backend.vfd_read_refs) from the in-memory snapshots.
    Refs tagged manager='stepper' resolve from the stepper snapshot; others are VFD."""
    out = []
    for r in (getattr(backend, 'vfd_read_refs', None) or []):
        if r.get('manager') == 'stepper':
            snap = (step_cache or {}).get(r['drive'], {}) or {}
            if r['kind'] == 'status':
                key = _STEP_PROP_KEY.get(str(r['token']).upper())
                if key == '__wf__':  v = 1.0 if snap.get('write_fault') else 0.0
                elif key is None:    v = 0.0
                else:
                    raw = snap.get(key)
                    v = (1.0 if raw else 0.0) if isinstance(raw, bool) else (float(raw) if raw is not None else 0.0)
            else:
                raw = snap.get(r['token'])
                try: v = float(raw) if raw is not None else 0.0
                except (TypeError, ValueError): v = 0.0
            out.append(v)
            continue
        snap = (cache or {}).get(r['drive'], {}) or {}
        if r['kind'] == 'status':
            key = _VFD_PROP_KEY.get(str(r['token']).upper())
            if key == '__rev__':   v = 1.0 if snap.get('direction') == 'reverse' else 0.0
            elif key == '__wf__':  v = 1.0 if snap.get('write_fault') else 0.0
            elif key is None:      v = 0.0
            else:
                raw = snap.get(key)
                v = (1.0 if raw else 0.0) if isinstance(raw, bool) else (float(raw) if raw is not None else 0.0)
        else:
            raw = snap.get(r['token'])
            try: v = float(raw) if raw is not None else 0.0
            except (TypeError, ValueError): v = 0.0
        out.append(v)
    return out

def _apply_vfd_write(w):
    """Route one expression drive write to the right manager's worker, on-change.
    manager='stepper' -> step_mgr; else vfd_mgr. kind=='cmd' -> request_command;
    else request_write (param/#reg)."""
    mgr = step_mgr if w.get('manager') == 'stepper' else vfd_mgr
    if mgr is None:
        return
    k = (w.get('manager', 'vfd'), w.get('drive'), w.get('token'))
    if _last_vfd_write.get(k) == w.get('value'):
        return
    if w.get('kind') == 'cmd':
        ok = mgr.request_command(w['drive'], w.get('cmd') or w['token'], w['value'])
    else:
        vfy = False if str(w.get('token','')).startswith('#') else None
        ok = mgr.request_write(w['drive'], w['token'], w['value'], verify=vfy)
    if ok:
        _last_vfd_write[k] = w['value']
        _drive_write_warned.pop(k, None)
        # Stepper re-trigger safety: a stepper VELOCITY is a TRIGGER (re-runs the
        # PR move), not a held register like a VFD speed. When the drive is
        # stopped -- STOP, or ENABLE=0 (disable) -- drop the cached VELOCITY so
        # the next velocity command (even an identical rpm) is re-sent and
        # re-fires the move instead of being deduped away. ENABLE is written as
        # a level every tick, so this fires reliably on each stop.
        if w.get('manager') == 'stepper':
            _tok = str(w.get('token', '')).upper()
            if _tok == 'STOP' or (_tok == 'ENABLE' and float(w.get('value') or 0) < 1.0):
                _last_vfd_write.pop(('stepper', w.get('drive'), 'VELOCITY'), None)
    elif k not in _drive_write_warned:
        # Command went nowhere -- almost always the drive's worker isn't running
        # (instance not included, or it failed to connect at startup). Warn ONCE
        # per drive.token so an expression silently failing to move the drive is
        # visible instead of a mystery. Clears + re-warns if it recurs after a
        # successful send.
        _drive_write_warned[k] = True
        print(f"[DRIVE] {k[0]}:{k[1]}.{k[2]} = {w.get('value')} NOT delivered "
              f"-- is '{k[1]}' included + connected? (check startup connect line)",
              flush=True)
_vfd_poll_every = 10          # poll once per this many acq ticks
_vfd_poll_ctr = 0

if not CFG_PATH.exists():
    CFG_DIR.mkdir(parents=True, exist_ok=True)
    CFG_PATH.write_text(json.dumps(default_config(), indent=2))
if not PID_PATH.exists():
    PID_PATH.write_text(json.dumps({"loops": []}, indent=2))
if not SCRIPT_PATH.exists():
    SCRIPT_PATH.write_text(json.dumps({"events": []}, indent=2))
if not SCALES_PATH.exists():
    SCALES_PATH.write_text(json.dumps({"scales": []}, indent=2))

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

# ---------- Serial Scale Manager ----------
import threading, re

class SerialScaleManager:
    """
    Reads weight values from serial scales via COM port (real or virtual,
    e.g. Moxa NPort in Real COM mode).  Each scale runs a background thread
    that opens the COM port with pyserial and parses ASCII weight lines.

    Supported formats:
        "   1234.5 g"           → 1234.5
        "ST,GS,+001234.5g"      → 1234.5  (Ruishan RD5002 stable/gross)
        "US,GS,+001234.5g"      → 1234.5  (unstable)
        "+001234.5"             → 1234.5
    """

    def __init__(self):
        self._scales: list[dict] = []
        self._values: list[float] = []
        self._threads: list[threading.Thread] = []
        self._stop_events: list[threading.Event] = []

    def load(self, path: Path):
        data = json.loads(path.read_text()) if path.exists() else {}
        self._scales = data.get("scales", [])
        self._restart_all()

    def save(self, path: Path):
        path.write_text(json.dumps({"scales": self._scales}, indent=2))

    def get_config(self) -> dict:
        return {"scales": self._scales}

    def set_config(self, data: dict, path: Path):
        self._scales = data.get("scales", [])
        self._restart_all()
        self.save(path)

    def get_values(self) -> list[float]:
        """Return offset-applied (tared) scale values for telemetry consumers.
        offset semantics: displayed = raw + offset (so a tare to target T from
        raw R produces offset = T - R; future raw X displays as X + offset)."""
        out = []
        for i, raw in enumerate(self._values):
            cfg = self._scales[i] if i < len(self._scales) else {}
            try:
                off = float(cfg.get("offset", 0.0))
            except (TypeError, ValueError):
                off = 0.0
            out.append(raw + off)
        return out

    def get_raw_values(self) -> list[float]:
        """Return un-tared raw values (used by the tare endpoint to compute
        new offsets without feedback)."""
        return list(self._values)

    def set_offsets(self, offsets: dict[int, float], path: Path):
        """Update offset on selected scale indices and persist scales.json.
        Does not restart reader threads (offset is applied at read-out, not
        in the serial reader itself)."""
        for idx, val in offsets.items():
            if 0 <= idx < len(self._scales):
                self._scales[idx]["offset"] = float(val)
        self.save(path)

    def _restart_all(self):
        for ev in self._stop_events:
            ev.set()
        for t in self._threads:
            t.join(timeout=2)
        self._threads = []
        self._stop_events = []
        self._values = [0.0] * len(self._scales)
        for i, cfg in enumerate(self._scales):
            ev = threading.Event()
            self._stop_events.append(ev)
            t = threading.Thread(target=self._reader, args=(i, cfg, ev), daemon=True)
            self._threads.append(t)
            if cfg.get("enabled", True):
                t.start()

    def _reader(self, idx: int, cfg: dict, stop: threading.Event):
        try:
            import serial
        except ImportError:
            print(f"[Scale{idx}] pyserial not installed — run: pip install pyserial")
            return

        port     = cfg.get("port", "COM1")
        baud     = int(cfg.get("baud", 9600))
        bytesize = int(cfg.get("bytesize", 8))
        parity   = cfg.get("parity", "N")
        stopbits = float(cfg.get("stopbits", 1))
        reconnect_delay = 3.0

        print(f"[Scale{idx}] Reader started: {port} {baud} {bytesize}{parity}{int(stopbits)}")
        while not stop.is_set():
            ser = None
            try:
                # Build Serial object without opening immediately so we can set
                # exclusive=False before open() — required for Moxa virtual COM ports
                # On Windows, use \\.\COMx device path to avoid Moxa driver quirks
                import sys as _sys
                port_path = port
                if _sys.platform == 'win32' and re.match(r'^COM\d+$', port, re.I):
                    port_path = f'\\\\.\\{port}'

                ser = serial.Serial()
                ser.port     = port_path
                ser.baudrate = baud
                ser.bytesize = bytesize
                ser.parity   = parity
                ser.stopbits = stopbits
                ser.timeout  = 1.0
                ser.rtscts   = False
                ser.dsrdtr   = False
                ser.xonxoff  = False
                ser.open()
                print(f"[Scale{idx}] Opened {port}")
                buf = ""
                while not stop.is_set():
                    # Read pattern: drain whatever's in the OS serial buffer
                    # immediately (no waiting), and only block on a 1-byte read
                    # when nothing is available. The previous ser.read(256) call
                    # would wait for either 256 bytes OR the 1-second timeout,
                    # and a 9 Hz scale at 9 bytes/line takes ~3 s to fill 256 b
                    # — so reads were timing out and lines were being processed
                    # in big bursts where intermediate values get overwritten in
                    # _values[idx] before the broadcast loop sees them. Hence
                    # the user-visible 2-3 Hz instead of the actual 9 Hz.
                    n_avail = ser.in_waiting
                    if n_avail > 0:
                        chunk = ser.read(n_avail).decode("ascii", errors="replace")
                    else:
                        chunk = ser.read(1).decode("ascii", errors="replace")
                    if not chunk:
                        continue
                    buf += chunk
                    while "\n" in buf or "\r" in buf:
                        line, buf = re.split(r"[\r\n]+", buf, maxsplit=1)
                        v = self._parse_line(line)
                        if v is not None:
                            self._values[idx] = v
            except Exception as e:
                print(f"[Scale{idx}] Error on {port}: {e}")
            finally:
                if ser and ser.is_open:
                    try: ser.close()
                    except: pass
            if not stop.is_set():
                stop.wait(reconnect_delay)
        print(f"[Scale{idx}] Reader stopped")

    @staticmethod
    def _parse_line(line: str) -> float | None:
        """Extract numeric weight value from a scale ASCII line."""
        # Strip Ruishan/Mettler-Toledo status prefix: "ST,GS," "US,NT," etc.
        line = re.sub(r'^[A-Z]{2},[A-Z]{2},', '', line.strip())
        m = re.search(r'[+-]?\d+\.?\d*', line)
        if m:
            try:
                return float(m.group())
            except ValueError:
                pass
        return None

scale_mgr = SerialScaleManager()
scale_mgr.load(SCALES_PATH)

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

    # Also check scales file — adding/removing/renaming a scale changes
    # scale_map and therefore the generated C++ "scale[i]" references.
    scales_mtime = SCALES_PATH.stat().st_mtime if SCALES_PATH.exists() else 0
    
    if expr_mtime > dll_mtime:
        log.info("[CPP-EXPR] expressions.json modified, will recompile")
        return True
    
    if pid_mtime > dll_mtime:
        log.info("[CPP-EXPR] pid.json modified, will recompile")
        return True

    if scales_mtime > dll_mtime:
        log.info("[CPP-EXPR] scales.json modified, will recompile")
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
                "compiled",
                scales_file=str(SCALES_PATH)
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
            return backend
        else:
            log.info("[CPP-EXPR] C++ backend not available, using Python")
            return None
            
    except Exception as e:
        log.warning(f"[CPP-EXPR] Could not load C++ backend: {e}")
        return None


def _collect_known_log_columns() -> list:
    """
    Harvest every gvar_/bvar_ column name the logger should know about
    BEFORE any frame arrives, so they're folded into the header at finalise
    time and the slow rewrite path never has to fire for them.

    Sources (whichever are populated at call time — works for both C++ and
    Python backends):
      * cpp_backend.staticvar_map   (compiled static var names)
      * cpp_backend.buttonvar_map   (button var names exposed to C++)
      * expr_global_vars.list_all() (Python evaluator's runtime statics)

    Returns:
        list of column names in stable, deduplicated order.
    """
    cols = []
    seen = set()

    def _add(prefix, names):
        for n in names:
            c = f"{prefix}{n}"
            if c not in seen:
                seen.add(c)
                cols.append(c)

    # From the C++ backend (most authoritative — generated by the codegen
    # from the actual expression source).
    try:
        if cpp_backend is not None:
            if hasattr(cpp_backend, 'staticvar_map'):
                _add("gvar_", cpp_backend.staticvar_map.keys())
            if hasattr(cpp_backend, 'buttonvar_map'):
                _add("bvar_", cpp_backend.buttonvar_map.keys())
    except Exception as e:
        log.debug(f"[LOG-COLS] cpp_backend harvest failed: {e}")

    # From the Python evaluator's runtime statics (covers any statics
    # discovered after a Python-path eval ran but before C++ caught up).
    try:
        py_globals = expr_global_vars.list_all() or {}
        _add("gvar_", py_globals.keys())
    except Exception as e:
        log.debug(f"[LOG-COLS] python globals harvest failed: {e}")

    return cols


def _collect_log_col_names() -> dict:
    """Friendly names for the ai/ao/do/tc/expr CSV columns so the log header
    reads 'EvapPress','MakeupHtr','MakeupControl',... instead of ai0/do0/expr5.
    Best-effort: any source that errors just leaves those columns generic."""
    names = {}
    for key, getter in (("ai", get_all_analogs), ("ao", get_all_analog_outputs),
                        ("do", get_all_digital_outputs), ("tc", get_all_thermocouples)):
        try:
            names[key] = [getattr(c, "name", "") for c in getter(app_cfg)]
        except Exception:
            pass
    try:
        names["expr"] = [e.name for e in expr_mgr.expressions]
    except Exception:
        pass
    return names

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
    try:
        if vfd_mgr: vfd_mgr.stop_workers()
        if step_mgr: step_mgr.stop_workers()
    except Exception: pass
    motor_mgr.disconnect_all()
    print("[MCC-Hub] Motors disconnected")

async def broadcast(msg: dict):
    try:
        # Chokepoint NaN/Inf guard. Some frame fields (notably static_vars,
        # built from the C++ backend after per-field scrubbing) can still hold
        # a non-finite float -- an MVR static like superheatIn/deltaT/evapTsat
        # sits at NaN until an expression fills it. json.dumps defaults to
        # allow_nan=True, which emits a bare `NaN` token; that is invalid JSON,
        # so the browser's JSON.parse rejects the WHOLE frame and the charts
        # freeze. clean_for_json turns NaN/Inf into null, and allow_nan=False
        # makes any straggler raise here (logged + frame dropped) instead of
        # silently poisoning the wire.
        txt = json.dumps(clean_for_json(msg), separators=(",", ":"), allow_nan=False)
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
    global session_logger, _need_reconfig_filters, _vfd_poll_ctr, _vfd_status_cache, _step_status_cache

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
    # Pre-declare gvar_/bvar_ columns from the loaded expression engine so
    # they're in the header from the start — avoids per-variable CSV rewrite
    # warnings when the first frame containing those vars arrives.
    known_cols = _collect_known_log_columns()
    if known_cols:
        log.info(f"[Logger] Pre-declared {len(known_cols)} known columns at startup")
    session_logger = SessionLogger(session_dir, known_columns=known_cols,
                                   col_names=_collect_log_col_names())
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

            # --- Counter-sourced AI channels (e.g. condensate flow on CTR0) ---
            # Overwrite their slot with a computed rate (eng units/min) from the HW counter.
            try:
                mcc.apply_counter_rates(ai_scaled, time.perf_counter())
            except Exception as e:
                print(f"[MCC-Hub] counter read failed: {e}")
            # Drive PWM-mode DOs (software PWM at the tick rate)
            try:
                mcc.pwm_step(time.perf_counter())
            except Exception:
                pass

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
                        button_vars=button_vars,  # CRITICAL: Pass buttonVars!
                        scale_vals=scale_mgr.get_values(),  # Serial scales for "Scale:Foo" refs
                        vfd_in_vals=_vfd_in_vals(cpp_backend, _vfd_status_cache, _step_status_cache)  # VFD + STEP reads (approach B)
                    )
                    
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
                            if mcc.is_pwm(ch):
                                mcc.set_pwm_duty(ch, val)   # val = 0..1 duty (raw)
                                do[ch] = val
                            elif cpp_backend._last_do_state.get(ch) != val:
                                st = 1.0 if val >= 1.0 else 0.0
                                do[ch] = st
                                mcc.set_do(ch, st >= 1.0, active_high=True)
                                cpp_backend._last_do_state[ch] = val
                        except Exception as e:
                            print(f"[CPP-DO] Failed to write DO{ch}={val}: {e}")
                    
                    for ch, val in cpp_results['ao_writes'].items():
                        try:
                            ao[ch] = val
                            mcc.set_ao(ch, val)
                        except Exception as e:
                            print(f"[CPP-AO] Failed to write AO{ch}={val}: {e}")

                    # VFD writes (approach B): commands vs registers, on-change
                    for w in cpp_results.get('vfd_writes', []) or []:
                        _apply_vfd_write(w)
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
                        "scales": scale_mgr.get_values(),  # Read-only serial scale values
                        "vfd": _vfd_status_cache,  # live VFD status for "VFD:Name".PROP reads
                        "stepper": _step_status_cache,  # live stepper status for "STEP:Name".PROP reads
                        "buttonVars": button_vars,
                        "ai_list": [{"name": ch.name} for ch in get_all_analogs(app_cfg)],
                        "ao_list": [{"name": ch.name} for ch in get_all_analog_outputs(app_cfg)],
                        "tc_list": [{"name": ch.name} for ch in get_all_thermocouples(app_cfg)],
                        "do_list": [{"name": ch.name} for ch in get_all_digital_outputs(app_cfg)],
                        "pid_list": [{"name": loop.name} for loop in pid_mgr.meta],
                        "math_list": [{"name": op.name} for op in math_mgr.operators],
                        "le_list": [{"name": elem.name} for elem in le_mgr.elements],
                        "expr_list": [{"name": expr.name} for expr in expr_mgr.expressions],
                        "scale_list": [{"name": sc.get("name", f"Scale{i}")}
                                       for i, sc in enumerate(scale_mgr._scales)]
                    }, bridge=mcc, sample_rate_hz=acq_rate_hz)
                    # VFD writes from the Python evaluator (fallback path)
                    for w in getattr(expr_mgr, "last_vfd_writes", []) or []:
                        _apply_vfd_write(w)
                
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
            # clean_for_json is defined at module scope (see top of file) so
            # the same NaN/Inf scrubbing applies to both this WS frame and
            # the REST endpoints that surface expression-derived values.
            # --- VFD status poll (slow cadence; serial is slow) ---
            if vfd_mgr and vfd_mgr.controllers:
                _vfd_poll_ctr += 1
                if _vfd_poll_ctr >= _vfd_poll_every:
                    _vfd_poll_ctr = 0
                    try:
                        _vfd_status_cache = vfd_mgr.snapshot_all()
                    except Exception as _ve:
                        log.debug("VFD poll failed: %s", _ve)

            # Stepper snapshot (in-memory, no serial -> safe every tick)
            if step_mgr and getattr(step_mgr, "controllers", None):
                try:
                    _step_status_cache = step_mgr.snapshot_all()
                except Exception:
                    pass

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
                "scales": clean_for_json(scale_mgr.get_values()),
                "vfd": clean_for_json(_vfd_status_cache),
                "stepper": clean_for_json(_step_status_cache),
                # Global/static variables from expression engine (static.name = ...)
                "global_vars": clean_for_json(expr_global_vars.list_all()),
                # buttonVars synchronized from the frontend
                "button_vars": clean_for_json(dict(button_vars)),
                # Static vars from C++ backend (for runtime editing)
                "static_vars": {}
            }
            
            # Populate static_vars from C++ backend
            if cpp_backend and hasattr(cpp_backend, 'staticvar_map') and hasattr(cpp_backend, 'static_vars'):
                _sv = cpp_backend.static_vars
                for name, index in cpp_backend.staticvar_map.items():
                    if 0 <= index < len(_sv):
                        frame['static_vars'][name] = float(_sv[index])

            ticks += 1
            log_ctr += 1
            bcast_ctr += 1

            # --- Logging: at full acq rate (or LOG_EVERY) ---
            if log_ctr >= LOG_EVERY and session_logger is not None:
                # Isolate the logger from the acq loop: hardware data
                # capture is more important than the CSV. If the logger
                # ever raises (transient file lock, disk full, etc.), log
                # the failure and keep acquiring rather than stopping.
                try:
                    session_logger.write(frame)
                except Exception as log_err:
                    print(f"[MCC-Hub] WARNING: session_logger.write() failed: {log_err}")
                    import traceback
                    traceback.print_exc()
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

                # Console: piggyback any new stdout/stderr lines onto the
                # broadcast tick. We track the last sequence we sent so
                # this stays cheap (one int compare) when there's nothing
                # new to ship.
                global _console_last_bcast_seq
                if _console_seq > _console_last_bcast_seq:
                    new_lines = _console_snapshot(since_seq=_console_last_bcast_seq)
                    if new_lines:
                        _console_last_bcast_seq = new_lines[-1][0]
                        await broadcast({
                            "type": "console",
                            "lines": new_lines,    # [[seq, label, text], ...]
                        })

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

    # Batch-register any newly-introduced gvar_/bvar_ columns with the
    # active logger so the next frame doesn't trigger N rewrites.
    try:
        if session_logger is not None:
            new_cols = _collect_known_log_columns()
            if new_cols:
                session_logger.add_columns(new_cols)
    except Exception as e:
        log.warning(f"[Logger] Could not register new columns after PID save: {e}")

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

        # Whether or not the C++ recompile ran, tell the active logger
        # about any gvar_/bvar_ columns introduced by the new expression
        # set. This converts what would otherwise be N back-to-back full
        # CSV rewrites (one per new variable, as frames arrive) into ONE
        # batched rewrite right now.
        try:
            if session_logger is not None:
                new_cols = _collect_known_log_columns()
                if new_cols:
                    session_logger.add_columns(new_cols)
        except Exception as e:
            log.warning(f"[Logger] Could not register new columns after recompile: {e}")

        # Refresh the VFD poll/watch list from the new expression set. Without
        # this, a VFD param or #register read newly added to an expression
        # (e.g. "VFD:VFD 1.P0.12") is not polled until the next server restart
        # or VFD-instance save, so it silently reads 0. Status props (.RPM etc.)
        # and raw addresses already polled are unaffected; this just adds any
        # newly-referenced tokens. Driven by expression TEXT, so it is correct
        # whether or not the C++ recompile above succeeded.
        try:
            if vfd_mgr is not None:
                import json as _json
                from vfd_driver import discover_vfd_params
                _exprs = _json.load(open(str(CFG_DIR / "expressions.json"))).get("expressions", [])
                vfd_mgr.set_watch_all(discover_vfd_params(_exprs))
                log.info("[VFD] watch list refreshed after recompile")
        except Exception as e:
            log.warning(f"[VFD] watch-list refresh after recompile failed: {e}")

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
        'scale_list': [{'name': sc.get('name', f'Scale{i}')}
                       for i, sc in enumerate(scale_mgr._scales)],
        'scales': [0.0] * len(scale_mgr._scales),
        'time': 0.0,
        'sample': 0
    }
    
    return clean_for_json(expr_mgr.check_syntax(expression, test_state))

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
        # Scrub NaN/Inf so the response is valid JSON even if a user
        # expression has stored a bad value into a static var.
        return {"globals": clean_for_json(static_dict)}
    else:
        # Return Python global vars
        log.info("[GLOBALS-API] Using Python global vars")
        return {"globals": clean_for_json(expr_global_vars.list_all())}

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
            # old_value comes straight off the numpy static array and is NaN
            # until an expression first writes it; clean_for_json -> null so
            # the JSON response can't 500 (allow_nan=False in Starlette).
            return clean_for_json({"ok": True, "old_value": old_value, "new_value": var_value})
    
    # Fall back to Python global vars
    if var_name in expr_global_vars._vars:
        old_value = expr_global_vars._vars[var_name]
        expr_global_vars._vars[var_name] = var_value
        log.info(f"[STATIC-VAR] Updated Python global {var_name} = {var_value} (was {old_value})")
        return clean_for_json({"ok": True, "old_value": old_value, "new_value": var_value, "backend": "python"})
    
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
        _sv = cpp_backend.static_vars
        for name, index in cpp_backend.staticvar_map.items():
            if 0 <= index < len(_sv):
                vars_dict[name] = float(_sv[index])
        # Scrub NaN/Inf — an expression that does 0/0 will silently store
        # NaN into a static var, and json.dumps would otherwise reject the
        # whole response.
        return {"ok": True, "vars": clean_for_json(vars_dict)}
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


# ---------- REST: VFD drives / motors / instances ----------
def _read_json_file(path, default):
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception as e:
            print(f"[MCC-Hub] {path.name} read failed: {e}")
    return default

def _write_json_file(path, body):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(body, indent=2), encoding="utf-8")
    os.replace(tmp, path)

# ---------- REST: stepper drives / configs / instances (MOD Drv) ----------
STEPPER_CONFIGS_PATH = CFG_DIR / "stepper_configs.json"
STEPPER_INSTANCES_PATH = CFG_DIR / "stepper_instances.json"

@app.get("/api/stepper/drives")
def get_stepper_drives():
    """Code-defined stepper drive profiles (e.g. DM556RS)."""
    try:
        from stepper_driver import STEPPER_PROFILES
        return {"drives": [{"key": k, "label": p.name} for k, p in STEPPER_PROFILES.items()]}
    except Exception:
        return {"drives": []}

@app.get("/api/stepper/configs")
def get_stepper_configs():
    return _read_json_file(STEPPER_CONFIGS_PATH, {"configs": []})

@app.put("/api/stepper/configs")
def put_stepper_configs(body: dict):
    try:
        _write_json_file(STEPPER_CONFIGS_PATH, body)
        if step_mgr: step_mgr.load_files()
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": str(e)}

@app.get("/api/stepper/instances")
def get_stepper_instances():
    return _read_json_file(STEPPER_INSTANCES_PATH, {"instances": []})

@app.put("/api/stepper/instances")
def put_stepper_instances(body: dict):
    """Persist + rebuild the stepper instances (mirrors the VFD instance PUT)."""
    try:
        _write_json_file(STEPPER_INSTANCES_PATH, body)
        if step_mgr:
            step_mgr.load_files()
            results = step_mgr.build(connect=True, do_setup=True)
            step_mgr.start_workers()
            _clear_drive_write_cache('stepper')  # fresh controllers -> re-send commands
            # Normalize (name, ok, error) tuples to dicts so the editor reads
            # x.name/x.ok/x.error the same way it does for the VFD endpoint.
            return {"ok": True, "results": [
                {"name": n, "ok": ok, "error": err} for (n, ok, err) in results]}
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": str(e)}

@app.get("/api/stepper/status")
def get_stepper_status():
    if not step_mgr:
        return {"ok": False, "error": "no stepper manager"}
    return {"ok": True, "steppers": clean_for_json(step_mgr.snapshot_all())}

# --- Manual stepper control (for the drive widget). Commands are QUEUED to the
# drive's worker thread (step_mgr.request_command), so they serialize with the
# background polling on the same serial port -- never call the controller
# directly from the request thread. Mirrors the VFD command endpoints. ---
def _stepper_cmd(name: str, cmd: str, value: float):
    if not step_mgr:
        return {"ok": False, "error": "no stepper manager"}
    if name not in step_mgr.workers:
        return {"ok": False, "error": f"stepper '{name}' not running (include it + Save)"}
    ok = step_mgr.request_command(name, cmd, float(value))
    return {"ok": bool(ok)} if ok else {"ok": False, "error": "command queue full"}

@app.post("/api/stepper/{name}/enable")
def stepper_enable(name: str):
    return _stepper_cmd(name, "ENABLE", 1.0)

@app.post("/api/stepper/{name}/disable")
def stepper_disable(name: str):
    return _stepper_cmd(name, "ENABLE", 0.0)

@app.post("/api/stepper/{name}/velocity")
def stepper_velocity(name: str, body: dict):
    return _stepper_cmd(name, "VELOCITY", float((body or {}).get("rpm", 0.0)))

@app.post("/api/stepper/{name}/stop")
def stepper_stop(name: str):
    return _stepper_cmd(name, "STOP", 0.0)

@app.post("/api/stepper/{name}/alarm_reset")
def stepper_alarm_reset(name: str):
    return _stepper_cmd(name, "ALARM_RESET", 1.0)

@app.post("/api/stepper/{name}/zero_position")
def stepper_zero_position(name: str):
    return _stepper_cmd(name, "ZERO_POSITION", 1.0)

@app.get("/api/vfd/drives")
def get_vfd_drives():
    return _read_json_file(VFD_DRIVES_PATH, {"drives": []})

@app.put("/api/vfd/drives")
def put_vfd_drives(body: dict):
    try:
        _write_json_file(VFD_DRIVES_PATH, body)
        if vfd_mgr: vfd_mgr.load_files()
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": str(e)}

@app.get("/api/vfd/motors")
def get_vfd_motors():
    return _read_json_file(VFD_MOTORS_PATH, {"motors": []})

@app.put("/api/vfd/motors")
def put_vfd_motors(body: dict):
    try:
        _write_json_file(VFD_MOTORS_PATH, body)
        if vfd_mgr: vfd_mgr.load_files()
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": str(e)}

@app.get("/api/vfd/instances")
def get_vfd_instances():
    return _read_json_file(VFD_INSTANCES_PATH, {"instances": []})

@app.put("/api/vfd/instances")
def put_vfd_instances(body: dict):
    """Save instances and rebuild controllers. Returns per-instance build
    results so the editor can show which ones connected."""
    global vfd_mgr
    try:
        _write_json_file(VFD_INSTANCES_PATH, body)
        results = []
        if vfd_mgr:
            vfd_mgr.load_files()
            results = vfd_mgr.build(connect=True)
            try: vfd_mgr.check_drives(do_setup=False)  # refresh comms health for the editor
            except Exception: pass
            vfd_mgr.start_workers()   # rebind workers to rebuilt controllers
            try:
                import json as _json
                from vfd_driver import discover_vfd_params
                _exprs = _json.load(open(str(CFG_DIR / "expressions.json"))).get("expressions", [])
                vfd_mgr.set_watch_all(discover_vfd_params(_exprs))
            except Exception as _e:
                print(f"[VFD] watch-list setup failed: {_e}")
        return {"ok": True, "results": [
            {"name": n, "ok": ok, "error": err} for (n, ok, err) in results]}
    except Exception as e:
        return {"ok": False, "error": str(e)}

@app.get("/api/vfd/status")
def get_vfd_status():
    if not vfd_mgr:
        return {"ok": False, "error": "VFD manager not available", "vfds": {}}
    return {"ok": True, "vfds": clean_for_json(vfd_mgr.snapshot_all())}

@app.post("/api/vfd/{name}/enable")
def vfd_enable(name: str, body: dict = None):
    if not vfd_mgr: return {"ok": False, "error": "no VFD manager"}
    c = vfd_mgr.get(name)
    if not c: return {"ok": False, "error": f"no VFD '{name}'"}
    try:
        rev = bool((body or {}).get("reverse", False))
        c.enable(reverse=rev)
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": str(e)}

@app.post("/api/vfd/{name}/disable")
def vfd_disable(name: str):
    if not vfd_mgr: return {"ok": False, "error": "no VFD manager"}
    c = vfd_mgr.get(name)
    if not c: return {"ok": False, "error": f"no VFD '{name}'"}
    try:
        c.disable(); return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": str(e)}

@app.post("/api/vfd/{name}/rpm")
def vfd_rpm(name: str, body: dict):
    if not vfd_mgr: return {"ok": False, "error": "no VFD manager"}
    c = vfd_mgr.get(name)
    if not c: return {"ok": False, "error": f"no VFD '{name}'"}
    try:
        c.set_rpm(float(body.get("rpm", 0.0))); return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": str(e)}

@app.post("/api/vfd/{name}/direction")
def vfd_direction(name: str, body: dict):
    if not vfd_mgr: return {"ok": False, "error": "no VFD manager"}
    c = vfd_mgr.get(name)
    if not c: return {"ok": False, "error": f"no VFD '{name}'"}
    try:
        c.set_direction(bool(body.get("reverse", False))); return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": str(e)}

@app.post("/api/vfd/{name}/fault_reset")
def vfd_fault_reset(name: str):
    if not vfd_mgr: return {"ok": False, "error": "no VFD manager"}
    c = vfd_mgr.get(name)
    if not c: return {"ok": False, "error": f"no VFD '{name}'"}
    try:
        c.fault_reset(); return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": str(e)}

@app.post("/api/vfd/{name}/baud")
def vfd_set_baud(name: str, body: dict = None):
    """Change a drive's Modbus baud (drive must be IDLE): writes the baud param
    at the current speed, reopens the PC port to match, verifies, and persists
    the new baud into vfd_instances.json. Reverts to a reachable baud on failure."""
    if not vfd_mgr: return {"ok": False, "error": "no VFD manager"}
    try:
        target = int((body or {}).get("baud"))
    except (TypeError, ValueError):
        return {"ok": False, "error": "missing/invalid 'baud'"}
    res = vfd_mgr.change_baud(name, target)
    if res.get("ok"):
        try:
            data = _read_json_file(VFD_INSTANCES_PATH, {"instances": []})
            for inst in data.get("instances", []):
                if inst.get("name") == name:
                    inst["baud"] = target
            _write_json_file(VFD_INSTANCES_PATH, data)
        except Exception as e:
            res["persist_error"] = str(e)
    return res

@app.get("/api/vfd/health")
def vfd_health():
    """Per-drive comms health from the last startup/rebuild probe (drive
    identified + Modbus reply confirmed). The UI pops up a warning if any failed."""
    if not vfd_mgr:
        return {"ok": False, "error": "no VFD manager", "drives": []}
    drives = getattr(vfd_mgr, "last_health", []) or []
    return {"ok": all(d.get("comms_ok") for d in drives) if drives else True,
            "drives": drives}


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

@app.post("/api/check_events/save")
async def save_check_events(req: Request):
    """Save full checklist snapshot as chk.json in the current session directory."""
    global session_logger
    try:
        import json as _json
        data = await req.json()
        if session_logger:
            chk_dir = session_logger.path.parent
        else:
            dirs = sorted([p for p in LOGS_DIR.iterdir() if p.is_dir()], key=lambda p: p.name)
            if not dirs:
                return {"ok": False, "error": "No session directory found"}
            chk_dir = dirs[-1]
        chk_path = chk_dir / "chk.json"
        # The disk write happens off the event loop so this handler can't
        # stall WebSocket broadcasts and other API requests — even on a
        # slow disk or under heavy IO load. The snapshot itself is small
        # (current checklist state, not all events ever), so this is
        # quick on a fast disk; the to_thread wrap is just insurance.
        payload = json.dumps(data, indent=2)
        await asyncio.to_thread(chk_path.write_text, payload)
        print(f"[MCC-Hub] Saved chk.json to {chk_path} ({len(data.get('checkEvents', []))} events)")
        return {"ok": True, "path": str(chk_path)}
    except Exception as e:
        print(f"[MCC-Hub] chk.json save error: {e}")
        return {"ok": False, "error": str(e)}

@app.get("/api/logs/{session}/chk")
def get_session_chk(session: str):
    """Return chk.json for a session, or null if none."""
    chk_path = LOGS_DIR / session / "chk.json"
    if chk_path.exists():
        try:
            return json.loads(chk_path.read_text())
        except Exception:
            pass
    return None

# ---------- REST: Serial Scales ----------
@app.get("/api/scales")
def get_scales():
    return scale_mgr.get_config()

@app.put("/api/scales")
async def put_scales(req: Request):
    global cpp_backend, USE_CPP_EXPRESSIONS, CURRENT_DLL_PATH
    data = await req.json()
    scale_mgr.set_config(data, SCALES_PATH)

    # Recompile C++ expressions if name changes affect Scale: references.
    # We always recompile here for simplicity — the cost is a few hundred ms
    # and the only practical alternative would be diffing names, which adds
    # complexity for marginal benefit. Same pattern as put_pid.
    if USE_CPP_EXPRESSIONS:
        try:
            print("[MCC-Hub] Recompiling with new scale configuration...")
            success = compile_cpp_expressions()
            if success:
                new_backend = load_cpp_backend(CURRENT_DLL_PATH)
                if new_backend:
                    cpp_backend = new_backend
                    USE_CPP_EXPRESSIONS = True
                    print("[MCC-Hub] ✓ C++ backend reloaded with new scales")
                else:
                    print("[MCC-Hub] ✗ Backend reload failed")
                    USE_CPP_EXPRESSIONS = False
                    cpp_backend = None
            else:
                print("[MCC-Hub] ✗ Compilation failed, using old DLL")
        except Exception as e:
            print(f"[MCC-Hub] Recompile after scales-save failed: {e}")

    # Register any new gvar_/bvar_ columns with the active logger in one
    # batched rewrite (rather than letting them trickle in frame-by-frame).
    try:
        if session_logger is not None:
            new_cols = _collect_known_log_columns()
            if new_cols:
                session_logger.add_columns(new_cols)
    except Exception as e:
        log.warning(f"[Logger] Could not register new columns after scales save: {e}")

    return {"ok": True}

@app.get("/api/scales/ports")
def get_scale_ports():
    return {"ports": list_serial_ports()}

@app.get("/api/scales/values")
def get_scale_values():
    return {"values": scale_mgr.get_values()}

@app.get("/api/scales/values/raw")
def get_scale_values_raw():
    """Return un-tared raw values — used by the tare dialog so the user sees
    the actual sensor reading while choosing a target."""
    return {"values": scale_mgr.get_raw_values()}

@app.post("/api/tare_scales")
async def tare_scales(req: dict):
    """Tare/balance serial scale channels by averaging raw readings and
    setting an offset so that displayed value = target_value.

    Request body:
      channels: list[int]               — scale indices to tare
      averaging_period: float (seconds) — how long to sample (default 1.0)
      target_value: float               — desired displayed value (default 0.0)

    Offset semantics: displayed = raw + offset. To make displayed == target,
    offset = target - raw_average.
    """
    channels = req.get("channels", [])
    averaging_period = float(req.get("averaging_period", 1.0))
    target_value = float(req.get("target_value", 0.0))

    if not channels:
        return {"ok": False, "error": "No channels specified"}

    num_scales = len(scale_mgr.get_raw_values())
    for ch in channels:
        if ch < 0 or ch >= num_scales:
            return {"ok": False, "error": f"Invalid scale index: {ch}"}

    # Sample the latest raw value at 10 Hz over the averaging window.
    # Serial scales typically emit 1-10 Hz; oversampling at 100 Hz would just
    # produce duplicate readings without improving the average.
    sample_rate = 10.0
    num_samples = max(1, int(averaging_period * sample_rate))
    samples: dict[int, list[float]] = {ch: [] for ch in channels}

    print(f"[Tare Scales] Collecting {num_samples} samples over {averaging_period}s "
          f"for scales {channels}, target={target_value}")

    last_seen: dict[int, float | None] = {ch: None for ch in channels}
    for _ in range(num_samples):
        raw = scale_mgr.get_raw_values()
        for ch in channels:
            if ch < len(raw):
                v = raw[ch]
                # Only record when the value has changed (avoid weighting stale reads).
                # If it never changes during the window, last_seen carries the single
                # value forward and the average is well-defined.
                if v != last_seen[ch]:
                    samples[ch].append(v)
                    last_seen[ch] = v
        await asyncio.sleep(1.0 / sample_rate)

    offsets_applied: list[dict] = []
    new_offsets: dict[int, float] = {}
    for ch in channels:
        if not samples[ch]:
            # No fresh samples observed — fall back to the current value if any
            cur = scale_mgr.get_raw_values()
            if ch < len(cur):
                samples[ch] = [cur[ch]]
            else:
                return {"ok": False, "error": f"No samples for scale {ch}"}

        avg = sum(samples[ch]) / len(samples[ch])
        cfg = scale_mgr._scales[ch] if ch < len(scale_mgr._scales) else {}
        try:
            old_offset = float(cfg.get("offset", 0.0))
        except (TypeError, ValueError):
            old_offset = 0.0
        new_offset = target_value - avg
        new_offsets[ch] = new_offset
        offsets_applied.append({
            "channel": ch,
            "name": cfg.get("name", f"Scale{ch}"),
            "raw_avg": avg,
            "old_offset": old_offset,
            "new_offset": new_offset,
            "displayed": avg + new_offset,  # should equal target_value
            "samples_used": len(samples[ch])
        })
        print(f"[Tare Scales] Scale{ch} ({cfg.get('name', '')}): "
              f"raw_avg={avg:.4f}, old_offset={old_offset:.4f}, "
              f"new_offset={new_offset:.4f} -> target={target_value}")

    scale_mgr.set_offsets(new_offsets, SCALES_PATH)
    print(f"[Tare Scales] Saved offsets to {SCALES_PATH}")
    return {"ok": True, "offsets": offsets_applied}

@app.post("/api/check_events")
async def post_check_events(req: Request):
    """Receive checklist check events from frontend and append to the
    current session's in-memory accumulator. The actual CSV write happens
    once at session close.

    The call to write_check_events is wrapped in asyncio.to_thread to keep
    even hypothetical future I/O off the event loop — historically this
    handler was a major source of UI freezes (10-20 seconds per X/Backspace
    keypress) because the underlying logger was rewriting the entire CSV
    on every call. With the O(1) in-memory accumulator now in place the
    to_thread wrap is overkill, but it's cheap and prevents regression.
    """
    global session_logger
    try:
        data = await req.json()
        events = data.get("events", [])
        if session_logger and events:
            await asyncio.to_thread(session_logger.write_check_events, events)
        # Relay to every connected browser. Same-machine windows already
        # synced via BroadcastChannel; this is what carries checks to OTHER
        # computers watching the same server. The originating window sees
        # the echo too and skips it (idempotent apply, see app.js).
        for ev in events:
            try:
                await broadcast({"type": "check_event", "op": "add", "ev": ev})
            except Exception:
                pass
        return {"ok": True, "count": len(events)}
    except Exception as e:
        return {"ok": False, "error": str(e)}

# ====================== checklist host arbitration ========================
# One browser can volunteer to HOST the checklist: its copy (items, cursor,
# check events) is pushed to the server and broadcast to every connected
# browser, whose checklist widgets adopt it. After adoption the existing
# check/uncheck relay keeps all copies in step; hosting only distributes
# the FILE and decides who is authoritative.
#
# Arbitration: claiming while another live host exists puts the claim in a
# pending slot and asks the current host (via its WebSocket) to relinquish.
# The host answers through /respond; silence expires after PENDING_TTL so
# an unattended host cannot wedge the system -- but it also is not stolen
# from: expiry DENIES the request. A DISCONNECTED host is replaced
# immediately (its WS is gone, nothing to ask).
ws_client_ids: dict = {}                     # client_id -> WebSocket
_cl_host = {"id": None, "data": None}        # current host + its checklist
_cl_pending = {"id": None, "data": None, "ts": 0.0}
_CL_PENDING_TTL = 30.0                       # seconds before a claim expires

async def _ws_send_to(cid, msg):
    """Best-effort targeted send to one client by id."""
    w = ws_client_ids.get(cid)
    if w is None:
        return False
    try:
        await w.send_text(json.dumps(msg, separators=(",", ":")))
        return True
    except Exception:
        return False

async def _cl_expire_pending():
    """Drop a stale pending claim, notifying the requester."""
    if _cl_pending["id"] and (time.time() - _cl_pending["ts"]) > _CL_PENDING_TTL:
        stale = _cl_pending["id"]
        _cl_pending.update({"id": None, "data": None, "ts": 0.0})
        await _ws_send_to(stale, {"type": "cl_host", "op": "timeout"})

async def _cl_install_host(cid, data):
    """Make cid the host with the given checklist and tell everyone."""
    _cl_host["id"] = cid
    _cl_host["data"] = data
    fname = (data or {}).get("checklistPath", "?")
    print(f"[MCC-Hub] checklist host = {cid} ({fname})")
    await broadcast({"type": "cl_host", "op": "set",
                     "host_id": cid, "checklist": data})

@app.get("/api/checklist_host")
async def get_checklist_host():
    """Current hosting state + the hosted checklist itself, so a browser
    that opens its checklist dock late can adopt immediately."""
    return {"host_id": _cl_host["id"],
            "has_data": _cl_host["data"] is not None,
            "checklist": _cl_host["data"]}

@app.post("/api/checklist_host/claim")
async def checklist_host_claim(req: Request):
    """A browser wants to host. Granted instantly when there is no live
    host (or the claimer already hosts -- that refreshes the data, used
    when the host loads a different checklist file). Otherwise the claim
    goes pending and the current host is asked to relinquish."""
    try:
        body = await req.json()
        cid = body.get("client_id")
        data = body.get("checklist")
        if not cid or not isinstance(data, dict):
            return {"ok": False, "error": "client_id and checklist required"}
        await _cl_expire_pending()

        # Already the host: refresh the shared copy and rebroadcast.
        if _cl_host["id"] == cid:
            await _cl_install_host(cid, data)
            return {"ok": True, "granted": True}

        # No host, or the recorded host has no live connection: take over.
        if _cl_host["id"] is None or _cl_host["id"] not in ws_client_ids:
            await _cl_install_host(cid, data)
            return {"ok": True, "granted": True}

        # A different request is already waiting its turn.
        if _cl_pending["id"] and _cl_pending["id"] != cid:
            return {"ok": False,
                    "error": "Another computer is already requesting to host. Try again shortly."}

        # Park the claim and ask the current host to relinquish.
        _cl_pending.update({"id": cid, "data": data, "ts": time.time()})
        sent = await _ws_send_to(_cl_host["id"],
                                 {"type": "cl_host", "op": "request"})
        if not sent:
            # Host vanished between the liveness check and the send.
            _cl_pending.update({"id": None, "data": None, "ts": 0.0})
            await _cl_install_host(cid, data)
            return {"ok": True, "granted": True}
        return {"ok": True, "granted": False, "pending": True,
                "ttl": _CL_PENDING_TTL}
    except Exception as e:
        return {"ok": False, "error": str(e)}

@app.post("/api/checklist_host/respond")
async def checklist_host_respond(req: Request):
    """The current host answers a relinquish request (allow true/false)."""
    try:
        body = await req.json()
        cid = body.get("client_id")
        allow = bool(body.get("allow"))
        if _cl_host["id"] != cid:
            return {"ok": False, "error": "You are not the current host."}
        await _cl_expire_pending()
        if not _cl_pending["id"]:
            return {"ok": False, "error": "The request already expired or was cancelled."}
        requester, data = _cl_pending["id"], _cl_pending["data"]
        _cl_pending.update({"id": None, "data": None, "ts": 0.0})
        if not allow:
            await _ws_send_to(requester, {"type": "cl_host", "op": "denied"})
            return {"ok": True, "relinquished": False}
        if requester not in ws_client_ids:
            return {"ok": True, "relinquished": False,
                    "note": "Requester disconnected; you remain host."}
        await _ws_send_to(requester, {"type": "cl_host", "op": "granted"})
        await _cl_install_host(requester, data)
        return {"ok": True, "relinquished": True}
    except Exception as e:
        return {"ok": False, "error": str(e)}

@app.post("/api/checklist_host/cancel")
async def checklist_host_cancel(req: Request):
    """The requester gave up waiting (timeout or Cancel button)."""
    try:
        body = await req.json()
        if _cl_pending["id"] == body.get("client_id"):
            _cl_pending.update({"id": None, "data": None, "ts": 0.0})
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": str(e)}

@app.post("/api/checklist_host/release")
async def checklist_host_release(req: Request):
    """The host unchecked its Host box: hosting ends for everyone."""
    try:
        body = await req.json()
        if _cl_host["id"] != body.get("client_id"):
            return {"ok": False, "error": "You are not the current host."}
        _cl_host["id"] = None
        _cl_host["data"] = None
        print("[MCC-Hub] checklist hosting released")
        await broadcast({"type": "cl_host", "op": "set", "host_id": None})
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": str(e)}

@app.post("/api/check_events/uncheck")
async def post_check_events_uncheck(req: Request):
    """Relay a checklist UNcheck to every connected browser and drop the
    matching event from the active session's in-memory accumulator so the
    chk_events column embedded at close reflects the final checked state.
    This is the cross-computer counterpart of the same-machine
    BroadcastChannel relay — a second computer only hears about checks and
    unchecks through the server."""
    global session_logger
    try:
        data = await req.json()
        item_num = data.get("itemNum")
        if item_num is None:
            return {"ok": False, "error": "itemNum required"}
        if session_logger:
            try:
                await asyncio.to_thread(session_logger.remove_check_event, item_num)
            except AttributeError:
                pass  # older logger without remove support; chk.json still rules
        try:
            await broadcast({"type": "check_event", "op": "remove",
                             "itemNum": item_num})
        except Exception:
            pass
        return {"ok": True}
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
        # Carry known gvar_/bvar_ columns into the new session too.
        session_logger = SessionLogger(session_dir, known_columns=_collect_known_log_columns(),
                                       col_names=_collect_log_col_names())
        
        return {"ok": True, "message": f"Log closed and new session started: {session_id}", "session_id": session_id}
    else:
        return {"ok": False, "message": "No active log to close"}

@app.get("/api/logs/{session}/csv")
def download_csv(session: str):
    path = LOGS_DIR/session/"session.csv"
    return FileResponse(str(path), filename=f"{session}.csv")

# ============================ log viewer launch ============================
@app.post("/api/log_viewer/launch")
def launch_log_viewer(body: dict = None):
    """Spawn the standalone log_viewer.py app on the server machine.

    The browser can't launch local applications itself, so it asks us to.
    This only makes sense when the browser and server run on the same
    machine (the normal single-box setup) — the viewer window opens on
    the SERVER's display.

    Optional body: {"session": "<name>"} pre-opens that session's CSV.
    """
    import subprocess, shutil
    body = body or {}

    # Find the viewer script: next to server.py first, then CWD.
    candidates = [
        Path(__file__).parent / "log_viewer.py",
        Path.cwd() / "log_viewer.py",
    ]
    script = next((p for p in candidates if p.exists()), None)
    if script is None:
        return {"ok": False, "error":
                "log_viewer.py not found next to server.py. Copy it into "
                "the server directory (or install dir for the frozen EXE)."}

    # Pick a Python. In a frozen EXE, sys.executable is the EXE itself —
    # useless for running a .py — so we hunt the PATH instead.
    if getattr(sys, 'frozen', False):
        py = shutil.which("python") or shutil.which("python3") or shutil.which("py")
        if not py:
            return {"ok": False, "error":
                    "No Python interpreter found on PATH. Install Python "
                    "(python.org) or run the viewer manually: "
                    f"python {script}"}
    else:
        py = sys.executable

    args = [py, str(script)]
    sess = body.get("session")
    if sess:
        csv_path = LOGS_DIR / sess / "session.csv"
        if csv_path.exists():
            args.append(str(csv_path))

    # Chart view bundle from the browser:
    #   scales  — {csvCol: {scale, offset, label}} display transforms
    #   names   — {csvCol: friendlyName} for every configured signal
    #   charted — [csvCol, ...] columns shown on charts (viewer enables these)
    # Written as one JSON file and handed to the viewer via --scales. The
    # viewer also accepts the old flat scales-only format for back-compat.
    scales  = body.get("scales")  if isinstance(body.get("scales"), dict)  else {}
    names   = body.get("names")   if isinstance(body.get("names"), dict)   else {}
    charted = body.get("charted") if isinstance(body.get("charted"), list) else []
    if scales or names or charted:
        try:
            scales_path = LOGS_DIR / "_viewer_scales.json"
            scales_path.write_text(json.dumps(
                {"scales": scales, "names": names, "charted": charted},
                indent=2), encoding="utf-8")
            args += ["--scales", str(scales_path)]
            print(f"[MCC-Hub] Viewer bundle: {len(scales)} scaled, "
                  f"{len(names)} named, {len(charted)} charted -> {scales_path}")
        except Exception as e:
            # Non-fatal — the viewer just opens without the chart-view extras.
            print(f"[MCC-Hub] Could not write viewer scales: {e}")

    try:
        kwargs = {"close_fds": True}
        if sys.platform == "win32":
            # Detach so the viewer survives a server restart and doesn't
            # share our console.
            kwargs["creationflags"] = 0x00000008 | 0x00000200  # DETACHED | NEW_PROCESS_GROUP
        subprocess.Popen(args, **kwargs)
        print(f"[MCC-Hub] Launched log viewer: {' '.join(args)}")
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": f"Launch failed: {e}"}

# ============================ chk.json merge ===============================
def _read_csv_head(csv_path):
    """Return (header_fields, row1_fields_or_None, delim) reading only the
    first two LINES of the file — never the whole thing. The chk_events
    payload always lives in row 1, so this is all we need to know the
    embed status of even a multi-GB CSV."""
    with open(csv_path, "r", newline="", encoding="utf-8", errors="replace") as f:
        h_line = f.readline()
        r1_line = f.readline()
    delim = "\t" if "\t" in h_line else ","
    header = next(csv.reader([h_line], delimiter=delim)) if h_line else []
    row1 = next(csv.reader([r1_line], delimiter=delim)) if r1_line.strip() else None
    return [c.strip() for c in header], row1, delim

def _read_csv_t_range(csv_path, header, row1, delim):
    """Best-effort (t_first, t_last) from the first data row and the file
    tail. Returns (None, None) if there's no 't' column or parsing fails."""
    lower = [c.lower() for c in header]
    t_idx = next((i for i, c in enumerate(lower)
                  if c in ("t", "time", "timestamp")), None)
    if t_idx is None or row1 is None:
        return None, None
    try:
        t_first = float(row1[t_idx])
    except (ValueError, IndexError):
        return None, None
    # Tail: read the last ~64 KB and take the final complete line.
    t_last = t_first
    try:
        size = os.path.getsize(csv_path)
        with open(csv_path, "rb") as f:
            f.seek(max(0, size - 65536))
            tail = f.read().decode("utf-8", errors="replace")
        lines = [ln for ln in tail.split("\n") if ln.strip()]
        if lines:
            last = next(csv.reader([lines[-1]], delimiter=delim))
            t_last = float(last[t_idx])
    except Exception:
        pass
    return t_first, t_last

def _chk_merge_status(session_dir):
    """Compute merge status for one session dir. Returns a dict the
    candidates endpoint serves to the browser, or None if the session
    isn't a merge candidate (missing chk.json or session.csv)."""
    chk_path = session_dir / "chk.json"
    csv_path = session_dir / "session.csv"
    if not chk_path.exists() or not csv_path.exists():
        return None
    try:
        snap = json.loads(chk_path.read_text(encoding="utf-8"))
        events = snap.get("checkEvents", [])
    except Exception as e:
        return {"session": session_dir.name, "error": f"chk.json unreadable: {e}"}

    header, row1, delim = _read_csv_head(csv_path)
    embedded = "none"
    if "chk_events" in header and row1 is not None:
        idx = header.index("chk_events")
        cell = row1[idx] if idx < len(row1) else ""
        if cell.strip():
            try:
                existing = json.loads(cell)
                embedded = "identical" if existing == events else "different"
            except Exception:
                embedded = "different"   # unparseable cell ≠ our events

    is_active = bool(session_logger and
                     session_logger.path.parent.name == session_dir.name)
    return {
        "session":  session_dir.name,
        "events":   len(events),
        "embedded": embedded,
        "is_active": is_active,
        "csv_mb":   round(csv_path.stat().st_size / (1024 * 1024), 1),
    }

@app.get("/api/chk_merge/candidates")
def chk_merge_candidates():
    """Sessions that have BOTH a chk.json and a session.csv, with their
    embed status. The browser's merge dialog lists these."""
    out = []
    try:
        for p in sorted(LOGS_DIR.iterdir(), key=lambda p: p.name, reverse=True):
            if not p.is_dir():
                continue
            st = _chk_merge_status(p)
            if st:
                out.append(st)
    except Exception as e:
        return {"ok": False, "error": str(e), "sessions": []}
    return {"ok": True, "sessions": out}

@app.post("/api/chk_merge/{session}")
def chk_merge(session: str, body: dict = None):
    """Merge a session's chk.json checkEvents into its session.csv as the
    chk_events column — the manual recovery path for sessions where the
    server was terminated before close() could embed them.

    Sanity checks (each requires force=true to override):
      * The CSV already has DIFFERENT chk_events embedded  -> 'conflict'
      * Event timestamps fall outside the CSV's time range -> 'time_mismatch'
    If the embedded events are IDENTICAL to chk.json, nothing is written
    and we report that — re-merging the same data is a no-op by design.

    The merge itself STREAMS the CSV row-by-row to a temp file and then
    atomically replaces the original (os.replace), so memory stays flat
    even for multi-GB files and a crash mid-merge can't corrupt the CSV.

    This is a sync (def) endpoint, so FastAPI runs it on a threadpool
    worker — a long merge does not block the asyncio event loop.
    """
    body = body or {}
    force = bool(body.get("force"))
    session_dir = LOGS_DIR / session
    chk_path = session_dir / "chk.json"
    csv_path = session_dir / "session.csv"

    if not chk_path.exists():
        return {"ok": False, "error": "No chk.json in this session"}
    if not csv_path.exists():
        return {"ok": False, "error": "No session.csv in this session"}
    if session_logger and session_logger.path.parent.name == session:
        return {"ok": False, "error":
                "This is the ACTIVE session — its CSV is open for writing. "
                "Stop the log (Start New Log) first, which embeds the "
                "events automatically anyway."}

    try:
        snap = json.loads(chk_path.read_text(encoding="utf-8"))
        events = snap.get("checkEvents", [])
    except Exception as e:
        return {"ok": False, "error": f"chk.json unreadable: {e}"}
    if not events:
        return {"ok": False, "error": "chk.json has no check events to merge"}

    header, row1, delim = _read_csv_head(csv_path)
    if not header or row1 is None:
        return {"ok": False, "error": "CSV has no data rows"}

    # --- sanity 1: existing embed -----------------------------------------
    if "chk_events" in header:
        idx = header.index("chk_events")
        cell = row1[idx] if idx < len(row1) else ""
        if cell.strip():
            try:
                existing = json.loads(cell)
            except Exception:
                existing = None
            if existing == events:
                return {"ok": True, "merged": False, "status": "identical",
                        "message": "CSV already contains these exact events "
                                   "— nothing to merge."}
            if not force:
                return {"ok": False, "needs_force": True, "status": "conflict",
                        "message": f"CSV already has {len(existing) if isinstance(existing, list) else '?'} "
                                   f"embedded events that DIFFER from chk.json's "
                                   f"{len(events)}. Merging will OVERWRITE the "
                                   f"embedded set with chk.json's."}

    # --- sanity 2: time range ----------------------------------------------
    t_first, t_last = _read_csv_t_range(csv_path, header, row1, delim)
    ev_ts = [ev.get("tServer", ev.get("t")) for ev in events]
    ev_ts = [float(t) for t in ev_ts if t is not None]
    if t_first is not None and ev_ts:
        # Only comparable when both look like the same time base (Unix
        # epoch ≈ 1e9+). A session-relative t column can't be checked.
        if t_first > 1e9 and min(ev_ts) > 1e9:
            TOL = 300.0   # 5-minute slack on each end
            if (min(ev_ts) < t_first - TOL) or (max(ev_ts) > t_last + TOL):
                if not force:
                    return {"ok": False, "needs_force": True,
                            "status": "time_mismatch",
                            "message": "Event timestamps fall OUTSIDE this "
                                       "CSV's time range — this chk.json may "
                                       "belong to a different session. "
                                       f"CSV: {t_first:.0f}…{t_last:.0f}, "
                                       f"events: {min(ev_ts):.0f}…{max(ev_ts):.0f}."}

    # --- the merge: stream copy with the column injected --------------------
    json_str = json.dumps(events)
    tmp_path = csv_path.with_suffix(".csv.tmp")
    try:
        with open(csv_path, "r", newline="", encoding="utf-8", errors="replace") as rf, \
             open(tmp_path, "w", newline="", encoding="utf-8") as wf:
            rd = csv.reader(rf, delimiter=delim)
            wr = csv.writer(wf, delimiter=delim)
            hdr = next(rd)
            if "chk_events" in hdr:
                col_idx = hdr.index("chk_events")
                append_col = False
            else:
                hdr.append("chk_events")
                col_idx = len(hdr) - 1
                append_col = True
            wr.writerow(hdr)
            for i, row in enumerate(rd):
                if append_col:
                    row.append(json_str if i == 0 else "")
                else:
                    while len(row) <= col_idx:
                        row.append("")
                    if i == 0:
                        row[col_idx] = json_str
                wr.writerow(row)
        os.replace(tmp_path, csv_path)   # atomic on same filesystem
    except Exception as e:
        try: tmp_path.unlink(missing_ok=True)
        except Exception: pass
        return {"ok": False, "error": f"Merge write failed: {e}"}

    print(f"[MCC-Hub] Merged {len(events)} check events from chk.json into {csv_path}")
    return {"ok": True, "merged": True, "status": "merged",
            "message": f"Embedded {len(events)} events into {session}/session.csv."}

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
    # Per-connection identity: used by the checklist-host arbitration so
    # the server can address ONE browser (the current host) and recognise
    # claims/releases coming back over HTTP from the same client.
    import uuid as _uuid
    client_id = _uuid.uuid4().hex[:12]
    ws_client_ids[client_id] = ws
    print(f"[WS] client connected; total={len(ws_clients)} id={client_id}")

    # Hello: hardware/runtime status for THIS client. Button colorization
    # (hwReady in app.js) used to rely on a single boot-time /api/diag
    # fetch — if that one fetch failed (server restarting, transient
    # network), the client's buttons stayed in the un-connected color
    # forever. Sending the status on every (re)connect makes it
    # self-healing.
    try:
        await ws.send_text(json.dumps({
            "type": "hello",
            "have_mcculw": bool(HAVE_MCCULW),
            "have_uldaq": bool(HAVE_ULDAQ),
            "server": SERVER_VERSION,
            "client_id": client_id,
        }, separators=(",", ":")))
    except Exception as e:
        print(f"[WS] failed sending hello: {e}")

    # Send a snapshot of recent console output to this client only, so
    # the console widget has history right away. Subsequent lines arrive
    # via the regular broadcast tick. `replace:true` tells the client to
    # discard its current contents (this is a full re-sync, not an append).
    try:
        snapshot = _console_snapshot()
        if snapshot:
            await ws.send_text(json.dumps({
                "type": "console",
                "lines": snapshot,
                "replace": True,
            }, separators=(",", ":")))
    except Exception as e:
        print(f"[WS] failed sending console snapshot: {e}")

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
        ws_client_ids.pop(client_id, None)
        # If the departing browser was hosting the checklist, hosting ends
        # with it -- everyone's Host checkbox clears and machines go back
        # to independent checklists until someone claims again.
        if _cl_host["id"] == client_id:
            _cl_host["id"] = None
            _cl_host["data"] = None
            print(f"[WS] checklist host {client_id} disconnected; hosting released")
            try:
                await broadcast({"type": "cl_host", "op": "set", "host_id": None})
            except Exception:
                pass
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
    # Frozen-EXE-friendly main: ALWAYS write a startup log file, ALWAYS
    # pause before exit when running as a PyInstaller EXE. Without this,
    # any failure (crash, clean exit, port already in use, …) closes the
    # console window before the user can read what happened.
    import traceback as _tb
    _frozen = getattr(sys, 'frozen', False)
    _log_path = "mcc_startup.log"        # next to the EXE; always created
    _exit_code = 0
    _crashed = False
    try:
        # Open the log immediately and tee a copy of stderr to it so we
        # capture EVERY error message even if our fd-capture failed earlier.
        _log_file = open(_log_path, "w", encoding="utf-8", buffering=1)
        _log_file.write(f"[MCC-Hub] startup begin (frozen={_frozen})\n")
        _log_file.flush()
    except Exception:
        _log_file = None

    def _log_write(msg):
        """Write a line to BOTH the original stderr and the startup log,
        if either is available. Used by the crash handler so we have
        independent records of what happened."""
        for target in (sys.__stderr__, sys.stderr, _log_file):
            if target is None: continue
            try:
                target.write(msg)
                target.flush()
            except Exception:
                pass

    try:
        import uvicorn, os
        port = int(os.environ.get("PORT", "8000"))
        uv_level = os.environ.get("UVICORN_LEVEL", "warning").lower()
        access = os.environ.get("UVICORN_ACCESS", "0") == "0"
        # Optional HTTPS: drop a cert.pem + key.pem into CFG_DIR/ssl (the
        # mkcert tool makes locally-trusted ones in two commands) and the
        # server switches to TLS automatically. Browsers then treat the
        # origin as secure — no "Not secure" chip in installed app
        # windows, and secure-context APIs (clipboard, native
        # crypto.randomUUID, ...) work on remote machines. Note: with TLS
        # on, plain http:// no longer answers on this port — use https://
        # on every machine. app.js already upgrades its WebSocket to wss
        # automatically based on the page protocol.
        ssl_kwargs = {}
        proto = "http"
        try:
            _cert = CFG_DIR / "ssl" / "cert.pem"
            _key  = CFG_DIR / "ssl" / "key.pem"
            if _cert.exists() and _key.exists():
                ssl_kwargs = {"ssl_certfile": str(_cert), "ssl_keyfile": str(_key)}
                proto = "https"
                _log_write(f"[MCC-Hub] HTTPS enabled (certs in {_cert.parent})\n")
        except Exception as _ssl_err:
            _log_write(f"[MCC-Hub] HTTPS cert check failed ({_ssl_err}); serving plain HTTP\n")
        _log_write(f"[MCC-Hub] Starting Uvicorn on {proto}://127.0.0.1:{port}\n")
        uvicorn.run(app, host="0.0.0.0", port=port, log_level=uv_level, access_log=access, **ssl_kwargs)
        _log_write("[MCC-Hub] Uvicorn exited normally.\n")
    except SystemExit as e:
        _log_write(f"[MCC-Hub] SystemExit with code={e.code}\n")
        _exit_code = e.code if isinstance(e.code, int) else 1
    except BaseException as _err:
        _crashed = True
        _exit_code = 1
        _log_write("\n========== MCC-Hub crashed during startup ==========\n")
        _log_write(_tb.format_exc())
        _log_write("====================================================\n")
    finally:
        # Always pause when running as a frozen EXE — this is the whole
        # point of the wrapper. If the user double-clicked the EXE, the
        # console will close on exit and they'll never see what went
        # wrong. The pause keeps the window open until they hit Enter.
        if _frozen:
            try:
                # Tell them what happened so they know what to look at.
                if _crashed:
                    msg = "\n[ Press Enter to close — see error above or mcc_startup.log ]\n"
                else:
                    msg = "\n[ Server exited. Press Enter to close — see mcc_startup.log ]\n"
                # Use the *original* stdout for the prompt so it's visible
                # even if our wrappers got into a bad state.
                tgt = sys.__stdout__ or sys.stdout
                if tgt is not None:
                    tgt.write(msg)
                    tgt.flush()
                try:
                    input()
                except EOFError:
                    pass
            except Exception:
                pass
        if _log_file is not None:
            try: _log_file.close()
            except Exception: pass
        sys.exit(_exit_code)
