/**
 * checklist_widget.js  — v1.1.0
 * Runtime checklist panel for MCC Web Control.
 */

'use strict';

window.CHECKLIST_VERSION = '1.20.1';  // 2026-08-27: FIX popout follower losing the host's row (russ: 'I'm on 10, he's on 45'): (1) HOST CURSOR KEEPALIVE -- host re-pushes the snapshot whenever its active row changes (1.5s throttle; server rebroadcasts 'set', every follower incl. popouts self-heals; Go-To jumps carried no check events so followers could never track them), (2) popout/reconnect host-sync re-adopts SILENTLY when the hosted checklist is the same file already loaded (the 'Follow it?' confirm was noise and declining it stranded the popout). Prev 1.20.0: 2026-08-27: SHARED CHECKLIST LIBRARY -- loading a .txt locally auto-publishes it to the server (PUT /api/checklists/{name}); new "🌐 Shared" toolbar button lists the server library and loads one with a click, so no computer ever needs the file hand-copied. Pairs with server 2.13.30. Prev 1.19.0: 2026-06-12: Host checkbox -- share this checklist with every connected computer (server-arbitrated claim/relinquish with popups on both sides, timeout denies, disconnect auto-releases; late joiners adopt on dock open; host re-pushes on file load/snapshot restore). Prev: Multi-computer checklist mirroring -- clApplyRemoteCheck/clApplyRemoteUncheck let relayed events from other machines check/uncheck items and move the cursor here, idempotently and without re-emitting. Prev: Unchecks now also POST /api/check_events/uncheck so the server relays them to other computers and trims the log accumulator. Prev: Check/uncheck/restore/clear relay through window.broadcastCheckEvent (BroadcastChannel in app.js) so popped-out charts get checkmarks from the main-page checklist and a popped-out checklist reaches main-page charts.

window.checklistItems     = [];
window.checklistActiveRow = 0;
window.checklistReturnRow = 0;
window.checklistShowRow   = 0;
window.checklistNumRows   = 5;
window.checklistLoaded    = false;
window.checklistPath      = '';
window.checkEvents        = [];

const CL_LINE_CHECKLISTITEM = 1;
const CL_LINE_COMMENT       = 0;

/* ================================================================ parsing */
function parseChecklistText(text) {
  const items = [];
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  for (const line of lines) {
    const fields = line.split('|');
    if (fields.length >= 3 && /^\s*\d+\s*$/.test(fields[0])) {
      items.push({
        itemNum:  parseInt(fields[0].trim(), 10),
        itemDest: fields[1] ?? '',
        itemText: (fields[2] ?? '').replace(/\t/g, '        '),
        checked:  fields.length > 3 ? (fields[3].trim() === '1' || fields[3].trim().toUpperCase() === 'X') : false,
        duration: fields.length > 4 ? (parseFloat(fields[4]) || 0) : 0,
        timeIn:   fields.length > 5 ? fields[5].trim() : '',
        timeOut:  fields.length > 6 ? fields[6].trim() : '',
        type: CL_LINE_CHECKLISTITEM
      });
    } else {
      items.push({ itemNum:0, itemDest:'', itemText:line, checked:false, duration:0, timeIn:'', timeOut:'', type:CL_LINE_COMMENT });
    }
  }
  return items;
}

function serializeChecklist(items, annotated) {
  const SIZES = [4, 4, 80, 4, 7, 8, 8, 1];
  let out = '';
  if (annotated) out += ' #  |DEST|' + 'ITEM'.padEnd(SIZES[2]) + '|CHK |  DUR  | TIME-IN | TIME-OUT|T\n';
  for (const it of items) {
    if (it.type === CL_LINE_CHECKLISTITEM) {
      if (annotated) {
        const pad = (s,w) => String(s??'').slice(0,w).padEnd(w);
        out += pad(it.itemNum,SIZES[0])+'|'+pad(it.itemDest,SIZES[1])+'|'+pad(it.itemText,SIZES[2])+'|'+
               pad(it.checked?'X':'O',SIZES[3])+'|'+pad(it.duration.toFixed(1),SIZES[4])+'|'+
               pad(it.timeIn,SIZES[5])+'|'+pad(it.timeOut,SIZES[6])+'|'+it.type+'\n';
      } else {
        out += `${it.itemNum}|${it.itemDest}|${it.itemText}\n`;
      }
    } else {
      out += it.itemText + '\n';
    }
  }
  return out;
}

/* ================================================================ snapshot */
function _clSaveSnapshot() {
  // Save full state to server's current session chk.json.
  // Called after every check/uncheck/goto/return/load change.
  if (!window.checklistLoaded) return;
  const snapshot = {
    checklistPath:    window.checklistPath || '',
    checklistActiveRow: window.checklistActiveRow,
    checklistReturnRow: window.checklistReturnRow,
    checklistShowRow:   window.checklistShowRow,
    checklistItems:   window.checklistItems,
    checkEvents:      window.checkEvents || []
  };
  // Fire-and-forget — defer so it doesn't block the UI
  setTimeout(() => {
    fetch('/api/check_events/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(snapshot)
    }).catch(() => {});
  }, 0);
}

function _clApplySnapshot(snap) {
  // Restore full checklist state from a snapshot object
  if (!snap || !Array.isArray(snap.checklistItems)) return false;
  window.checklistItems     = snap.checklistItems;
  window.checklistActiveRow = snap.checklistActiveRow ?? 0;
  window.checklistReturnRow = snap.checklistReturnRow ?? 0;
  window.checklistShowRow   = snap.checklistShowRow   ?? 0;
  window.checkEvents        = snap.checkEvents || [];
  window.broadcastCheckEvent?.('replace', { events: window.checkEvents });
  window.checklistLoaded    = true;
  if (snap.checklistPath) window.checklistPath = snap.checklistPath;
  _renderTable();
  if (_clAmHost) setTimeout(_clHostPush, 50);   // hosting? share restored state
  return true;
}

/* ================================================================ panel */
let _clPanel    = null;
let _clTbody    = null;
let _clDurTimer = null;

