#!/usr/bin/env python3
# log_viewer.py
"""
MCC Log Viewer — standalone session.csv viewer for HUGE log files.
Version: 1.2.0 (2026-06-11) — friendly signal names + chart-driven defaults:
  the launch bundle now carries configured names (LOX P, Chamber T, …) for
  every signal and the list of columns shown on the app's charts. Series
  checkboxes and the legend use the names, and exactly the charted signals
  are enabled on open (first-6 fallback when none match the file). — adds the "Chart scale/offset" toggle:
  when launched from the browser, the app sends each chart series'
  displayScale/displayOffset keyed by CSV column; the viewer can then
  flip between raw CSV values and the chart-style scaled view. A
  viewer_scales.json sidecar next to a CSV works for manual opens.

Why this exists:
  The browser replay loads the entire CSV into memory as JS objects, which
  caps out around ~150 MB of file. This viewer never loads the whole file.
  Instead it:
    1. Scans the file ONCE on a background thread, building
       - a byte-offset index (one entry every INDEX_EVERY rows, with the
         row's t value), and
       - a stride-decimated "overview" of every numeric column
         (~MAX_OVERVIEW_POINTS points per series).
    2. Plots the overview. When you zoom in (matplotlib toolbar or wheel),
       it uses the index to seek directly to the visible time window and
       re-reads JUST that region at up to MAX_WINDOW_POINTS resolution.
    3. Zoom Full snaps back to the overview.

  Net effect: a 5 GB CSV opens in the time it takes to stream-read it once
  (disk speed bound), uses a few MB of RAM, and zooming is fast because
  each window read touches only the bytes for that window.

Usage:
    python log_viewer.py [path/to/session.csv]
  With no argument, starts with a file-open dialog.

Requirements: Python 3.8+, matplotlib (pip install matplotlib).
tkinter ships with standard CPython installs.

Checklist events: if a chk.json sits next to the CSV, or the CSV has a
chk_events column (embedded at session close), check events are drawn as
vertical dashed lines with the item number at the top.
"""

import csv
import io
import json
import math
import os
import queue
import sys
import tempfile
import threading
import webbrowser
from bisect import bisect_left, bisect_right
from pathlib import Path

__version__ = "1.2.0"

# ----------------------------- tunables -----------------------------------
INDEX_EVERY         = 2000    # one (byte_offset, t, row#) index entry per N rows
MAX_OVERVIEW_POINTS = 4000    # decimated points per series for the full view
MAX_WINDOW_POINTS   = 20000   # max points per series when zoomed into a window
MAX_SERIES_COLS     = 64      # safety cap on number of numeric columns tracked
SAMPLE_LINES        = 200     # lines sampled to estimate total row count

try:
    import tkinter as tk
    from tkinter import filedialog, messagebox, ttk
except Exception as e:  # pragma: no cover
    print("tkinter is required but failed to import:", e)
    sys.exit(1)

try:
    import matplotlib
    matplotlib.use("TkAgg")
    from matplotlib.backends.backend_tkagg import (
        FigureCanvasTkAgg, NavigationToolbar2Tk)
    from matplotlib.figure import Figure
except Exception as e:  # pragma: no cover
    # Show the error in a GUI box if possible — the user double-clicking
    # this script won't see a console.
    try:
        root = tk.Tk(); root.withdraw()
        messagebox.showerror(
            "MCC Log Viewer",
            "matplotlib is required but failed to import:\n\n"
            f"{e}\n\nInstall it with:\n    pip install matplotlib")
    except Exception:
        print("matplotlib is required: pip install matplotlib —", e)
    sys.exit(1)


# ============================ chunked CSV reader ===========================

