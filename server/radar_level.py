"""radar_level.py -- 80GHz Modbus-RTU radar level transmitter client -- v1.0.0 (russ 11/17).

The radar (slave 1, 9600 N81, FC03 only) answers a 2-register read at 0x0000:
    reg0 = distance from the sensor face (mm), reg1 = range - distance.
Bench facts (11/13 characterization on COM4): internal update ~1.7 Hz, each
poll takes the sensor ~150 ms to answer, +/-1 mm on a still target, and it
CLAMPS instead of erroring: dist <= blindMM (200) = target inside the blind
zone, dist >= rangeMM (3000) = LOST ECHO (one-sample spikes while the surface
is disturbed) -- a lost echo must never reach the level law as a real reading.

One background thread polls the port and publishes BY NAME into expression
statics (same path as pico_counter.py / the E-TC DINs):
    distStatic ("radarDistMM") = last GOOD distance (mm; survives dropouts)
    ageStatic  ("radarAgeS")   = seconds since the last good reading
    okStatic   ("radarOK")     = 1 while fresh (age <= maxAgeS) and valid
Level conversion + calibration (mm -> mL) stays in the EXPRESSIONS, where it
is live-tunable and visible (SensorMux: radarLevelML / levelSrcSel).

Config lives in config/radar_level.json:
{ "enabled": true, "port": "/dev/serial/by-id/usb-...", "pollMs": 400,
  "slave": 1, "maxAgeS": 5.0, "blindMM": 201, "lostMM": 2999 }
Set the port EXPLICITLY (by-id on the Pi): the rig has other RS485 USB
adapters (stepper 38400, VFD) and generic FTDI/CH340 VIDs cannot tell them
apart. "auto" probes every port with one harmless FC03 read and takes the
first valid slave-1 reply -- bench convenience, not for the rig.
"""
from __future__ import annotations

import json
import threading
import time
from pathlib import Path

VERSION = "1.0.0"

try:
    import serial                       # pyserial
    from serial.tools import list_ports
    HAVE_SERIAL = True
except Exception:                       # pragma: no cover
    serial = None
    list_ports = None
    HAVE_SERIAL = False


def _crc16(data: bytes) -> bytes:
    crc = 0xFFFF
    for b in data:
        crc ^= b
        for _ in range(8):
            crc = (crc >> 1) ^ 0xA001 if crc & 1 else crc >> 1
    return bytes((crc & 0xFF, crc >> 8))


def default_config() -> dict:
    return {"enabled": False, "port": "", "pollMs": 400, "slave": 1,
            "maxAgeS": 5.0, "blindMM": 201.0, "lostMM": 2999.0,
            "distStatic": "radarDistMM", "ageStatic": "radarAgeS", "okStatic": "radarOK"}