function buildChecklistPanel() {
  const panel = document.createElement('div');
  panel.className = 'cl-panel';
  panel.setAttribute('tabindex', '0');

  panel.innerHTML = `
    <div class="cl-toolbar">
      <button class="btn cl-btn" id="clLoadBtn"   title="Load checklist (Ctrl+O)">📂 Load</button>
      <button class="btn cl-btn" id="clSharedBtn" title="Load a checklist from the server library (auto-published whenever any computer loads one locally)">🌐 Shared</button>
      <button class="btn cl-btn" id="clSaveBtn"   title="Save annotated (Ctrl+S)">💾 Save</button>
      <button class="btn cl-btn" id="clGotoBtn"   title="Jump to item (Ctrl+G)">⤵ Go-To</button>
      <button class="btn cl-btn" id="clReturnBtn" title="Return to saved pos (Ctrl+R)">↩ Return</button>
      <button class="btn cl-btn" id="clSetRetBtn" title="Set return point (Ctrl+[)">📌 Set Ret</button>
      <button class="btn cl-btn" id="clRowsBtn"   title="Set visible rows (Ctrl+N)">≡ Rows</button>
      <button class="btn cl-btn" id="clFontDownBtn" title="Smaller font">A−</button>
      <button class="btn cl-btn" id="clFontUpBtn"   title="Larger font">A+</button>
      <button class="btn cl-btn" id="clPopBtn"      title="Pop out checklist to a separate window">📤 Pop</button>
      <button class="btn cl-btn" id="clInsBtn"   title="Insert item below active (Ins)">⤵ Insert</button>
      <button class="btn cl-btn" id="clRenumBtn" title="Renumber items in order and rewrite GOTO references">🔢 Renum</button>
      <label class="cl-host-lbl" title="Host this checklist: every connected computer follows this copy" style="display:inline-flex;align-items:center;gap:4px;font-size:11px;color:#a8b3cf;cursor:pointer;margin-left:4px"><input type="checkbox" id="clHostChk"> Host</label>
      <span class="cl-status" id="clStatus">No checklist loaded</span>
    </div>
    <div class="cl-table-wrap" id="clTableWrap">
      <table class="cl-table">
        <thead><tr>
          <th class="cl-th cl-num">#</th>
          <th class="cl-th cl-dest">Dest</th>
          <th class="cl-th cl-item">Item</th>
          <th class="cl-th cl-chk">✓</th>
          <th class="cl-th cl-dur">Dur</th>
          <th class="cl-th cl-time">Time In</th>
          <th class="cl-th cl-time">Time Out</th>
        </tr></thead>
        <tbody id="clTbody"></tbody>
      </table>
    </div>
    <div class="cl-hint">X = check &nbsp;|&nbsp; Backspace = uncheck &nbsp;|&nbsp; ↑↓ = scroll &nbsp;|&nbsp; Dbl-click item to edit</div>
  `;

  _clPanel = panel;
  _clTbody = panel.querySelector('#clTbody');

  // Toolbar wiring
  panel.querySelector('#clLoadBtn').onclick   = clOpenFile;
  panel.querySelector('#clSharedBtn').onclick = (e) => clOpenShared(e.currentTarget);
  panel.querySelector('#clHostChk').onchange  = _clHostToggle;
  // Late joiner: if a host is already active, offer/adopt its checklist.
  setTimeout(_clHostSyncOnMount, 400);
  // HOST CURSOR KEEPALIVE (1.20.1): followers track the host by check-event
  // deltas, which carry NO cursor for jumps (Go-To/Return) and can be missed
  // across a popout open -- a follower could sit on row 10 while the host ran
  // row 45. While hosting, re-push the full snapshot whenever the active row
  // changes (throttled): the server rebroadcasts 'set' and every follower --
  // popouts included, they own a WebSocket -- self-heals within ~2s.
  if (!window._clHostRowTimer) {
    window._clHostRowTimer = setInterval(() => {
      if (_clAmHost && window.checklistLoaded &&
          window.checklistActiveRow !== window._clLastPushedRow) {
        _clHostPush();
      }
    }, 1500);
  }
  panel.querySelector('#clSaveBtn').onclick   = () => clSaveFile(true);
  panel.querySelector('#clGotoBtn').onclick   = clGoto;
  panel.querySelector('#clReturnBtn').onclick = clReturn;
  panel.querySelector('#clSetRetBtn').onclick = clSetReturn;
  panel.querySelector('#clRowsBtn').onclick   = clSetRows;
  panel.querySelector('#clFontDownBtn').onclick = () => clNudgeFont(-0.1);
  panel.querySelector('#clFontUpBtn').onclick   = () => clNudgeFont(+0.1);
  // The Pop button only makes sense in the main window — inside a popout
  // it'd mean "pop out the popout" which is nonsense. Hide it in the
  // popout window itself.
  const popBtn = panel.querySelector('#clPopBtn');
  if (popBtn) {
    if (_CL_IS_CHECKLIST_POPOUT) {
      popBtn.style.display = 'none';
    } else {
      popBtn.onclick = clPopOutChecklist;
    }
  }
  panel.querySelector('#clInsBtn').onclick    = clInsertBelow;
  const renumBtn = panel.querySelector('#clRenumBtn');
  if (renumBtn) renumBtn.onclick = clRenumber;

  // Restore the user's preferred font scale from a previous session.
  // Must run after the panel is in the DOM so clApplyFontScale can find it.
  clRestoreFontScale();

  // Key events on the panel itself
  panel.addEventListener('keydown', clKeyHandler);

  // Auto-focus when mouse enters the panel or clicks anywhere in it
  panel.addEventListener('mouseenter', () => panel.focus());
  panel.addEventListener('mousedown',  (e) => {
    // Only focus if not clicking a button/input (let those handle themselves)
    if (!e.target.closest('button, input, select, textarea')) {
      e.preventDefault();   // prevent blur of panel
      panel.focus();
    }
  });

  if (!_clDurTimer) _clDurTimer = setInterval(_clTickDuration, 100);

  _renderTable();
  return panel;
}

/* ================================================================ render */
function _renderTable() {
  if (!_clTbody) return;
  const items  = window.checklistItems;
  const active = window.checklistActiveRow;
  _clTbody.innerHTML = '';

  items.forEach((it, i) => {
    const tr = document.createElement('tr');
    tr.dataset.row = i;
    tr.className = 'cl-tr' +
      (i === active           ? ' cl-active'  : '') +
      (it.checked             ? ' cl-checked' : '') +
      (it.type===CL_LINE_COMMENT ? ' cl-comment' : '');

    if (it.type === CL_LINE_CHECKLISTITEM) {
      tr.innerHTML = `
        <td class="cl-td cl-num">${it.itemNum}</td>
        <td class="cl-td cl-dest">${_esc(it.itemDest)}</td>
        <td class="cl-td cl-item cl-item-text" data-row="${i}">${_esc(it.itemText)}</td>
        <td class="cl-td cl-chk">${it.checked ? '✓' : '○'}</td>
        <td class="cl-td cl-dur" data-durrow="${i}">${it.duration.toFixed(1)}</td>
        <td class="cl-td cl-time">${_esc(it.timeIn)}</td>
        <td class="cl-td cl-time">${_esc(it.timeOut)}</td>`;
      tr.querySelector('.cl-item-text').addEventListener('dblclick', () => clEditItemText(i));
    } else {
      tr.innerHTML = `<td class="cl-td cl-comment-text" colspan="7">${_esc(it.itemText)}</td>`;
      tr.querySelector('.cl-comment-text').addEventListener('dblclick', () => clEditItemText(i));
    }
    _clTbody.appendChild(tr);
  });

  _scrollToActive();
  _updateStatus();
}

function _updateStatus() {
  const el = _clPanel?.querySelector('#clStatus');
  if (!el) return;
  if (!window.checklistLoaded) { el.textContent = 'No checklist loaded'; return; }
  const items = window.checklistItems;
  const total = items.filter(x => x.type===CL_LINE_CHECKLISTITEM).length;
  const done  = items.filter(x => x.type===CL_LINE_CHECKLISTITEM && x.checked).length;
  const cur   = items[window.checklistActiveRow];
  const name  = window.checklistPath ? window.checklistPath.split(/[\\/]/).pop() : '';
  el.textContent = `${name}  |  #${cur?.itemNum??'?'}  |  ${done}/${total}`;
}

