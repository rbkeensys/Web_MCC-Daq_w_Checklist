#!/usr/bin/env python3
"""pico_ctr4_test.py -- v1.0.0 (russ 11/16)

Host-side checker for the MCC-CTR4 Pico pulse counter (pi_port/pico_ctr4/main.py).
Finds the Pico's USB serial port, polls it once a second and prints per-channel
totals, Hz from delta-count/delta-time, and L/min for an SMWF-0420A
(f = 50*Q - 3  =>  Q = (f + 3) / 50, valid 0.4..2.0 L/min; 0 below ~5 Hz).

    python3 tools/pico_ctr4_test.py                 # auto-find the Pico
    python3 tools/pico_ctr4_test.py /dev/ttyACM0    # or name the port
    python3 tools/pico_ctr4_test.py --zero          # zero the counters first
    python3 tools/pico_ctr4_test.py --gap 2000      # 2 ms debounce on every channel (reed switches)

Needs pyserial (the Pi venv already has it for the VFD/stepper drivers).
"""
import sys
import time
import argparse

import serial
from serial.tools import list_ports

PICO_VID = 0x2E8A          # Raspberry Pi (MicroPython USB CDC is VID 2E8A, PID 0005)
SMWF_SLOPE = 50.0          # Hz per L/min
SMWF_OFFSET = 3.0          # Hz


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
    ap.add_argument("--zero", action="store_true", help="zero all counters before polling")
    ap.add_argument("--gap", type=int, help="set min-gap (debounce) in us on all channels")
    ap.add_argument("--period", type=float, default=1.0, help="poll period s (default 1)")
    a = ap.parse_args()

    port = a.port or find_port()
    if not port:
        sys.exit("no Pico found -- plug it in, or pass the port (e.g. /dev/ttyACM0, COM7)")
    ser = serial.Serial(port, 115200, timeout=1)
    time.sleep(0.3)
    ser.reset_input_buffer()

    def ask(cmd):
        ser.write((cmd + "\n").encode())
        while True:
            line = ser.readline().decode(errors="replace").strip()
            if not line:
                return None
            if line.startswith("ID,") and cmd != "?":
                continue              # boot banner / stray identify, keep waiting
            return line

    ident = ask("?")
    print("port", port, "->", ident)
    if not ident or not ident.startswith("ID,MCC-CTR4"):
        sys.exit("that is not an MCC-CTR4 Pico (no ID reply)")
    boot_id = ident.split(",")[3]

    if a.gap is not None:
        for ch in range(4):
            print("G,%d,%d ->" % (ch, a.gap), ask("G,%d,%d" % (ch, a.gap)))
    print("gaps:", ask("G"))
    if a.zero:
        print("Z ->", ask("Z"))

    prev = None
    print("\n   t(s)   ch   total      Hz   period(us)   SMWF L/min")
    while True:
        line = ask("R")
        if not line or not line.startswith("C,"):
            print("no/odd reply:", line)
            time.sleep(a.period)
            continue
        f = line.split(",")
        if len(f) != 2 + 2 * 4:
            print("short frame:", line)
            continue
        t_ms = int(f[1])
        counts = [int(f[2 + 2 * i]) for i in range(4)]
        periods = [int(f[3 + 2 * i]) for i in range(4)]
        if prev:
            pt, pc = prev
            dt = (t_ms - pt) / 1000.0
            if dt <= 0 or any(c < p for c, p in zip(counts, pc)):
                print("counter reset / time jump -- delta skipped (boot_id was %s)" % boot_id)
            else:
                for ch in range(4):
                    hz = (counts[ch] - pc[ch]) / dt
                    # with 1 s polls a single 97 Hz pulse train quantizes to 1 Hz; the
                    # period field gives the instantaneous rate when the count is small
                    hz_p = 1e6 / periods[ch] if periods[ch] else 0.0
                    print("%7.1f   %d   %7d   %6.2f   %9d   %7.3f%s" % (
                        t_ms / 1000.0, ch, counts[ch], hz, periods[ch], smwf_lpm(hz),
                        ("   (1/period %.2f Hz)" % hz_p) if periods[ch] else ""))
                print()
        prev = (t_ms, counts)
        time.sleep(a.period)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass
