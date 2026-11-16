# MCC-CTR4 -- Raspberry Pi Pico 4-channel pulse counter for flow meters.
# MicroPython (rp2 port). Reports counts over the USB CDC serial port to the
# main Raspberry Pi running the MCC DAQ server.
#
# VERSION 1.0.0 (russ 11/16: "4 counter inputs ... interrupts so edges do not
# get lost" -- first flow meters are Shineui SMWF-0420A, 3000 p/L, <= 97 Hz).
#
# HOW EDGES ARE COUNTED
#   Each input gets a HARD GPIO interrupt (machine.Pin.irq(hard=True)). A hard
#   IRQ runs the handler inside the interrupt itself, not via the scheduler, so
#   latency is a few microseconds and nothing else on the Pico (USB traffic,
#   the main loop, garbage collection) can defer or drop an edge. The handler
#   only touches pre-allocated integer arrays -- a hard IRQ must not allocate.
#   Practical ceiling is several kHz per channel with all four active; the
#   flow meters this was built for run below 100 Hz, so there is >30x margin.
#   (If a future sensor needs tens of kHz, move counting into PIO or a PWM
#   slice in input-count mode -- same protocol, different counting core.)
#
# WIRING (sensor open-collector / Hall output, pull-up to 3V3 -- NOT 5V, the
# RP2040 GPIOs are not 5 V tolerant):
#   CH0  GP2  (board pin 4)      CH2  GP4  (board pin 6)
#   CH1  GP3  (board pin 5)      CH3  GP5  (board pin 7)
#   GND          board pin 3 / 8 / 38
#   3V3 OUT      board pin 36  -> external 10k pull-up per channel (internal
#                                pull-up is also enabled as a backstop)
#   VBUS 5V      board pin 40  -> sensor V+ when the sensor needs 4.5 V or more
#                                (SMWF-0420A: red=V+, black=GND, white=out)
#   Optional 4.7 nF from each output to GND for noise, per the SMWF sheet.
#
# PROTOCOL (ASCII lines, newline-terminated, 115200 is irrelevant on USB CDC)
#   host -> pico                     pico -> host
#   ?                                ID,MCC-CTR4,<ver>,<boot_id>,<uptime_ms>
#   R                                C,<uptime_ms>,<c0>,<p0>,<c1>,<p1>,<c2>,<p2>,<c3>,<p3>
#                                      c = total edges since boot/zero (monotonic, 64-bit)
#                                      p = last edge-to-edge period in us (0 = none / stale)
#   Z          zero all channels     OK
#   Z,<ch>     zero one channel      OK
#   G          show min-gap (us)     G,<g0>,<g1>,<g2>,<g3>
#   G,<ch>,<us>  set min-gap         OK        (debounce: edges closer than this are ignored;
#                                               0 for Hall sensors, ~2000 for reed switches)
#   S,<ms>     stream C lines every ms (0 = stop)   OK
#   anything else                    ERR,<reason>
#
# The host computes flow rate as delta-count / delta-time between two R lines
# (lossless) and may use p to resolve very low rates or detect zero flow. A
# reset mid-run shows as boot_id changing and counts dropping -- the host
# should discard that one delta.

import sys
import time
import select
import machine
import micropython
from array import array
from machine import Pin

VERSION = "1.0.0"
PINS = (2, 3, 4, 5)            # GP numbers for CH0..CH3
EDGE = Pin.IRQ_FALLING         # open-collector sensors pull LOW on each pulse
USE_WDT = False                # True on the rig: 8 s hardware watchdog (reboots a hung Pico).
                               # Leave False while developing in Thonny, or the REPL reboots
                               # 8 s after you stop the script (the WDT cannot be disabled).
STALE_FACTOR = 4               # period reported as 0 once no edge for 4x the last period
STALE_MIN_MS = 2000            # ...and never before 2 s of silence
FOLD = 1 << 28                 # IRQ counters are folded into Python big-int bases at this
                               # value so the hard IRQ never touches a MicroPython big int

micropython.alloc_emergency_exception_buf(100)
micropython.kbd_intr(-1)       # a stray 0x03 from the host must not break into the REPL

N = len(PINS)
_cnt    = array("I", [0] * N)    # edges since last fold (IRQ-owned)
_last   = array("I", [0] * N)    # ticks_us of last accepted edge (IRQ-owned)
_period = array("I", [0] * N)    # us between the last two accepted edges (IRQ-owned)
_gap    = array("I", [0] * N)    # min accepted gap, us (debounce); 0 = accept every edge
_base   = [0] * N                # folded totals (main-loop-owned, big ints OK)
_seen   = [False] * N            # at least one edge since boot/zero (for stale logic)


