# server/logger.py
"""
Buffered CSV logger for session data
Version: 2.1.5 (2026-06-10)

CHANGES from 2.1.4:
- BUGFIX (regression introduced in 2.1.4): __init__ now accepts an
  optional known_columns parameter. server.py constructs SessionLogger
  as SessionLogger(dir, known_columns=...) and 2.1.4 lost that
  parameter, causing TypeError at acq-loop startup which killed
  expressions and static vars (they're populated by the acq loop's
  broadcast frame). 2.1.5 accepts known_columns and threads them
  through to _finalise_header so the pre-declared gvar_/bvar_ columns
  end up in the CSV header from the start without triggering the slow
  per-column rewrite path.

CHANGES from 2.1.3:
- BUGFIX (CRITICAL): write_check_events() no longer rewrites the entire
  CSV file on every call. Previously, every X/Backspace press in the
  checklist widget caused the server to read+rewrite the whole session
  CSV (potentially hundreds of MB), blocking the asyncio event loop for
  10-20 seconds and freezing the entire app. Now events are accumulated
  in memory and embedded in the CSV's chk_events column exactly once,
  at session close.

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

    for i, _ in enumerate(frame.get("scales", [])):
        cols.append(f"scale{i}")

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

    for i, v in enumerate(frame.get("scales", [])):
        put(f"scale{i}", v)

    for name, val in frame.get("global_vars", {}).items():
        put(f"gvar_{name}", val)

    for name, val in frame.get("button_vars", {}).items():
        put(f"bvar_{name}", val)

    return row


class SessionLogger:
    def __init__(self, folder: Path, known_columns: Optional[list] = None):
        self.path = folder / "session.csv"
        # CRITICAL: 1 MB buffer prevents synchronous disk flushes (Windows 80 ms+ spikes)
        self.f = open(self.path, "w", newline="", buffering=1024 * 1024)
        self.w = csv.writer(self.f)

        self._cols: Optional[list] = None    # finalised column list
        self._col_idx: Optional[dict] = None

        # Pre-header buffer: accumulate frames until schema stabilises
        self._pending_frames: list = []      # raw frame dicts
        self._settled = False                # True once header has been written

        # Known gvar_/bvar_ columns supplied by server startup. These get
        # folded into the header at finalisation time so the slow
        # "_rewrite_with_new_col" path never fires for them when they
        # first appear in a frame. Order is preserved (deduped). None or
        # empty list means "no pre-declared columns" — behaves exactly
        # like the older logger that didn't have this parameter.
        self._known_columns: list = []
        if known_columns:
            seen = set()
            for c in known_columns:
                if c and c not in seen:
                    seen.add(c)
                    self._known_columns.append(c)

        # Accumulator for checklist check events. write_check_events()
        # appends here in O(1) instead of rewriting the entire CSV on
        # every X/Backspace key press — which was causing 10-20 second
        # blocking on the asyncio event loop when sessions got large.
        # The events are embedded in the CSV's chk_events column exactly
        # once, during close().
        self._check_events_accum: list = []

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _finalise_header(self):
        """
        Build the definitive column set from all buffered frames, write
        the header row, then flush every buffered frame as data rows.
        Any pre-declared known_columns (gvar_/bvar_ names supplied at
        construction time) are appended to the column list — these get
        empty cells in any rows that don't carry a value for them.
        """
        # Union of all columns seen across all buffered frames, in stable order
        seen = {}
        for frame in self._pending_frames:
            for col in _extract_cols(frame):
                if col not in seen:
                    seen[col] = None
        # Add the pre-declared columns at the end so they're in the header
        # even if no buffered frame actually carried that variable yet.
        # The "rewrite when new column appears" path in write() never
        # fires for these because they're already in self._col_idx.
        for col in self._known_columns:
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
        Accumulate checklist check events for later embedding in the CSV.
        Returns immediately — the actual file rewrite happens in close().

        IMPORTANT: this was previously rewriting the entire CSV file on
        every call. That blocked the asyncio event loop for 10-20 seconds
        in large sessions, freezing the UI every time the user pressed X
        or Backspace in the checklist widget. Now it's O(1).

        events = [{"t": float, "itemNum": int, "label": str}, ...]
        """
        if not events:
            return
        # Append to the in-memory accumulator. Cheap, lock-free for our
        # use case (single producer — the API handler — at a time).
        self._check_events_accum.extend(events)

    def _embed_check_events_in_csv(self):
        """Rewrite the CSV file with a chk_events column on row 1 holding
        the JSON-serialised list of all accumulated check events. Called
        exactly once, from close(), so the 10-20s rewrite cost is paid
        only at session end (when the user is already waiting for things
        to finalise) instead of on every X/Backspace press.

        If no events were ever recorded, this is a no-op.
        """
        events = self._check_events_accum
        if not events:
            return

        import json
        col = "chk_events"

        # Make sure the file is settled and any buffered data is flushed.
        if not self._settled and self._pending_frames:
            self._finalise_header()
        try:
            self.f.flush()
        except Exception:
            pass

        # Read back the file
        with open(self.path, newline="") as rf:
            existing_rows = list(__import__("csv").reader(rf))

        if not existing_rows:
            return

        # We store the entire events JSON in row[1] of this column only;
        # all other rows get an empty cell. This keeps the CSV valid while
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
        # Embed all accumulated checklist check events as the chk_events
        # column. This is the slow file-rewrite operation that USED to
        # run on every X/Backspace key press — moved here so it happens
        # exactly once per session.
        try:
            self._embed_check_events_in_csv()
        except Exception as e:
            # Don't fail close() if the embed has trouble — the CSV data
            # rows are still intact, just without the chk_events column.
            print(f"[Logger] check-event embed on close failed: {e}")
        self.f.close()