class IndexedCSV:
    """One-pass scanning + windowed re-reads of a (possibly huge) CSV.

    The scan builds:
      self.index    : list of (byte_offset, t_value, row_number) every
                      INDEX_EVERY rows — lets read_window() seek straight
                      to a time range without reading preceding data.
      self.overview : dict col_name -> list[float], stride-decimated to
                      roughly MAX_OVERVIEW_POINTS points.
      self.overview_t : matching t values.
    Byte offsets are exact: we accumulate len(raw_line) ourselves instead
    of trusting f.tell() (which is unreliable during buffered iteration).
    """

    def __init__(self, path):
        self.path = Path(path)
        self.delim = ","
        self.cols = []            # all header names
        self.numeric_cols = []    # subset we actually track (and their idx)
        self.numeric_idx = []
        self.t_idx = None         # column index of the time axis (or None)
        self.t_is_index = False   # True when we fall back to row number
        self.index = []           # [(offset, t, row#), ...]
        self.overview_t = []
        self.overview = {}        # col -> [values]
        self.total_rows = 0
        self.t_min = None
        self.t_max = None
        self.header_bytes = 0
        self.check_events = []    # [(t, label), ...] harvested during scan

    # -------------------------------------------------------- scan (once)
    def scan(self, progress_cb=None, stop_flag=None):
        """Stream the whole file once. progress_cb(frac, msg) is called
        periodically; stop_flag is a threading.Event that aborts the scan."""
        fsize = self.path.stat().st_size

        with open(self.path, "rb") as f:
            header_raw = f.readline()
            self.header_bytes = len(header_raw)
            header_line = header_raw.decode("utf-8", errors="replace").rstrip("\r\n")
            self.delim = "\t" if "\t" in header_line else ","
            self.cols = next(csv.reader([header_line], delimiter=self.delim))
            self.cols = [c.strip() for c in self.cols]

            # Pick the time axis: a column literally named t/time/timestamp.
            for i, c in enumerate(self.cols):
                if c.lower() in ("t", "time", "timestamp"):
                    self.t_idx = i
                    break
            if self.t_idx is None:
                self.t_is_index = True   # fall back to row number as x axis

            # Sample the first rows to (a) find numeric columns and
            # (b) estimate the total row count for the decimation stride.
            sample = []
            off = self.header_bytes
            for _ in range(SAMPLE_LINES):
                raw = f.readline()
                if not raw:
                    break
                sample.append((off, raw))
                off += len(raw)
            if not sample:
                raise ValueError("CSV has a header but no data rows")

            first_fields = next(csv.reader(
                [sample[0][1].decode("utf-8", errors="replace")],
                delimiter=self.delim))
            for i, val in enumerate(first_fields):
                if i >= len(self.cols):
                    break
                name = self.cols[i]
                if name == "chk_events":
                    # Embedded checklist JSON — harvest, never plot.
                    try:
                        for ev in json.loads(val):
                            t = ev.get("tServer", ev.get("t"))
                            if t is not None:
                                self.check_events.append(
                                    (float(t), str(ev.get("label", ev.get("itemNum", "")))))
                    except Exception:
                        pass
                    continue
                try:
                    float(val)
                    if len(self.numeric_cols) < MAX_SERIES_COLS and i != self.t_idx:
                        self.numeric_cols.append(name)
                        self.numeric_idx.append(i)
                except (ValueError, TypeError):
                    pass  # non-numeric column — skip

            avg_line = sum(len(r) for _, r in sample) / len(sample)
            est_rows = max(1, int((fsize - self.header_bytes) / avg_line))
            stride = max(1, est_rows // MAX_OVERVIEW_POINTS)

            self.overview = {c: [] for c in self.numeric_cols}

            def _consume(offset, raw, row_no):
                """Index + decimate one row."""
                line = raw.decode("utf-8", errors="replace")
                if row_no % INDEX_EVERY == 0 or row_no % stride == 0:
                    try:
                        fields = next(csv.reader([line], delimiter=self.delim))
                    except Exception:
                        return
                    t = self._row_t(fields, row_no)
                    if row_no % INDEX_EVERY == 0:
                        self.index.append((offset, t, row_no))
                    if row_no % stride == 0:
                        self.overview_t.append(t)
                        for name, ci in zip(self.numeric_cols, self.numeric_idx):
                            try:
                                self.overview[name].append(float(fields[ci]))
                            except (ValueError, IndexError):
                                self.overview[name].append(math.nan)
                    if self.t_min is None:
                        self.t_min = t
                    self.t_max = t

            # Replay the sampled lines, then continue streaming the rest.
            row_no = 0
            for offset, raw in sample:
                _consume(offset, raw, row_no)
                row_no += 1
            done = off
            tick = 0
            for raw in f:
                _consume(done, raw, row_no)
                done += len(raw)
                row_no += 1
                tick += 1
                if progress_cb and tick >= 50000:
                    tick = 0
                    progress_cb(done / fsize, f"Scanning… {done//(1024*1024)} / {fsize//(1024*1024)} MB")
                    if stop_flag is not None and stop_flag.is_set():
                        raise InterruptedError("scan aborted")

        self.total_rows = row_no
        if progress_cb:
            progress_cb(1.0, f"Scanned {row_no:,} rows, {len(self.numeric_cols)} series")

        # Sidecar chk.json (covers sessions where the server was killed
        # before the chk_events column got embedded in the CSV).
        if not self.check_events:
            sidecar = self.path.parent / "chk.json"
            if sidecar.exists():
                try:
                    snap = json.loads(sidecar.read_text(encoding="utf-8"))
                    for ev in snap.get("checkEvents", []):
                        t = ev.get("tServer", ev.get("t"))
                        if t is not None:
                            self.check_events.append(
                                (float(t), str(ev.get("label", ev.get("itemNum", "")))))
                except Exception:
                    pass

    def _row_t(self, fields, row_no):
        if self.t_is_index:
            return float(row_no)
        try:
            return float(fields[self.t_idx])
        except (ValueError, IndexError):
            return float(row_no)

    # ------------------------------------------------------ windowed read
    def read_window(self, t0, t1):
        """Read only the rows with t in [t0, t1], stride-decimated to at
        most MAX_WINDOW_POINTS, by seeking via the byte-offset index.
        Returns (t_list, {col: values})."""
        if not self.index:
            return self.overview_t, self.overview
        ts = [e[1] for e in self.index]
        lo = max(0, bisect_left(ts, t0) - 1)          # block containing t0
        hi = min(len(self.index) - 1, bisect_right(ts, t1))
        start_off = self.index[lo][0]
        end_off = self.index[hi][0] if hi > lo else None
        approx_rows = (self.index[hi][2] - self.index[lo][2]) or INDEX_EVERY
        stride = max(1, approx_rows // MAX_WINDOW_POINTS)

        out_t = []
        out = {c: [] for c in self.numeric_cols}
        with open(self.path, "rb") as f:
            f.seek(start_off)
            off = start_off
            row_in_window = 0
            for raw in f:
                if end_off is not None and off > end_off:
                    break
                off += len(raw)
                if row_in_window % stride:
                    row_in_window += 1
                    continue
                row_in_window += 1
                line = raw.decode("utf-8", errors="replace")
                try:
                    fields = next(csv.reader([line], delimiter=self.delim))
                except Exception:
                    continue
                t = self._row_t(fields, 0)
                if t < t0:
                    continue
                if t > t1:
                    break
                out_t.append(t)
                for name, ci in zip(self.numeric_cols, self.numeric_idx):
                    try:
                        out[name].append(float(fields[ci]))
                    except (ValueError, IndexError):
                        out[name].append(math.nan)
        return out_t, out


# ================================ the app ==================================

class ViewerApp:
    def __init__(self, root, initial_path=None, scales_path=None):
        self.root = root
        root.title(f"MCC Log Viewer v{__version__}")
        root.geometry("1200x720")

        self.csvfile = None          # IndexedCSV once loaded
        self.lines = {}              # col -> Line2D
        self.visible = {}            # col -> tk.BooleanVar
        self._scan_q = queue.Queue()
        self._stop_scan = threading.Event()
        self._zoom_job = None        # debounce handle for window re-reads
        self._showing_window = False
        self._cur_t = []             # data currently on screen (RAW values;
        self._cur_data = {}          #  the scale toggle re-applies from these)

        # Chart display scales: {csvCol: {"scale": s, "offset": o, "label": L}}.
        # Loaded from --scales (handed over by the server at launch, holding
        # the browser charts' displayScale/displayOffset per column). A
        # sidecar viewer_scales.json next to an opened CSV also works for
        # manual sessions — see load().
        self.scales = {}
        self.names = {}        # csvCol -> friendly display name
        self.charted = set()   # csvCols shown on the app's charts
        if scales_path:
            self._load_scales(scales_path)

        # ----- toolbar row -----
        bar = ttk.Frame(root); bar.pack(side=tk.TOP, fill=tk.X, padx=4, pady=3)
        ttk.Button(bar, text="📂 Open…",   command=self.open_file).pack(side=tk.LEFT, padx=2)
        ttk.Button(bar, text="⛶ Zoom Full", command=self.zoom_full).pack(side=tk.LEFT, padx=2)
        ttk.Button(bar, text="🖨 Print",     command=self.print_view).pack(side=tk.LEFT, padx=2)
        ttk.Button(bar, text="💾 Save PNG",  command=self.save_png).pack(side=tk.LEFT, padx=2)
        # Raw ↔ chart-scaled toggle. Default ON when scales were provided —
        # the user launched from the app expecting the chart-like view.
        self.apply_scales = tk.BooleanVar(value=bool(self.scales))
        self.scales_chk = ttk.Checkbutton(
            bar, text="Chart scale/offset", variable=self.apply_scales,
            command=self._on_scales_toggle)
        self.scales_chk.pack(side=tk.LEFT, padx=8)
        if not self.scales:
            self.scales_chk.state(["disabled"])
        self.status = ttk.Label(bar, text="Open a session.csv to begin")
        self.status.pack(side=tk.LEFT, padx=12)
        self.prog = ttk.Progressbar(bar, length=160, mode="determinate")
        self.prog.pack(side=tk.RIGHT, padx=4)

        # ----- main split: series list | plot -----
        main = ttk.Frame(root); main.pack(fill=tk.BOTH, expand=True)

        side = ttk.Frame(main, width=200); side.pack(side=tk.LEFT, fill=tk.Y)
        ttk.Label(side, text="Series").pack(anchor="w", padx=6, pady=(4, 0))
        canvas_holder = tk.Canvas(side, width=190, highlightthickness=0)
        scroll = ttk.Scrollbar(side, orient="vertical", command=canvas_holder.yview)
        self.series_frame = ttk.Frame(canvas_holder)
        self.series_frame.bind(
            "<Configure>",
            lambda e: canvas_holder.configure(scrollregion=canvas_holder.bbox("all")))
        canvas_holder.create_window((0, 0), window=self.series_frame, anchor="nw")
        canvas_holder.configure(yscrollcommand=scroll.set)
        canvas_holder.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=(6, 0))
        scroll.pack(side=tk.RIGHT, fill=tk.Y)

        plot = ttk.Frame(main); plot.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        self.fig = Figure(figsize=(9, 5), dpi=100)
        self.ax = self.fig.add_subplot(111)
        self.ax.set_xlabel("t"); self.ax.grid(True, alpha=0.3)
        self.canvas = FigureCanvasTkAgg(self.fig, master=plot)
        self.canvas.get_tk_widget().pack(fill=tk.BOTH, expand=True)
        self.toolbar = NavigationToolbar2Tk(self.canvas, plot)
        self.toolbar.update()

        # When matplotlib's pan/zoom changes the x-limits, schedule a
        # high-resolution windowed re-read (debounced so dragging doesn't
        # hammer the disk).
        self.ax.callbacks.connect("xlim_changed", self._on_xlim_changed)

        self.root.after(100, self._poll_scan_queue)
        if initial_path:
            self.root.after(200, lambda: self.load(initial_path))

    def _load_scales(self, path):
        """Read the chart-view JSON. Two accepted shapes:
          new bundle:  {"scales": {col:{scale,offset,label}},
                        "names":  {col: friendlyName},
                        "charted":[col, ...]}
          legacy flat: {col: {scale, offset, label}}      (scales only)
        Bad entries are dropped rather than failing the whole load."""
        try:
            raw = json.loads(Path(path).read_text(encoding="utf-8"))
        except Exception as e:
            print(f"[Viewer] could not load scales from {path}: {e}")
            return
        if isinstance(raw, dict) and ("scales" in raw or "names" in raw
                                      or "charted" in raw):
            scales_raw = raw.get("scales") or {}
            for col, nm in (raw.get("names") or {}).items():
                if isinstance(nm, str) and nm:
                    self.names[col] = nm
            for col in (raw.get("charted") or []):
                if isinstance(col, str):
                    self.charted.add(col)
        else:
            scales_raw = raw if isinstance(raw, dict) else {}
        for col, spec in scales_raw.items():
            try:
                self.scales[col] = {
                    "scale":  float(spec.get("scale", 1)),
                    "offset": float(spec.get("offset", 0)),
                    "label":  str(spec.get("label", col)),
                }
                # Scales' label doubles as a name fallback.
                if col not in self.names and spec.get("label"):
                    self.names[col] = str(spec["label"])
            except (TypeError, ValueError, AttributeError):
                continue

    def _disp(self, col):
        """Friendly display name for a column: configured name if we have
        one, else strip the gvar_/bvar_/sv_ prefix, else the raw key."""
        if col in self.names:
            return self.names[col]
        for p in ("gvar_", "bvar_", "sv_"):
            if col.startswith(p):
                return col[len(p):]
        return col

    # --------------------------------------------------------------- load
    def open_file(self):
        p = filedialog.askopenfilename(
            title="Open session log",
            filetypes=[("CSV logs", "*.csv"), ("All files", "*.*")])
        if p:
            self.load(p)

    def load(self, path):
        path = Path(path)
        if not path.exists():
            messagebox.showerror("MCC Log Viewer", f"File not found:\n{path}")
            return
        # Sidecar scales: lets a manually-opened CSV get the chart view too —
        # drop a viewer_scales.json next to the file (same format the server
        # writes at launch). Launch-provided scales take precedence.
        if not self.scales:
            sidecar = path.parent / "viewer_scales.json"
            if sidecar.exists():
                self._load_scales(sidecar)
                if self.scales:
                    self.scales_chk.state(["!disabled"])
                    self.apply_scales.set(True)
        self._stop_scan.set()              # abort any scan in progress
        self._stop_scan = threading.Event()
        self.csvfile = IndexedCSV(path)
        self.status.config(text=f"Scanning {path.name}…")
        self.root.title(f"MCC Log Viewer — {path.name}")

        stop = self._stop_scan

        def worker():
            try:
                self.csvfile.scan(
                    progress_cb=lambda fr, msg: self._scan_q.put(("prog", fr, msg)),
                    stop_flag=stop)
                self._scan_q.put(("done", None, None))
            except InterruptedError:
                pass
            except Exception as e:
                self._scan_q.put(("err", None, str(e)))

        threading.Thread(target=worker, daemon=True,
                         name="csv-scan").start()

    def _poll_scan_queue(self):
        try:
            while True:
                kind, fr, msg = self._scan_q.get_nowait()
                if kind == "prog":
                    self.prog["value"] = fr * 100
                    self.status.config(text=msg)
                elif kind == "done":
                    self.prog["value"] = 100
                    self._populate_after_scan()
                elif kind == "err":
                    messagebox.showerror("MCC Log Viewer", f"Scan failed:\n{msg}")
                    self.status.config(text="Scan failed")
        except queue.Empty:
            pass
        self.root.after(100, self._poll_scan_queue)

    def _populate_after_scan(self):
        cf = self.csvfile
        self.status.config(
            text=f"{cf.total_rows:,} rows · {len(cf.numeric_cols)} series · "
                 f"{cf.path.stat().st_size // (1024*1024)} MB")

        # Series checkboxes. Default visibility: exactly the signals shown
        # on the app's charts (the 'charted' list from launch). If none of
        # those columns exist in THIS file (different layout/session), fall
        # back to the first 6 so the plot isn't empty.
        for child in self.series_frame.winfo_children():
            child.destroy()
        self.visible = {}
        charted_here = self.charted & set(cf.numeric_cols)
        for i, col in enumerate(cf.numeric_cols):
            on = (col in charted_here) if charted_here else (i < 6)
            var = tk.BooleanVar(value=on)
            self.visible[col] = var
            ttk.Checkbutton(self.series_frame, text=self._disp(col),
                            variable=var,
                            command=self._refresh_visibility).pack(anchor="w")

        # Build lines (empty), then push the overview through _swap_data so
        # the scale/offset transform is applied in exactly one place.
        self.ax.clear()
        self.ax.set_xlabel("t" if not cf.t_is_index else "row #")
        self.ax.grid(True, alpha=0.3)
        self.lines = {}
        for col in cf.numeric_cols:
            (ln,) = self.ax.plot([], [], lw=0.8, label=col)
            ln.set_visible(self.visible[col].get())
            self.lines[col] = ln
        self._swap_data(cf.overview_t, cf.overview)

        # Check-event markers.
        for t, label in cf.check_events:
            if cf.t_min is not None and cf.t_min <= t <= (cf.t_max or t):
                self.ax.axvline(t, color="tab:red", ls="--", lw=0.7, alpha=0.6)
                self.ax.annotate(label, xy=(t, 1.0),
                                 xycoords=("data", "axes fraction"),
                                 fontsize=7, color="tab:red",
                                 ha="center", va="bottom")

        self._showing_window = False
        self._relegend()
        self.ax.relim(); self.ax.autoscale()
        self.canvas.draw_idle()

    # ------------------------------------------------------------ display
    def _relegend(self):
        shown = [c for c in self.lines if self.lines[c].get_visible()]
        if shown:
            self.ax.legend(loc="upper right", fontsize=7, ncol=2)
        elif self.ax.get_legend():
            self.ax.get_legend().remove()

    def _refresh_visibility(self):
        for col, ln in self.lines.items():
            ln.set_visible(self.visible[col].get())
        self._relegend()
        self.canvas.draw_idle()

    def _on_xlim_changed(self, ax):
        # Debounce: pan/zoom fires many limit changes per second.
        if self.csvfile is None or not self.csvfile.index:
            return
        if self._zoom_job:
            self.root.after_cancel(self._zoom_job)
        self._zoom_job = self.root.after(300, self._load_window)

    def _load_window(self):
        self._zoom_job = None
        cf = self.csvfile
        if cf is None or cf.t_min is None:
            return
        t0, t1 = self.ax.get_xlim()
        full_span = (cf.t_max - cf.t_min) or 1.0
        # If we're (nearly) zoomed out, the overview is the right data.
        if (t1 - t0) >= full_span * 0.98:
            if self._showing_window:
                self._swap_data(cf.overview_t, cf.overview)
                self._showing_window = False
            return
        self.status.config(text="Loading window…")
        self.root.update_idletasks()

        def worker():
            try:
                wt, wdata = cf.read_window(t0, t1)
                self.root.after(0, lambda: self._apply_window(wt, wdata))
            except Exception as e:
                self.root.after(0, lambda: self.status.config(
                    text=f"Window read failed: {e}"))

        threading.Thread(target=worker, daemon=True,
                         name="csv-window").start()

    def _apply_window(self, wt, wdata):
        if not wt:
            self.status.config(text="No rows in window")
            return
        self._swap_data(wt, wdata)
        self._showing_window = True
        self.status.config(text=f"Window: {len(wt):,} points/series")

    def _swap_data(self, t, data):
        """Single point where data reaches the plot. Stores the RAW values
        so the scale toggle can re-render without another disk read, then
        applies y' = y·scale + offset per column when the toggle is on.
        NaNs pass through unchanged (nan·s + o is still nan)."""
        self._cur_t, self._cur_data = t, data
        scaled = self.apply_scales.get() and bool(self.scales)
        for col, ln in self.lines.items():
            vals = data.get(col, [])
            base = self._disp(col)
            spec = self.scales.get(col) if scaled else None
            if spec and (spec["scale"] != 1 or spec["offset"] != 0):
                s, o = spec["scale"], spec["offset"]
                vals = [v * s + o for v in vals]
                ln.set_label(f"{base} ×{s:g}{o:+g}")
            else:
                ln.set_label(base)
            ln.set_data(t, vals)
        self._relegend()
        # Re-fit Y only — X stays where the user zoomed it.
        self.ax.relim(visible_only=True)
        self.ax.autoscale_view(scalex=False, scaley=True)
        self.canvas.draw_idle()

    def _on_scales_toggle(self):
        """Raw ↔ chart-scaled flip: re-render the data already on screen."""
        if self._cur_t:
            self._swap_data(self._cur_t, self._cur_data)
            self.status.config(text="Chart scale/offset applied"
                               if self.apply_scales.get() else "Raw values")

    # ------------------------------------------------------------ actions
    def zoom_full(self):
        cf = self.csvfile
        if cf is None or cf.t_min is None:
            return
        self._swap_data(cf.overview_t, cf.overview)
        self._showing_window = False
        self.ax.set_xlim(cf.t_min, cf.t_max)
        self.ax.relim(); self.ax.autoscale()
        self.canvas.draw_idle()
        self.status.config(text="Full view (overview resolution)")

    def _render_png(self):
        path = Path(tempfile.gettempdir()) / "mcc_log_view.png"
        self.fig.savefig(path, dpi=150, facecolor="white",
                         bbox_inches="tight")
        return path

    def print_view(self):
        if self.csvfile is None:
            return
        png = self._render_png()
        if sys.platform == "win32":
            try:
                os.startfile(str(png), "print")   # OS print dialog
                self.status.config(text=f"Sent to printer: {png.name}")
                return
            except Exception:
                try:
                    os.startfile(str(png))        # at least open it
                    return
                except Exception:
                    pass
        webbrowser.open("file://" + str(png))
        self.status.config(text=f"Rendered {png} — print from your image viewer")

    def save_png(self):
        if self.csvfile is None:
            return
        p = filedialog.asksaveasfilename(
            defaultextension=".png",
            filetypes=[("PNG image", "*.png")],
            initialfile=self.csvfile.path.stem + ".png")
        if p:
            self.fig.savefig(p, dpi=150, facecolor="white", bbox_inches="tight")
            self.status.config(text=f"Saved {p}")


def main():
    # Manual argv parse: [csv_path] [--scales scales.json] in any order.
    initial, scales_path = None, None
    args = sys.argv[1:]
    i = 0
    while i < len(args):
        if args[i] == "--scales" and i + 1 < len(args):
            scales_path = args[i + 1]
            i += 2
        else:
            initial = args[i]
            i += 1
    root = tk.Tk()
    try:
        ttk.Style().theme_use("clam")
    except Exception:
        pass
    ViewerApp(root, initial, scales_path)
    root.mainloop()


if __name__ == "__main__":
    main()
