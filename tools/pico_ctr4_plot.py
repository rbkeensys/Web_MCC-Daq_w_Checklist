#!/usr/bin/env python3
"""pico_ctr4_plot.py -- v1.0.0 (russ 11/19: "read the device and graph ch0 vs time, fixed scale adjustable")

Live strip chart of one MCC-CTR4 channel (firmware 2.x stream) with a FIXED
y-axis you set and change while it runs -- no autoscale jumping around.

    python tools/pico_ctr4_plot.py                     # auto-find the Pico, CH0 in Hz, 0..100 Hz, last 60 s
    python tools/pico_ctr4_plot.py COM5 --ymax 120     # name the port, y-axis 0..120
    python tools/pico_ctr4_plot.py --ch 1 --count      # CH1, pulses per window instead of Hz
    python tools/pico_ctr4_plot.py --window 100 --span 30
    python tools/pico_ctr4_plot.py --demo              # no Pico: synthetic signal, to try the controls

While it runs:
    Y max box / Span s box   type a number + Enter
    Up / Down keys           y-axis max x2 / /2        Left / Right keys   span /2 / x2
    Space                    pause / resume            Z                   zero the Pico's totals

The plotted value is Hz = pulses / window length (or the raw pulses-per-window
with --count). The title shows the latest value and the running total.
Needs pyserial + matplotlib (both in the project venv).
"""
import sys
import time
import argparse
import threading
import collections
import math

NCH = 4
PICO_VID = 0x2E8A


def find_port():
    from serial.tools import list_ports
    for p in list_ports.comports():
        if p.vid == PICO_VID:
            return p.device
    return None


class Source:
    """Reads W lines from the Pico on a thread; keeps (t_s, value, total) samples."""

    def __init__(self, port, ch, window_ms, count_mode, span_s):
        import serial
        self.ch = ch
        self.count_mode = count_mode
        self.samples = collections.deque()          # (t, value, total)
        self.keep_s = max(span_s, 1.0) * 4           # history beyond the span so a wider span fills in
        self.lock = threading.Lock()
        self.err = None
        self.fw = "?"
        self.ser = serial.Serial(port, 115200, timeout=0.5)
        time.sleep(0.3)
        self.ser.reset_input_buffer()
        self._cmd("S,0")
        ident = self._cmd("?", ("ID,",))
        if not ident or not ident.startswith("ID,MCC-CTR4"):
            raise IOError("%s is not an MCC-CTR4 (reply %r)" % (port, ident))
        self.fw = ident.split(",")[2]
        if not self.fw.startswith("2."):
            raise IOError("firmware %s: needs 2.x" % self.fw)
        self._cmd("W,%d" % window_ms)
        self._cmd("S,1")
        self.t0 = time.time()
        self.stop = threading.Event()
        threading.Thread(target=self._run, daemon=True).start()

    def _cmd(self, cmd, want=("OK", "ERR")):
        self.ser.write((cmd + "\n").encode())
        deadline = time.time() + 1.5
        while time.time() < deadline:
            line = self.ser.readline().decode(errors="replace").strip()
            if line.startswith(want):
                return line
        return None

    def zero(self):
        with self.lock:
            self.ser.write(b"Z\n")                 # OK comes back in the stream; the reader skips it

    def _run(self):
        while not self.stop.is_set():
            try:
                line = self.ser.readline().decode(errors="replace").strip()
            except Exception as e:
                self.err = str(e)
                return
            if not line.startswith("W,"):
                if line.startswith("ID,"):          # Pico rebooted: stream defaults are back, re-arm
                    self.ser.write(b"S,1\n")
                continue
            f = line.split(",")
            if len(f) != 3 + 2 * NCH:
                continue
            try:
                dt_us = int(f[2]); n = int(f[3 + self.ch]); tot = int(f[3 + NCH + self.ch])
            except ValueError:
                continue
            if dt_us <= 0:
                continue
            v = n if self.count_mode else n * 1e6 / dt_us
            t = time.time() - self.t0
            with self.lock:
                self.samples.append((t, v, tot))
                while self.samples and t - self.samples[0][0] > self.keep_s:
                    self.samples.popleft()

    def snapshot(self):
        with self.lock:
            return list(self.samples)