def _make_handler(i):
    # Hard-IRQ handler: integer math on pre-allocated arrays only. No allocation,
    # no float, no print. ticks_us/ticks_diff are allocation-free small ints.
    def _h(pin):
        t = time.ticks_us()
        d = time.ticks_diff(t, _last[i])
        if d >= _gap[i] or d < 0:
            _cnt[i] += 1
            _period[i] = d if d > 0 else 0
            _last[i] = t
    return _h


pins = []
for i, gp in enumerate(PINS):
    p = Pin(gp, Pin.IN, Pin.PULL_UP)
    p.irq(handler=_make_handler(i), trigger=EDGE, hard=True)
    pins.append(p)

led = Pin("LED", Pin.OUT)
boot_id = time.ticks_us() & 0xFFFF   # changes on every reset; host uses it to spot reboots
t0 = time.ticks_ms()
wdt = machine.WDT(timeout=8000) if USE_WDT else None


def _fold():
    # Move counts above FOLD into the big-int base so the IRQ never sees a big int.
    for i in range(N):
        if _cnt[i] >= FOLD:
            st = machine.disable_irq()
            _cnt[i] -= FOLD
            machine.enable_irq(st)
            _base[i] += FOLD


def _snapshot():
    # Consistent copy of count + period + last-edge time per channel.
    now = time.ticks_us()
    out = []
    for i in range(N):
        st = machine.disable_irq()
        c = _cnt[i]; p = _period[i]; l = _last[i]
        machine.enable_irq(st)
        total = _base[i] + c
        if total > 0:
            _seen[i] = True
        age = time.ticks_diff(now, l)
        stale_us = max(p * STALE_FACTOR, STALE_MIN_MS * 1000)
        if (not _seen[i]) or p == 0 or age > stale_us:
            p = 0
        out.append((total, p))
    return out


def _uptime_ms():
    return time.ticks_diff(time.ticks_ms(), t0)


def _line_counts():
    snap = _snapshot()
    parts = ["C", str(_uptime_ms())]
    for total, p in snap:
        parts.append(str(total)); parts.append(str(p))
    return ",".join(parts)


def _zero(ch=None):
    for i in range(N):
        if ch is not None and i != ch:
            continue
        st = machine.disable_irq()
        _cnt[i] = 0; _period[i] = 0
        machine.enable_irq(st)
        _base[i] = 0
        _seen[i] = False


def _send(s):
    sys.stdout.write(s + "\n")


def _handle(line):
    line = line.strip()
    if not line:
        return
    f = line.split(",")
    cmd = f[0].upper()
    try:
        if cmd == "?":
            _send("ID,MCC-CTR4,%s,%d,%d" % (VERSION, boot_id, _uptime_ms()))
        elif cmd == "R":
            _send(_line_counts())
        elif cmd == "Z":
            if len(f) > 1:
                ch = int(f[1])
                if not 0 <= ch < N:
                    raise ValueError("ch")
                _zero(ch)
            else:
                _zero()
            _send("OK")
        elif cmd == "G":
            if len(f) == 1:
                _send("G," + ",".join(str(_gap[i]) for i in range(N)))
            else:
                ch = int(f[1]); us = int(f[2])
                if not 0 <= ch < N or not 0 <= us <= 1000000:
                    raise ValueError("range")
                _gap[ch] = us
                _send("OK")
        elif cmd == "S":
            global stream_ms, stream_next
            ms = int(f[1]) if len(f) > 1 else 0
            if not 0 <= ms <= 60000:
                raise ValueError("range")
            stream_ms = ms
            stream_next = time.ticks_add(time.ticks_ms(), ms)
            _send("OK")
        else:
            _send("ERR,unknown command")
    except (ValueError, IndexError) as e:
        _send("ERR,bad argument")


# ---- main loop: poll USB stdin without blocking, stream if asked, blink, feed WDT
stream_ms = 0
stream_next = 0
poller = select.poll()
poller.register(sys.stdin, select.POLLIN)
buf = ""
blink_next = time.ticks_ms()

_send("ID,MCC-CTR4,%s,%d,%d" % (VERSION, boot_id, _uptime_ms()))   # banner on connect/boot

while True:
    if poller.poll(20):                       # 20 ms slice; IRQs keep counting regardless
        ch = sys.stdin.read(1)
        if ch:
            if ch == "\n" or ch == "\r":
                _handle(buf); buf = ""
            elif len(buf) < 64:
                buf += ch
            else:
                buf = ""                      # runaway line without newline: drop it
    now = time.ticks_ms()
    if stream_ms and time.ticks_diff(now, stream_next) >= 0:
        _send(_line_counts())
        stream_next = time.ticks_add(stream_next, stream_ms)
    if time.ticks_diff(now, blink_next) >= 0:
        led.toggle()
        blink_next = time.ticks_add(now, 500)
        _fold()
    if wdt:
        wdt.feed()
