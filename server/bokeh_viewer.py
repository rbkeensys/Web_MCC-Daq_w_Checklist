#!/usr/bin/env python3
"""bokeh_viewer.py v1.1.0 -- legend of visible series + app-chart colors from the bundle. Prev v1.0.1 -- axes follow only VISIBLE series (invisible clock counters at ~1e8 were setting the y-scale). Prev v1.0.0 -- browser-based log viewer (russ 9/11: "instead of
matplotlib how about bokeh?").

Renders a session CSV as a standalone interactive HTML page and opens it in
the default browser: wheel-zoom / pan / box-zoom / reset, hover readout with
the series name, and a searchable multi-select to choose which of the ~500
series are shown (the app's charted signals start visible). The scales
bundle (--scales, same file log_viewer takes) supplies friendly names and
display scale/offset.

Data budget: sessions up to EMBED_FULL_ROWS rows embed at FULL resolution
(an eco 1 Hz day is ~86k rows -- fine); bigger files are decimated to
~OVERVIEW_POINTS points per series. For forensic zooming inside multi-GB
full-rate logs, the Tk log_viewer.py (windowed re-reads) remains the tool.

CLI: bokeh_viewer.py <session.csv> [--scales scales.json]
If bokeh is not installed, exec log_viewer.py with the same arguments.
"""
import csv
import json
import math
import os
import sys
import webbrowser

__version__ = "1.1.0"

EMBED_FULL_ROWS = 120_000   # embed full resolution up to this many rows
OVERVIEW_POINTS = 4_000     # decimation target beyond that
MAX_SERIES      = 600


def parse_args(argv):
    initial, scales_path = None, None
    i = 0
    while i < len(argv):
        if argv[i] == "--scales" and i + 1 < len(argv):
            scales_path = argv[i + 1]
            i += 2
        else:
            initial = argv[i]
            i += 1
    return initial, scales_path


def load_bundle(scales_path):
    names, scales, charted, colors = {}, {}, [], {}
    if not scales_path or not os.path.isfile(scales_path):
        return names, scales, charted, colors
    try:
        raw = json.load(open(scales_path, encoding="utf-8"))
    except Exception:
        return names, scales, charted, colors
    if not isinstance(raw, dict):
        return names, scales, charted, colors
    if "scales" in raw or "names" in raw or "charted" in raw:
        names = {k: str(v) for k, v in (raw.get("names") or {}).items()}
        charted = [str(c) for c in (raw.get("charted") or [])]
        scales = raw.get("scales") or {}
        colors = {k: str(v) for k, v in (raw.get("colors") or {}).items()}
    else:
        scales = raw
    for col, spec in list(scales.items()):
        if isinstance(spec, dict) and spec.get("label") and col not in names:
            names[col] = str(spec["label"])
    return names, scales, charted, colors