function _scrollToActive() {
  // Just scroll to the active row — the actual sizing is handled by
  // _clRefitWindow which is called whenever numRows or font scale changes.
  _clRefitWindow();
  const tr = _clTbody?.querySelector(`tr[data-row="${window.checklistActiveRow}"]`);
  if (tr) tr.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

/**
 * Resize the checklist dock so that exactly checklistNumRows rows are
 * visible. Triggered when:
 *   - rows count changes (clSetRows)
 *   - font scale changes (clNudgeFont / clRestoreFontScale)
 *   - the checklist is (re)loaded
 *   - the user drags the dock corner (we recompute numRows from the new
 *     height — keeping the two ways of controlling row count consistent)
 *
 * "Row count is authoritative." Whatever causes a change, the resulting
 * state is: dockHeight = chromeHeight + headerRowHeight + numRows * rowHeight.
 * That guarantees the visible row count matches numRows regardless of
 * font scale, and that font/row changes grow or shrink the window
 * proportionally instead of just letting the visible row count drift.
 */
function _clRefitWindow() {
  const dock = document.getElementById('clDock');
  const wrap = _clPanel?.querySelector('#clTableWrap');
  if (!dock || !wrap) return;
  const table = wrap.querySelector('table.cl-table');
  if (!table) return;

  // Measure actual row height by inspecting a real <tr> in the tbody.
  // If the table is empty (no checklist loaded), fall back to a font-scale
  // weighted estimate that matches what the rules in styles.css produce
  // at the current --cl-scale. 24px at scale 1.0 lines up with the
  // table's font-size:12px + 5px top/bottom padding from .cl-td.
  const tbody = table.querySelector('tbody');
  const sampleRow = tbody && tbody.querySelector('tr');
  const scale = parseFloat(getComputedStyle(dock).getPropertyValue('--cl-scale')) || 1;
  let rowH = sampleRow ? sampleRow.getBoundingClientRect().height : 0;
  if (!rowH || rowH < 6) rowH = 24 * scale;

  // Header row (<thead><tr>) — measure if visible, otherwise estimate.
  const headRow = table.querySelector('thead tr');
  let headH = headRow ? headRow.getBoundingClientRect().height : 0;
  if (!headH || headH < 6) headH = 22 * scale;

  // Chrome around the wrap inside the dock: drag handle + toolbar + hint
  // footer + borders. Measured from the rendered elements so it stays
  // accurate if any of those are re-styled or scaled later.
  const handle  = dock.querySelector('.cl-drag-handle');
  const toolbar = _clPanel?.querySelector('.cl-toolbar');
  const hint    = _clPanel?.querySelector('.cl-hint');
  const handleH  = handle  ? handle.getBoundingClientRect().height  : 30;
  const toolbarH = toolbar ? toolbar.getBoundingClientRect().height : 36;
  const hintH    = hint    ? hint.getBoundingClientRect().height    : 22;
  // A few pixels for dock border + flexbox math fudge.
  const chromeH = handleH + toolbarH + hintH + 6;

  const n = Math.max(1, Math.min(15, window.checklistNumRows | 0 || 5));
  const wrapH = headH + n * rowH + 2;       // +2 for the thin border row
  const dockH = chromeH + wrapH;

  // Lock the wrap to exactly N rows worth of space (not maxHeight — using
  // explicit height makes the row count visible-rows-exactly, not
  // up-to-N-depending-on-other-content).
  wrap.style.height    = wrapH + 'px';
  wrap.style.maxHeight = wrapH + 'px';
  // Signal the ResizeObserver that the dock height change about to fire
  // came from us, not from the user dragging the corner. Without this
  // the observer would convert our refit-computed height back into a
  // numRows value (possibly off-by-one due to sub-pixel rounding) and
  // we'd be stuck in a refit/observe loop.
  window._clProgrammaticResize = true;
  dock.style.height    = dockH + 'px';
}

/**
 * Convert a user-dragged dock height back into a numRows value, so the
 * two controls stay consistent. Called from the ResizeObserver in the
 * dock's self-mount path. Returns true if numRows actually changed.
 */
function _clNumRowsFromDockHeight() {
  const dock = document.getElementById('clDock');
  const wrap = _clPanel?.querySelector('#clTableWrap');
  if (!dock || !wrap) return false;
  const table = wrap.querySelector('table.cl-table');
  if (!table) return false;

  const tbody = table.querySelector('tbody');
  const sampleRow = tbody && tbody.querySelector('tr');
  const scale = parseFloat(getComputedStyle(dock).getPropertyValue('--cl-scale')) || 1;
  let rowH = sampleRow ? sampleRow.getBoundingClientRect().height : 0;
  if (!rowH || rowH < 6) rowH = 24 * scale;

  const headRow = table.querySelector('thead tr');
  let headH = headRow ? headRow.getBoundingClientRect().height : 22 * scale;

  const handle  = dock.querySelector('.cl-drag-handle');
  const toolbar = _clPanel?.querySelector('.cl-toolbar');
  const hint    = _clPanel?.querySelector('.cl-hint');
  const chromeH = (handle  ? handle.getBoundingClientRect().height  : 30)
                + (toolbar ? toolbar.getBoundingClientRect().height : 36)
                + (hint    ? hint.getBoundingClientRect().height    : 22) + 6;

  const dockH = dock.getBoundingClientRect().height;
  const wrapH = dockH - chromeH;
  const n = Math.max(1, Math.min(15, Math.round((wrapH - headH) / rowH)));
  if (n !== window.checklistNumRows) {
    window.checklistNumRows = n;
    return true;
  }
  return false;
}

function _clTickDuration() {
  if (!window.checklistLoaded) return;
  const items  = window.checklistItems;
  const active = window.checklistActiveRow;
  if (active >= items.length || items[active].type !== CL_LINE_CHECKLISTITEM) return;
  items[active].duration += 0.1;
  const cell = _clTbody?.querySelector(`td[data-durrow="${active}"]`);
  if (cell) cell.textContent = items[active].duration.toFixed(1);
}

function _nowStr() {
  return new Date().toLocaleTimeString('en-US', { hour12:false });
}

function _esc(s) {
  return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/* ================================================================ check / uncheck */
/* ------------------------- checklist hosting -----------------------------
 * The Host checkbox shares THIS checklist with every connected computer.
 * Server-arbitrated: claiming while another live host exists asks them to
 * relinquish (their popup); the requester waits (our popup) until granted,
 * denied, or timeout. The hosted payload is a snapshot object, so adoption
 * is just _clApplySnapshot(); afterwards the normal check/uncheck relay
 * keeps everyone in step. */
let _clAmHost = false;
let _clHostWaitDiv = null;
let _clHostWaitTimer = null;

function _clBuildHostPayload() {
  return {
    checklistItems:     window.checklistItems,
    checklistActiveRow: window.checklistActiveRow,
    checklistReturnRow: window.checklistReturnRow,
    checklistShowRow:   window.checklistShowRow,
    checkEvents:        window.checkEvents || [],
    checklistPath:      window.checklistPath || 'checklist.txt',
  };
}

function _clSetHostChk(on) {
  const chk = _clPanel?.querySelector('#clHostChk');
  if (chk) chk.checked = !!on;
}

function _clCloseHostWait() {
  if (_clHostWaitTimer) { clearTimeout(_clHostWaitTimer); _clHostWaitTimer = null; }
  if (_clHostWaitDiv)   { _clHostWaitDiv.remove(); _clHostWaitDiv = null; }
}

function _clShowHostWait(ttl) {
  _clCloseHostWait();
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);' +
    'display:flex;align-items:center;justify-content:center;z-index:99999';
  const box = document.createElement('div');
  box.style.cssText = 'background:#1d2233;border:1px solid #3e4668;border-radius:8px;' +
    'padding:18px 22px;color:#e6e6e6;font-size:14px;max-width:380px;text-align:center';
  box.innerHTML = '<div style="margin-bottom:12px">Requesting to host checklist from other computers\u2026</div>';
  const cancel = document.createElement('button');
  cancel.className = 'btn'; cancel.textContent = 'Cancel';
  cancel.onclick = () => {
    _clCloseHostWait();
    _clSetHostChk(false);
    fetch('/api/checklist_host/cancel', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: window.MCC_CLIENT_ID })
    }).catch(() => {});
  };
  box.append(cancel);
  d.append(box);
  document.body.append(d);
  _clHostWaitDiv = d;
  // Local timeout slightly under the server TTL so OUR dialog resolves
  // first; the server denies the stale claim on its own clock anyway.
  _clHostWaitTimer = setTimeout(() => {
    _clCloseHostWait();
    _clSetHostChk(false);
    fetch('/api/checklist_host/cancel', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: window.MCC_CLIENT_ID })
    }).catch(() => {});
    alert('No response from the current host \u2014 request expired.');
  }, Math.max(5, (ttl || 30) - 3) * 1000);
}

async function _clHostToggle(e) {
  const want = e.target.checked;
  if (want) {
    if (!window.checklistLoaded) {
      alert('Load a checklist first \u2014 hosting shares YOUR copy with the other computers.');
      e.target.checked = false;
      return;
    }
    if (!window.MCC_CLIENT_ID) {
      alert('Not connected to the server yet \u2014 try again in a moment.');
      e.target.checked = false;
      return;
    }
    try {
      const r = await fetch('/api/checklist_host/claim', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: window.MCC_CLIENT_ID,
                               checklist: _clBuildHostPayload() })
      });
      const j = await r.json();
      if (j.ok && j.granted) {
        // The broadcast 'set' confirms and flips _clAmHost.
      } else if (j.ok && j.pending) {
        _clShowHostWait(j.ttl);
      } else {
        alert(j.error || 'Hosting request failed.');
        e.target.checked = false;
      }
    } catch (err) {
      alert('Hosting request failed: ' + err.message);
      e.target.checked = false;
    }
  } else if (_clAmHost) {
    fetch('/api/checklist_host/release', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: window.MCC_CLIENT_ID })
    }).catch(() => {});
  }
}

/* Push a refreshed copy to the server while hosting (host loaded a new
 * file or restored a snapshot). The claim endpoint treats a claim from
 * the current host as a data refresh + rebroadcast. */
function _clHostPush() {
  if (!_clAmHost || !window.checklistLoaded) return;
  window._clLastPushedRow = window.checklistActiveRow;
  fetch('/api/checklist_host/claim', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: window.MCC_CLIENT_ID,
                           checklist: _clBuildHostPayload() })
  }).catch(() => {});
}

/* Server messages routed here by app.js (type === 'cl_host'). */
window.clHostMessage = function (msg) {
  switch (msg.op) {
    case 'request': {
      // We are the current host; someone wants it.
      const ok = confirm('Another computer is requesting to host the checklist.\n' +
                         'Do you want to relinquish hosting to them?');
      fetch('/api/checklist_host/respond', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: window.MCC_CLIENT_ID, allow: ok })
      }).then(r => r.json()).then(j => {
        if (!j.ok) alert(j.error || 'The request had already expired.');
      }).catch(() => {});
      break;
    }
    case 'set': {
      const mine = !!(msg.host_id && msg.host_id === window.MCC_CLIENT_ID);
      const wasHost = _clAmHost;
      _clAmHost = mine;
      _clSetHostChk(mine);
      if (mine) {
        _clCloseHostWait();
      } else if (msg.host_id && msg.checklist) {
        _clCloseHostWait();           // covers losing a pending race
        if (wasHost) alert('Hosting was transferred to another computer; this checklist now follows theirs.');
        _clApplySnapshot(msg.checklist);
      }
      // host_id === null: hosting ended; keep current local state as-is.
      break;
    }
    case 'granted':  _clCloseHostWait(); break;   // 'set' carries the rest
    case 'denied':
      _clCloseHostWait();
      _clSetHostChk(false);
      alert('The current host declined to relinquish hosting.');
      break;
    case 'timeout':
      _clCloseHostWait();
      _clSetHostChk(false);
      alert('Hosting request expired \u2014 no response from the current host.');
      break;
  }
};

/* Dock just opened: if a host is already active elsewhere, adopt (with a
 * confirm when it would replace a locally loaded checklist). */
