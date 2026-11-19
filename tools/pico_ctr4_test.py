#!/usr/bin/env python3
"""pico_ctr4_test.py -- v2.0.1 (russ 11/19: ignore the firmware's "# ..." help lines)

Host-side checker for the MCC-CTR4 Pico pulse counter, firmware 2.x
(pi_port/pico_ctr4/main.py: PWM-slice hardware counters, one streamed line per
timer window). Finds the Pico's USB serial port, sets the window, and prints
each window as it arrives: pulses in the window, Hz, running total, and L/min
for an SMWF-0420A (f = 50*Q - 3  =>  Q = (f + 3) / 50, valid 0.4..2.0 L/min;
0 below ~5 Hz).

    python3 tools/pico_ctr4_test.py                 # auto-find the Pico, 250 ms windows
    python3 tools/pico_ctr4_test.py /dev/ttyACM0    # or name the port
    python3 tools/pico_ctr4_test.py --zero          # zero the totals first
    python3 tools/pico_ctr4_test.py --window 1000   # 1 s windows (1 Hz resolution)
    python3 tools/pico_ctr4_test.py --avg 4         # average Hz over the last 4 windows
    python3 tools/pico_ctr4_test.py --inject 37     # no-wire self-test: step each channel's hardware
                                                    # counter by 37 (T command) and check the total
                                                    # moves by exactly 37, then exit

Needs pyserial (the Pi venv already has it for the VFD/stepper drivers).
"""
import sys
import time
import argparse
from collections import deque

import serial
from serial.tools import list_ports

PICO_VID = 0x2E8A          # Raspberry Pi (MicroPython USB CDC is VID 2E8A, PID 0005)
SMWF_SLOPE = 50.0          # Hz per L/min
SMWF_OFFSET = 3.0          # Hz
NCH = 4


def find_port():
    for p in list_ports.comports():
        if p.vid == PICO_VID:
            return p.device
    for p in list_ports.comports():
        if "ACM" in p.device or "Pico" in (p.description or ""):
            return p.device
    return None


def smwf_lpm(hz):
    if hz < 5.0:
        return 0.0
    return (hz + SMWF_OFFSET) / SMWF_SLOPE


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("port", nargs="?", help="serial port (default: auto-detect by VID 2E8A)")
    ap.add_argument("--zero", action="store_true", help="zero all totals before listening")
    ap.add_argument("--window", type=int, default=250, help="Pico window (timer) period ms, 50..5000 (default 250)")
    ap.add_argument("--avg", type=int, default=4, help="windows to average Hz over (default 4 = 1 s at 250 ms)")
    ap.add_argument("--inject", type=int, help="self-test: advance each channel's counter by N via T,<ch>,N and verify")
    a = ap.parse_args()

    port = a.port or find_port()
    if not port:
        sys.exit("no Pico found -- plug it in, or pass the port (e.g. /dev/ttyACM0, COM7)")
    ser = serial.Serial(port, 115200, timeout=1)
    time.sleep(0.3)
    ser.reset_input_buffer()

    def ask(cmd, want=("OK", "ERR")):
        ser.write((cmd + "\n").encode())
        deadline = time.time() + 1.5
        while time.time() < deadline:
            line = ser.readline().decode(errors="replace").strip()
            if line.startswith(want):
                return line
        return None

    ident = ask("?", ("ID,",))
    print("port", port, "->", ident)
    if not ident or not ident.startswith("ID,MCC-CTR4"):
        sys.exit("that is not an MCC-CTR4 Pico (no ID reply)")
    fw = ident.split(",")[2]
    if not fw.startswith("2."):
        sys.exit("firmware %s: this tool needs 2.x (flash pi_port/pico_ctr4/main.py)" % fw)
    boot_id = ident.split(",")[3]

    print("W,%d ->" % a.window, ask("W,%d" % a.window))
    if a.zero:
        print("Z ->", ask("Z"))
    print("S,1 ->", ask("S,1"))

    def latest_totals():
        """Totals from the next W line (the stream is on)."""
        deadline = time.time() + 2.5
        while time.time() < deadline:
            line = ser.readline().decode(errors="replace").strip()
            f = line.split(",")
            if line.startswith("W,") and len(f) == 3 + 2 * NCH:
                return [int(f[3 + NCH + i]) for i in range(NCH)]
        sys.exit("no W line within 2.5 s -- is the stream on?")

    if a.inject is not None:
        n = a.inject
        ok = True
        for ch in range(NCH):
            before = latest_totals()[ch]
            rep = ask("T,%d,%d" % (ch, n))
            time.sleep(2.2 * a.window / 1000.0)     # let the window containing the steps go out
            after = latest_totals()[ch]
            good = (after - before) == n
            ok &= good
            print("ch%d: T,%d,%d -> %s   total %d -> %d   (delta %d, expected %d)   %s" % (
                ch, ch, n, rep, before, after, after - before, n, "OK" if good else "FAIL"))
        print("self-test", "PASSED" if ok else "FAILED")
        sys.exit(0 if ok else 1)

    hist = [deque(maxlen=max(1, a.avg)) for _ in range(NCH)]
    last_total = [None] * NCH
    print("\n   t(s)   dt(ms)   ch   n/win      Hz      total   SMWF L/min")
    while True:
        line = ser.readline().decode(errors="replace").strip()
        if not line:
            print("... no line in 1 s (boot_id was %s)" % boot_id)
            continue
        if line.startswith("ID,"):
            print("Pico rebooted:", line, "-- re-sending window/stream")
            boot_id = line.split(",")[3]
            ask("W,%d" % a.window); ask("S,1")
            continue
        if line.startswith("#"):
            continue                       # help text from ? / H
        f = line.split(",")
        if not line.startswith("W,") or len(f) != 3 + 2 * NCH:
            print("odd line:", line)
            continue
        t_ms, dt_us = int(f[1]), int(f[2])
        ns = [int(f[3 + i]) for i in range(NCH)]
        ts = [int(f[3 + NCH + i]) for i in range(NCH)]
        for ch in range(NCH):
            if last_total[ch] is not None and ts[ch] < last_total[ch]:
                print("ch%d total dropped (reset/zero) -- averaging restarted" % ch)
                hist[ch].clear()
            last_total[ch] = ts[ch]
            hist[ch].append((ns[ch], dt_us / 1e6))
            span = sum(d for _, d in hist[ch])
            hz = sum(n for n, _ in hist[ch]) / span if span > 0 else 0.0
            print("%7.2f   %6.1f   %d   %5d   %7.2f   %8d   %7.3f" % (
                t_ms / 1000.0, dt_us / 1000.0, ch, ns[ch], hz, ts[ch], smwf_lpm(hz)))
        print()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass
