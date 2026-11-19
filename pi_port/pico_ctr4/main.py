# MCC-CTR4 -- Raspberry Pi Pico 4-channel pulse counter for flow meters.
# MicroPython (rp2 port). Reports pulse counts over the USB CDC serial port to
# the main Raspberry Pi running the MCC DAQ server.
#
# VERSION 2.0.1 (russ 11/19: help list on "?" and "H", like his other firmware;
# control bytes in the command buffer ignored). First ran on a real Pico 11/18:
# window timing within 10 us, T self-test exact on all four slices.
# 2.0.0 (russ 11/18: "have the firmware produce 4 timer events per
# second and those events read the count in the PWM counter ... so we get a
# total pulses per 1/4 second and then let the pi convert that to LPM").
# v1.0.0 (11/16) counted with hard GPIO interrupts; this version counts in
# hardware and the CPU never sees an edge.
#
# HOW EDGES ARE COUNTED
#   Each input is the B pin of a PWM slice with the slice in edge-count mode
#   (CSR.DIVMODE = 3: the 16-bit counter advances once per FALLING edge on B,
#   divider 1.0, TOP = 0xFFFF). Counting is pure hardware -- USB traffic, the
#   main loop and garbage collection cannot delay or drop a pulse. Only PWM B
#   pins (odd GPIOs) can be counter inputs, so the channels sit on GP1/3/5/7
#   (slices 0..3). The pad output driver is forced off, so the pin is input
#   only no matter what the slice's PWM output does.
#
#   A machine.Timer fires every WINDOW_MS (250 ms = 4 events per second). The
#   callback snapshots the four counters and ticks_us. The main loop turns each
#   snapshot into pulses-in-this-window = (ctr_now - ctr_prev) & 0xFFFF. The
#   counter is NOT written back to zero after a read: the slice has no atomic
#   read-and-clear, so an edge arriving between the read and the write of 0
#   would vanish. Free-running + modular difference gives the same number with
#   nothing lost (unambiguous below 65535 pulses per window = 262 kHz at 250 ms).
#   The window's true length in us goes out with the counts, so timer jitter
#   does not touch the rate the host computes.
#
# WIRING (sensor open-collector / Hall output, pull-up to 3V3 -- NOT 5V, the
# RP2040 GPIOs are not 5 V tolerant):
#   CH0  GP1  (board pin 2)   PWM0B      CH2  GP5  (board pin 7)   PWM2B
#   CH1  GP3  (board pin 5)   PWM1B      CH3  GP7  (board pin 10)  PWM3B
#   GND          board pin 3 / 8 / 38
#   3V3 OUT      board pin 36  -> external 10k pull-up per channel (internal
#                                pull-up is also enabled as a backstop)
#   VBUS 5V      board pin 40  -> sensor V+ when the sensor needs 4.5 V or more
#                                (SMWF-0420A: red=V+, black=GND, white=out)
#   Optional 4.7 nF from each output to GND for noise, per the SMWF sheet.
#   The pad Schmitt trigger is on (power-on default), which cleans slow edges.
#
# PROTOCOL (ASCII lines, newline-terminated; the baud setting is ignored on USB CDC)
#   pico -> host, unsolicited, once per window (streaming is ON at boot):
#   W,<uptime_ms>,<dt_us>,<n0>,<n1>,<n2>,<n3>,<t0>,<t1>,<t2>,<t3>
#       dt_us = true length of this window, n = pulses in it,
#       t = running total since boot/zero (so a dropped line never loses a pulse)
#   host -> pico                     pico -> host
#   ?                                ID,MCC-CTR4,<ver>,<boot_id>,<uptime_ms>  then the help
#                                    list, one "# ..." line each (hosts ignore # lines)
#   H                                the help list alone
#   R                                the latest W line again
#   Z          zero all totals       OK
#   Z,<ch>     zero one total        OK
#   W          show window ms        W,<ms>        (note: 2 fields, a count line has 10)
#   W,<ms>     set window 50..5000   OK
#   S,0 / S,1  streaming off / on    OK
#   T,<ch>,<n> self-test: advance    OK        (pulses the slice's PH_ADV bit n times, so the
#              channel's counter by n           counter steps exactly n with nothing wired)
#   X          exit to the REPL      OK        (Ctrl-C is disabled below, so Thonny/mpremote
#                                               cannot interrupt this program; send X first)
#   anything else                    ERR,<reason>
#
# Rate on the host: Hz = n / (dt_us / 1e6), averaged over as many windows as it
# likes. A reset mid-run shows as boot_id changing and totals dropping.

import sys
import time
import select
import machine
import micropython
from machine import Pin, Timer, mem32