async function _clHostSyncOnMount() {
  try {
    const r = await fetch('/api/checklist_host');
    const j = await r.json();
    if (!j.host_id || !j.checklist) return;
    if (j.host_id === window.MCC_CLIENT_ID) { _clAmHost = true; _clSetHostChk(true); return; }
    // Same checklist file already loaded (e.g. a popout of a following
    // window, or a reconnect): re-adopt silently -- the prompt is noise and
    // declining it is how a popout ended up stranded rows behind the host.
    const samePath = window.checklistLoaded &&
      (j.checklist.checklistPath || '') === (window.checklistPath || '');
    if (window.checklistLoaded && !samePath &&
        !confirm('A hosted checklist is active (' + (j.checklist.checklistPath || '?') +
                 ').\nFollow it? This replaces your current checklist.')) return;
    _clApplySnapshot(j.checklist);
  } catch {}
}

function clCheck() {
  const items  = window.checklistItems;
  let   active = window.checklistActiveRow;
  if (!window.checklistLoaded || active >= items.length) return;
  // Skip comment rows — advance to next real item
  if (items[active].type !== CL_LINE_CHECKLISTITEM) {
    for (let i=active+1; i<items.length; i++) {
      if (items[i].type === CL_LINE_CHECKLISTITEM) { window.checklistActiveRow = i; active = i; break; }
    }
    if (items[active].type !== CL_LINE_CHECKLISTITEM) return;
  }

  // Fire chart event — store wall-clock tServer for CSV/replay sync
  const ts = _currentT();
  const ev = { t: ts.tServer, tServer: ts.tServer, itemNum: items[active].itemNum, label: String(items[active].itemNum) };
  window.checkEvents.push(ev);
  window.dispatchEvent(new CustomEvent('checklist-check', { detail: ev }));
  // Relay to other windows (popped-out charts / main page when WE are the
  // popped-out checklist). No-op when the sync layer isn't loaded.
  window.broadcastCheckEvent?.('add', { ev });

  fetch('/api/check_events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ events: [ev] })
  }).catch(() => {});

  items[active].checked = true;
  items[active].timeOut = _nowStr();

  // Advance to next unchecked item
  let next = active;
  for (let i=active+1; i<items.length; i++) {
    if (items[i].type === CL_LINE_CHECKLISTITEM && !items[i].checked) { next = i; break; }
  }
  if (next !== active) {
    window.checklistActiveRow = next;
    items[next].timeIn   = _nowStr();
    items[next].duration = 0;
  }

  window.checklistShowRow = window.checklistActiveRow;
  _renderTable();
  _clSaveSnapshot();
}

/* ---------------- remote checklist mirroring (multi-computer) -----------
 * Applied when ANOTHER computer (or another window) checks/unchecks an
 * item; events arrive via the server WS relay -> app.js
 * applyRemoteCheckEvent -> these hooks. They mutate the local checklist
 * state the same way clCheck/clUncheck do, but emit NOTHING (no POST, no
 * broadcast, no snapshot save -- the originator did all that), so there
 * are no echo loops. Both are idempotent by matching on itemNum AND the
 * current checked state: an echo of our own action, or a duplicate
 * delivery, finds nothing left to change and no-ops.                     */
window.clApplyRemoteCheck = function (ev) {
  const items = window.checklistItems;
  if (!window.checklistLoaded || !items || !ev) return;
  // First UNCHECKED item with this number. Already-checked => echo/dup => no-op.
  let idx = -1;
  for (let i = 0; i < items.length; i++) {
    if (items[i].type === CL_LINE_CHECKLISTITEM &&
        items[i].itemNum === ev.itemNum && !items[i].checked) { idx = i; break; }
  }
  if (idx < 0) return;
  items[idx].checked = true;
  items[idx].timeOut = _nowStr();
  // Mirror clCheck's cursor advance when the checked row IS our active
  // row (the normal both-screens-in-step case). If our cursor is
  // elsewhere (operator browsing), just mark the box and leave it be.
  if (idx === window.checklistActiveRow) {
    let next = idx;
    for (let i = idx + 1; i < items.length; i++) {
      if (items[i].type === CL_LINE_CHECKLISTITEM && !items[i].checked) { next = i; break; }
    }
    if (next !== idx) {
      window.checklistActiveRow = next;
      items[next].timeIn   = _nowStr();
      items[next].duration = 0;
    }
    window.checklistShowRow = window.checklistActiveRow;
  }
  _renderTable();
};

window.clApplyRemoteUncheck = function (itemNum) {
  const items = window.checklistItems;
  if (!window.checklistLoaded || !items) return;
  // Last CHECKED item with this number. Already-unchecked => echo => no-op.
  let idx = -1;
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i].type === CL_LINE_CHECKLISTITEM &&
        items[i].itemNum === itemNum && items[i].checked) { idx = i; break; }
  }
  if (idx < 0) return;
  const active = window.checklistActiveRow;
  items[idx].checked  = false;
  items[idx].timeIn   = '';
  items[idx].timeOut  = '';
  items[idx].duration = 0;
  // Mirror clUncheck's cursor retreat when the unchecked row is at or
  // before our active row; zero the abandoned active row's times like
  // the local path does.
  if (idx <= active) {
    window.checklistActiveRow = idx;
    window.checklistShowRow   = idx;
    if (active !== idx && items[active]) {
      items[active].timeIn   = '';
      items[active].timeOut  = '';
      items[active].duration = 0;
    }
    items[idx].timeIn = _nowStr();   // it is the active row again; resume timing
  }
  _renderTable();
};

function clUncheck() {
  const items  = window.checklistItems;
  const active = window.checklistActiveRow;
  if (!window.checklistLoaded || active >= items.length) return;

  // If a GoTo is in effect (returnRow is set), Backspace cancels the goto:
  // zero the current item and return to the saved return row, same as clReturn()
  // but also zeroing times/duration on the current item.
  if (window.checklistReturnRow) {
    const ret = window.checklistReturnRow;

    // Move active row first so _clTickDuration stops on the old row
    window.checklistActiveRow = ret;
    window.checklistShowRow   = ret;

    // Zero the jumped-to item (was counting but never checked)
    items[active].timeIn   = '';
    items[active].timeOut  = '';
    items[active].duration = 0;

    // Clear the return mark from the return row and restore its timeIn
    const retItem = items[ret];
    if (retItem?.itemText.startsWith('>< ')) retItem.itemText = retItem.itemText.slice(3);
    retItem.timeIn  = _nowStr();
    retItem.timeOut = '';
    window.checklistReturnRow = 0;

    _renderTable();
    _clSaveSnapshot();
    return;
  }

  // Normal backspace: find the last checked item strictly before active
  let target = -1;
  for (let i = active - 1; i >= 0; i--) {
    if (items[i].type === CL_LINE_CHECKLISTITEM && items[i].checked) { target = i; break; }
  }
  // If active itself is checked, uncheck it
  if (target < 0 && items[active].type === CL_LINE_CHECKLISTITEM && items[active].checked) {
    target = active;
  }
  if (target < 0) return;

  // Remove the matching chart event
  const removedNum = items[target].itemNum;
  const idx = window.checkEvents.map(e => e.itemNum).lastIndexOf(removedNum);
  if (idx >= 0) window.checkEvents.splice(idx, 1);

  // Dispatch event so app.js removes the chart mark
  window.dispatchEvent(new CustomEvent('checklist-uncheck', { detail: { itemNum: removedNum } }));
  window.broadcastCheckEvent?.('remove', { itemNum: removedNum });
  // Tell the server too: it relays the removal to OTHER computers and
  // drops the event from the session log accumulator.
  fetch('/api/check_events/uncheck', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ itemNum: removedNum })
  }).catch(() => {});

  // Move active row FIRST so _clTickDuration immediately stops on old active row
  window.checklistActiveRow = target;
  window.checklistShowRow   = target;

  // NOW zero old active row (timer no longer touches it)
  if (active !== target) {
    items[active].timeIn   = '';
    items[active].timeOut  = '';
    items[active].duration = 0;
  }

  // Zero the target item (being unchecked)
  items[target].checked  = false;
  items[target].timeIn   = '';
  items[target].timeOut  = '';
  items[target].duration = 0;

  _renderTable();
  _clSaveSnapshot();
}

/* ================================================================ keyboard */
function clKeyHandler(e) {
  const ctrl = e.ctrlKey || e.metaKey;
  switch(e.key) {
    case 'x': case 'X': clCheck();        e.preventDefault(); break;
    case 'Backspace':   clUncheck();      e.preventDefault(); break;
    case 'ArrowUp':     clScrollView(-1); e.preventDefault(); break;
    case 'ArrowDown':   clScrollView(+1); e.preventDefault(); break;
    case 'o': if(ctrl){ clOpenFile();    e.preventDefault(); } break;
    case 's': if(ctrl){ clSaveFile(true);e.preventDefault(); } break;
    case 'g': if(ctrl){ clGoto();        e.preventDefault(); } break;
    case 'r': if(ctrl){ clReturn();      e.preventDefault(); } break;
    case '[': if(ctrl){ clSetReturn();   e.preventDefault(); } break;
    case 'n': if(ctrl){ clSetRows();     e.preventDefault(); } break;
    case 'Insert':      clInsertBelow(); e.preventDefault(); break;
  }
}

