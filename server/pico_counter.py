"""pico_counter.py -- MCC-CTR4 Raspberry Pi Pico pulse-counter client -- v1.0.0 (russ 11/16).

The Pico (pi_port/pico_ctr4/main.py) counts pulses on four inputs with hard
GPIO interrupts and answers "R" on its USB serial port with
    C,<uptime_ms>,<c0>,<p0>,<c1>,<p1>,<c2>,<p2>,<c3>,<p3>
(c = total edges, p = last edge-to-edge period in us, 0 when stale).

This module owns ONE background thread that keeps that port open, polls it at
pollMs, and turns the counts into engineering values per channel:

    hz    = delta-count / delta-time over rateWindowS (lossless: the Pico's
            totals are monotonic, so nothing between polls is ever missed);
            when fewer than 2 pulses landed in the window and the Pico still
            reports a fresh period, 1e6/period gives the instantaneous rate
            instead (resolves very low flow); p == 0 => 0 Hz (zero flow).
    rate  = (hz + hzOffset) * 60 / pulsesPerUnit   [units per minute], 0 when hz is 0
            -- the Shineui SMWF-0420A is f = 50*Q - 3 Hz, i.e. 3000 pulses/L and
               hzOffset +3 (its table: 22/47/72/97 Hz at 0.5/1/1.5/2 L/min)
    total = (host base + count) / pulsesPerUnit    [units]; survives a Pico
            reboot (count drop => base += last count) and is zeroed by zero().

Values are published by NAME into expression statics (rateStatic / totalStatic),
exactly like the E-TC digital inputs: the server stamps them before every
evaluate(), so expressions, dashboard staticvar widgets, charts and the session
CSV (gvar_ columns) all see them with no DLL-signature change. The statics must
be declared in the expression set (static.name = 0) or the stamp is a no-op.

Config lives in config/pico_counters.json (per machine, like scales.json):
{
  "enabled": true, "port": "auto", "pollMs": 250, "rateWindowS": 1.0,
  "channels": [ {"ch":0, "name":"Flow0", "enabled":true, "pulsesPerUnit":3000,
                 "hzOffset":3.0, "units":"L", "rateStatic":"picoRate0",
                 "totalStatic":"picoTotal0", "gapUs":0, "lowCutHz":5.0}, ... ]
}
port "auto" = first serial port with the Raspberry Pi USB VID (0x2E8A); on the
rig prefer the /dev/serial/by-id/usb-MicroPython_Board_in_FS_mode_<serial>-if00
name so USB enumeration order cannot swap it with another device.
"""
from __future__ import annotations

import json
import threading
import time
from collections import deque
from pathlib import Path

VERSION = "1.0.0"
PICO_VID = 0x2E8A
NCH = 4

try:
    import serial                       # pyserial
    from serial.tools import list_ports
    HAVE_SERIAL = True
except Exception:                       # pragma: no cover
    serial = None
    list_ports = None
    HAVE_SERIAL = False


def default_channel(i: int) -> dict:
    return {
        "ch": i, "name": f"Flow{i}", "enabled": i < 2,
        "pulsesPerUnit": 3000.0,        # SMWF-0420A: 3000 pulses per litre
        "hzOffset": 3.0,                # SMWF-0420A: f = 50*Q - 3
        "units": "L",
        "rateStatic": f"picoRate{i}",   # units/min
        "totalStatic": f"picoTotal{i}", # units
        "gapUs": 0,                     # debounce on the Pico; 0 = Hall sensor, ~2000 = reed
        "lowCutHz": 5.0,                # below this the rate is reported as 0 (sensor floor)
    }


def default_config() -> dict:
    return {"enabled": False, "port": "auto", "pollMs": 250, "rateWindowS": 1.0,
            "channels": [default_channel(i) for i in range(NCH)]}