def load_csv(path):
    """Stream the CSV; return (t, {col: values}) decimated to the budget."""
    fsize = os.path.getsize(path)
    with open(path, newline="", encoding="utf-8", errors="replace") as f:
        rdr = csv.reader(f)
        hdr = next(rdr)
        first = next(rdr)
        # estimate rows from the first data line
        approx = max(1, int(fsize / max(len(",".join(first)) + 1, 1)))
        stride = 1 if approx <= EMBED_FULL_ROWS else max(1, approx // OVERVIEW_POINTS)

        t_idx = None
        for i, c in enumerate(hdr):
            if c.lower() in ("t", "time", "timestamp"):
                t_idx = i
                break
        num_idx = []
        for i, v in enumerate(first):
            if i == t_idx or i >= len(hdr) or hdr[i] == "chk_events":
                continue
            try:
                float(v)
                num_idx.append(i)
            except (ValueError, TypeError):
                pass
        num_idx = num_idx[:MAX_SERIES]
        cols = {hdr[i]: [] for i in num_idx}
        t = []

        def take(row, n):
            if n % stride:
                return
            try:
                t.append(float(row[t_idx]) if t_idx is not None else float(n))
            except (ValueError, IndexError):
                return
            for i in num_idx:
                try:
                    cols[hdr[i]].append(float(row[i]))
                except (ValueError, IndexError):
                    cols[hdr[i]].append(math.nan)

        take(first, 0)
        n = 1
        for row in rdr:
            take(row, n)
            n += 1
    print("[bokeh-viewer] %s: %d rows read, stride %d -> %d points x %d series"
          % (os.path.basename(path), n, stride, len(t), len(cols)))
    return t, cols


def main():
    initial, scales_path = parse_args(sys.argv[1:])
    if not initial or not os.path.isfile(initial):
        print("usage: bokeh_viewer.py <session.csv> [--scales scales.json]")
        sys.exit(1)
    try:
        from bokeh.plotting import figure, output_file, save
        from bokeh.models import (ColumnDataSource, MultiChoice, CustomJS,
                                  HoverTool, Button, DataRange1d,
                                  Legend, LegendItem)
        from bokeh.layouts import column, row
        from bokeh.palettes import Category20_20
    except ImportError:
        # Fall back to the Tk viewer with identical arguments.
        print("[bokeh-viewer] bokeh not installed -- falling back to log_viewer.py")
        lv = os.path.join(os.path.dirname(os.path.abspath(__file__)), "log_viewer.py")
        os.execv(sys.executable, [sys.executable, lv] + sys.argv[1:])

    names, scales, charted, colors = load_bundle(scales_path)
    t, cols = load_csv(initial)

    # display transform (chart-style scaled view, like the Tk viewer)
    for col, spec in scales.items():
        if col in cols and isinstance(spec, dict):
            k = float(spec.get("scale", 1) or 1)
            b = float(spec.get("offset", 0) or 0)
            if k != 1 or b != 0:
                cols[col] = [v * k + b for v in cols[col]]

    data = {"t": t}
    data.update(cols)
    src = ColumnDataSource(data=data)

    # AUTO Y-SCALE (1.0.1, russ: "y values go into the millions"): the default
    # range follows ALL renderers including the ~470 invisible ones -- the
    # clock counters (sysMs ~1e8) set the scale and flatline everything real.
    # only_visible makes both axes track just the series you have on.
    p = figure(sizing_mode="stretch_both",
               y_range=DataRange1d(only_visible=True),
               x_range=DataRange1d(only_visible=True),
               title=os.path.basename(initial),
               x_axis_label="t (s)",
               tools="pan,wheel_zoom,box_zoom,reset,save",
               active_scroll="wheel_zoom",
               output_backend="webgl")
    p.toolbar.logo = None

    charted_set = [c for c in charted if c in cols]
    default_visible = charted_set or list(cols)[:8]
    label_of = lambda c: names.get(c, c)
    renderers = {}
    legend_items = {}
    for i, col in enumerate(cols):
        # APP-CHART COLORS (1.1.0): the bundle carries each charted series'
        # color from the app, so the viewer matches the dashboard; everything
        # else cycles the palette.
        renderers[col] = p.line(
            "t", col, source=src, name=col,
            line_width=1.3,
            color=colors.get(col, Category20_20[i % 20]),
            visible=(col in default_visible))
        legend_items[col] = LegendItem(label=label_of(col),
                                       renderers=[renderers[col]],
                                       visible=(col in default_visible))
    legend = Legend(items=list(legend_items.values()),
                    label_text_font_size="9pt", spacing=0, padding=4)
    p.add_layout(legend, "right")
    p.add_tools(HoverTool(
        tooltips=[("series", "$name"), ("t", "$x{0.00}"), ("value", "$y{0.000}")],
        line_policy="nearest"))
    options = sorted(((c, label_of(c)) for c in cols), key=lambda x: x[1].lower())
    picker = MultiChoice(
        value=default_visible,
        options=options,
        title="Visible series (type to search %d available)" % len(cols),
        sizing_mode="stretch_width")
    picker.js_on_change("value", CustomJS(
        args=dict(rmap=renderers, imap=legend_items),
        code="for (const [c, r] of Object.entries(rmap)) { const on = this.value.includes(c); r.visible = on; imap[c].visible = on; }"))

    btn_charted = Button(label="Charted", width=90)
    btn_charted.js_on_click(CustomJS(
        args=dict(picker=picker, val=default_visible),
        code="picker.value = val.slice();"))
    btn_none = Button(label="None", width=70)
    btn_none.js_on_click(CustomJS(args=dict(picker=picker), code="picker.value = [];"))

    out = os.path.splitext(initial)[0] + "_view.html"
    output_file(out, title="MCC Log — " + os.path.basename(initial))
    save(column(row(btn_charted, btn_none, picker, sizing_mode="stretch_width"),
                p, sizing_mode="stretch_both"))
    print("[bokeh-viewer] wrote", out)
    webbrowser.open("file:///" + out.replace(os.sep, "/"))


if __name__ == "__main__":
    main()