function clScrollView(dir) {
  const n = window.checklistItems.length;
  window.checklistShowRow = Math.max(0, Math.min(n-1, window.checklistShowRow + dir));
  const tr = _clTbody?.querySelector(`tr[data-row="${window.checklistShowRow}"]`);
  if (tr) tr.scrollIntoView({ block:'center', behavior:'smooth' });
}

function _currentT() {
  // tServer = wall-clock Unix epoch, same as the CSV t column.
  // This is what gets stored in checkEvents and matched against buf tServer in the chart.
  let tServer;
  if (typeof replayData !== 'undefined' && replayData &&
      typeof replayIndex !== 'undefined') {
    // replayIndex is the *next* row to play; use replayIndex-1 for current
    const ri = Math.max(0, (replayIndex || 1) - 1);
    const row = replayData.rows[ri];
    if (row) { tServer = row[0]; }  // col 0 = t (Unix epoch)
  }
  if (!tServer) {
    // Live mode: state.lastT is the server wall-clock from the last tick
    tServer = (typeof state !== 'undefined' && state.lastT) || (Date.now() / 1000);
  }
  return { tServer };
}

/* ================================================================ toolbar actions */
/* Apply checklist text as the freshly loaded checklist (shared by the local
 * file picker and the server "Shared" library load). */
function _clApplyLoadedText(name, text) {
  window.checklistPath      = name;
  window.checklistItems     = parseChecklistText(text);
  window.checklistActiveRow = 0;
  window.checklistShowRow   = 0;
  window.checklistReturnRow = 0;
  window.checklistLoaded    = true;
  if (window.checklistItems.length > 0) window.checklistItems[0].timeIn = _nowStr();
  window.checkEvents = [];
  window.broadcastCheckEvent?.('replace', { events: [] });
  _renderTable();
  if (_clPanel) _clPanel.focus();
  _clHostPush();   // hosting? share the freshly loaded file
}

/* Publish a locally loaded checklist to the server library so ANY other
 * computer can pull it (Shared button) instead of hand-copying the file.
 * Fire-and-forget: view-only clients get a 403 and that's fine. */
function _clPublishShared(name, text) {
  const base = String(name || 'checklist').replace(/\.txt$/i, '');
  fetch('/api/checklists/' + encodeURIComponent(base), {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  }).then(r => r.json()).then(j => {
    if (j.ok) console.log('[Checklist] published to server library as', j.name);
  }).catch(() => {});
}

/* "Shared" toolbar button: list the server's checklist library, one click
 * loads. Anything anyone loaded locally on any computer is in here. */
async function clOpenShared(anchorBtn) {
  let j;
  try { j = await (await fetch('/api/checklists')).json(); }
  catch (e) { alert('Server not reachable.'); return; }
  if (!j.ok) { alert(j.error || 'Failed to list shared checklists.'); return; }
  if (!j.names || !j.names.length) {
    alert('No shared checklists on the server yet.\nLoad a checklist locally on any computer and it is shared automatically.');
    return;
  }
  document.getElementById('clSharedMenu')?.remove();
  const m = document.createElement('div');
  m.id = 'clSharedMenu';
  m.style.cssText = 'position:fixed;z-index:10000;background:#1e2235;border:1px solid #4c5170;border-radius:6px;padding:4px;min-width:180px;max-height:60vh;overflow-y:auto;box-shadow:0 4px 16px rgba(0,0,0,.5)';
  const r = anchorBtn.getBoundingClientRect();
  m.style.left = r.left + 'px';
  m.style.top  = (r.bottom + 4) + 'px';
  j.names.forEach(n => {
    const b = document.createElement('div');
    b.textContent = n;
    b.style.cssText = 'padding:4px 10px;font-size:12px;color:#e6e6e6;cursor:pointer;border-radius:4px;white-space:nowrap';
    b.onmouseenter = () => b.style.background = '#2a2f4a';
    b.onmouseleave = () => b.style.background = '';
    b.onclick = async () => {
      m.remove();
      if (window.checklistLoaded &&
          !confirm('Load shared checklist "' + n + '"?\nThis replaces the current checklist.')) return;
      try {
        const g = await (await fetch('/api/checklists/' + encodeURIComponent(n))).json();
        if (!g.ok) { alert(g.error || 'Failed to fetch checklist.'); return; }
        _clApplyLoadedText(g.name + '.txt', g.text);
        console.log('[Checklist] loaded shared checklist', g.name);
      } catch (e) { alert('Failed to fetch checklist: ' + e.message); }
    };
    m.append(b);
  });
  document.body.append(m);
  const close = (ev) => {
    if (!m.contains(ev.target)) { m.remove(); document.removeEventListener('pointerdown', close, true); }
  };
  setTimeout(() => document.addEventListener('pointerdown', close, true));
}

function clOpenFile() {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = '.txt';
  inp.onchange = () => {
    const f = inp.files?.[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      _clApplyLoadedText(f.name, rd.result);
      _clPublishShared(f.name, rd.result);   // auto-share: this computer becomes a supplier

      // Offer to restore a saved snapshot (chk.json) for this checklist
      if (confirm('Load a saved checkpoint (.chk.json) to restore where you left off?\n(Cancel to start fresh)')) {
        const ci = document.createElement('input');
        ci.type = 'file'; ci.accept = '.json';
        ci.onchange = () => {
          const cf = ci.files?.[0]; if (!cf) return;
          const cr = new FileReader();
          cr.onload = () => {
            try {
              const snap = JSON.parse(cr.result);
              if (_clApplySnapshot(snap)) {
                // Also restore chart marks from checkEvents
                window.dispatchEvent(new CustomEvent('checklist-snapshot-loaded', { detail: snap }));
                console.log('[Checklist] Snapshot restored from', cf.name);
              } else {
                alert('Invalid snapshot file.');
              }
            } catch(e) { alert('Failed to load snapshot: ' + e.message); }
          };
          cr.readAsText(cf);
        };
        ci.click();
      }
    };
    rd.readAsText(f);
  };
  inp.click();
}

function clSaveFile(annotated) {
  if (!window.checklistLoaded) { alert('No checklist loaded.'); return; }
  const text = serializeChecklist(window.checklistItems, annotated);
  const base = (window.checklistPath||'checklist').replace(/\.txt$/i,'');
  _downloadText((annotated ? base+'_annotated' : base+'_clean')+'.txt', text);
  // Also save a snapshot when user explicitly saves the checklist
  _clSaveSnapshot();
}

function clGoto() {
  const s = prompt('Jump to item number:'); if (!s) return;
  const num = parseInt(s, 10);
  const idx = window.checklistItems.findIndex(it => it.itemNum === num);
  if (idx < 0) { alert(`Item ${num} not found.`); return; }
  _clClearReturnMark();
  window.checklistReturnRow = window.checklistActiveRow;
  _clMarkReturn(window.checklistReturnRow);
  window.checklistItems[window.checklistActiveRow].timeOut = _nowStr();
  window.checklistActiveRow = idx;
  window.checklistShowRow   = idx;
  window.checklistItems[idx].timeIn = _nowStr();
  _renderTable();
  _clSaveSnapshot();
}

function clReturn() {
  const ret = window.checklistReturnRow; if (!ret) return;
  window.checklistItems[window.checklistActiveRow].timeOut = _nowStr();
  window.checklistActiveRow = ret;
  window.checklistShowRow   = ret;
  const it = window.checklistItems[ret];
  if (it?.itemText.startsWith('>< ')) { it.itemText = it.itemText.slice(3); window.checklistReturnRow = 0; }
  window.checklistItems[ret].timeIn = _nowStr();
  _renderTable();
  _clSaveSnapshot();
}

function clSetReturn() {
  _clClearReturnMark();
  window.checklistReturnRow = window.checklistActiveRow;
  _clMarkReturn(window.checklistActiveRow);
  _renderTable();
  _clSaveSnapshot();
}

function _clMarkReturn(idx) {
  const it = window.checklistItems[idx];
  if (it && !it.itemText.startsWith('>< ')) it.itemText = '>< ' + it.itemText;
}

function _clClearReturnMark() {
  const it = window.checklistItems[window.checklistReturnRow];
  if (it?.itemText.startsWith('>< ')) it.itemText = it.itemText.slice(3);
}

function clSetRows() {
  const s = prompt(`Visible rows (1-15, current: ${window.checklistNumRows}):`, window.checklistNumRows);
  if (!s) return;
  const n = parseInt(s,10);
  if (n>=1 && n<=15) { window.checklistNumRows = n; _scrollToActive(); }
}

