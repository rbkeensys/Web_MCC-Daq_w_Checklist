/**
 * checklist_widget.js  — v1.1.0
 * Runtime checklist panel for MCC Web Control.
 */

'use strict';

window.CHECKLIST_VERSION = '1.10.0';  // 2026-03-27: Position/size persistence via localStorage

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
      <button class="btn cl-btn" id="clSaveBtn"   title="Save annotated (Ctrl+S)">💾 Save</button>
      <button class="btn cl-btn" id="clGotoBtn"   title="Jump to item (Ctrl+G)">⤵ Go-To</button>
      <button class="btn cl-btn" id="clReturnBtn" title="Return to saved pos (Ctrl+R)">↩ Return</button>
      <button class="btn cl-btn" id="clSetRetBtn" title="Set return point (Ctrl+[)">📌 Set Ret</button>
      <button class="btn cl-btn" id="clRowsBtn"   title="Set visible rows (Ctrl+N)">≡ Rows</button>
      <button class="btn cl-btn" id="clInsBtn"   title="Insert item below active (Ins)">⤵ Insert</button>
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
  panel.querySelector('#clSaveBtn').onclick   = () => clSaveFile(true);
  panel.querySelector('#clGotoBtn').onclick   = clGoto;
  panel.querySelector('#clReturnBtn').onclick = clReturn;
  panel.querySelector('#clSetRetBtn').onclick = clSetReturn;
  panel.querySelector('#clRowsBtn').onclick   = clSetRows;
  panel.querySelector('#clInsBtn').onclick    = clInsertBelow;

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
  const wrap = _clPanel?.querySelector('#clTableWrap');
  if (!wrap) return;
  const rh = 40;
  wrap.style.maxHeight = (window.checklistNumRows * rh + 36) + 'px';
  const tr = _clTbody?.querySelector(`tr[data-row="${window.checklistActiveRow}"]`);
  if (tr) tr.scrollIntoView({ block: 'center', behavior: 'smooth' });
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
}

function clUncheck() {
  const items  = window.checklistItems;
  const active = window.checklistActiveRow;
  if (!window.checklistLoaded || active >= items.length) return;

  // Find the last checked item at or before active
  let target = -1;
  for (let i=active; i>=0; i--) {
    if (items[i].type === CL_LINE_CHECKLISTITEM && items[i].checked) { target = i; break; }
  }
  if (target < 0) return;  // nothing to uncheck

  // Remove the matching chart event
  const removedNum = items[target].itemNum;
  const idx = window.checkEvents.map(e=>e.itemNum).lastIndexOf(removedNum);
  if (idx >= 0) window.checkEvents.splice(idx, 1);

  items[target].checked  = false;
  items[target].duration = 0;
  items[target].timeIn   = _nowStr();
  items[target].timeOut  = '';
  window.checklistActiveRow = target;
  window.checklistShowRow   = target;
  _renderTable();
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
function clOpenFile() {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = '.txt';
  inp.onchange = () => {
    const f = inp.files?.[0]; if (!f) return;
    window.checklistPath = f.name;
    const rd = new FileReader();
    rd.onload = () => {
      window.checklistItems     = parseChecklistText(rd.result);
      window.checklistActiveRow = 0;
      window.checklistShowRow   = 0;
      window.checklistReturnRow = 0;
      window.checklistLoaded    = true;
      if (window.checklistItems.length > 0) window.checklistItems[0].timeIn = _nowStr();
      window.checkEvents = [];
      _renderTable();
      if (_clPanel) _clPanel.focus();
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
}

function clSetReturn() {
  _clClearReturnMark();
  window.checklistReturnRow = window.checklistActiveRow;
  _clMarkReturn(window.checklistActiveRow);
  _renderTable();
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
    dock.style.left = (ox + e.clientX - sx) + 'px';
    dock.style.top  = (oy + e.clientY - sy) + 'px';
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
function _clSelfMount() {
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

  // Save layout when resized (CSS resize:both on .cl-dock)
  if (window.ResizeObserver) {
    const resizeObserver = new ResizeObserver(() => {
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
    const vis = dock.style.display !== 'none';
    dock.style.display = vis ? 'none' : 'flex';
    if (!vis) { panel.focus(); }
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
  document.addEventListener('DOMContentLoaded', () => { _clSelfMount(); _clAutoLoad(); });
} else {
  _clSelfMount();
  _clAutoLoad();
}

// Expose save/load for main layout to trigger
window._clSaveLayout = _clSaveLayout;
window._clLoadLayout = _clLoadLayout;
console.log('[Checklist] Exposed functions:', {
  _clSaveLayout: window._clSaveLayout,
  _clLoadLayout: window._clLoadLayout
});

