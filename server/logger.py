# server/logger.py
"""
Buffered CSV logger for session data
Version: 2.2.1 (2026-06-04)

CHANGES from 2.2.0:
- THREAD SAFETY: write(), add_columns(), write_check_events(), and close()
  are now serialized with an internal RLock. Previously the acq-loop's
  writerow could race the HTTP request thread's add_columns() — when
  put_expressions triggered a CSV rewrite, the close()+reopen() of self.f
  happened mid-write in the acq loop, crashing it with "I/O operation on
  closed file." All file-handle mutations are now atomic w.r.t. write().

Version: 2.2.0 (2026-06-03)

CHANGES from 2.1.3:
- PERFORMANCE: missing columns discovered in write() are now batched into
  a single CSV rewrite instead of one rewrite per column. Previously
  saving an expression that added 6 globals triggered 6 full-CSV reads
  + 6 full-CSV writes back-to-back; long sessions stalled the server
  for seconds. One batched rewrite is O(rows), not O(N*rows).
- NEW: __init__ accepts known_columns=[…] so callers can pre-declare
  gvar_/bvar_ names harvested at startup. Those names are unioned into
  the header at finalise time, so the slow rewrite path never fires
  for them at all.
- NEW: add_columns(names) public method. Call after a recompile/config
  change to register newly-introduced variables. Triggers at most one
  batched rewrite (or no rewrite if header hasn't settled yet).

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
import threading
from pathlib import Path
from typing import Optional, Iterable

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
    def __init__(self, folder: Path, known_columns: Optional[Iterable[str]] = None):
        """
        folder: where to write session.csv
        known_columns: optional iterable of column names that the caller
            knows will appear in frames (e.g. "gvar_LN2maintainPeriod",
            "bvar_run"). These get unioned into the header at finalise
            time so the *normal-path* rewrite mechanism never has to fire
            for any of them — eliminating the WARNING-storm + slow rewrite
            you'd otherwise see when the first frame containing a new
            global variable arrives after the header settled.

            Pass everything you know up front: harvest static-var names
            from the expression engine, button-var names from any UI
            registration, anything else stable that contributes a
            gvar_ / bvar_ column. The cost of including a column that's
            never populated is one empty CSV cell per row, which is far
            cheaper than even one mid-session rewrite.
        """
        self.path = folder / "session.csv"
        # CRITICAL: 1 MB buffer prevents synchronous disk flushes (Windows 80 ms+ spikes)
        self.f = open(self.path, "w", newline="", buffering=1024 * 1024)
        self.w = csv.writer(self.f)

        self._cols: Optional[list] = None    # finalised column list
        self._col_idx: Optional[dict] = None

        # Pre-header buffer: accumulate frames until schema stabilises
        self._pending_frames: list = []      # raw frame dicts
        self._settled = False                # True once header has been written

        # Pre-declared columns, unioned into the header at finalise time.
        # Stored as a stable-ordered list (insertion order) so re-runs
        # produce deterministic header layouts.
        self._predeclared_cols: list = []
        if known_columns:
            for c in known_columns:
                if isinstance(c, str) and c and c not in self._predeclared_cols:
                    self._predeclared_cols.append(c)

        # Serialize all mutations of self.f / self.w / self._cols / etc.
        # The acquisition loop calls write() from the asyncio event loop
        # thread; HTTP request handlers (put_expressions, put_pid, put_scales)
        # call add_columns() from FastAPI's threadpool. Without this lock,
        # the request thread can close+reopen self.f mid-write — surfacing
        # as "I/O operation on closed file" in the acq loop. RLock because
        # write() may itself trigger _rewrite_with_new_cols, and
        # write_check_events() calls _finalise_header — both re-enter the
        # lock from already-locked code paths.
        self._lock = threading.RLock()

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _finalise_header(self):
        """
        Build the definitive column set from all buffered frames AND any
        pre-declared columns the caller passed at construction time, write
        the header row, then flush every buffered frame as data rows.
        """
        # Union of all columns seen across all buffered frames, in stable order
        seen = {}
        for frame in self._pending_frames:
            for col in _extract_cols(frame):
                if col not in seen:
                    seen[col] = None
        # Then add any pre-declared columns that haven't already appeared.
        # These tend to be gvar_*/bvar_* names harvested from the expression
        # engine at startup — including them here means the slow-path
        # rewrite never has to fire for them later.
        for col in self._predeclared_cols:
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

    def _rewrite_with_new_cols(self, new_cols):
        """
        One or more bvar_ / gvar_ columns appeared after the header was
        already written. Rewrite the entire CSV ONCE, appending all of
        them at the same time.

        This is the slow path. Adding N columns the old way would do N
        full reads + N full rewrites — on a long session this is O(N*rows)
        and stalls the server for seconds. Batching collapses that to
        one read + one rewrite no matter how many columns appeared.
        """
        # Filter to genuinely new columns and preserve caller order
        new_cols = [c for c in new_cols if c not in self._col_idx]
        if not new_cols:
            return

        if len(new_cols) == 1:
            print(f"[Logger] new column '{new_cols[0]}' appeared after header – rewriting CSV")
        else:
            print(f"[Logger] {len(new_cols)} new columns appeared after header – rewriting CSV once: {new_cols}")

        # Flush pending writes before reading back the file
        self.f.flush()

        # Read existing content via path (file handle is write-only)
        with open(self.path, newline="") as rf:
            existing_rows = list(csv.reader(rf))

        # Extend schema with ALL new columns at once
        start_idx = len(self._cols)
        for c in new_cols:
            self._cols.append(c)
            self._col_idx[c] = len(self._cols) - 1
        n_added = len(new_cols)
        pad = [""] * n_added

        # Close current handle, reopen for full rewrite, restore 1 MB buffer
        self.f.close()
        self.f = open(self.path, "w", newline="", buffering=1024 * 1024)
        self.w = csv.writer(self.f)

        # New header, then every data row padded with n_added empty cells.
        self.w.writerow(self._cols)
        if len(existing_rows) > 1:
            for row in existing_rows[1:]:
                row.extend(pad)
                self.w.writerow(row)

    # Kept for backwards compatibility with any external caller.
    def _rewrite_with_new_col(self, new_col: str):
        self._rewrite_with_new_cols([new_col])

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def write(self, frame: dict):
        with self._lock:
            if not self._settled:
                self._pending_frames.append(frame)
                if len(self._pending_frames) >= HEADER_SETTLE_FRAMES:
                    self._finalise_header()
                return

            # --- Normal path: header already written ---
            # Collect ALL missing bvar_ / gvar_ columns from this frame first,
            # then do a single batched rewrite if any are new. This avoids
            # N back-to-back full-CSV rewrites when an expression save adds
            # several variables at once.
            missing = []
            for name in frame.get("button_vars", {}).keys():
                col = f"bvar_{name}"
                if col not in self._col_idx and col not in missing:
                    missing.append(col)
            for name in frame.get("global_vars", {}).keys():
                col = f"gvar_{name}"
                if col not in self._col_idx and col not in missing:
                    missing.append(col)
            if missing:
                self._rewrite_with_new_cols(missing)

            self.w.writerow(_row_from_frame(frame, self._col_idx))

    def add_columns(self, names):
        """
        Pre-register one or more column names (typically gvar_* or bvar_*).
        Safe to call at any time:
          * Before the header has settled, the names get folded into the
            initial header at finalise time (no rewrite).
          * After the header has settled, this triggers ONE batched rewrite
            of the whole CSV with all the new names appended.

        Use this when something the server knows about changes that
        will contribute new columns — e.g. after an expression recompile,
        when new static variables get introduced.

        Thread-safe: serialized with write() / close() so the file handle
        can't be swapped out from under an in-flight writerow.
        """
        if not names:
            return
        # Normalise to list, dedupe
        names = [n for n in names if isinstance(n, str) and n]
        if not names:
            return

        with self._lock:
            if not self._settled:
                for n in names:
                    if n not in self._predeclared_cols:
                        self._predeclared_cols.append(n)
                return

            self._rewrite_with_new_cols(names)

    def write_check_events(self, events: list):
        """
        Append (or rewrite) a chk_events column containing the JSON-serialised
        list of checklist check events.  Called by server.py on session stop.
        events = [{"t": float, "itemNum": int, "label": str}, ...]

        Thread-safe: serialized via the same lock as write() / add_columns()
        so the file handle can't be closed under an in-flight writerow.
        """
        import json
        if not events:
            return

        col = "chk_events"

        with self._lock:
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
        with self._lock:
            if not self._settled and self._pending_frames:
                self._finalise_header()
            self.f.close()