/* ---------------------------------------------------------------- font size
   The checklist panel uses CSS custom property --cl-scale to scale all
   font-sizes and row padding together (see styles.css .cl-panel block).
   We persist the user's chosen scale to localStorage so it survives reloads.
   The store key is intentionally namespaced ('mcc.checklist.fontScale') so
   it doesn't collide with anything else the app might want to remember. */
const CL_FONT_SCALE_KEY = 'mcc.checklist.fontScale';
const CL_FONT_SCALE_MIN  = 0.7;
const CL_FONT_SCALE_MAX  = 2.0;
const CL_FONT_SCALE_STEP = 0.1;
window.clFontScale = 1.0;

function clApplyFontScale() {
  // Silent — just sets the CSS variable. Called both on user nudges and
  // on session-restore at mount. The toast notification is separate
  // (clAnnounceFontScale) so first-load doesn't flash an unsolicited
  // "Font 100%" message at the user.
  const panel = document.querySelector('.cl-panel');
  if (panel) panel.style.setProperty('--cl-scale', String(window.clFontScale));
}

function clAnnounceFontScale() {
  // Temporary status-bar toast showing the current scale percentage.
  // Auto-restores the normal status text after ~900ms.
  const status = document.getElementById('clStatus');
  if (!status) return;
  const pct = Math.round(window.clFontScale * 100);
  // Stash the current text once so repeated nudges all restore to the
  // same baseline rather than chaining "Font 110%" → "Font 120%" forever.
  if (!status.dataset.origText) status.dataset.origText = status.textContent;
  status.textContent = `Font ${pct}%`;
  clearTimeout(window._clFontScaleToast);
  window._clFontScaleToast = setTimeout(() => {
    if (typeof _updateStatus === 'function') {
      _updateStatus();
    } else if (status.dataset.origText) {
      status.textContent = status.dataset.origText;
    }
    delete status.dataset.origText;
  }, 900);
}

function clNudgeFont(delta) {
  const next = Math.max(CL_FONT_SCALE_MIN,
                        Math.min(CL_FONT_SCALE_MAX,
                                 Math.round((window.clFontScale + delta) * 100) / 100));
  if (next === window.clFontScale) return;
  window.clFontScale = next;
  clApplyFontScale();
  // After the browser has applied the new --cl-scale, the rendered row
  // height has changed — refit the dock so numRows visible stays correct.
  requestAnimationFrame(() => {
    if (typeof _clRefitWindow === 'function') _clRefitWindow();
  });
  clAnnounceFontScale();
  try { localStorage.setItem(CL_FONT_SCALE_KEY, String(next)); }
  catch (e) { /* localStorage may be disabled — non-fatal */ }
}

function clRestoreFontScale() {
  try {
    const v = parseFloat(localStorage.getItem(CL_FONT_SCALE_KEY));
    if (Number.isFinite(v) && v >= CL_FONT_SCALE_MIN && v <= CL_FONT_SCALE_MAX) {
      window.clFontScale = v;
    }
  } catch (e) { /* no localStorage — keep default 1.0 */ }
  // Apply silently — no toast for the restore-on-mount path.
  clApplyFontScale();
  // Same dance as clNudgeFont — refit after the browser applies the var.
  requestAnimationFrame(() => {
    if (typeof _clRefitWindow === 'function') _clRefitWindow();
  });
}

/* ============================================================== pop-out ===

   Move the checklist to a separate browser window for multi-monitor
   layouts. Ownership semantics (intentionally simple):
   
     - While popped out: the popout window owns the state and the user
       interacts there. The main window's dock is hidden and its duration
       timer is paused so it doesn't double-tick the durations.
     - On close: the popout copies its state back to the opener's globals
       so the main window can resume cleanly.
     - State copying is one-shot at popout open / popout close. This
       deliberately avoids the synchronization complexity of "both windows
       editing the same data live"; the main window's dock is invisible
       while popped out anyway, so the user doesn't lose anything.        */

const _CL_POPOUT_STATE_KEYS = [
  // Primitive globals that need to round-trip explicitly. Arrays/objects
  // can pass by reference, but primitives need copy semantics.
  'checklistActiveRow', 'checklistShowRow', 'checklistLoaded',
  'checklistFilename', 'checklistNumRows', 'clFontScale',
];

function clPopOutChecklist() {
  // Already open? Just focus it.
  if (window._clPopoutWindow && !window._clPopoutWindow.closed) {
    window._clPopoutWindow.focus();
    return;
  }

  // 'popup' strips the browser chrome (address bar / tabs / menu) so the
  // checklist gets the whole window. 'resizable=yes' explicitly allows
  // dragging the OS border to resize. See the matching popOutWidget()
  // call in app.js for fuller commentary.
  const features = 'popup,width=720,height=520,resizable=yes,menubar=no,toolbar=no,location=no,status=no';
  const popWin = window.open('/popout.html?popout=checklist', '_blank', features);
  if (!popWin) {
    alert('Could not open popout window — please allow popups for this site.');
    return;
  }
  window._clPopoutWindow = popWin;

  // Pause our timer and hide our dock. The popout will mount its own
  // dock + timer when it loads.
  if (_clDurTimer) {
    clearInterval(_clDurTimer);
    _clDurTimer = null;
  }
  window.checklistPoppedOut = true;
  const dock = document.getElementById('clDock');
  if (dock) dock.style.display = 'none';

  // Fallback close detection in case the popout fails to fire its
  // beforeunload notification (e.g. browser quit). The popout's normal
  // close path calls window.opener._clChecklistPopoutClosed() directly.
  const watcher = setInterval(() => {
    if (popWin.closed) {
      clearInterval(watcher);
      _clChecklistPopoutClosed();
    }
  }, 1000);
}

/**
 * Called from the popout window's beforeunload (or by our 1Hz watcher if
 * the popout was closed without firing beforeunload). Pulls the popout's
 * state back into our globals and re-shows the dock.
 *
 * The popout calls this on us via window.opener._clChecklistPopoutClosed()
 * BEFORE its own globals get torn down. So at the moment we run, the
 * popout's window is still alive and we can read from it.
 */
window._clChecklistPopoutClosed = function _clChecklistPopoutClosed() {
  const popWin = window._clPopoutWindow;
  if (popWin && !popWin.closed) {
    // Copy primitive globals back from the popout.
    try {
      for (const k of _CL_POPOUT_STATE_KEYS) {
        if (k in popWin) window[k] = popWin[k];
      }
      // Arrays passed by reference shouldn't need to be copied — but
      // if the popout reassigned the array (e.g. via clLoadFile),
      // we need to pick up the new reference.
      if (Array.isArray(popWin.checklistItems)) {
        window.checklistItems = popWin.checklistItems;
      }
    } catch (e) {
      console.warn('[Checklist popout] State copy-back failed:', e);
    }
  }
  window._clPopoutWindow = null;
  window.checklistPoppedOut = false;

  // Re-show the dock if a checklist is still loaded; restart the timer.
  const dock = document.getElementById('clDock');
  if (dock && window.checklistLoaded) dock.style.display = 'flex';
  if (!_clDurTimer) _clDurTimer = setInterval(_clTickDuration, 100);

  // Re-render with the popout's possibly-mutated state.
  _renderTable();
  if (typeof _clRefitWindow === 'function') {
    requestAnimationFrame(_clRefitWindow);
  }
};

/**
 * Called by the popout window's own DOMContentLoaded init path. Sets up
 * the popout's globals by copying from the opener, then runs the normal
 * self-mount + auto-load path.
 *
 * Returns true on success so the popout's init code can know whether the
 * state arrived. Returns false if the opener isn't reachable (in which
 * case the popout init should show an error and not try to mount).
 */
window._clInitChecklistPopout = function _clInitChecklistPopout() {
  try {
    if (!window.opener) return false;
    // Copy primitives in.
    for (const k of _CL_POPOUT_STATE_KEYS) {
      if (k in window.opener) window[k] = window.opener[k];
    }
    // Adopt the opener's array reference. Mutations to individual items
    // in the popout will be visible to the opener via the shared reference,
    // BUT the opener won't react (it's not rendering); the dock-back path
    // re-renders on close.
    if (Array.isArray(window.opener.checklistItems)) {
      window.checklistItems = window.opener.checklistItems;
    }
    return true;
  } catch (e) {
    console.warn('[Checklist popout] Init failed:', e);
    return false;
  }
};

function clInsertBelow() {
  if (!window.checklistLoaded) return;
  const items  = window.checklistItems;
  const active = window.checklistActiveRow;
  const maxNum = items.reduce((m,x) => Math.max(m, x.itemNum||0), 0);
  const insertAt = active + 1;
  items.splice(insertAt, 0, {
    itemNum: maxNum+1, itemDest:'', itemText:'New Item',
    checked:false, duration:0, timeIn:'', timeOut:'', type:1
  });
  window.checklistActiveRow = insertAt;
  window.checklistShowRow   = insertAt;
  _renderTable();
  // Prompt to edit text immediately
  setTimeout(() => clEditItemText(insertAt), 50);
}

