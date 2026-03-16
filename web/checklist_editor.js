/**
 * checklist_editor.js  — v1.1.0
 * Standalone checklist editor for MCC Web Control.
 */

'use strict';

window.CHECKLIST_EDITOR_VERSION = '1.2.0';

let _edItems       = [];
let _edPath        = '';
let _edDirty       = false;
let _edSelectedRow = -1;

/* ============================================================ open/close */
function openChecklistEditor(itemsOverride) {
  const existing = document.getElementById('clEditorModal');
  if (existing) { existing.style.display = 'flex'; return; }

  _edItems       = JSON.parse(JSON.stringify(itemsOverride || window.checklistItems || []));
  _edPath        = window.checklistPath || '';
  _edDirty       = false;
  _edSelectedRow = -1;

  const modal = document.createElement('div');
  modal.id = 'clEditorModal';
  modal.className = 'modal';
  modal.style.cssText = 'display:flex;z-index:20000';

  const panel = document.createElement('div');
  panel.className = 'panel cl-editor-panel';
  panel.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap">
      <h3 style="margin:0;flex:1">Checklist Editor <span id="clEdFile" style="font-size:12px;color:#9094a1"></span></h3>
      <button class="btn" id="clEdLoad">📂 Load</button>
      <button class="btn" id="clEdSaveClean">💾 Save Clean</button>
      <button class="btn" id="clEdSaveAnnotated">💾 Save Annotated</button>
      <button class="btn" id="clEdStripTs" title="Wipe timestamps and save clean">🧹 Strip Timestamps</button>
      <button class="btn" id="clEdSaveAs">📥 Save As…</button>
      <button class="btn danger" id="clEdClose">✕ Close</button>
    </div>
    <div style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap">
      <button class="btn" id="clEdAddItem">+ Item</button>
      <button class="btn" id="clEdAddComment">+ Comment</button>
      <button class="btn" id="clEdInsBelow" title="Insert blank row below selected">⤵ Insert Below</button>
      <button class="btn danger" id="clEdDelRow">🗑 Delete</button>
      <button class="btn" id="clEdMoveUp">▲ Up</button>
      <button class="btn" id="clEdMoveDown">▼ Down</button>
      <span id="clEdDirty" style="color:#f0caca;align-self:center;font-size:12px"></span>
    </div>
    <div class="cl-editor-table-wrap">
      <table class="cl-editor-table" id="clEdTable">
        <thead><tr>
          <th style="width:28px">#</th>
          <th style="width:52px">Item#</th>
          <th style="width:60px">Dest</th>
          <th>Item Text</th>
          <th style="width:34px">Chk</th>
          <th style="width:52px">Dur</th>
          <th style="width:78px">Time In</th>
          <th style="width:78px">Time Out</th>
          <th style="width:46px">Type</th>
        </tr></thead>
        <tbody id="clEdTbody"></tbody>
      </table>
    </div>
  `;

  modal.appendChild(panel);
  document.body.appendChild(modal);
  // Raise to front on click; uses app.js bringToFront manager if available
  if (window.bringToFront) window.bringToFront(modal);
  modal.addEventListener('mousedown', () => {
    if (window.bringToFront) window.bringToFront(modal);
  }, { capture: true });

  panel.querySelector('#clEdLoad').onclick          = _edLoad;
  panel.querySelector('#clEdSaveClean').onclick     = () => _edSave(false, false);
  panel.querySelector('#clEdSaveAnnotated').onclick = () => _edSave(true,  false);
  panel.querySelector('#clEdStripTs').onclick       = _edStripTimestamps;
  panel.querySelector('#clEdSaveAs').onclick        = () => _edSave(false, true);
  panel.querySelector('#clEdAddItem').onclick       = _edAddItem;
  panel.querySelector('#clEdAddComment').onclick    = _edAddComment;
  panel.querySelector('#clEdInsBelow').onclick      = _edInsertBelow;
  panel.querySelector('#clEdDelRow').onclick        = _edDeleteSelected;
  panel.querySelector('#clEdMoveUp').onclick        = () => _edMoveSelected(-1);
  panel.querySelector('#clEdMoveDown').onclick      = () => _edMoveSelected(+1);
  panel.querySelector('#clEdClose').onclick         = () => _edClose(modal);

  _edRender();
}

function _edClose(modal) {
  if (_edDirty && !confirm('Unsaved changes — close without saving?')) return;
  modal.remove();
}

/* ============================================================ render
   KEY RULE: _edRender() builds the full table once.
   After that, selection highlight is toggled by _edSetSelected()
   WITHOUT re-rendering, so inputs keep focus between clicks.       */

function _edRender() {
  const tbody = document.getElementById('clEdTbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const fileSpan = document.getElementById('clEdFile');
  if (fileSpan) fileSpan.textContent = _edPath ? `— ${_edPath.split(/[\\/]/).pop()}` : '';
  _edMarkDirty(_edDirty);

  _edItems.forEach((it, i) => {
    const tr = _edBuildRow(it, i);
    tbody.appendChild(tr);
  });
}

function _edBuildRow(it, i) {
  const tr = document.createElement('tr');
  tr.dataset.row = i;
  if (i === _edSelectedRow) tr.classList.add('cl-ed-selected');
  const isItem = it.type === 1;

  // Row-click selects WITHOUT re-rendering the whole table
  tr.addEventListener('mousedown', (e) => {
    if (e.target.tagName === 'INPUT') return;  // let inputs handle themselves
    _edSetSelected(i);
  });

  if (isItem) {
    tr.innerHTML = `
      <td style="text-align:center;color:#9094a1;font-size:11px;padding:2px 4px">${i+1}</td>
      <td>${_edInput('number', it.itemNum,  i, 'itemNum',  'width:48px')}</td>
      <td>${_edInput('text',   it.itemDest, i, 'itemDest', 'width:56px')}</td>
      <td>${_edInput('text',   it.itemText, i, 'itemText', 'width:100%', 'cl-ed-wide')}</td>
      <td style="text-align:center"><input type="checkbox" ${it.checked?'checked':''} data-row="${i}" data-field="checked" class="cl-ed-chk" style="width:18px;height:18px"></td>
      <td>${_edInput('number', it.duration.toFixed(1), i, 'duration', 'width:46px', '', '0.1')}</td>
      <td>${_edInput('text',   it.timeIn,   i, 'timeIn',   'width:74px')}</td>
      <td>${_edInput('text',   it.timeOut,  i, 'timeOut',  'width:74px')}</td>
      <td style="text-align:center;color:#79c0ff;font-size:10px">Item</td>`;
  } else {
    tr.innerHTML = `
      <td style="text-align:center;color:#9094a1;font-size:11px;padding:2px 4px">${i+1}</td>
      <td colspan="2" style="color:#9094a1;font-size:10px;padding:4px">cmnt</td>
      <td colspan="5">${_edInput('text', it.itemText, i, 'itemText', 'width:100%;font-style:italic;color:#9094a1', 'cl-ed-wide')}</td>
      <td style="text-align:center;color:#9094a1;font-size:10px">Cmnt</td>`;
  }

  // Wire all inputs — update data model on change, no re-render
  tr.querySelectorAll('input[data-field]').forEach(inp => {
    // Select the row when an input is clicked (no re-render)
    inp.addEventListener('focus', () => _edSetSelected(i));

    if (inp.classList.contains('cl-ed-chk')) {
      inp.addEventListener('change', () => {
        _edItems[i].checked = inp.checked;
        _edMarkDirty(true);
      });
    } else {
      inp.addEventListener('input', () => {
        const f = inp.dataset.field;
        _edItems[i][f] = (f==='itemNum') ? (parseInt(inp.value,10)||0)
                       : (f==='duration') ? (parseFloat(inp.value)||0)
                       : inp.value;
        _edMarkDirty(true);
      });
    }
  });

  return tr;
}

function _edInput(type, val, row, field, style, extraClass, step) {
  const stepAttr = step ? `step="${step}"` : '';
  const cls = 'cl-ed-in' + (extraClass ? ' '+extraClass : '');
  return `<input class="${cls}" type="${type}" value="${_esc(val)}" data-row="${row}" data-field="${field}" style="${style}" ${stepAttr}>`;
}

/* Select a row by toggling CSS class — no DOM rebuild, inputs keep focus */
function _edSetSelected(i) {
  const tbody = document.getElementById('clEdTbody');
  if (!tbody) return;
  if (_edSelectedRow >= 0) {
    const old = tbody.querySelector(`tr[data-row="${_edSelectedRow}"]`);
    if (old) old.classList.remove('cl-ed-selected');
  }
  _edSelectedRow = i;
  const tr = tbody.querySelector(`tr[data-row="${i}"]`);
  if (tr) tr.classList.add('cl-ed-selected');
}

function _edMarkDirty(dirty) {
  _edDirty = dirty;
  const d = document.getElementById('clEdDirty');
  if (d) d.textContent = dirty ? '● unsaved changes' : '';
}

function _esc(s) {
  return String(s??'')    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')    .replace(/"/g,'&quot;');
}

/* ============================================================ row ops */
function _edAddItem() {
  const maxNum = _edItems.reduce((m,x) => Math.max(m, x.itemNum||0), 0);
  const at = _edSelectedRow >= 0 ? _edSelectedRow+1 : _edItems.length;
  _edItems.splice(at, 0, { itemNum:maxNum+1, itemDest:'', itemText:'New Item',
    checked:false, duration:0, timeIn:'', timeOut:'', type:1 });
  _edSelectedRow = at;
  _edMarkDirty(true);
  _edRender();
  // Focus the item text field of new row
  setTimeout(() => {
    const inp = document.querySelector(`#clEdTbody tr[data-row="${at}"] input[data-field="itemText"]`);
    if (inp) inp.focus();
  }, 20);
}