VERSION = "2.0.1"
PINS = (1, 3, 5, 7)            # GP numbers for CH0..CH3 -- PWM B pins, slices 0..3
WINDOW_MS = 250                # 4 timer events per second
USE_WDT = False                # True on the rig: 8 s hardware watchdog (reboots a hung Pico).
                               # Leave False while developing in Thonny, or the REPL reboots
                               # 8 s after you stop the script (the WDT cannot be disabled).

micropython.alloc_emergency_exception_buf(100)
micropython.kbd_intr(-1)       # a stray 0x03 from the host must not break into the REPL

# ---- register map (RP2040 / RP2350 -- same layout, different bases)
if "RP2350" in getattr(sys.implementation, "_machine", ""):
    IO_BANK0, PADS_BANK0, PWM_BASE, NSLICE = 0x40028000, 0x40038000, 0x400A8000, 12
else:
    IO_BANK0, PADS_BANK0, PWM_BASE, NSLICE = 0x40014000, 0x4001C000, 0x40050000, 8
ALIAS_SET = 0x2000             # atomic bit-set alias of any peripheral register
FUNCSEL_PWM = 4
PAD_OD = 1 << 7                # pad output disable
CSR, DIV, CTR, CC, TOP = 0x00, 0x04, 0x08, 0x0C, 0x10
CSR_EN = 1 << 0
CSR_DIVMODE_FALL = 3 << 4      # 2 << 4 would count rising edges
CSR_PH_ADV = 1 << 7            # write 1: counter +1, self-clears (self-test without a signal)
SLICE_STRIDE = 0x14

N = len(PINS)
_slice = []
for gp in PINS:
    if gp & 1 == 0:
        raise ValueError("GP%d is a PWM A pin; only B pins (odd GPIOs) can count" % gp)
    s = (gp >> 1) % NSLICE
    if s in _slice:
        raise ValueError("GP%d shares PWM slice %d with another channel" % (gp, s))
    _slice.append(s)
_ctr_addr = [PWM_BASE + s * SLICE_STRIDE + CTR for s in _slice]


def _setup_channel(i):
    gp, s = PINS[i], _slice[i]
    Pin(gp, Pin.IN, Pin.PULL_UP)                               # IE + PUE (+ de-isolate on RP2350)
    mem32[PADS_BANK0 + ALIAS_SET + 4 + 4 * gp] = PAD_OD        # never drive the pin
    mem32[IO_BANK0 + 4 + 8 * gp] = FUNCSEL_PWM                 # route the pad to PWM<s>B
    base = PWM_BASE + s * SLICE_STRIDE
    mem32[base + CSR] = 0                                      # stop while configuring
    mem32[base + DIV] = 1 << 4                                 # divider 1.0: every edge counts
    mem32[base + TOP] = 0xFFFF                                 # full 16-bit range
    mem32[base + CC] = 0                                       # outputs idle low (not driven anyway)
    mem32[base + CTR] = 0
    mem32[base + CSR] = CSR_DIVMODE_FALL | CSR_EN


for _i in range(N):
    _setup_channel(_i)

led = Pin("LED", Pin.OUT)
boot_id = time.ticks_us() & 0xFFFF   # changes on every reset; host uses it to spot reboots
t0 = time.ticks_ms()
wdt = machine.WDT(timeout=8000) if USE_WDT else None

# ---- window timer: snapshot the four counters + the time, as one tuple (atomic to the main loop)
_snap = None


def _tick(t):
    global _snap
    _snap = (time.ticks_us(),
             mem32[_ctr_addr[0]] & 0xFFFF, mem32[_ctr_addr[1]] & 0xFFFF,
             mem32[_ctr_addr[2]] & 0xFFFF, mem32[_ctr_addr[3]] & 0xFFFF)


timer = Timer(period=WINDOW_MS, mode=Timer.PERIODIC, callback=_tick)


def _set_window(ms):
    global timer, WINDOW_MS
    timer.deinit()
    WINDOW_MS = ms
    timer = Timer(period=ms, mode=Timer.PERIODIC, callback=_tick)


_prev_t = time.ticks_us()
_prev_c = [mem32[a] & 0xFFFF for a in _ctr_addr]
_total = [0] * N                     # Python ints: never wrap
_last_line = "W,0,0,0,0,0,0,0,0,0,0"
stream_on = True


def _uptime_ms():
    return time.ticks_diff(time.ticks_ms(), t0)


def _consume(snap):
    """Turn a counter snapshot into the W line for that window."""
    global _prev_t, _last_line
    t_now = snap[0]
    dt = time.ticks_diff(t_now, _prev_t)
    _prev_t = t_now
    n = [0] * N
    for i in range(N):
        c = snap[1 + i]
        n[i] = (c - _prev_c[i]) & 0xFFFF
        _prev_c[i] = c
        _total[i] += n[i]
    _last_line = "W,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d" % (
        _uptime_ms(), dt, n[0], n[1], n[2], n[3], _total[0], _total[1], _total[2], _total[3])
    return _last_line