/* =========================================================== renumber ===

   Renumber all checklist items in order with a user-chosen step size,
   then rewrite any `GOTO nnnn` references in item or comment text so
   they still point at the right line.

   Design notes:
     - Comments (type=CL_LINE_COMMENT) are skipped entirely; they keep
       itemNum:0 and don't advance the step counter.
     - The rewrite is atomic: we build the complete (old -> new) map
       FIRST, then walk the items and substitute GOTO references using
       that map. A one-at-a-time renumber-and-rewrite would risk a
       GOTO 100 pointing at OLD item 100 accidentally picking up the
       new item that just got numbered 100.
     - GOTO regex /\bgoto\s+(\d+)\b/gi:
         * \b on goto excludes "AGOTO", "GOTOS", etc.
         * case-insensitive so GOTO / Goto / goto all match; we preserve
           the user's original casing via the captured word.
         * \s+ requires whitespace between word and number so "GOTO250"
           (which is almost certainly a variable name) doesn't match.
         * trailing \b prevents consuming part of a larger number.
     - Unresolved references (GOTO N where no item had number N) are
       LEFT UNTOUCHED in the text. The user gets a count so they can
       investigate. Silent rewriting to "?" or deletion would be worse
       than a visible bad reference.                                     */
function clRenumber() {
  if (!window.checklistLoaded) {
    alert('Load a checklist first.');
    return;
  }
  const items = window.checklistItems;
  if (!items || items.length === 0) return;

  // 1. Ask for step size. Default 10 (BASIC-style "renumber by tens"
  //    leaves room for inserts without re-renumbering).
  const stepStr = prompt(
    'Renumber items with what step size?\n\n' +
    '(First item gets the step value; e.g. step=10 → items become 10, 20, 30, ...)\n' +
    'Comments are skipped.',
    '10'
  );
  if (stepStr === null) return;  // cancelled
  const step = parseInt(stepStr, 10);
  if (!Number.isFinite(step) || step < 1 || step > 1000) {
    alert(`Step size must be an integer between 1 and 1000 (got: ${stepStr}).`);
    return;
  }

  // 2. Build (oldNum -> newNum) map by walking items, numbering only
  //    real checklist items.
  const map = new Map();
  let next = step;
  let renumbered = 0;
  for (const it of items) {
    if (it.type !== CL_LINE_CHECKLISTITEM) continue;
    const oldNum = it.itemNum;
    // Multiple items shouldn't share a number, but be defensive: only
    // record the first mapping for any given old number. (If duplicates
    // exist, all of them get renumbered correctly anyway — the map just
    // gets used for GOTO rewriting, where the first occurrence wins.)
    if (oldNum && !map.has(oldNum)) map.set(oldNum, next);
    next += step;
    renumbered++;
  }

  // 3. Preview to user with destructive-action warning. Show how many
  //    items will be renumbered and (peek) how many GOTOs we'll touch.
  //    We do a non-mutating scan here to get the counts.
  const GOTO_RE = /\bgoto\s+(\d+)\b/gi;
  let gotosFound = 0, gotosResolvable = 0, gotosUnresolved = 0;
  for (const it of items) {
    const text = it.itemText || '';
    let m;
    GOTO_RE.lastIndex = 0;
    while ((m = GOTO_RE.exec(text)) !== null) {
      gotosFound++;
      const oldN = parseInt(m[1], 10);
      if (map.has(oldN)) gotosResolvable++;
      else gotosUnresolved++;
    }
  }
  const lastNum = next - step;
  const ok = confirm(
    `Renumber ${renumbered} item${renumbered===1?'':'s'} ` +
    `(${step}, ${step*2}, ${step*3}, … ${lastNum})?\n\n` +
    `GOTO references found: ${gotosFound}\n` +
    `  • will be rewritten: ${gotosResolvable}\n` +
    `  • unresolvable (no matching item): ${gotosUnresolved}\n\n` +
    `This cannot be undone. Save your file first if you want a backup.`
  );
  if (!ok) return;

  // 4. Apply the renumbering. Walk again, assigning the new numbers.
  let n = step;
  for (const it of items) {
    if (it.type !== CL_LINE_CHECKLISTITEM) continue;
    it.itemNum = n;
    n += step;
  }

  // 5. Rewrite GOTO references in item/comment text. Use the same regex
  //    with a function-replacer so we can preserve the original casing
  //    of the "goto" word and skip unresolved references.
  let gotosRewritten = 0;
  for (const it of items) {
    if (typeof it.itemText !== 'string') continue;
    it.itemText = it.itemText.replace(/\b(goto)(\s+)(\d+)\b/gi,
      (whole, word, sep, num) => {
        const oldN = parseInt(num, 10);
        if (!map.has(oldN)) return whole;  // leave unresolved alone
        gotosRewritten++;
        return `${word}${sep}${map.get(oldN)}`;
      });
  }

  // 6. Re-render + persist snapshot so the new numbering survives reload.
  _renderTable();
  if (typeof _clSaveSnapshot === 'function') _clSaveSnapshot();

  // 7. Tell the user what happened.
  alert(
    `Renumber complete.\n\n` +
    `${renumbered} items renumbered (${step}..${lastNum}, step ${step}).\n` +
    `${gotosRewritten} GOTO reference${gotosRewritten===1?'':'s'} rewritten.` +
    (gotosUnresolved > 0
      ? `\n${gotosUnresolved} GOTO reference${gotosUnresolved===1?'':'s'} left untouched (no matching item).`
      : '')
  );
}

function clEditItemText(rowIdx) {
  const it = window.checklistItems[rowIdx]; if (!it) return;
  const t = prompt('Edit item text:', it.itemText);
  if (t !== null) { it.itemText = t; _renderTable(); }
}

function _downloadText(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text],{type:'text/plain'}));
  a.download = name; a.click();
}

/* ================================================================ log restore */
window.loadCheckEventsFromLog = function(jsonStr) {
  try {
    const evts = JSON.parse(jsonStr);
    if (Array.isArray(evts)) {
      // Ensure every event has tServer set (may be absent in older logs)
      window.checkEvents = evts.map(ev => ({
        ...ev,
        tServer: ev.tServer ?? ev.t   // t in logs is always Unix epoch
      }));
      console.log(`[Checklist] Loaded ${evts.length} check events from log`);
    }
  } catch(e) { console.warn('[Checklist] chk_events parse error:', e); }
};

/* ================================================================ expose */
window.buildChecklistPanel  = buildChecklistPanel;
window.clCheck              = clCheck;
window.clUncheck            = clUncheck;
window.parseChecklistText   = parseChecklistText;
window.serializeChecklist   = serializeChecklist;

/* ================================================================ layout persistence */
function _clSaveLayout(dock) {
  if (!dock) return;
  const layout = {
    top: dock.style.top,
    left: dock.style.left,
    width: dock.style.width,
    height: dock.style.height,
    display: dock.style.display
  };
  localStorage.setItem('checklist_dock_layout', JSON.stringify(layout));
}

function _clLoadLayout(dock) {
  if (!dock) return;
  const saved = localStorage.getItem('checklist_dock_layout');
  if (!saved) return;
  
  try {
    const layout = JSON.parse(saved);
    if (layout.top) dock.style.top = layout.top;
    if (layout.left) dock.style.left = layout.left;
    if (layout.width) dock.style.width = layout.width;
    if (layout.height) dock.style.height = layout.height;
    if (layout.display) dock.style.display = layout.display;
  } catch (e) {
    console.error('[Checklist] Failed to load layout:', e);
  }
}

/* ================================================================ draggable dock */
function _makeDraggable(dock, handle) {
  handle.style.cursor = 'grab';
  let dragging = false, ox, oy, sx, sy;

  handle.addEventListener('mousedown', (e) => {
    if (e.target.closest('button')) return;   // don't hijack button clicks
    dragging = true;
    handle.style.cursor = 'grabbing';
    // Always resolve current position from getBoundingClientRect for accuracy
    const r = dock.getBoundingClientRect();
    dock.style.left      = r.left + 'px';
    dock.style.top       = r.top  + 'px';
    dock.style.transform = '';
    sx = e.clientX; sy = e.clientY;
    ox = r.left;
    oy = r.top;
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    // Honor the main UI's grid-snap setting when enabled. window.gridSnap
    // is exposed by app.js and returns the input unchanged when grid is
    // off, so this branch behaves identically to the original code when
    // the user hasn't turned the grid on.
    const snap = (typeof window.gridSnap === 'function') ? window.gridSnap : (px => px);
    dock.style.left = snap(ox + e.clientX - sx) + 'px';
    dock.style.top  = snap(oy + e.clientY - sy) + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (dragging) { 
      dragging = false; 
      handle.style.cursor = 'grab';
      _clSaveLayout(dock);  // Save position after dragging
    }
  });
}

