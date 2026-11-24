"""radar_level.py -- 80GHz Modbus-RTU radar level transmitter client -- v1.6.0 (russ 11/24).

v1.6.0: REACQUIRE CONFIRMATION (russ 11/24 "the radar is jumping a lot causing
false readings forcing the pump to extremes"): during the first boiling RUN the
sight tube flickered with steam/condensate echoes -- the driver cycled dropout ->
single bogus mid-tube echo accepted -> pub RESEEDED from that one reading and
radarOK restored -> the level law stepped hundreds of mL instantly (yEvapLevRaw
= radarLevelML with no smoothing, and radarSnapML snapped feedInvEst to the lie
as well) -> feed pump slammed -> echo lost again -> back to dead-reckon. Session
counters: 1894 lost / 1475 blind-pins / 166 doubles / 40 reseeds. The hole: after
a >5 s gap ONE in-window reading restored trust. Now a reacquire (any gap > 5 s
since the last good reading, first acquisition included) must present confirmN
CONSECUTIVE in-window readings spanning <= confirmBandMM before anything is
published or radarOK can return: a one-poll liar can never re-arm the level law,
and the new lock must be a STABLE echo. Any reject (lost/blind/double) restarts
the count. Genuine reacquires cost confirmN-1 polls (~0.75 s at 250 ms) -- noise
against the 25 s fusion tau. confirmN 0/1 disables. Status: "reacq" = confirmed
reacquisitions, "pend" = readings collected toward the current confirmation.

PLUS TRACKING ACROSS DROPOUTS (russ 11/24 "add that tracking over jumps up/down,
that worked fine before"): the v1.3.0 jump-cancel used to die at every >5 s gap
(continuity reset), so a jump that STRADDLED a dropout -- the entire boil
pattern -- reseeded the published distance to the new lock instead of being
absorbed. Now a confirmed reacquire KEEPS prev_med/offs/pub: the step from the
pre-dropout value to the confirmed new lock runs through the jump-cancel, a
bogus lock is absorbed into offs while the published distance continues
seamlessly and keeps tracking the lock's relative motion, the jump-back cancels
it, offsetLeakMMS re-anchors any residual, and the offset cap still bails out
when the absorb was actually a real move. offsetMaxMM default 30 -> 60: one
dropout-spanning absorb of a mid-tube bogus lock (~50 mm on 11/24) must live
under the cap or the cap instantly defeats the tracking; an 11/20-style ratchet
still dies at 60 (that incident built to 152.8). Continuity resets only on true
first acquisition, after a cap reseed, or with confirmation disabled.

v1.5.0: DOUBLE-BOUNCE RATIO GATE + OFFSET RESEED CAP + offs export (russ 11/20
"we have to have mechanisms to catch this until I get a better tube"). Incident:
during the 11/20 fill the echo was lost for long stretches (bottom-of-tube
double-bounce zone) with brief reacquisitions; each sub-5s reacquire saw the
real catch-up as a >jumpMM step and ATE IT into offs_mm, which built to -152.8
mm = the app showed ~1315 mL while the sight tube sat at ~2730 (75%). Three
mechanisms:
  (1) RATIO GATE (ratioTolPct, default 8, 0=off): a raw reading within +/-tol%
      of 2x the current published distance IS the double bounce (11/19 tall-tube
      data: raw/filtered ratio was EXACTLY 2.00 on all 19 jumps) -- held like a
      lost echo, counted in status "dbl". Matters most at HIGH level: below a
      true ~253 mm the double lands INSIDE the 215-505 trust window and would
      otherwise reach the median/jump-cancel (the lost gate only catches doubles
      of readings deeper than ~253).
  (2) OFFSET RESEED CAP (offsetMaxMM, default 30, 0=off): a genuine alternate-
      echo offset is roughly constant and cancels on the jump-back; an offset
      that GROWS past the cap means the jump-cancel is eating a real move (the
      11/20 -152.8). At the cap the filter drops its continuity claim and
      reseeds from the live reading (counted in status "reseeds").
  (3) offs_mm is now stamped to a static (offsStatic, default "radarOffsMM") so
      the UI can chart it and expressions can alarm on a big standing offset.

v1.4.0: BLIND-ZONE GATE (russ 11/17 max-reading campaign: "we must know your max
reading"): measured on the rig -- readings clean down to ~215 mm, intermittent
clamps 207-212, HARD PIN at 200-201 with the surface still rising (a frozen lie
at ~3250 mL). Readings <= blindMM are now HELD like lost echoes instead of
published: radarOK drops, fusion coasts on dead-reckon, the frozen clamp never
reaches the level law. blindMM default 201 -> 215 (the measured trust edge).
Trustworthy ceiling at the 11/17 cal: dist 215 =~ 3120 mL.

v1.3.0: JUMP-CANCEL offset tracker (russ 11/17: "subtracts the jump size and
keeps going from what we know is correct" -- the empty-down jump went UP, kept
TRACKING the inflow in parallel, then jumped back: an alternate-echo lock, the
sensor rides a second reflection with a ~constant offset). A median-to-median
step > jumpMM (default 10; physical max is ~0.6 mm/poll at 500 rpm) is
impossible, so the step is absorbed into a running offset and the published
level continues seamlessly from the last known-correct value -- still tracking
real motion through the episode. The jump-back cancels the offset; any residual
asymmetry leaks out at offsetLeakMMS (default 0.1 mm/s). Offset resets with the
window on reconnect/dropout re-seed, and is reported in status as "offs_mm".
jumpMM=0 disables. Chain: median -> jump-cancel -> slew limit.

v1.2.0: SLEW LIMITER (russ 11/17 "if the height jumps that large amount you need
to remove it from the level" -- a jump outlived the median window during the
empty-down): the published distance may move at most maxSlewMMS (default 6 mm/s)
from its previous value. PHYSICS: the level is liquid in a tube -- the feed pump
flat out (500 rpm =~ 23 mL/s / 9.27 mL/mm) moves it ~2.5 mm/s, so 6 mm/s passes
every real move unlagged while a spike of ANY duration is crushed to a crawl and
pulled straight back (net effect ~zero). Re-seeds directly after a >5 s good-gap
(dropout recovery must not crawl from a stale value). 0 = off.

v1.1.0: MEDIAN DESPIKE (russ 11/17 cal run "we had some weird jumps"): the sensor
occasionally returns 1-2 polls of mid-range garbage (sight-tube multipath -- e.g.
270 -> 293 -> 266 mm with a still surface). dist published is now the MEDIAN of
the last medianN good readings (default 7 =~ 2.8 s at 400 ms polls): up to 3
consecutive liars get voted out entirely; real level moves just arrive ~1.4 s
late, nothing against the 25 s fusion tau. medianN=1 disables. raw_mm in status
stays unfiltered for diagnostics.

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

VERSION = "1.6.0"

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
            "maxAgeS": 5.0, "blindMM": 215.0, "lostMM": 2999.0, "medianN": 7,
            "maxSlewMMS": 6.0, "jumpMM": 10.0, "offsetLeakMMS": 0.1,
            "ratioTolPct": 8.0, "offsetMaxMM": 60.0,
            "confirmN": 4, "confirmBandMM": 8.0,
            "distStatic": "radarDistMM", "ageStatic": "radarAgeS", "okStatic": "radarOK",
            "offsStatic": "radarOffsMM"}


class RadarLevelManager:
    def __init__(self):
        self._cfg = default_config()
        self._lock = threading.Lock()
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        self._path: Path | None = None
        self._st = {"connected": False, "port": None, "err": None,
                    "polls": 0, "bad": 0, "lost": 0, "blind": 0, "dbl": 0, "reseeds": 0,
                    "reacq": 0, "pend": 0,
                    "last_rx": 0.0, "last_good": 0.0, "dist_mm": None, "raw_mm": None,
                    "offs_mm": 0.0}

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
        n = int(cfg.get("medianN") or 7)
        cfg["medianN"] = max(1, min(15, n | 1))   # odd, 1..15 (1 = filter off)
        cfg["maxSlewMMS"] = float(max(0.0, min(100.0, float(cfg.get("maxSlewMMS", 6.0)))))
        cfg["jumpMM"] = float(max(0.0, min(500.0, float(cfg.get("jumpMM", 10.0)))))
        cfg["offsetLeakMMS"] = float(max(0.0, min(10.0, float(cfg.get("offsetLeakMMS", 0.1)))))
        cfg["ratioTolPct"] = float(max(0.0, min(30.0, float(cfg.get("ratioTolPct", 8.0)))))
        cfg["offsetMaxMM"] = float(max(0.0, min(300.0, float(cfg.get("offsetMaxMM", 60.0)))))
        cfg["confirmN"] = int(max(0, min(15, int(cfg.get("confirmN", 4)))))
        cfg["confirmBandMM"] = float(max(0.0, min(100.0, float(cfg.get("confirmBandMM", 8.0)))))
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
            om = (self._cfg.get("offsStatic") or "").strip()
            if om:
                out[om] = float(self._st.get("offs_mm", 0.0))
        return out

    def status(self) -> dict:
        with self._lock:
            now = time.time()
            return {"version": VERSION, "enabled": bool(self._cfg.get("enabled")),
                    "connected": self._st["connected"], "port": self._st["port"],
                    "err": self._st["err"], "polls": self._st["polls"], "bad": self._st["bad"],
                    "lost_echo": self._st["lost"], "blind": self._st["blind"],
                    "dbl": self._st.get("dbl", 0), "reseeds": self._st.get("reseeds", 0),
                    "reacq": self._st.get("reacq", 0), "pend": self._st.get("pend", 0),
                    "dist_mm": self._st["dist_mm"], "raw_mm": self._st["raw_mm"],
                    "offs_mm": self._st.get("offs_mm", 0.0),
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
        window: list[float] = []   # last medianN GOOD readings (despike vote)
        pub: float | None = None   # slew-limited published distance
        pub_t = 0.0                # time of the previous publish (slew dt)
        prev_med: float | None = None  # previous median (jump-cancel step detect)
        offs = 0.0                 # running alternate-echo offset (subtracted)
        confirm: list[tuple[float, float]] = []  # (t, mm) reacquire candidates (v1.6.0)
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
                        # DOUBLE-BOUNCE RATIO GATE (v1.5.0): a reading at ~2x
                        # the current published distance IS the second bounce
                        # (measured ratio EXACTLY 2.00 on the 11/19 run) -- hold
                        # it like a lost echo. The lost gate alone only catches
                        # doubles of surfaces deeper than lostMM/2: at HIGH
                        # level the double lands INSIDE the trust window.
                        # Only while continuity holds (<5 s since the last good
                        # reading, same horizon as the dropout reseed): after a
                        # long blind stretch pub is stale and a REAL reading
                        # near 2x stale-pub must not be rejected forever.
                        rtol = float(self._cfg.get("ratioTolPct") or 0.0)
                        is_dbl = (rtol > 0.0 and pub is not None and pub > 0.0
                                  and (now - (self._st["last_good"] or 0.0)) < 5.0
                                  and abs(dist - 2.0 * pub) <= 2.0 * pub * rtol / 100.0)
                        if is_dbl:
                            self._st["dbl"] += 1
                            confirm.clear()           # a reject breaks the reacquire run
                            self._st["pend"] = 0
                        elif dist >= float(self._cfg["lostMM"]) or dist <= float(self._cfg["blindMM"]):
                            # OUTSIDE THE TRUST WINDOW -- hold last good, let
                            # radarOK age out, fusion coasts on dead-reckon.
                            # Far side: lost echo / double bounce. Near side
                            # (v1.4.0): blind-zone clamp -- the sensor PINS at
                            # ~200 mm while the surface keeps rising (measured
                            # 11/17: clean to 215, pinned at 200-201 = a frozen
                            # lie at ~3250 mL that must never reach the law).
                            if dist >= float(self._cfg["lostMM"]):
                                self._st["lost"] += 1
                            else:
                                self._st["blind"] += 1
                            confirm.clear()           # a reject breaks the reacquire run
                            self._st["pend"] = 0
                        else:
                            # REACQUIRE CONFIRMATION (v1.6.0): after any >5 s
                            # good-gap (dropout or first acquisition), ONE
                            # in-window echo must not restore trust -- during
                            # the 11/24 boil each flicker-reacquire reseeded pub
                            # from a single bogus echo, radarOK snapped back and
                            # the level law (+ feedInvEst via radarSnapML)
                            # stepped to the lie, slamming the feed pump. Hold
                            # until confirmN CONSECUTIVE in-window readings
                            # agree within confirmBandMM, then reseed from them.
                            gap = now - (self._st["last_good"] or 0.0)
                            cn = int(self._cfg.get("confirmN") or 0)
                            if cn > 1 and gap > 5.0:
                                stale = max(2.0, 3.0 * float(self._cfg.get("pollMs", 400)) / 1000.0)
                                if confirm and (now - confirm[-1][0]) > stale:
                                    confirm.clear()   # polls stopped mid-run: start over
                                confirm.append((now, dist))
                                del confirm[:-cn]
                                band = float(self._cfg.get("confirmBandMM") or 0.0)
                                ds_c = [c[1] for c in confirm]
                                if band > 0.0 and (max(ds_c) - min(ds_c)) > band:
                                    confirm[:] = confirm[-1:]   # disagreement: newest only
                                self._st["pend"] = len(confirm)
                                if len(confirm) < cn:
                                    raise_hold = True   # not yet trusted -- hold
                                else:
                                    raise_hold = False
                                    self._st["reacq"] += 1
                                    # seed the despike vote with the confirm run
                                    # (all but the current sample -- it is
                                    # appended by the normal path below)
                                    window[:] = [c[1] for c in confirm][:-1]
                                    confirm.clear()
                                    self._st["pend"] = 0
                            else:
                                raise_hold = False
                                confirm.clear()
                                self._st["pend"] = 0
                            if not raise_hold:
                                # MEDIAN DESPIKE (v1.1.0): vote out 1-3 poll liars
                                n = int(self._cfg.get("medianN") or 1)
                                window.append(dist)
                                del window[:-n]
                                med = sorted(window)[len(window) // 2]
                                # TRACKING ACROSS DROPOUTS (v1.6.0, russ 11/24
                                # "add that tracking over jumps up/down, that
                                # worked fine before"): a confirmed reacquire
                                # KEEPS continuity -- prev_med/offs/pub survive
                                # the gap, so the med-to-med step vs the pre-
                                # dropout value runs through the jump-cancel
                                # below: a bogus new lock is absorbed into offs
                                # and the published distance continues from the
                                # last known-correct value, still tracking the
                                # lock's relative motion; the leak re-anchors
                                # and the offset cap bails out a real move.
                                # Continuity only resets when there is nothing
                                # to carry (first acquisition / post-cap
                                # reseed) or confirmation is disabled.
                                if gap > 5.0 and (cn <= 1 or pub is None):
                                    prev_med, offs, pub = None, 0.0, None
                                # JUMP-CANCEL (v1.3.0): a med-to-med step beyond
                                # jumpMM is physically impossible (alternate-echo
                                # lock) -- absorb it into the offset so the level
                                # keeps going from the last known-correct value and
                                # still tracks real motion; the jump-back cancels
                                # it, leak bleeds any residual asymmetry.
                                jump = float(self._cfg.get("jumpMM") or 0.0)
                                if jump > 0.0 and prev_med is not None:
                                    step = med - prev_med
                                    if abs(step) > jump:
                                        offs += step
                                    leak = float(self._cfg.get("offsetLeakMMS") or 0.0) \
                                        * max(0.0, now - pub_t)
                                    offs -= max(-leak, min(leak, offs))
                                # OFFSET RESEED CAP (v1.5.0): a real alternate-echo
                                # offset is ~constant and cancels on the jump-back;
                                # one that GROWS past the cap means the jump-cancel
                                # is eating a real move (11/20: repeated sub-5s
                                # reacquisitions during the fill built -152.8 mm and
                                # the app showed 1315 mL against a 75% sight tube).
                                # Drop the continuity claim, reseed from the live
                                # reading.
                                omax = float(self._cfg.get("offsetMaxMM") or 0.0)
                                if omax > 0.0 and abs(offs) > omax:
                                    self._st["reseeds"] += 1
                                    offs = 0.0
                                    pub = None
                                prev_med = med
                                corr = med - offs
                                # SLEW LIMITER (v1.2.0): the level physically moves
                                # <= ~2.5 mm/s -- crush any surviving jump to a
                                # maxSlewMMS crawl
                                slew = float(self._cfg.get("maxSlewMMS") or 0.0)
                                if pub is None or slew <= 0.0:
                                    pub = corr
                                else:
                                    lim = slew * max(0.0, now - pub_t)
                                    pub += max(-lim, min(lim, corr - pub))
                                pub_t = now
                                self._st["offs_mm"] = round(offs, 1)
                                self._st["dist_mm"] = round(pub, 1)
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