class PicoCounterManager:
    def __init__(self):
        self._cfg = default_config()
        self._lock = threading.Lock()
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        self._zero_req: set[int] = set()
        self._path: Path | None = None
        # live state
        self._st = {"connected": False, "port": None, "boot_id": None, "err": None,
                    "last_rx": 0.0, "polls": 0, "bad": 0}
        self._ch = [{"count": 0, "base": 0, "hz": 0.0, "rate": 0.0, "total": 0.0,
                     "period_us": 0, "last_count": None} for _ in range(NCH)]
        self._hist: list[deque] = [deque() for _ in range(NCH)]   # (t, total_count) per channel

    # ---------------- config ----------------
    def load(self, path: Path):
        self._path = path
        cfg = default_config()
        try:
            if path.exists():
                user = json.loads(path.read_text(encoding="utf-8"))
                cfg.update({k: v for k, v in user.items() if k != "channels"})
                chans = user.get("channels") or []
                for i in range(NCH):
                    if i < len(chans) and isinstance(chans[i], dict):
                        cfg["channels"][i].update(chans[i])
                        cfg["channels"][i]["ch"] = i
        except Exception as e:
            print(f"[PICO] config load failed ({e}) -- defaults in use")
        self._cfg = cfg
        self._restart()

    def save(self):
        if self._path is None:
            return
        tmp = self._path.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(self._cfg, indent=2), encoding="utf-8")
        tmp.replace(self._path)

    def get_config(self) -> dict:
        return json.loads(json.dumps(self._cfg))

    def set_config(self, data: dict):
        cfg = default_config()
        cfg.update({k: v for k, v in (data or {}).items() if k != "channels"})
        chans = (data or {}).get("channels") or []
        for i in range(NCH):
            if i < len(chans) and isinstance(chans[i], dict):
                cfg["channels"][i].update(chans[i])
                cfg["channels"][i]["ch"] = i
        cfg["pollMs"] = int(max(50, min(5000, int(cfg.get("pollMs") or 250))))
        cfg["rateWindowS"] = float(max(0.2, min(30.0, float(cfg.get("rateWindowS") or 1.0))))
        self._cfg = cfg
        self.save()
        self._restart()

    # ---------------- lifecycle ----------------
    def _restart(self):
        self.stop()
        if not self._cfg.get("enabled"):
            with self._lock:
                self._st.update({"connected": False, "err": None if HAVE_SERIAL else "pyserial missing"})
            return
        if not HAVE_SERIAL:
            with self._lock:
                self._st.update({"connected": False, "err": "pyserial not installed"})
            print("[PICO] pyserial not installed -- counters disabled")
            return
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._run, name="pico-ctr4", daemon=True)
        self._thread.start()

    def stop(self):
        if self._thread and self._thread.is_alive():
            self._stop.set()
            self._thread.join(timeout=3.0)
        self._thread = None

    # ---------------- public reads ----------------
    def zero(self, ch: int | None = None):
        """Zero the host totals now and ask the Pico to zero on its next poll."""
        with self._lock:
            for i in range(NCH):
                if ch is not None and i != ch:
                    continue
                c = self._ch[i]
                c["base"] = 0; c["count"] = 0; c["total"] = 0.0; c["last_count"] = None
                self._hist[i].clear()
                self._zero_req.add(i)

    def get_static_writes(self) -> dict:
        """{static name: value} for the acq loop to stamp before evaluate()."""
        out = {}
        with self._lock:
            if not self._cfg.get("enabled"):
                return out
            for i, cc in enumerate(self._cfg["channels"]):
                if not cc.get("enabled"):
                    continue
                c = self._ch[i]
                rs = (cc.get("rateStatic") or "").strip()
                ts = (cc.get("totalStatic") or "").strip()
                if rs:
                    out[rs] = float(c["rate"])
                if ts:
                    out[ts] = float(c["total"])
        return out

    def status(self) -> dict:
        with self._lock:
            now = time.time()
            chans = []
            for i, cc in enumerate(self._cfg["channels"]):
                c = self._ch[i]
                chans.append({"ch": i, "name": cc.get("name"), "enabled": bool(cc.get("enabled")),
                              "count": int(c["base"] + c["count"]), "hz": round(c["hz"], 3),
                              "rate": round(c["rate"], 4), "total": round(c["total"], 4),
                              "period_us": int(c["period_us"]), "units": cc.get("units", "")})
            return {"version": VERSION, "enabled": bool(self._cfg.get("enabled")),
                    "connected": self._st["connected"], "port": self._st["port"],
                    "boot_id": self._st["boot_id"], "err": self._st["err"],
                    "rx_age_s": (round(now - self._st["last_rx"], 1) if self._st["last_rx"] else None),
                    "polls": self._st["polls"], "bad": self._st["bad"], "channels": chans}

    def brief(self) -> dict:
        """Small block for /api/diag."""
        with self._lock:
            return {"enabled": bool(self._cfg.get("enabled")), "connected": self._st["connected"],
                    "port": self._st["port"], "err": self._st["err"]}

    # ---------------- worker ----------------
    def _find_port(self) -> str | None:
        want = (self._cfg.get("port") or "auto").strip()
        if want and want.lower() != "auto":
            return want
        try:
            for p in list_ports.comports():
                if p.vid == PICO_VID:
                    return p.device
        except Exception:
            pass
        return None

    def _open(self):
        port = self._find_port()
        if not port:
            raise IOError("no Pico serial port found (set the port, or plug the Pico in)")
        ser = serial.Serial(port, 115200, timeout=0.5, write_timeout=0.5)
        time.sleep(0.2)
        ser.reset_input_buffer()
        ident = self._ask(ser, "?")
        if not ident or not ident.startswith("ID,MCC-CTR4"):
            ser.close()
            raise IOError(f"{port}: not an MCC-CTR4 (reply {ident!r})")
        f = ident.split(",")
        boot_id = f[3] if len(f) > 3 else None
        # push per-channel debounce
        for cc in self._cfg["channels"]:
            try:
                self._ask(ser, f"G,{int(cc['ch'])},{int(cc.get('gapUs') or 0)}")
            except Exception:
                pass
        with self._lock:
            self._st.update({"connected": True, "port": port, "boot_id": boot_id, "err": None})
        print(f"[PICO] MCC-CTR4 connected on {port} (boot {boot_id}, fw {f[2] if len(f) > 2 else '?'})")
        return ser

    @staticmethod
    def _ask(ser, cmd: str, want_prefix: str | None = None) -> str | None:
        ser.write((cmd + "\n").encode())
        deadline = time.time() + 1.0
        while time.time() < deadline:
            line = ser.readline().decode(errors="replace").strip()
            if not line:
                continue
            if cmd != "?" and line.startswith("ID,"):
                continue                    # boot banner mid-stream: the Pico just reset
            if want_prefix and not line.startswith(want_prefix):
                continue
            return line
        return None

    def _run(self):
        ser = None
        next_retry = 0.0
        while not self._stop.is_set():
            if ser is None:
                if time.time() < next_retry:
                    time.sleep(0.2)
                    continue
                try:
                    ser = self._open()
                except Exception as e:
                    with self._lock:
                        self._st.update({"connected": False, "err": str(e)})
                    next_retry = time.time() + 3.0
                    continue
            try:
                # zero requests first
                with self._lock:
                    zq = sorted(self._zero_req); self._zero_req.clear()
                for i in zq:
                    self._ask(ser, f"Z,{i}")
                line = self._ask(ser, "R", "C,")
                if line is None:
                    raise IOError("no reply to R")
                self._ingest(line)
            except Exception as e:
                with self._lock:
                    self._st.update({"connected": False, "err": f"link lost: {e}"})
                    self._st["bad"] += 1
                try:
                    ser.close()
                except Exception:
                    pass
                ser = None
                next_retry = time.time() + 2.0
                continue
            self._stop.wait(max(0.05, self._cfg.get("pollMs", 250) / 1000.0))
        try:
            if ser:
                ser.close()
        except Exception:
            pass
        with self._lock:
            self._st["connected"] = False

    def _ingest(self, line: str):
        f = line.split(",")
        if len(f) < 2 + 2 * NCH:
            with self._lock:
                self._st["bad"] += 1
            return
        now = time.time()
        win = float(self._cfg.get("rateWindowS") or 1.0)
        with self._lock:
            self._st["last_rx"] = now
            self._st["polls"] += 1
            for i in range(NCH):
                cc = self._cfg["channels"][i]
                c = self._ch[i]
                try:
                    cnt = int(f[2 + 2 * i]); per = int(f[3 + 2 * i])
                except ValueError:
                    continue
                if c["last_count"] is not None and cnt < c["last_count"]:
                    # Pico rebooted (or was zeroed on its side): keep the host total continuous
                    c["base"] += c["last_count"]
                    self._hist[i].clear()
                c["last_count"] = cnt
                c["count"] = cnt
                c["period_us"] = per
                total_cnt = c["base"] + cnt
                h = self._hist[i]
                h.append((now, total_cnt))
                while len(h) > 2 and now - h[0][0] > win:
                    h.popleft()
                hz = 0.0
                if per > 0:
                    if len(h) >= 2 and (h[-1][1] - h[0][1]) >= 2 and (h[-1][0] - h[0][0]) > 0:
                        hz = (h[-1][1] - h[0][1]) / (h[-1][0] - h[0][0])
                    else:
                        hz = 1e6 / per          # low flow: last period is the better estimate
                low = float(cc.get("lowCutHz") or 0.0)
                if hz < low:
                    hz = 0.0
                ppu = float(cc.get("pulsesPerUnit") or 1.0) or 1.0
                off = float(cc.get("hzOffset") or 0.0)
                c["hz"] = hz
                c["rate"] = ((hz + off) * 60.0 / ppu) if hz > 0 else 0.0
                c["total"] = total_cnt / ppu