def _zero(ch=None):
    for i in range(N):
        if ch is None or i == ch:
            _total[i] = 0


def _advance(ch, n):
    # Step channel ch's hardware counter by n using the slice's PH_ADV bit: the
    # same count path a real edge takes, minus the pad. Verifies slice setup,
    # snapshots, deltas and the protocol end to end with nothing wired.
    csr = PWM_BASE + _slice[ch] * SLICE_STRIDE + CSR
    for _ in range(n):
        mem32[csr + ALIAS_SET] = CSR_PH_ADV
        while mem32[csr] & CSR_PH_ADV:
            pass


def _send(s):
    sys.stdout.write(s + "\n")


HELP = (
    "# MCC-CTR4 " + VERSION + " -- 4-ch pulse counter. Commands end with newline, case-insensitive:",
    "#   ?           identify (ID,MCC-CTR4,<ver>,<boot_id>,<uptime_ms>) then this help",
    "#   H           this help",
    "#   R           repeat the latest W line",
    "#   W           show the window period (W,<ms>)",
    "#   W,<ms>      set the window period, 50..5000 ms (default 250 = 4 lines/s)",
    "#   S,0 | S,1   streaming off | on (on at boot)",
    "#   Z           zero all running totals",
    "#   Z,<ch>      zero one channel, 0..3",
    "#   T,<ch>,<n>  self-test: step channel <ch>'s hardware counter by <n> (0..60000)",
    "#   X           exit to the REPL for Thonny/mpremote (Ctrl-C is disabled)",
    "# W,<uptime_ms>,<dt_us>,<n0>,<n1>,<n2>,<n3>,<t0>,<t1>,<t2>,<t3> every window:",
    "#   dt = window length us, n = pulses in it, t = running total since boot/zero",
    "# Inputs: CH0 GP1  CH1 GP3  CH2 GP5  CH3 GP7 (falling edge, pull-up to 3V3, not 5 V)",
)


def _help():
    for h in HELP:
        _send(h)


def _handle(line):
    global stream_on, _exit
    line = line.strip()
    if not line:
        return
    f = line.split(",")
    cmd = f[0].upper()
    try:
        if cmd == "?":
            _send("ID,MCC-CTR4,%s,%d,%d" % (VERSION, boot_id, _uptime_ms()))
            _help()
        elif cmd == "H" or cmd == "HELP":
            _help()
        elif cmd == "R":
            _send(_last_line)
        elif cmd == "Z":
            if len(f) > 1:
                ch = int(f[1])
                if not 0 <= ch < N:
                    raise ValueError("ch")
                _zero(ch)
            else:
                _zero()
            _send("OK")
        elif cmd == "W":
            if len(f) == 1:
                _send("W,%d" % WINDOW_MS)
            else:
                ms = int(f[1])
                if not 50 <= ms <= 5000:
                    raise ValueError("range")
                _set_window(ms)
                _send("OK")
        elif cmd == "S":
            stream_on = bool(int(f[1])) if len(f) > 1 else True
            _send("OK")
        elif cmd == "T":
            ch = int(f[1]); n = int(f[2])
            if not 0 <= ch < N or not 0 <= n <= 60000:
                raise ValueError("range")
            _advance(ch, n)
            _send("OK")
        elif cmd == "X":
            _send("OK")
            timer.deinit()
            micropython.kbd_intr(3)
            _exit = True                      # main loop ends -> script ends -> friendly REPL.
                                              # NOT SystemExit: on rp2 that soft-reboots and
                                              # re-runs main.py (found out 11/18).
        else:
            _send("ERR,unknown command (H for help)")
    except (ValueError, IndexError):
        _send("ERR,bad argument")


# ---- main loop: poll USB stdin without blocking, emit each window, blink, feed WDT
poller = select.poll()
poller.register(sys.stdin, select.POLLIN)
buf = ""
_seen_snap = None
_exit = False

_send("ID,MCC-CTR4,%s,%d,%d" % (VERSION, boot_id, _uptime_ms()))   # banner on connect/boot

while not _exit:
    if poller.poll(20):                       # 20 ms slice; the slices keep counting regardless
        ch = sys.stdin.read(1)
        if ch:
            if ch == "\n" or ch == "\r":
                _handle(buf); buf = ""
            elif ch < " ":
                pass                          # control bytes (mpremote/Thonny break-in attempts): ignore
            elif len(buf) < 64:
                buf += ch
            else:
                buf = ""                      # runaway line without newline: drop it
    s = _snap
    if s is not None and s is not _seen_snap:
        _seen_snap = s
        line = _consume(s)
        if stream_on:
            _send(line)
        led.toggle()                          # 2 Hz blink at the default window = alive and ticking
    if wdt:
        wdt.feed()

# X received: fall off the end of main.py into the REPL (with USE_WDT the watchdog
# reboots the board 8 s later, which is fine for a quick mpremote cp + reset).