class DemoSource:
    """Synthetic 'flow' for trying the plot without hardware: slow ramp + a few bursts."""

    def __init__(self, ch, window_ms, count_mode, span_s):
        self.count_mode = count_mode
        self.window_s = window_ms / 1000.0
        self.samples = collections.deque()
        self.keep_s = max(span_s, 1.0) * 4
        self.lock = threading.Lock()
        self.err = None
        self.fw = "demo"
        self.t0 = time.time()
        self.total = 0
        self.stop = threading.Event()
        threading.Thread(target=self._run, daemon=True).start()

    def zero(self):
        self.total = 0

    def _run(self):
        nxt = time.time()
        while not self.stop.is_set():
            t = time.time() - self.t0
            hz = 50 + 40 * math.sin(t / 8.0) + (30 if int(t) % 17 == 0 else 0)
            n = int(round(hz * self.window_s))
            self.total += n
            v = n if self.count_mode else n / self.window_s
            with self.lock:
                self.samples.append((t, v, self.total))
                while self.samples and t - self.samples[0][0] > self.keep_s:
                    self.samples.popleft()
            nxt += self.window_s
            time.sleep(max(0.0, nxt - time.time()))

    def snapshot(self):
        with self.lock:
            return list(self.samples)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("port", nargs="?", help="serial port (default: auto-detect by VID 2E8A)")
    ap.add_argument("--ch", type=int, default=0, choices=range(NCH), help="channel 0..3 (default 0)")
    ap.add_argument("--window", type=int, default=250, help="Pico window ms, 50..5000 (default 250)")
    ap.add_argument("--span", type=float, default=60.0, help="seconds of history on screen (default 60)")
    ap.add_argument("--ymax", type=float, default=100.0, help="fixed y-axis maximum (default 100)")
    ap.add_argument("--count", action="store_true", help="plot pulses per window instead of Hz")
    ap.add_argument("--demo", action="store_true", help="synthetic data, no Pico needed")
    ap.add_argument("--snapshot", help="headless: run a few seconds and save a PNG (self-test)")
    a = ap.parse_args()

    import matplotlib
    if a.snapshot:
        matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.widgets import TextBox
    from matplotlib.animation import FuncAnimation

    if a.demo:
        src = DemoSource(a.ch, a.window, a.count, a.span)
        title_port = "demo"
    else:
        port = a.port or find_port()
        if not port:
            sys.exit("no Pico found -- plug it in, or pass the port (e.g. COM5, /dev/ttyACM0)")
        src = Source(port, a.ch, a.window, a.count, a.span)
        title_port = port

    state = {"ymax": float(a.ymax), "span": float(a.span), "paused": False}
    unit = "pulses / window" if a.count else "Hz"

    fig, ax = plt.subplots(figsize=(10, 5))
    fig.canvas.manager.set_window_title("MCC-CTR4 CH%d  (%s, fw %s)" % (a.ch, title_port, src.fw)) \
        if hasattr(fig.canvas.manager, "set_window_title") else None
    fig.subplots_adjust(bottom=0.22)
    (line,) = ax.plot([], [], lw=1.4, color="#2f7bd8")
    ax.set_xlabel("time (s)")
    ax.set_ylabel("CH%d  %s" % (a.ch, unit))
    ax.grid(True, alpha=0.3)
    ax.set_ylim(0, state["ymax"])
    ax.set_xlim(-state["span"], 0)

    ax_y = fig.add_axes([0.14, 0.06, 0.12, 0.06])
    ax_s = fig.add_axes([0.44, 0.06, 0.12, 0.06])
    tb_y = TextBox(ax_y, "Y max  ", initial="%g" % state["ymax"])
    tb_s = TextBox(ax_s, "Span s  ", initial="%g" % state["span"])
    fig.text(0.62, 0.075, "Up/Down: Y x2, /2    Left/Right: span /2, x2    Space: pause    Z: zero totals",
             fontsize=8, color="#666")

    def apply():
        ax.set_ylim(0, state["ymax"])
        ax.set_xlim(-state["span"], 0)
        tb_y.set_val("%g" % state["ymax"])
        tb_s.set_val("%g" % state["span"])
        fig.canvas.draw_idle()

    def on_y(text):
        try:
            v = float(text)
            if v > 0:
                state["ymax"] = v
        except ValueError:
            pass
        ax.set_ylim(0, state["ymax"]); fig.canvas.draw_idle()

    def on_s(text):
        try:
            v = float(text)
            if v > 0:
                state["span"] = v
        except ValueError:
            pass
        ax.set_xlim(-state["span"], 0); fig.canvas.draw_idle()

    tb_y.on_submit(on_y)
    tb_s.on_submit(on_s)

    def on_key(ev):
        if ev.inaxes in (ax_y, ax_s):
            return                                   # typing in a box
        k = ev.key
        if k == "up":
            state["ymax"] *= 2; apply()
        elif k == "down":
            state["ymax"] = max(1.0, state["ymax"] / 2); apply()
        elif k == "right":
            state["span"] *= 2; apply()
        elif k == "left":
            state["span"] = max(2.0, state["span"] / 2); apply()
        elif k == " ":
            state["paused"] = not state["paused"]
        elif k in ("z", "Z"):
            src.zero()

    fig.canvas.mpl_connect("key_press_event", on_key)

    def update(_frame):
        if state["paused"]:
            return (line,)
        s = src.snapshot()
        if s:
            now = s[-1][0]
            xs = [t - now for t, _, _ in s]
            ys = [v for _, v, _ in s]
            line.set_data(xs, ys)
            ax.set_title("CH%d  %.1f %s    total %d pulses    (%s)" % (
                a.ch, s[-1][1], unit, s[-1][2], "PAUSED" if state["paused"] else "live"), fontsize=10)
        if src.err:
            ax.set_title("link lost: " + src.err, color="red")
        return (line,)

    ani = FuncAnimation(fig, update, interval=100, cache_frame_data=False)

    if a.snapshot:
        for _ in range(30):                           # ~3 s of samples, then draw once and save
            time.sleep(0.1)
        update(0)
        fig.savefig(a.snapshot, dpi=100)
        print("saved", a.snapshot, "with", len(src.snapshot()), "samples")
        return
    plt.show()
    src.stop.set()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass
