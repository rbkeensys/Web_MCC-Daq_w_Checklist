# server/logger.py
"""
Buffered CSV logger for session data
Version: 2.1.3 (2026-03-09)

CHANGES from 2.0.0:
- BUGFIX: Header is now deferred for HEADER_SETTLE_FRAMES ticks so that
  buttonVars (which arrive from the frontend after the first few ticks)
  are included in the column schema instead of being silently dropped.
- Rows buffered during the settle window are flushed together with the
  header once the schema stops changing.
- New bvar_ columns appearing after the settle window are appended and
  all previously-written rows get empty cells backfilled in the CSV
  (file is reopened and rewritten - rare event, minimal overhead).

COLUMNS LOGGED:
  t                         - wall-clock timestamp
  ai{N}                     - analog input channels (scaled + filtered)
  ao{N}                     - analog output channels
  do{N}                     - digital output channels (0 / 1)
  tc{N}                     - thermocouple channels
  pid{N}_pv/sp/u/out/err/p/i/d/enabled  - PID loop telemetry
  expr{N}                   - expression output scalars
  gvar_{name}               - static / global variables (static.name = ...)
  bvar_{name}               - buttonVars from frontend (buttonVars.name)
  chk_events                - JSON array of checklist check events (written on close)

1 MB write buffer retained to prevent disk-I/O timing spikes on Windows.
"""

import csv
import io
import math
from pathlib import Path
from typing import Optional

# How many ticks to buffer before writing the header.
# At 100 Hz this is 0.5 s - plenty of time for the frontend to POST its
# buttonVars after the WebSocket connects.
HEADER_SETTLE_FRAMES = 50


def _safe(v):
    """Convert NaN / Inf / None to empty string so the CSV stays clean."""
    if v is None:
        return ""
    if isinstance(v, float) and not math.isfinite(v):
        return ""
    return v


def _extract_cols(frame: dict) -> list:
    """Return the ordered list of column names that a frame contributes."""
    cols = ["t"]

    for i, _ in enumerate(frame.get("ai", [])):
        cols.append(f"ai{i}")
    for i, _ in enumerate(frame.get("ao", [])):
        cols.append(f"ao{i}")
    for i, _ in enumerate(frame.get("do", [])):
        cols.append(f"do{i}")
    for i, _ in enumerate(frame.get("tc", [])):
        cols.append(f"tc{i}")

    for i, pid in enumerate(frame.get("pid", [])):
        prefix = f"pid{i}"
        for suffix in ("_pv", "_sp", "_u", "_out", "_err", "_p", "_i", "_d", "_enabled"):
            cols.append(prefix + suffix)

    for i, _ in enumerate(frame.get("expr", [])):
        cols.append(f"expr{i}")

    for name in sorted(frame.get("global_vars", {}).keys()):
        cols.append(f"gvar_{name}")

    for name in sorted(frame.get("button_vars", {}).keys()):
        cols.append(f"bvar_{name}")

    return cols


def _row_from_frame(frame: dict, col_idx: dict) -> list:
    """Serialise one frame into a CSV row using the given column index."""
    row = [""] * len(col_idx)

    def put(col, val):
        idx = col_idx.get(col)
        if idx is not None:
            row[idx] = _safe(val)

    put("t", frame.get("t"))

    for i, v in enumerate(frame.get("ai", [])):
        put(f"ai{i}", v)
    for i, v in enumerate(frame.get("ao", [])):
        put(f"ao{i}", v)
    for i, v in enumerate(frame.get("do", [])):
        put(f"do{i}", int(bool(v)) if v is not None else "")
    for i, v in enumerate(frame.get("tc", [])):
        put(f"tc{i}", v)

    for i, pid in enumerate(frame.get("pid", [])):
        if not isinstance(pid, dict):
            continue
        prefix = f"pid{i}"
        put(f"{prefix}_pv",      pid.get("pv"))
        put(f"{prefix}_sp",      pid.get("target"))
        put(f"{prefix}_u",       pid.get("u"))
        put(f"{prefix}_out",     pid.get("out"))
        put(f"{prefix}_err",     pid.get("err"))
        put(f"{prefix}_p",       pid.get("p_term"))
        put(f"{prefix}_i",       pid.get("i_term"))
        put(f"{prefix}_d",       pid.get("d_term"))
        put(f"{prefix}_enabled", 1 if pid.get("enabled") else 0)

    for i, expr in enumerate(frame.get("expr", [])):
        if isinstance(expr, dict):
            put(f"expr{i}", expr.get("output"))
        elif expr is not None:
            put(f"expr{i}", expr)

    for name, val in frame.get("global_vars", {}).items():
        put(f"gvar_{name}", val)

    for name, val in frame.get("button_vars", {}).items():
        put(f"bvar_{name}", val)

    return row


