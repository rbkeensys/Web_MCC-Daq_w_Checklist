"""pico_counter.py -- MCC-CTR4 Raspberry Pi Pico pulse-counter client -- v2.0.1 (russ 11/19).

v2.0.1: "# ..." help lines (firmware 2.0.1 answers "?" with the ID line plus a help
list) are not counted as bad lines. Verified 11/18 against a real Pico on COM5.
v2.0.0: firmware 2.x counts in the Pico's PWM-slice hardware counters and
STREAMS one line per timer window (default 250 ms = 4 per second):
    W,<uptime_ms>,<dt_us>,<n0>,<n1>,<n2>,<n3>,<t0>,<t1>,<t2>,<t3>
    n = pulses in that window, dt_us = the window's true length,
    t = running total since boot/zero (monotonic, so a dropped line loses nothing).
The Pi does the engineering here: Hz = sum(n) / sum(dt) over the last
rateWindowS worth of windows, and the rest as before.
(v1.0.0, 11/16, polled an interrupt-counting firmware with "R"; firmware 1.x is
refused at connect with a clear error -- flash pi_port/pico_ctr4/main.py 2.x.)

This module owns ONE background thread that keeps the port open, tells the Pico
the window length (pollMs) and turns on streaming, then listens:

    hz    = pulses / seconds over rateWindowS of windows (lossless: the counts
            come from hardware and every window is accounted for)
    rate  = (hz + hzOffset) * 60 / pulsesPerUnit   [units per minute], 0 when hz is 0
            -- the Shineui SMWF-0420A is f = 50*Q - 3 Hz, i.e. 3000 pulses/L and
               hzOffset +3 (its table: 22/47/72/97 Hz at 0.5/1/1.5/2 L/min)
    total = (host base + Pico total) / pulsesPerUnit   [units]; survives a Pico
            reboot (total drop => base += last total) and is zeroed by zero().

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
                 "totalStatic":"picoTotal0", "lowCutHz":5.0}, ... ]
}
pollMs is the Pico's window (timer) period, 50..5000 ms. rateWindowS is how
much of the stream the rate is averaged over (at 97 Hz one 250 ms window holds
~24 pulses, so a single window quantizes to 4 Hz; 1 s brings that to 1 Hz).
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

VERSION = "2.0.1"
PICO_VID = 0x2E8A
NCH = 4
FW_MAJOR = 2                        # firmware protocol this client speaks

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
        "lowCutHz": 5.0,                # below this the rate is reported as 0 (sensor floor)
    }


def default_config() -> dict:
    return {"enabled": False, "port": "auto", "pollMs": 250, "rateWindowS": 1.0,
            "channels": [default_channel(i) for i in range(NCH)]}


def _blank_channel() -> dict:
    return {"pico_total": 0, "base": 0, "hz": 0.0, "rate": 0.0, "total": 0.0,
            "last_n": 0, "dt_ms": 0.0, "last_total": None}


class PicoCounterManager:
    def __init__(self):
        self._cfg = default_config()
        self._lock = threading.Lock()
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        self._zero_req: set[int] = set()
        self._path: Path | None = None
        # live state
        self._st = {"connected": False, "port": None, "boot_id": None, "fw": None, "err": None,
                    "last_rx": 0.0, "windows": 0, "bad": 0}
        self._ch = [_blank_channel() for _ in range(NCH)]
        self._hist: list[deque] = [deque() for _ in range(NCH)]   # (n, dt_s) per window, newest last

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
                        cfg["channels"][i].pop("gapUs", None)   # v1 debounce: gone with the IRQ firmware
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
                cfg["channels"][i].pop("gapUs", None)
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
        """Queue a zero: the worker sends Z,<ch> and resets the host state once the
        Pico has acknowledged (resetting first would make the Pico's total drop
        look like a reboot and get added straight back). Takes effect within one
        window (pollMs)."""
        with self._lock:
            for i in range(NCH):
                if ch is None or i == ch:
                    self._zero_req.add(i)

    def _zero_host(self, i: int):
        c = self._ch[i]
        c["base"] = 0; c["pico_total"] = 0; c["total"] = 0.0; c["last_total"] = None
        self._hist[i].clear()

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
                              "count": int(c["base"] + c["pico_total"]), "hz": round(c["hz"], 3),
                              "rate": round(c["rate"], 4), "total": round(c["total"], 4),
                              "last_n": int(c["last_n"]), "dt_ms": round(c["dt_ms"], 1),
                              "units": cc.get("units", "")})
            return {"version": VERSION, "enabled": bool(self._cfg.get("enabled")),
                    "connected": self._st["connected"], "port": self._st["port"],
                    "boot_id": self._st["boot_id"], "fw": self._st["fw"], "err": self._st["err"],
                    "rx_age_s": (round(now - self._st["last_rx"], 1) if self._st["last_rx"] else None),
                    "windows": self._st["windows"], "bad": self._st["bad"], "channels": chans}

    def brief(self) -> dict:
        """Small block for /api/diag."""
        with self._lock:
            return {"enabled": bool(self._cfg.get("enabled")), "connected": self._st["connected"],
                    "port": self._st["port"], "fw": self._st["fw"], "err": self._st["err"]}

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

    @staticmethod
    def _ask(ser, cmd: str, want=("OK", "ERR")) -> str | None:
        """Send a command and return the first reply line starting with one of `want`.
        Stream lines (W,...) that arrive meanwhile are skipped, not lost: the
        worker re-reads the stream right after, and totals are cumulative."""
        ser.write((cmd + "\n").encode())
        deadline = time.time() + 1.0
        while time.time() < deadline:
            line = ser.readline().decode(errors="replace").strip()
            if not line:
                continue
            if line.startswith(want):
                return line
        return None

    def _configure(self, ser):
        """Push window length and turn streaming on (also after a Pico reboot)."""
        self._ask(ser, f"W,{int(self._cfg.get('pollMs') or 250)}")
        self._ask(ser, "S,1")

    def _open(self):
        port = self._find_port()
        if not port:
            raise IOError("no Pico serial port found (set the port, or plug the Pico in)")
        ser = serial.Serial(port, 115200, timeout=0.5, write_timeout=0.5)
        time.sleep(0.2)
        ser.reset_input_buffer()
        ident = self._ask(ser, "?", ("ID,",))
        if not ident or not ident.startswith("ID,MCC-CTR4"):
            ser.close()
            raise IOError(f"{port}: not an MCC-CTR4 (reply {ident!r})")
        f = ident.split(",")
        fw = f[2] if len(f) > 2 else "?"
        boot_id = f[3] if len(f) > 3 else None
        try:
            major = int(fw.split(".")[0])
        except ValueError:
            major = 0
        if major != FW_MAJOR:
            ser.close()
            raise IOError(f"{port}: MCC-CTR4 firmware {fw}, this server needs {FW_MAJOR}.x "
                          f"(flash pi_port/pico_ctr4/main.py)")
        self._configure(ser)
        with self._lock:
            self._st.update({"connected": True, "port": port, "boot_id": boot_id, "fw": fw, "err": None})
        print(f"[PICO] MCC-CTR4 connected on {port} (boot {boot_id}, fw {fw}, "
              f"window {self._cfg.get('pollMs')} ms)")
        return ser

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
                    with self._lock:
                        self._st["last_rx"] = time.time()
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
                    rep = self._ask(ser, f"Z,{i}")        # W lines read meanwhile carry the OLD totals: skipped
                    if rep == "OK":
                        with self._lock:
                            self._zero_host(i)            # every W line from here on is post-zero
                    else:
                        print(f"[PICO] zero ch{i}: no OK ({rep!r})")
                line = ser.readline().decode(errors="replace").strip()   # <= 0.5 s block
                if line.startswith("W,"):
                    self._ingest(line)
                elif line.startswith("ID,"):
                    # boot banner mid-stream: the Pico just reset. Its window/stream
                    # settings are back at defaults, so push ours again; the total
                    # drop is handled in _ingest (base += last total).
                    f = line.split(",")
                    with self._lock:
                        self._st["boot_id"] = f[3] if len(f) > 3 else None
                    self._configure(ser)
                    print("[PICO] MCC-CTR4 rebooted (boot %s) -- reconfigured" % self._st["boot_id"])
                elif line and not line.startswith("#"):     # "# ..." = help text (fw 2.0.1 "?"/"H")
                    with self._lock:
                        self._st["bad"] += 1
                with self._lock:
                    silent = time.time() - self._st["last_rx"]
                limit = max(2.0, 3.0 * (self._cfg.get("pollMs") or 250) / 1000.0)
                if silent > limit:
                    raise IOError(f"no W line for {silent:.1f} s")
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
        try:
            if ser:
                self._ask(ser, "S,0")
                ser.close()
        except Exception:
            pass
        with self._lock:
            self._st["connected"] = False

    def _ingest(self, line: str):
        f = line.split(",")
        if len(f) != 3 + 2 * NCH:
            with self._lock:
                self._st["bad"] += 1
            return
        try:
            dt_us = int(f[2])
            ns = [int(f[3 + i]) for i in range(NCH)]
            ts = [int(f[3 + NCH + i]) for i in range(NCH)]
        except ValueError:
            with self._lock:
                self._st["bad"] += 1
            return
        if dt_us <= 0:
            return
        dt_s = dt_us / 1e6
        win = float(self._cfg.get("rateWindowS") or 1.0)
        with self._lock:
            self._st["last_rx"] = time.time()
            self._st["windows"] += 1
            for i in range(NCH):
                cc = self._cfg["channels"][i]
                c = self._ch[i]
                n, t = ns[i], ts[i]
                if c["last_total"] is not None and t < c["last_total"]:
                    # Pico rebooted (or was zeroed on its side): keep the host total continuous
                    c["base"] += c["last_total"]
                    self._hist[i].clear()
                c["last_total"] = t
                c["pico_total"] = t
                c["last_n"] = n
                c["dt_ms"] = dt_us / 1000.0
                h = self._hist[i]
                h.append((n, dt_s))
                span = sum(d for _, d in h)
                while len(h) > 1 and span - h[0][1] >= win:
                    span -= h.popleft()[1]
                pulses = sum(k for k, _ in h)
                hz = pulses / span if span > 0 else 0.0
                low = float(cc.get("lowCutHz") or 0.0)
                if hz < low:
                    hz = 0.0
                ppu = float(cc.get("pulsesPerUnit") or 1.0) or 1.0
                off = float(cc.get("hzOffset") or 0.0)
                c["hz"] = hz
                c["rate"] = ((hz + off) * 60.0 / ppu) if hz > 0 else 0.0
                c["total"] = (c["base"] + t) / ppu