class RadarLevelManager:
    def __init__(self):
        self._cfg = default_config()
        self._lock = threading.Lock()
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        self._path: Path | None = None
        self._st = {"connected": False, "port": None, "err": None,
                    "polls": 0, "bad": 0, "lost": 0, "blind": 0,
                    "last_rx": 0.0, "last_good": 0.0, "dist_mm": None, "raw_mm": None}

    # ---------------- config ----------------
    def load(self, path: Path):
        self._path = path
        cfg = default_config()
        try:
            if path.exists():
                cfg.update(json.loads(path.read_text(encoding="utf-8")) or {})
        except Exception as e:
            print(f"[RADAR] config load failed ({e}) -- defaults in use")
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
        cfg.update({k: v for k, v in (data or {}).items() if k in cfg})
        cfg["pollMs"] = int(max(150, min(5000, int(cfg.get("pollMs") or 400))))
        cfg["slave"] = int(max(1, min(250, int(cfg.get("slave") or 1))))
        cfg["maxAgeS"] = float(max(1.0, min(60.0, float(cfg.get("maxAgeS") or 5.0))))
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
            print("[RADAR] pyserial not installed -- radar disabled")
            return
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._run, name="radar-level", daemon=True)
        self._thread.start()

    def stop(self):
        if self._thread and self._thread.is_alive():
            self._stop.set()
            self._thread.join(timeout=3.0)
        self._thread = None

    # ---------------- public reads ----------------
    def get_static_writes(self) -> dict:
        """{static name: value} stamped by the acq loop before evaluate()."""
        out = {}
        with self._lock:
            if not self._cfg.get("enabled"):
                return out
            now = time.time()
            age = (now - self._st["last_good"]) if self._st["last_good"] else 9999.0
            ok = 1.0 if (self._st["dist_mm"] is not None and age <= float(self._cfg["maxAgeS"])) else 0.0
            ds = (self._cfg.get("distStatic") or "").strip()
            ag = (self._cfg.get("ageStatic") or "").strip()
            ko = (self._cfg.get("okStatic") or "").strip()
            if ds and self._st["dist_mm"] is not None:
                out[ds] = float(self._st["dist_mm"])
            if ag:
                out[ag] = float(min(age, 9999.0))
            if ko:
                out[ko] = ok
        return out

    def status(self) -> dict:
        with self._lock:
            now = time.time()
            return {"version": VERSION, "enabled": bool(self._cfg.get("enabled")),
                    "connected": self._st["connected"], "port": self._st["port"],
                    "err": self._st["err"], "polls": self._st["polls"], "bad": self._st["bad"],
                    "lost_echo": self._st["lost"], "blind": self._st["blind"],
                    "dist_mm": self._st["dist_mm"], "raw_mm": self._st["raw_mm"],
                    "rx_age_s": (round(now - self._st["last_rx"], 1) if self._st["last_rx"] else None),
                    "good_age_s": (round(now - self._st["last_good"], 1) if self._st["last_good"] else None)}

    def brief(self) -> dict:
        with self._lock:
            return {"enabled": bool(self._cfg.get("enabled")), "connected": self._st["connected"],
                    "port": self._st["port"], "err": self._st["err"], "dist_mm": self._st["dist_mm"]}

    # ---------------- worker ----------------
    def _req(self) -> bytes:
        f = bytes((int(self._cfg["slave"]), 3, 0, 0, 0, 2))
        return f + _crc16(f)

    def _probe(self, port: str) -> bool:
        try:
            ser = serial.Serial(port, 9600, bytesize=8, parity="N", stopbits=1,
                                timeout=0.4, write_timeout=0.4)
        except Exception:
            return False
        try:
            ser.reset_input_buffer()
            ser.write(self._req())
            r = ser.read(9)
            return len(r) == 9 and r[0] == int(self._cfg["slave"]) and r[1] == 3 \
                and _crc16(r[:-2]) == r[-2:]
        except Exception:
            return False
        finally:
            try:
                ser.close()
            except Exception:
                pass

    def _find_port(self) -> str | None:
        want = (self._cfg.get("port") or "").strip()
        if want and want.lower() != "auto":
            return want
        try:
            for p in list_ports.comports():
                if self._probe(p.device):
                    return p.device
        except Exception:
            pass
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
                    port = self._find_port()
                    if not port:
                        raise IOError("no radar port (set the by-id port in the Radar editor)")
                    ser = serial.Serial(port, 9600, bytesize=8, parity="N", stopbits=1,
                                        timeout=0.5, write_timeout=0.5)
                    with self._lock:
                        self._st.update({"connected": True, "port": port, "err": None})
                    print(f"[RADAR] connected on {port}")
                except Exception as e:
                    with self._lock:
                        self._st.update({"connected": False, "err": str(e)})
                    next_retry = time.time() + 3.0
                    continue
            try:
                ser.reset_input_buffer()
                ser.write(self._req())
                r = ser.read(9)
                now = time.time()
                with self._lock:
                    self._st["polls"] += 1
                    if len(r) == 9 and r[1] == 3 and _crc16(r[:-2]) == r[-2:]:
                        dist = float(int.from_bytes(r[3:5], "big"))
                        self._st["last_rx"] = now
                        self._st["raw_mm"] = dist
                        if dist >= float(self._cfg["lostMM"]):
                            self._st["lost"] += 1          # lost echo: HOLD last good
                        else:
                            if dist <= float(self._cfg["blindMM"]):
                                self._st["blind"] += 1     # blind-zone clamp: real but pinned
                            self._st["dist_mm"] = dist
                            self._st["last_good"] = now
                    else:
                        self._st["bad"] += 1
                        if len(r) == 0:
                            raise IOError("no reply")
            except Exception as e:
                with self._lock:
                    self._st.update({"connected": False, "err": f"link lost: {e}"})
                try:
                    ser.close()
                except Exception:
                    pass
                ser = None
                next_retry = time.time() + 2.0
                continue
            self._stop.wait(max(0.1, self._cfg.get("pollMs", 400) / 1000.0))
        try:
            if ser:
                ser.close()
        except Exception:
            pass
        with self._lock:
            self._st["connected"] = False