class SessionLogger:
    def __init__(self, folder: Path):
        self.path = folder / "session.csv"
        # CRITICAL: 1 MB buffer prevents synchronous disk flushes (Windows 80 ms+ spikes)
        self.f = open(self.path, "w", newline="", buffering=1024 * 1024)
        self.w = csv.writer(self.f)

        self._cols: Optional[list] = None    # finalised column list
        self._col_idx: Optional[dict] = None

        # Pre-header buffer: accumulate frames until schema stabilises
        self._pending_frames: list = []      # raw frame dicts
        self._settled = False                # True once header has been written

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _finalise_header(self):
        """
        Build the definitive column set from all buffered frames, write
        the header row, then flush every buffered frame as data rows.
        """
        # Union of all columns seen across all buffered frames, in stable order
        seen = {}
        for frame in self._pending_frames:
            for col in _extract_cols(frame):
                if col not in seen:
                    seen[col] = None
        self._cols = list(seen.keys())
        self._col_idx = {c: i for i, c in enumerate(self._cols)}

        # Write header then flush buffered rows
        self.w.writerow(self._cols)
        for frame in self._pending_frames:
            self.w.writerow(_row_from_frame(frame, self._col_idx))

        self._pending_frames = []
        self._settled = True

    def _rewrite_with_new_col(self, new_col: str):
        """
        A bvar_ / gvar_ column appeared after the header was already written.
        Rewrite the entire CSV to add the column (rare slow path).
        """
        print(f"[Logger] WARNING: new column '{new_col}' appeared after header – rewriting CSV")

        # Flush pending writes before reading back the file
        self.f.flush()

        # Read existing content via path (file handle is write-only)
        with open(self.path, newline="") as rf:
            existing_rows = list(csv.reader(rf))

        # Extend schema
        self._cols.append(new_col)
        self._col_idx[new_col] = len(self._cols) - 1

        # Close current handle, reopen for full rewrite, restore 1 MB buffer
        self.f.close()
        self.f = open(self.path, "w", newline="", buffering=1024 * 1024)
        self.w = csv.writer(self.f)

        self.w.writerow(self._cols)
        if len(existing_rows) > 1:
            for row in existing_rows[1:]:
                row.append("")
                self.w.writerow(row)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def write(self, frame: dict):
        if not self._settled:
            self._pending_frames.append(frame)
            if len(self._pending_frames) >= HEADER_SETTLE_FRAMES:
                self._finalise_header()
            return

        # --- Normal path: header already written ---
        # Check for new bvar_ / gvar_ columns that appeared after settle time
        for name in frame.get("button_vars", {}).keys():
            col = f"bvar_{name}"
            if col not in self._col_idx:
                self._rewrite_with_new_col(col)

        for name in frame.get("global_vars", {}).keys():
            col = f"gvar_{name}"
            if col not in self._col_idx:
                self._rewrite_with_new_col(col)

        self.w.writerow(_row_from_frame(frame, self._col_idx))

    def write_check_events(self, events: list):
        """
        Append (or rewrite) a chk_events column containing the JSON-serialised
        list of checklist check events.  Called by server.py on session stop.
        events = [{"t": float, "itemNum": int, "label": str}, ...]
        """
        import json
        if not events:
            return

        col = "chk_events"

        # Make sure the file is settled first
        if not self._settled and self._pending_frames:
            self._finalise_header()

        self.f.flush()

        # Read back the file
        with open(self.path, newline="") as rf:
            existing_rows = list(__import__("csv").reader(rf))

        if not existing_rows:
            return

        # We store the entire events JSON in row[1] of this column only;
        # all other rows get an empty cell.  This keeps the CSV valid while
        # making the payload easy to find on reload.
        json_str = json.dumps(events)

        if col in (existing_rows[0] if existing_rows else []):
            # Column already exists — overwrite row 1 value
            idx = existing_rows[0].index(col)
            if len(existing_rows) > 1:
                while len(existing_rows[1]) <= idx:
                    existing_rows[1].append("")
                existing_rows[1][idx] = json_str
        else:
            # Append new column
            existing_rows[0].append(col)
            if len(existing_rows) > 1:
                existing_rows[1].append(json_str)
            for row in existing_rows[2:]:
                row.append("")

        self.f.close()
        self.f = open(self.path, "w", newline="", buffering=1024 * 1024)
        self.w = __import__("csv").writer(self.f)
        for row in existing_rows:
            self.w.writerow(row)
        self.f.flush()

    def close(self):
        # Short session that never hit HEADER_SETTLE_FRAMES - flush now
        if not self._settled and self._pending_frames:
            self._finalise_header()
        self.f.close()