function _edAddComment() {
  const at = _edSelectedRow >= 0 ? _edSelectedRow+1 : _edItems.length;
  _edItems.splice(at, 0, { itemNum:0, itemDest:'', itemText:'--- Comment ---',
    checked:false, duration:0, timeIn:'', timeOut:'', type:0 });
  _edSelectedRow = at;
  _edMarkDirty(true);
  _edRender();
  setTimeout(() => {
    const inp = document.querySelector(`#clEdTbody tr[data-row="${at}"] input[data-field="itemText"]`);
    if (inp) inp.focus();
  }, 20);
}

function _edInsertBelow() {
  // Insert a blank item below selected (or at end)
  _edAddItem();
}

function _edDeleteSelected() {
  if (_edSelectedRow < 0 || _edSelectedRow >= _edItems.length) { alert('Select a row first.'); return; }
  if (!confirm(`Delete row ${_edSelectedRow+1}?`)) return;
  _edItems.splice(_edSelectedRow, 1);
  _edSelectedRow = Math.min(_edSelectedRow, _edItems.length-1);
  _edMarkDirty(true);
  _edRender();
}

function _edMoveSelected(dir) {
  const i = _edSelectedRow, j = i+dir;
  if (i < 0 || j < 0 || j >= _edItems.length) return;
  [_edItems[i], _edItems[j]] = [_edItems[j], _edItems[i]];
  _edSelectedRow = j;
  _edMarkDirty(true);
  _edRender();
  // Re-select the moved row
  setTimeout(() => _edSetSelected(j), 10);
}