/* ================================================================ self-mount */
/* Detect what kind of window we're in. Done inline rather than reading
   constants from app.js because checklist_widget.js loads first in
   popout.html. Three states:
     null           — regular main window; full self-mount as before.
     'checklist'    — popout window dedicated to the checklist; mount and
                      take over from the opener's dock.
     any other      — popout window for some other widget (chart, gauge,
                      etc.); do NOT self-mount, we have no business
                      creating a checklist dock in someone else's popout. */
const _CL_POPOUT_ID = (() => {
  try { return new URLSearchParams(location.search).get('popout'); }
  catch { return null; }
})();
const _CL_IS_OTHER_POPOUT = _CL_POPOUT_ID !== null && _CL_POPOUT_ID !== 'checklist';
const _CL_IS_CHECKLIST_POPOUT = _CL_POPOUT_ID === 'checklist';

function _clSelfMount() {
  if (_CL_IS_OTHER_POPOUT) {
    // We're loaded inside a popout window for some unrelated widget
    // (e.g. a chart). Skip self-mount entirely — there should be no
    // checklist dock in those windows.
    return;
  }

  // --- Floating dock ---
  const dock = document.createElement('div');
  dock.id = 'clDock';
  dock.className = 'cl-dock';
  dock.style.display = 'none';

  const handle = document.createElement('div');
  handle.className = 'cl-drag-handle';
  handle.innerHTML = '<span>📋 Checklist</span>';
  const closeX = document.createElement('button');
  closeX.className = 'cl-drag-close'; closeX.textContent = '✕'; closeX.title = 'Close';
  closeX.onclick = () => {
    if (_CL_IS_CHECKLIST_POPOUT) {
      // Dock IS the window in popout mode — close the window. The
      // beforeunload handler will fire and re-dock to the main window.
      window.close();
      return;
    }
    dock.style.display = 'none';
    _clSaveLayout(dock);  // Save visibility state
  };
  handle.appendChild(closeX);
  dock.appendChild(handle);

  const panel = buildChecklistPanel();
  dock.appendChild(panel);
  document.body.appendChild(dock);
  _makeDraggable(dock, handle);

  // Load saved layout (position, size, visibility)
  _clLoadLayout(dock);

  // Save layout when resized (CSS resize:both on .cl-dock).
  // ALSO: convert a user-drag resize into a numRows change so the prompt-
  // based "Rows" control and direct dragging stay in sync. We use the
  // _clProgrammaticResize flag to ignore size changes that _clRefitWindow
  // caused itself — otherwise we'd loop: refit → resize event → recompute
  // numRows → refit → ...
  if (window.ResizeObserver) {
    const resizeObserver = new ResizeObserver(() => {
      if (window._clProgrammaticResize) {
        window._clProgrammaticResize = false;
        _clSaveLayout(dock);
        return;
      }
      // User-driven resize. Snap width to the grid (height is taken care
      // of separately by _clRefitWindow's numRows logic). gridSnap is a
      // no-op when grid is off, so this is invisible until the user
      // enables snap.
      if (typeof window.gridSnap === 'function') {
        const r = dock.getBoundingClientRect();
        const snappedW = window.gridSnap(r.width);
        if (snappedW !== Math.round(r.width)) {
          window._clProgrammaticResize = true;
          dock.style.width = snappedW + 'px';
        }
      }
      // figure out which numRows this height implies and refit cleanly
      // to lock the visible rows exactly.
      if (_clNumRowsFromDockHeight()) {
        _clRefitWindow();  // snaps the dock to a clean rows-aligned height
      }
      _clSaveLayout(dock);
    });
    resizeObserver.observe(dock);
  }

  // Clicking anywhere in the dock focuses the panel and brings it to front
  dock.addEventListener('mousedown', () => {
    if (window.bringToFront) window.bringToFront(dock);
    panel.focus();
  }, { capture: true });
  dock.addEventListener('mouseenter', () => panel.focus());

  function toggleDock() {
    // While the checklist is popped out, the main-window dock stays hidden
    // and trying to show it would give us two visible checklists racing
    // on the same data. Bring the popout to the front instead.
    if (window.checklistPoppedOut) {
      if (window._clPopoutWindow && !window._clPopoutWindow.closed) {
        window._clPopoutWindow.focus();
      } else {
        // Stale flag — popout was closed without us noticing. Recover.
        window.checklistPoppedOut = false;
        window._clPopoutWindow = null;
      }
      return;
    }

    const vis = dock.style.display !== 'none';
    dock.style.display = vis ? 'none' : 'flex';
    if (!vis) {
      panel.focus();
      // Dock just became visible — give the browser a beat to lay it out,
      // then size to exactly numRows rows. Without this the dock would
      // show with its last saved pixel height which won't match the
      // current font scale or numRows setting.
      requestAnimationFrame(() => {
        if (typeof _clRefitWindow === 'function') _clRefitWindow();
      });
    }
    _clSaveLayout(dock);  // Save visibility state
  }

  // --- Wire topbar buttons ---
  // clToggleBtn (📋 Checklist in topbar) → was "open editor", keep for editor
  // clOpenChecklistBtn (new button added to palette) → opens the dock
  // We wire both after a tick to ensure DOM is ready
  setTimeout(() => {
    // Top menu Checklist button → editor
    const topBtn = document.getElementById('clToggleBtn');
    if (topBtn && !topBtn._clWired) {
      topBtn.addEventListener('click', () => {
        if (window.openChecklistEditor) openChecklistEditor();
      });
      topBtn._clWired = true;
    }

    // Palette "Add Checklist Widget" button → dock toggle
    const paletteBtn = document.getElementById('clOpenDockBtn');
    if (paletteBtn && !paletteBtn._clWired) {
      paletteBtn.addEventListener('click', toggleDock);
      paletteBtn._clWired = true;
    }
  }, 200);
}

function _clAutoLoad() {
  // Try to fetch checklist.txt from the server's working directory
  fetch('/api/default_checklist')
    .then(r => {
      if (!r.ok) return null;
      return r.text();
    })
    .then(text => {
      if (!text || !text.trim()) return;
      window.checklistItems     = parseChecklistText(text);
      window.checklistActiveRow = 0;
      window.checklistShowRow   = 0;
      window.checklistReturnRow = 0;
      window.checklistLoaded    = true;
      window.checklistPath      = 'checklist.txt';
      if (window.checklistItems.length > 0)
        window.checklistItems[0].timeIn = new Date().toLocaleTimeString('en-US',{hour12:false});
      window.checkEvents = [];
      _renderTable();
    })
    .catch(() => {}); // silently ignore if not found
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    if (_CL_IS_CHECKLIST_POPOUT) { _clBootChecklistPopout(); }
    else                          { _clSelfMount(); _clAutoLoad(); }
  });
} else {
  if (_CL_IS_CHECKLIST_POPOUT) { _clBootChecklistPopout(); }
  else                          { _clSelfMount(); _clAutoLoad(); }
}

/* ------------------------------------- checklist popout boot sequence ----
   Runs in /popout.html?popout=checklist. Mounts the dock, copies state
   from the opener, makes the dock fill the window, wires the close-handoff
   back to the opener.

   Note we still call _clSelfMount() here — it builds the dock DOM and
   wires the panel buttons + timer. We then override the dock's CSS class
   to fill the window and skip the load-layout step (the popout's geometry
   comes from the window, not from saved layout). */
function _clBootChecklistPopout() {
  // 1. Mount the dock DOM (creates #clDock, panel, buttons, timer).
  _clSelfMount();

  // 2. Copy state from the opener (active row, items array, font scale, ...).
  if (!window._clInitChecklistPopout()) {
    document.body.innerHTML =
      '<div style="padding:24px;color:#cfd6f0;font:14px/1.4 system-ui">' +
      '<h2 style="color:#ff6b6b">Popout failed</h2>' +
      '<p>Could not reach the main window. Close this and re-open from the main app.</p>' +
      '</div>';
    return;
  }

  // 3. Mark the body so the popout CSS rule fills the dock to the window.
  document.body.classList.add('cl-popout');

  // 4. Show the dock and render. _clSelfMount started it hidden.
  const dock = document.getElementById('clDock');
  if (dock) dock.style.display = 'flex';
  _renderTable();
  // Apply the font scale that came from the opener.
  clApplyFontScale();

  // 5. Notify the opener on close so it can dock back and resume its timer.
  window.addEventListener('beforeunload', () => {
    try {
      if (window.opener && typeof window.opener._clChecklistPopoutClosed === 'function') {
        window.opener._clChecklistPopoutClosed();
      }
    } catch { /* opener gone */ }
  });

  document.title = 'Checklist';
}

// Expose save/load for main layout to trigger
window._clSaveLayout = _clSaveLayout;
window._clLoadLayout = _clLoadLayout;
console.log('[Checklist] Exposed functions:', {
  _clSaveLayout: window._clSaveLayout,
  _clLoadLayout: window._clLoadLayout
});

