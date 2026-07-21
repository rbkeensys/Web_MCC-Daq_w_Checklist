# server/logger.py
"""
Buffered CSV logger for session data
Version: 2.2.1 (2026-07-15)

CHANGES from 2.2.0:
- Optional t_zero: the t column logs RELATIVE time (frame t - t_zero) so a
  session can begin at T0 (Start New Log 'reset clocks' option). Check
  events embedded at close are shifted into the same frame.

CHANGES from 2.1.6:
- THREAD SAFETY + non-blocking schema growth: an RLock serializes the
  acquisition/control thread (write) against the HTTP save thread
  (add_columns). New gvar_/bvar_ columns now collect in a pending set and
  are added in ONE batched full-file rewrite (was: one multi-GB rewrite
  PER column, racing from BOTH threads -> doubled rewrites, _col_idx
  growing under _row_from_frame (IndexError: list assignment index out of
  range), the control loop stalled on file IO, and the post-compile hang).
  The batched rewrite runs on a background thread when triggered from
  write(); meanwhile write() buffers frames in memory (capped ~6min) and
  drains them in order afterwards -- the control loop NEVER blocks on the
  rewrite. add_columns() rewrites inline on the caller (HTTP) thread.
  close() takes the lock and drains before the check-event embed.

CHANGES from 2.1.5:
- remove_check_event(item_num): unchecking in the UI now removes the
  matching event from the in-memory accumulator, so the chk_events
  column embedded at session close matches the final checked state.

CHANGES from 2.1.4 (was 2.1.5):

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
import threading
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


def _gvars(frame: dict) -> dict:
    """All static/global variables for the gvar_ columns. In C++ DLL mode the
    runtime statics live in frame['static_vars'] (the cpp_backend array); the
    Python evaluator uses frame['global_vars']. Merge both (static_vars wins) so
    the gvar_ columns carry real values regardless of which backend is active --
    previously C++ mode logged empty gvar_ columns."""
    merged = dict(frame.get("global_vars", {}) or {})
    merged.update(frame.get("static_vars", {}) or {})
    return merged


def _build_name_for(col_names: dict) -> dict:
    """Map the generic column id (ai0, tc1, do2, expr5, ...) to a friendly
    header name from config / expression names, e.g. ai0 -> 'EvapPress',
    do0 -> 'MakeupHtr', expr5 -> 'MakeupControl'. Unnamed channels keep the
    generic id; a duplicate name is disambiguated with its generic id so CSV
    headers stay unique (duplicate headers would corrupt the value mapping)."""
    name_for, used = {}, set()
    for kind in ("ai", "ao", "do", "tc", "expr"):
        for i, nm in enumerate((col_names or {}).get(kind, []) or []):
            nm = str(nm).strip() if nm else ""
            if not nm:
                continue
            final = nm if nm not in used else f"{nm}_{kind}{i}"
            used.add(final)
            name_for[f"{kind}{i}"] = final
    return name_for


def _extract_cols(frame: dict, name_for: dict = None) -> list:
    """Return the ordered list of column names that a frame contributes.
    name_for translates generic ids (ai0/tc1/do2/expr5) to friendly names."""
    name_for = name_for or {}
    def nm(g): return name_for.get(g, g)
    cols = ["t"]

    for i, _ in enumerate(frame.get("ai", [])):
        cols.append(nm(f"ai{i}"))
    for i, _ in enumerate(frame.get("ao", [])):
        cols.append(nm(f"ao{i}"))
    for i, _ in enumerate(frame.get("do", [])):
        cols.append(nm(f"do{i}"))
    for i, _ in enumerate(frame.get("tc", [])):
        cols.append(nm(f"tc{i}"))

    for i, pid in enumerate(frame.get("pid", [])):
        prefix = f"pid{i}"
        for suffix in ("_pv", "_sp", "_u", "_out", "_err", "_p", "_i", "_d", "_enabled"):
            cols.append(prefix + suffix)

    for i, _ in enumerate(frame.get("expr", [])):
        cols.append(nm(f"expr{i}"))

    for i, _ in enumerate(frame.get("scales", [])):
        cols.append(f"scale{i}")

    for name in sorted(_gvars(frame).keys()):
        cols.append(f"gvar_{name}")

    for name in sorted(frame.get("button_vars", {}).keys()):
        cols.append(f"bvar_{name}")

    return cols


def _row_from_frame(frame: dict, col_idx: dict, name_for: dict = None, t_zero: float = 0.0) -> list:
    """Serialise one frame into a CSV row using the given column index.
    name_for must match the one used to build the header (generic id -> name).
    t_zero (2.2.1): subtracted from the t column so a session can log
    relative time starting at ~0 (the Start New Log 'reset clocks' option)."""
    row = [""] * len(col_idx)
    name_for = name_for or {}
    def nm(g): return name_for.get(g, g)

    def put(col, val):
        idx = col_idx.get(col)
        if idx is not None:
            row[idx] = _safe(val)

    tv = frame.get("t")
    if t_zero and isinstance(tv, (int, float)):
        tv = tv - t_zero
    put("t", tv)

    for i, v in enumerate(frame.get("ai", [])):
        put(nm(f"ai{i}"), v)
    for i, v in enumerate(frame.get("ao", [])):
        put(nm(f"ao{i}"), v)
    for i, v in enumerate(frame.get("do", [])):
        put(nm(f"do{i}"), int(bool(v)) if v is not None else "")
    for i, v in enumerate(frame.get("tc", [])):
        put(nm(f"tc{i}"), v)

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
            put(nm(f"expr{i}"), expr.get("output"))
        elif expr is not None:
            put(nm(f"expr{i}"), expr)

    for i, v in enumerate(frame.get("scales", [])):
        put(f"scale{i}", v)

    for name, val in _gvars(frame).items():
        put(f"gvar_{name}", val)

    for name, val in frame.get("button_vars", {}).items():
        put(f"bvar_{name}", val)

    return row


class SessionLogger:
    def __init__(self, folder: Path, known_columns: Optional[list] = None,
                 col_names: Optional[dict] = None, t_zero: Optional[float] = None):
        # col_names: {'ai':[names], 'ao':[...], 'do':[...], 'tc':[...], 'expr':[...]}
        # -> friendly CSV headers instead of ai0/ao0/do0/tc0/expr0.
        self._name_for = _build_name_for(col_names or {})
        # 2.2.1: optional relative-time logging -- t column = frame t - t_zero
        self._t_zero = float(t_zero) if t_zero else 0.0
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

        # 2.2.0 THREAD SAFETY + non-blocking schema growth. Two threads touch
        # this object: the acquisition/CONTROL loop (write() every tick) and
        # the HTTP save thread (add_columns() after an expression recompile).
        # Unsynchronized, both used to detect the same new gvar_ column and
        # each ran a full multi-GB CSV rewrite concurrently: doubled rewrites,
        # _col_idx growing under _row_from_frame's feet (the IndexError), the
        # control loop stalled for the whole file IO, and the client "hang on
        # compile". Now: one RLock; new columns collect in _pending_new_cols
        # and are added in ONE batched rewrite on a BACKGROUND thread; while
        # the rewrite runs, write() buffers frames in memory (never blocks the
        # control loop) and drains them afterwards.
        self._lock = threading.RLock()
        self._pending_new_cols: set = set()
        self._side_buf: list = []          # frames buffered during a rewrite
        self._rewrite_thread: Optional[threading.Thread] = None

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
            for col in _extract_cols(frame, self._name_for):
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
            self.w.writerow(_row_from_frame(frame, self._col_idx, self._name_for, self._t_zero))

        self._pending_frames = []
        self._settled = True

    def _rewrite_pending_cols(self):
        """
        Add ALL pending new columns in ONE full-file rewrite (slow path --
        multi-GB sessions take seconds). MUST be called with self._lock held.
        The old per-column version ran once per new column from two racing
        threads; a recompile adding 4 statics meant 8 concurrent multi-GB
        rewrites and a corrupted column index.
        """
        new_cols = sorted(c for c in self._pending_new_cols if c not in self._col_idx)
        self._pending_new_cols.clear()
        if not new_cols:
            return
        print(f"[Logger] adding {len(new_cols)} new column(s) in one rewrite: {', '.join(new_cols)}")

        # Flush pending writes before reading back the file
        self.f.flush()

        # Read existing content via path (file handle is write-only)
        with open(self.path, newline="") as rf:
            existing_rows = list(csv.reader(rf))

        # Extend schema (all at once)
        for c in new_cols:
            self._cols.append(c)
            self._col_idx[c] = len(self._cols) - 1

        # Close current handle, reopen for full rewrite, restore 1 MB buffer
        self.f.close()
        self.f = open(self.path, "w", newline="", buffering=1024 * 1024)
        self.w = csv.writer(self.f)

        pad = [""] * len(new_cols)
        self.w.writerow(self._cols)
        if len(existing_rows) > 1:
            for row in existing_rows[1:]:
                self.w.writerow(row + pad)
        print(f"[Logger] rewrite complete ({len(existing_rows)-1 if existing_rows else 0} rows)")

    def _drain_side_buf(self):
        """Write out frames buffered while a rewrite held the lock.
        MUST be called with self._lock held (after the schema is current)."""
        if not self._side_buf:
            return
        buf, self._side_buf = self._side_buf, []
        for fr in buf:
            self.w.writerow(_row_from_frame(fr, self._col_idx, self._name_for, self._t_zero))

    def _kick_bg_rewrite(self):
        """Run the batched rewrite on a background thread so the CONTROL loop
        (which calls write()) never blocks on multi-GB file IO."""
        if self._rewrite_thread is not None and self._rewrite_thread.is_alive():
            return

        def _run():
            with self._lock:
                try:
                    self._rewrite_pending_cols()
                    self._drain_side_buf()
                except Exception as e:
                    print(f"[Logger] background rewrite failed: {e}")

        self._rewrite_thread = threading.Thread(target=_run, daemon=True,
                                                name="logger-col-rewrite")
        self._rewrite_thread.start()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def add_columns(self, cols):
        """Pre-register columns introduced after the header settled (e.g. new
        gvar_/bvar_ columns from an expression recompile). All new columns are
        added in ONE batched rewrite, executed here on the CALLER's thread
        (the HTTP save thread -- fine to block) under the lock. Already-known
        columns are skipped. Before the header is written this is a no-op --
        _finalise_header() (and write()'s auto-add) will pick the columns up."""
        if not getattr(self, "_settled", False):
            return
        with self._lock:
            fresh = [c for c in (cols or []) if c not in self._col_idx]
            if fresh:
                self._pending_new_cols.update(fresh)
                self._rewrite_pending_cols()
                self._drain_side_buf()


    def write(self, frame: dict):
        if not self._settled:
            with self._lock:
                self._pending_frames.append(frame)
                if len(self._pending_frames) >= HEADER_SETTLE_FRAMES:
                    self._finalise_header()
            return

        # --- Normal path: header already written ---
        # NEVER block the control loop on the multi-GB rewrite: if another
        # thread holds the lock (a rewrite is running), buffer the frame in
        # memory; it drains -- in order -- when the rewrite finishes.
        if not self._lock.acquire(blocking=False):
            self._side_buf.append(frame)
            if len(self._side_buf) > 60000:      # ~6min at 160Hz -- hard cap
                self._side_buf.pop(0)
            return
        try:
            # Check for new bvar_ / gvar_ columns that appeared after settle
            # time. They go to the pending set and a BACKGROUND thread does one
            # batched rewrite -- this (control) thread just buffers the frame.
            fresh = set()
            for name in frame.get("button_vars", {}).keys():
                col = f"bvar_{name}"
                if col not in self._col_idx:
                    fresh.add(col)
            for name in _gvars(frame).keys():
                col = f"gvar_{name}"
                if col not in self._col_idx:
                    fresh.add(col)
            if fresh or self._pending_new_cols:
                self._pending_new_cols.update(fresh)
                self._side_buf.append(frame)
                self._kick_bg_rewrite()
                return
            self._drain_side_buf()
            self.w.writerow(_row_from_frame(frame, self._col_idx, self._name_for, self._t_zero))
        finally:
            self._lock.release()

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

    def remove_check_event(self, item_num):
        """Drop the most recent accumulated event for item_num (the user
        unchecked it). Keeps the chk_events column embedded at close in
        agreement with the final checklist state. O(n) on a small
        in-memory list — n is the number of checks this session."""
        for i in range(len(self._check_events_accum) - 1, -1, -1):
            if self._check_events_accum[i].get("itemNum") == item_num:
                del self._check_events_accum[i]
                return True
        return False

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

        # 2.2.1: with relative-time logging, shift event timestamps into the
        # same frame so replay marks align with the CSV's t column.
        if self._t_zero:
            shifted = []
            for e in events:
                e = dict(e)
                for k in ("t", "tServer"):
                    if isinstance(e.get(k), (int, float)):
                        e[k] = e[k] - self._t_zero
                shifted.append(e)
            events = shifted

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
        # Take the lock: a background column-rewrite may be mid-flight; also
        # flush any frames buffered while it ran.
        with self._lock:
            # Short session that never hit HEADER_SETTLE_FRAMES - flush now
            if not self._settled and self._pending_frames:
                self._finalise_header()
            if getattr(self, "_settled", False):
                try:
                    self._rewrite_pending_cols()
                    self._drain_side_buf()
                except Exception as e:
                    print(f"[Logger] close-time drain failed: {e}")
            # Embed all accumulated checklist check events as the chk_events
            # column. This is the slow file-rewrite operation that USED to
            # run on every X/Backspace key press — moved here so it happens
            # exactly once per session. Under the lock so a late write()/
            # rewrite can't interleave with the embed's file swap.
            try:
                self._embed_check_events_in_csv()
            except Exception as e:
                # Don't fail close() if the embed has trouble — the CSV data
                # rows are still intact, just without the chk_events column.
                print(f"[Logger] check-event embed on close failed: {e}")
            self.f.close()