/* ============================================================ load/save */
function _edLoad() {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = '.txt';
  inp.onchange = () => {
    const f = inp.files?.[0]; if (!f) return;
    _edPath = f.name;
    const rd = new FileReader();
    rd.onload = () => {
      _edItems = parseChecklistText(rd.result);
      _edDirty = false; _edSelectedRow = -1;
      _edRender();
    };
    rd.readAsText(f);
  };
  inp.click();
}

function _edSave(annotated, forceDialog) {
  const text = serializeChecklist(_edItems, annotated);
  const base = (_edPath||'checklist').replace(/\.txt$/i,'');
  let name;
  if (forceDialog || !_edPath) {
    const p = prompt('Save as:', base+(annotated?'_annotated':'_clean')+'.txt');
    if (!p) return;
    name = p;
  } else {
    name = base+(annotated?'_annotated':'')+'.txt';
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text],{type:'text/plain'}));
  a.download = name; a.click();
  _edMarkDirty(false);
}

function _edStripTimestamps() {
  _edItems.forEach(it => {
    it.checked=false; it.duration=0; it.timeIn=''; it.timeOut='';
    if (it.itemText.startsWith('>< ')) it.itemText = it.itemText.slice(3);
  });
  _edMarkDirty(true);
  _edRender();
  _edSave(false, false);
}

/* ============================================================ expose */
window.openChecklistEditor = openChecklistEditor;
