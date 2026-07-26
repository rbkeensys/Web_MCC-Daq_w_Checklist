const UI_VERSION = "2.1.95";  // top-bar OSK toggle button (POST /api/ui/keyboard -> server signals wvkbd on the rig display: SIGRTMIN toggle) -- full on-screen QWERTY for the keyboardless kiosk, deterministic (squeekboard/IME chain abandoned after it failed to render on labwc). Prev 2.1.92:  // Close UI button next to Start New Log (closes the kiosk browser on the server machine via window.close + POST /api/ui/close -- keyboardless kiosk escape); script-player bar hidden on all UIs (scripting lives in expressions now; code intact). Prev 2.1.91:  // Config editor gains a LOGGING section: mode full (every tick, dev) / eco (decimated logHz + daily-rotated session_YYYYMMDD.csv + logRetainDays pruning -- self-hosted rigs / Raspberry Pi on SD). Pairs with server 2.13.14 + logger 2.4.0 + app_models 2.5.0. Prev 2.1.90:  // FIX: statustext-widget had no CSS block, so it inherited the base .widget min-width:280px -- the browser clamped the box regardless of the JS resize floor. Own CSS now: min 10x10, no card chrome. Prev 2.1.89:  // Status widget minimum size lowered to 10x10 px (was 24x16) -- tiny fixed-size pills allowed. Prev 2.1.88:  // FIX: resize-handle mousedown no longer ALSO starts a drag (it bubbles up from inside the drag surface; harmless under left-corner snap, but center-anchored snap re-derived the position from the changing width every frame -- the Status widget danced while resizing). Resize now pivots the upper-left, as it always should have. Prev 2.1.87:  // ANCHOR-AWARE grid snap: indicators + status texts snap by their CENTER, labels by their text justification (left/center/right edge) -- auto-sized boxes have text-dependent widths, so left-edge snapping could never line a column up (per russ). Other widgets keep upper-left snap. Prev 2.1.86:  // Status widget gains an EDIT-MODE corner resize grabber (shape-style, hidden when the layout is locked): dragging it switches autoSize off and keeps the user's box (text centers inside -- size it for the LONGEST state so the layout doesn't breathe); "Auto-size to text" checkbox in Settings snaps it back. Prev 2.1.85:  // NEW 'Status' widget (palette 🚦, type 'statustext'): conditional status text for one input signal -- ordered conditions (first match wins), each with its own display text, text color, and background ("All good" white-on-green / "Error Trip" black-on-red); default text/colors when nothing matches; optional outline; font size/bold; chromeless like indicator/label (right-click or double-click to edit) and AUTO-SIZES to the displayed text. Labels + indicators now AUTO-SIZE to their text at the chosen font too (fixed boxes forced abbreviations -- per russ). Prev 2.1.84: Versions strip (top bar) now shows "Expr N" -- the expressions compile counter (server DLL_VERSION, seeded from the highest expressions_vN.dll at boot, +1 on every successful Save/compile); refreshed via showVersions() after each expression Save. Pairs with server 2.13.10 (/api/diag expr_dll). Prev 2.1.83: Start New Log gains a RESET-CLOCKS-TO-T0 option: log t column starts ~0 (server t_zero) and charts clear + rebase their x-axis to 0 (_chartT0). Prev 2.1.82: Start New Log prompts for a session NAME (default = the usual timestamp); posts {name} to /api/logs/close. Prev 2.1.81: fault popups are non-blocking TOASTS (window.alert froze the JS thread -> chart data-popup readings stalled and stayed stale); stacked top-right, dismiss per-fault. Prev 2.1.80: Zero dialog gains THERMOCOUPLES (include:true only, live readings, positional indices) -> /api/zero_tc; AI + TC selections submit together with the shared balance-to value (run separate passes for different targets). Prev 2.1.79: evapLevelErr popup broadened for the FEED-STALL guard (fill-rate feed, sender frozen -> pump not delivering). Prev 2.1.78: condSensErr popup (CondLevel lying but meter counting -> TIMED pumping engaged). Prev 2.1.77: chart data-popup Follow/Current radios get a PER-WIDGET group name (radio groups are document-global -- a shared name:'mode' made all open popups one group, so selecting Current on one blanked the rest). All open data viewers now hold their own mode. Prev 2.1.76: Static Var WIDGET add-dialog + settings dropdowns sorted too (they fetch /api/static_vars separately from the createSignalSelector picker sorted in 2.1.75). Prev 2.1.75: static-var pickers + globals table sorted ALPHABETICALLY (case-insensitive) -- 280+ vars in definition order were unfindable. Prev 2.1.74: condMeterErr popup (condensate pump running, meter counts nothing -> production control blind; warn, not trip). Prev 2.1.73: purgeErr popup (purge not lowering the level -> check pump direction). Prev 2.1.72:  // 2026-07-01: senderErr fault popup -- level-sender open/short (raw 0V/10V) latched trip, pairs with the Interlocks senderErr debounce. evapLevelErr popup reworded for the sender. Prev 2.1.71: DO buttons are purely LOGICAL -- widget 'Active High' checkbox removed (settings shows read-only 'Polarity: from config'); clicks/buzz/boot-off send logical state with NO active_high so the server applies the config Invert once (the widget was a second inversion layer: it converted logical->'physical' itself AND sent active_high=true, so inverted relays showed green-ON at boot and needed double toggles to sync). updateDOButtons colors from the logical do[] directly. Pairs with server 2.13.2 (DOReq/Buzz active_high Optional->None = derive from config) + app_models 2.4.2 pad_board_channels (config editor now always shows all 8 DO / 8 AI / 2 AO / 8 TC pins, include=False spares appended -- the editor only showed the 7 DOs present in config.json). Prev 2.1.70: DO config 'normallyOpen' checkbox -> 'Invert' (binds DigitalOutCfg.invert): drive the physical pin 1 when the expression commands logical 0. The old checkbox never reached the hardware (expression + PWM writes hardcoded active_high=True in server/mcc_bridge); pairs with mcc_bridge 2.5.0 + server 2.13.1 where it now actually works. Manual DO button widgets keep their own NO/NC radios (unchanged). Prev 2.1.69: E-TC DIGITAL INPUTS -- each E-TC board card gets a "Digital Inputs (DIO -> static var)" editor (name/bit/static_var/invert/include, +Add/delete), so a High-Level float switch on the E-TC DIO can be added in-UI (writes boardsetc[].digitalInputs). New evapHighWarn fault popup ("High Level Warning -- feed paused"). Pairs with app_models/mcc_bridge 2.4.0 + server 2.13.0 (read_etc_dins stamps the bit into static.dinEvapHigh -> yEvapHigh). Prev 2.1.68: Two evaporator sight-glass level sensors -- EvapLowLevel (AI6, ~0.75L heater-covered floor) + EvapMidLevel (AI7, ~2.0L operating). Feed holds the level at EvapMid via a slow wet/dry integral (robust to flow-meter bias); prime fills to EvapLow + confirms, heat ramps to EvapMid. evapLevelErr popup reworded to EvapLowLevel. Pairs with the level-rework expressions + config AI6/AI7. Prev 2.1.67: Evaporator level fault popup -- a latched control fault static going 0->1 in the live frame fires a one-shot alert() (FAULT_MSGS/checkFaultPopups); first entry is evapLevelErr "Evaporator Level Error -- possible level-sensor or feed-pump failure". Pairs with expressions: AI:EvapLevel (AI6) wet/dry sensor read as boolean in SensorMux, PRIME won't start heat until the evaporator reads wet, and Interlocks latches evapLevelErr if primed-but-dry. Prev 2.1.66: Counters (CTR) editor enforces one counter per board (E-1608 has a single HW counter CTR0) -- "+ Add CTR" alerts + refuses past the limit (button dimmed), with a hint line. Prev 2.1.65: FIX Counters (CTR) config editor -- "+ Add CTR" now re-renders in place (own ctrBody container + local renderCtr; it was built outside renderBoards() so Add never redrew the row -> looked dead, easy to add dupes), and each counter row gets a delete (X) button. Pairs with /api/config now migrating legacy counter-on-AI -> board.counters so the UI shows the first-class structure. Prev 2.1.64: CTR first-class signal type in the UI -- getAllCounters(), a "Counters (CTR)" config editor section (name/ctr#/K/mode/win/units) with + Add CTR, 'ctr' added to every signal-selection picker (createSignalSelector/labelFor/kind lists/numericKinds), readSelection('ctr') reads state.ctr for live charts, and msg.ctr ingested into state. Counter fields removed from the analog editor (counters are no longer AI). Pairs with the 19-arg CTR DLL (app_models 2.3.0 / mcc_bridge 2.3.0 / expr_to_cpp 3.7.0 / cpp_expr_backend 3.4.0 / expr_engine 2.7.0 / server CTR frame). Prev 2.1.63: analog counter 'mode' selector (rate | total) next to K/win -- exposes AnalogCfg.counter_mode so a counter channel can report a rollover-safe cumulative TOTAL (condensate totalizer / AI:CondTotal) without editing config.json. Pairs with mcc_bridge 2.2.0 + app_models 2.2.0. Prev 2.1.62: LOG REPLAY FIX -- makeTickFromRow now strips the gvar_ prefix on static-var columns (like sv_) so replayed static-var charts get data; previously gvar_simEvapTemp was stored under that literal key while charts look up the bare name (simEvapTemp) -> every static-var chart was empty on log read-back ("almost no data", since the MVR dashboard is mostly sim* statics). Prev 2.1.61: Sim panel gains a "Reset sim to ambient" button -- POSTs static.simReset=1; the MVR System expression snaps the plant + control state back to cold/ambient startup and self-clears (instant cool-down). Prev 2.1.60: PWM DO indicators -- readSelection('do') now returns the RAW value (was boolean'd to 0/1), and the indicator BLINKS when a watched DO holds a partial PWM duty (0<v<1): lit for `duty` of each ~0.8s cycle, solid at full duty, off at 0. Pairs with cpp_expr_backend fix (do_writes carried the raw duty, was thresholded to bool>=1 -> partial duties read as off). Prev 2.1.59: top bar -- removed Logic + Math buttons (handlers kept as harmless no-ops; editor code intact), added a "Sim" button opening a Simulator panel with two checkboxes (Simulate inputs=simEnable, Hardware enabled/HIL=simDriveHW) backed by static vars + a live mode status line so suppressed outputs are never a mystery. Prev 2.1.58: stepper holding-current "Hold Pr" default corrected to Pr5.03 (0x0197, confirmed DM556RS standstill current reg) from the Pr5.01 guess. Prev 2.1.57: drive widget Reset now also zeroes the stepper step count (POST .../zero_position) alongside alarm reset; stepper library editor gains "Hold %" (standstill/holding current as % of peak when idle, blank=drive default) + editable "Hold Pr" register (default Pr5.01, datasheet-unverified). Pairs with stepper_driver 1.7.0 + server.py 2.11.6. Prev 2.1.56: Stepper Units editor gains a "Log IO" checkbox (per-instance inst.io_log -> ctrl.log_io; Modbus TX/RX logging now OFF by default). Pairs with stepper_driver 1.6.2 + server.py 2.11.4 (undelivered-command warning + stepper on-change cache cleared on rebuild). Prev 2.1.55: NEW unified "MOD Drv" widget (type 'drive') -- pick VFD or stepper in settings then the instance; live status + manual controls (VFD: RPM/Fwd/Rev/Stop/Reset; stepper: velocity/Enable/Fwd/Rev/Stop/Disable/Reset) via /api/{vfd,stepper}/{name}/*. Palette "VFD" button -> "MOD Drv" (old 'vfd' widgets still render). Stepper Units editor gains per-instance Modbus reliability fields (Retries/Gap ms/Reply ms). Pairs with server.py 2.11.3 + stepper_driver 1.6.1. Prev 2.1.54: expression help cheatsheet now lists the SWITCH/CASE/DEFAULT/ENDSWITCH block (pairs with expr_engine.py 2.5.0). Note: the live expr-debug branch colorizer doesn't yet tint SWITCH case bodies (cosmetic only; SWITCH works in both backends). Prev 2.1.53: MOD Drv Save is now SCOPED to the active domain -- VFD tabs save only VFD libs+instances, Stepper tabs save only stepper config+instances (button relabels "Save VFD"/"Save Steppers"). Previously one Save PUT both vfd/instances AND stepper/instances every time, so saving steppers rebuilt + re-commanded the running VFD and surfaced VFD connect results (the "VFD isn't there" flakiness came from that needless rebuild probe). Pair with server.py 2.11.2 (stepper PUT result normalization). Prev 2.1.52: FIX stepper-unit Port column showed "[object Object]" -- the editor appended the portSelectControl() return object (psc) into the cell instead of psc.wrap (the VFD editor already did .wrap correctly). Now el('td',{},psc.wrap). Prev 2.1.51: VFD instance editor gains a "Poll ms" column (per-instance poll_rate_ms; blank/unset shows 250 = 4/sec default, 0 = continuous) -- sets how fast the worker reads the drive over Modbus; saved to vfd_instances.json and applied on rebuild. Prev 2.1.50: chart "Keep×" spinner (1-100, default 4) sets how much history to retain in multiples of the span -- live keeps keep*span of scrollback, paused keeps ~keep*span split around the freeze (so memory is user-bounded; 100 ~= 100 spans). Filter[Hz] box narrowed to make room. Prev 2.1.49: paused charts stay filled -- the live-buffer trim now also honors the Pause-button flag (w.opts.paused), not only the zoom/pan freeze (w.view.paused); a button-paused chart previously kept doing buf.shift() each tick and wiped its left edge as new samples arrived. Span-change trim is skipped while paused too. Pairs with vfd_driver.py worker carry-forward (holds the last-good VFD reading instead of emitting 0 on a missed Modbus read, so .RPM etc. no longer drop to 0 during AO-slider command bursts). Prev 2.1.48: startup VFD comms-health popup (/api/vfd/health) — warns if a configured drive did not answer. Prev 2.1.47:  // 2026-06-15: VFD instance editor Baud column is now a speed dropdown with a →drive button that POSTs /api/vfd/{name}/baud to change the drive's Modbus baud (drive must be idle) and reopen the port. Prev: VFD widget (palette + settings pulldown of instances) showing live RPM/Hz/current/voltage/power/direction/state/fault and Set-RPM/Fwd/Rev/Stop/Reset buttons via /api/vfd/{name}/*; status arrives in the tick frame as state.vfd. COM-port dropdowns in the VFD & Motor editors got a 🔄 refresh button (portSelectControl/fetchSerialPorts) so newly-plugged adapters appear without F5. Prev: VFD config editor (VFDs menu) -- three tabs (Instances/Drives/Motors) backed by /api/vfd/{instances,drives,motors}; instances bind a drive+motor+port via pulldowns populated from the drive & motor libraries, so multiple motors/drives are supported. Pair with server.py 2.8.28 + vfd_driver.py. Prev: Checklist HOSTING support -- WS hello carries a client_id and cl_host messages route to the checklist widget (checklist_widget.js 1.19.0 + server.py 2.8.27). Prev: Checklists now mirror across computers -- relayed check/uncheck events also update a locally-hosted checklist widget (checkbox, times, cursor advance/retreat) via idempotent clApplyRemote hooks in checklist_widget.js 1.18.0. Prev: Layouts are now strictly per-browser -- boot restores THIS machine's last-saved layout from localStorage (or a starter page); Save Layout / Load Layout / color tweaks persist locally; nothing auto-loads or auto-uploads the server copy, so one machine's save can never appear on another. Sharing stays deliberate: layout file + Load Layout. Prev: Layout-sync made diagnosable and honest — Save Layout now alerts when the server mirror actually fails (fetch resolves on HTTP 500, so the old success log lied); server auto-load logs each decision and fetches with cache:no-store; defined the previously-missing saveLayout() as a debounced silent server mirror. Pair with server.py 2.8.24. Prev: FIX for remote computers (plain http origins): crypto.randomUUID only exists in secure contexts, so its use in ensureStarterPage crashed the whole boot on other machines (no auto-connect, no server layout) and broke every add-widget palette button. All id generation now goes through genId(), which falls back to an RFC-4122 v4 UUID built from crypto.getRandomValues. Prev: Multi-select & grouping editing aid — Ctrl+click or rubber-band-drag on empty canvas to select several widgets; dragging any selected widget moves them all with relative offsets preserved (only the grabbed one snaps). Ctrl+G makes the selection a persistent group (groupId, saved in layout) that always moves as one; Ctrl+Shift+G ungroups; also in the right-click menu. Group/multi drags skip bring-to-front so a background shape stays sent-to-back. Prev: hwReady now arrives via a WS hello message on every (re)connect, fixing remote machines whose DO buttons stayed in the un-connected color when the one-shot /api/diag fetch failed at boot. Prev: Multi-computer support — layouts now mirror to the server on Save and auto-load on empty browsers (second machine gets your widgets on open), and check events relay through the server WebSocket so a checklist run on one computer marks charts on every computer. Pair with server.py 2.8.22 + checklist_widget.js 1.17.1. Prev: Cross-window check-event sync via BroadcastChannel — popped-out charts now receive checkmarks from the main-page checklist and a popped-out checklist reaches all windows; new windows pull existing events on open (sync_request). Also fixed: unchecking now removes the live chart mark (the checklist-uncheck listener was missing). Pair with checklist_widget.js 1.17.0. Prev 2026-06-11: Viewer launch now also exports friendly signal names (from config/expr/pid/math caches) and the list of charted columns, so the standalone viewer shows real names and opens with exactly the chart's signals enabled. Plus chart display scales — every chart series' displayScale/displayOffset is collected across all pages, keyed by CSV column name (ai0, tc2, expr5, pid0, bvar_/gvar_ names), and sent with /api/log_viewer/launch so the standalone viewer can toggle between raw CSV values and the chart-style scaled view. Identity transforms (×1 +0) are skipped; first chart wins on duplicates. Pair with server.py 2.8.20 + log_viewer.py 1.1.0.

/* ----------------------------- popout mode ------------------------------ */
/* When app.js loads in /popout.html?popout=<widgetId>, we run a stripped-down
   init that:
     - skips the toolbar / sidebar / page-tabs UI
     - pulls the widget config from window.opener
     - opens its own WebSocket
     - renders just that one widget filling the entire window
   The main page sets a .popoutId field on the widget to remember which
   window owns it, hides the widget from its page renderer, and re-docks
   automatically when the popout window closes.
   Same code, different entry point — keeps the renderers DRY.            */
const POPOUT_ID = (() => {
  try { return new URLSearchParams(location.search).get('popout'); }
  catch { return null; }
})();
const IS_POPOUT = !!POPOUT_ID;

/* ----------------------------- helpers ---------------------------------- */
const $ = sel => document.querySelector(sel);
const el = (tag, props = {}, children = []) => {
  const n = Object.assign(document.createElement(tag), props || {});
  if (props && props.className === undefined && props.class) n.className = props.class;
  if (!Array.isArray(children)) children = [children];
  for (const c of children) n.append(c instanceof Node ? c : document.createTextNode(c));
  return n;
};
// ENHANCED: Now supports custom colors per series
function colorFor(i, customColors = null) {
  const defaultPalette = ['#7aa2f7','#9ece6a','#f7768e','#bb9af7','#e0af68','#73daca','#f4b8e4','#ffd479'];
  if (customColors && customColors[i]) return customColors[i];
  return defaultPalette[i % defaultPalette.length];
}

// COLOR PICKER: Standard color palette
const STANDARD_COLORS = [
  '#ff4d4d','#ff0000','#cc0000','#990000','#660000',
  '#ff9933','#ff6600','#ff3300','#cc2900','#991f00',
  '#ffff00','#ffcc00','#ff9900','#ff6600','#cc5200',
  '#00ff00','#00cc00','#009900','#006600','#003300',
  '#00ffff','#00cccc','#009999','#006666','#004d4d',
  '#4d94ff','#0066ff','#0052cc','#003d99','#002966',
  '#bb9af7','#9966ff','#7733ff','#5500cc','#3d0099',
  '#ff99ff','#ff66ff','#ff33ff','#cc00cc','#990099',
  '#ffffff','#cccccc','#999999','#666666','#333333',
  '#7aa2f7','#9ece6a','#f7768e','#e0af68','#73daca'
];

// Create color picker modal
function createColorPicker(currentColor, onSelect) {
  const modal = el('div', {
    className: 'modal',
    style: 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center'
  });
  
  const picker = el('div', {
    className: 'color-picker',
    style: 'background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:20px;max-width:400px;box-shadow:0 4px 12px rgba(0,0,0,0.3)'
  });
  
  const header = el('div', {style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:16px'}, [
    el('h3', {style: 'margin:0;color:var(--text)'}, 'Choose Color'),
    el('button', {
      className: 'icon',
      style: 'font-size:20px;cursor:pointer;border:none;background:none;color:var(--text)',
      onclick: () => modal.remove()
    }, '×')
  ]);
  
  const preview = el('div', {
    style: `width:100%;height:40px;border-radius:4px;border:1px solid var(--border);margin-bottom:16px;background:${currentColor}`
  });
  
  const standardGrid = el('div', {
    style: 'display:grid;grid-template-columns:repeat(5, 1fr);gap:6px;margin-bottom:16px'
  });
  
  STANDARD_COLORS.forEach(color => {
    const swatch = el('div', {
      className: 'color-swatch',
      style: `width:100%;aspect-ratio:1;background:${color};border-radius:4px;cursor:pointer;border:2px solid ${color === currentColor ? '#fff' : 'transparent'};transition:transform 0.1s`,
      onclick: () => {
        onSelect(color);
        modal.remove();
      },
      onmouseenter: (e) => {
        e.target.style.transform = 'scale(1.1)';
        preview.style.background = color;
      },
      onmouseleave: (e) => {
        e.target.style.transform = 'scale(1)';
        preview.style.background = currentColor;
      }
    });
    standardGrid.append(swatch);
  });
  
  const customSection = el('div', {style: 'border-top:1px solid var(--border);padding-top:16px'});
  const customLabel = el('div', {
    style: 'font-size:12px;color:var(--muted);margin-bottom:8px;font-weight:600'
  }, 'Custom Color');
  
  const customInput = el('input', {
    type: 'color',
    value: currentColor,
    style: 'width:100%;height:40px;border:1px solid var(--border);border-radius:4px;cursor:pointer',
    oninput: (e) => {
      preview.style.background = e.target.value;
    },
    onchange: (e) => {
      onSelect(e.target.value);
      modal.remove();
    }
  });
  
  const hexInput = el('input', {
    type: 'text',
    value: currentColor,
    placeholder: '#000000',
    style: 'width:100%;margin-top:8px;padding:8px;border:1px solid var(--border);border-radius:4px;background:var(--input-bg);color:var(--text);font-family:monospace',
    oninput: (e) => {
      const val = e.target.value;
      if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
        preview.style.background = val;
        customInput.value = val;
      }
    },
    onchange: (e) => {
      const val = e.target.value;
      if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
        onSelect(val);
        modal.remove();
      }
    }
  });
  
  customSection.append(customLabel, customInput, hexInput);
  picker.append(header, preview, standardGrid, customSection);
  modal.append(picker);
  
  modal.onclick = (e) => {
    if (e.target === modal) modal.remove();
  };
  
  document.body.append(modal);
  return modal;
}

function clamp(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); }
function safeArc(ctx, cx, cy, r, a0, a1) {
  if (!Number.isFinite(r) || r <= 0) return false;
  ctx.arc(cx, cy, r, a0, a1);
  return true;
}

/* ==================== CHART DECIMATION (LTTB) ====================
   Largest-Triangle-Three-Buckets algorithm.
   Reduces `pts` (array of {t, v}) to at most `threshold` points while
   preserving the visual shape of every series.  `seriesCount` tells it
   how many value slots exist in each point's .v array so it can compute
   the triangle area across all series simultaneously.
   Returns a new (smaller) array; returns pts unchanged when no reduction needed.
   ================================================================== */
const CHART_MAX_RENDER_PTS = 2000; // max points sent to canvas per series

function lttbDecimate(pts, threshold) {
  if (!pts || pts.length <= threshold || threshold < 3) return pts;
  const result = [];
  const bucketSize = (pts.length - 2) / (threshold - 2);
  let a = 0; // always start with first point
  result.push(pts[0]);

  for (let i = 0; i < threshold - 2; i++) {
    // Calculate point average for next bucket (look-ahead)
    let avgT = 0, avgLen = 0;
    const nextBucketStart = Math.floor((i + 1) * bucketSize) + 1;
    const nextBucketEnd   = Math.min(Math.floor((i + 2) * bucketSize) + 1, pts.length);
    for (let j = nextBucketStart; j < nextBucketEnd; j++) {
      avgT += pts[j].t;
      avgLen++;
    }
    avgT /= avgLen;
    // Average v[0] for triangle area (use first series; good enough heuristic)
    let avgV = 0;
    for (let j = nextBucketStart; j < nextBucketEnd; j++) avgV += (pts[j].v[0] || 0);
    avgV /= avgLen;

    // Find point in current bucket with largest triangle
    const curBucketStart = Math.floor(i * bucketSize) + 1;
    const curBucketEnd   = Math.min(Math.floor((i + 1) * bucketSize) + 1, pts.length);
    const aT = pts[a].t, aV = pts[a].v[0] || 0;
    let maxArea = -1, maxIdx = curBucketStart;
    for (let j = curBucketStart; j < curBucketEnd; j++) {
      const area = Math.abs((aT - avgT) * ((pts[j].v[0]||0) - aV) -
                            (aT - pts[j].t) * (avgV - aV)) * 0.5;
      if (area > maxArea) { maxArea = area; maxIdx = j; }
    }
    result.push(pts[maxIdx]);
    a = maxIdx;
  }
  result.push(pts[pts.length - 1]);
  return result;
}

/* Pixel-stride decimation for live scrolling data.
   Divides the time range into `pixelW` buckets (one per canvas pixel column).
   For each bucket keeps the min-value and max-value point so noise peaks are
   preserved. Output order is strictly time-ascending.
   Returns pts unchanged if no reduction is needed. */
function pixelStride(pts, pixelW) {
  if (!pts || pts.length === 0) return pts;
  const maxOut = pixelW * 2; // min+max per pixel = 2 pts per column at most
  if (pts.length <= maxOut) return pts;

  const tMin = pts[0].t;
  const tMax = pts[pts.length - 1].t;
  const tSpan = tMax - tMin || 1;
  const bucketDt = tSpan / pixelW;

  const result = [];
  let bucketStart = 0;

  for (let bx = 0; bx < pixelW; bx++) {
    const bEnd = tMin + (bx + 1) * bucketDt;
    let bucketEnd = bucketStart;
    while (bucketEnd < pts.length - 1 && pts[bucketEnd + 1].t <= bEnd) bucketEnd++;

    if (bucketEnd < bucketStart) continue;
    if (bucketStart === bucketEnd) {
      result.push(pts[bucketStart]);
    } else {
      // Find min and max by first series value (good enough for stroke shape)
      let minIdx = bucketStart, maxIdx = bucketStart;
      for (let i = bucketStart + 1; i <= bucketEnd; i++) {
        if ((pts[i].v[0] ?? 0) < (pts[minIdx].v[0] ?? 0)) minIdx = i;
        if ((pts[i].v[0] ?? 0) > (pts[maxIdx].v[0] ?? 0)) maxIdx = i;
      }
      // Push in time order
      if (minIdx <= maxIdx) {
        if (minIdx !== bucketStart) result.push(pts[bucketStart]);
        result.push(pts[minIdx]);
        if (maxIdx !== minIdx) result.push(pts[maxIdx]);
      } else {
        if (maxIdx !== bucketStart) result.push(pts[bucketStart]);
        result.push(pts[maxIdx]);
        if (minIdx !== maxIdx) result.push(pts[minIdx]);
      }
    }
    bucketStart = bucketEnd + 1;
    if (bucketStart >= pts.length) break;
  }

  // Always include the last point so the line reaches the right edge
  if (result.length && result[result.length - 1] !== pts[pts.length - 1]) {
    result.push(pts[pts.length - 1]);
  }
  return result;
}

/* How many render points to target based on zoom level (for LTTB replay) */
function decimTargetForZoom(zoomRatio) {
  // zoomRatio = viewSpan / opts.span  (1.0 = full span, <1 = zoomed in)
  // Zoomed in sees fewer raw pts, so we can afford more detail per pixel.
  // Cap between 500 and CHART_MAX_RENDER_PTS.
  const r = Math.max(0.01, Math.min(1, zoomRatio));
  return Math.round(CHART_MAX_RENDER_PTS * Math.sqrt(r) + 500 * (1 - Math.sqrt(r)));
}

/* ==================== FILE LOAD/SAVE HELPERS ==================== */
// Create a Load button that loads JSON from file
function createLoadButton(onLoad) {
  return el('button', {
    className: 'btn',
    onclick: () => {
      const inp = el('input', {type: 'file', accept: '.json'});
      inp.onchange = async () => {
        const f = inp.files?.[0];
        if (!f) return;
        try {
          const text = await f.text();
          const loaded = JSON.parse(text);
          onLoad(loaded, f.name);
        } catch(e) {
          alert('Failed to load: ' + e.message);
        }
      };
      inp.click();
    }
  }, '📁 Load from File');
}

// Create a Save As button that saves JSON to file
function createSaveAsButton(getData, defaultFilename = 'data.json') {
  return el('button', {
    className: 'btn',
    onclick: () => {
      const data = JSON.stringify(getData(), null, 2);
      const blob = new Blob([data], {type: 'application/json'});
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = defaultFilename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      URL.revokeObjectURL(url);
    }
  }, '💾 Save As...');
}


/* ======================== EXPRESSION WIDGET HELPERS ======================== */
function formatValue(val) {
  if (val === null || val === undefined) return 'N/A';
  if (typeof val === 'boolean') return val ? 'true' : 'false';
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) return 'NaN';
    if (Math.abs(val) < 0.01 || Math.abs(val) > 10000) {
      return val.toExponential(3);
    }
    return val.toFixed(3);
  }
  return String(val);
}

function getValueColor(val) {
  if (val === null || val === undefined || !Number.isFinite(val)) return '#d84a4a';
  if (val === 0) return '#9094a1';
  if (val > 0) return '#2faa60';
  return '#ff9966';
}

/* ======================== LOG REPLAY ======================== */
let replayTimer = null;
let replayData = null;
let replayIndex = 0;
let replayPaused = false;
let replayRate = 60;
let replayMode = null; // null = live, 'paused' = showing full log, 'playing' = animating

function parseCSV(text){
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return {cols:[], rows:[]};
  // Auto-detect delimiter: tab-separated files are common from the server logger
  const firstLine = lines[0];
  const delim = firstLine.includes('\t') ? '\t' : ',';
  const cols = firstLine.split(delim).map(s=>s.trim());
  const rows = lines.slice(1).map(line => line.split(delim).map(v=>Number(v.trim())));
  return { cols, rows };
}

/* Remap raw CSV column headers to friendly configured names.
   e.g. "ai0" -> "LOX P", "expr7" -> "Test Sequencer", "do3" -> "LOX Vent"
   Fetches any missing caches on demand so names are always available.        */
async function friendlyColNames(cols) {
  // Always fetch fresh — log may be opened before or independently of layout load
  try { const r = await fetch('/api/config');         if (r.ok) configCache        = await r.json(); } catch {}
  try { const r = await fetch('/api/pid');             if (r.ok) window.pidCache    = await r.json(); } catch {}
  try { const r = await fetch('/api/math_operators');  if (r.ok) window.mathCache   = await r.json(); } catch {}
  try { const r = await fetch('/api/expressions');     if (r.ok) window.exprCache   = await r.json(); } catch {}

  const cfg = configCache || {};
  const aiNames   = getAllAnalogs(cfg).map((a,i)       => (a&&a.name) || null);
  const aoNames   = getAllAnalogOutputs(cfg).map((a,i)  => (a&&a.name) || null);
  const doNames   = getAllDigitalOutputs(cfg).map((d,i) => (d&&d.name) || null);
  const tcNames   = getAllThermocouples(cfg).map((t,i)  => (t&&t.name) || null);
  const exprNames = (window.exprCache?.expressions || []).map((e,i) => (e&&e.name) || null);
  const mathNames = (window.mathCache?.operators   || []).map((m,i) => (m&&m.name) || null);
  const pidNames  = (window.pidCache?.loops        || []).map((p,i) => (p&&p.name) || null);

  console.log('[friendlyColNames] loaded — ai[0]:', aiNames[0], 'expr[0]:', exprNames[0], 'do[0]:', doNames[0]);

  const result = cols.map(col => {
    const low = col.toLowerCase().trim();
    if (low === 't' || low === 'time' || low === 'timestamp') return col;
    let m;
    m = low.match(/^ai(\d+)$/);   if (m) return aiNames[+m[1]]   || col;
    m = low.match(/^ao(\d+)$/);   if (m) return aoNames[+m[1]]   || col;
    m = low.match(/^do(\d+)$/);   if (m) return doNames[+m[1]]   || col;
    m = low.match(/^tc(\d+)$/);   if (m) return tcNames[+m[1]]   || col;
    m = low.match(/^expr(\d+)$/); if (m) return exprNames[+m[1]] || col;
    m = low.match(/^math(\d+)$/); if (m) return mathNames[+m[1]] || col;
    m = low.match(/^pid(\d+)_(.+)$/);
    if (m) {
      const pname = pidNames[+m[1]] || `PID${m[1]}`;
      return `${pname}_${m[2]}`;
    }
    m = low.match(/^pid(\d+)$/);  if (m) return pidNames[+m[1]]  || col;
    m = low.match(/^scale(\d+)$/);
    if (m) { const sc = window.scaleCache?.scales?.[+m[1]]; return (sc&&sc.name) ? sc.name : col; }
    if (col.startsWith('sv_'))   return col.slice(3);
    if (col.startsWith('gvar_')) return col.slice(5);
    return col;
  });
  console.log('[friendlyColNames] first 8 cols:', result.slice(0,8));
  return result;
}

/* Build a reverse lookup: friendly channel name -> {kind, index}  */
function buildNameMap(){
  const map = {}; // name.toLowerCase() -> {kind, index}
  const cfg = configCache || {};

  // AI channels
  getAllAnalogs(cfg).forEach((a, i) => {
    map[`ai${i}`] = {kind:'ai', index:i};
    if (a && a.name) map[a.name.toLowerCase()] = {kind:'ai', index:i};
  });
  // AO channels
  getAllAnalogOutputs(cfg).forEach((a, i) => {
    map[`ao${i}`] = {kind:'ao', index:i};
    if (a && a.name) map[a.name.toLowerCase()] = {kind:'ao', index:i};
  });
  // DO channels
  getAllDigitalOutputs(cfg).forEach((d, i) => {
    map[`do${i}`] = {kind:'do', index:i};
    if (d && d.name) map[d.name.toLowerCase()] = {kind:'do', index:i};
  });
  // TC channels
  getAllThermocouples(cfg).forEach((t, i) => {
    map[`tc${i}`] = {kind:'tc', index:i};
    if (t && t.name) map[t.name.toLowerCase()] = {kind:'tc', index:i};
  });
  // Expressions — keyed by name AND by expr0/expr1 index
  const exprs = window.exprCache?.expressions || [];
  exprs.forEach((e, i) => {
    map[`expr${i}`] = {kind:'expr', index:i};
    if (e && e.name) map[e.name.toLowerCase()] = {kind:'expr', index:i};
  });
  // Math operators
  const maths = window.mathCache?.operators || [];
  maths.forEach((m, i) => {
    map[`math${i}`] = {kind:'math', index:i};
    if (m && m.name) map[m.name.toLowerCase()] = {kind:'math', index:i};
  });
  // PID loops
  const pids = window.pidCache?.loops || [];
  pids.forEach((p, i) => {
    map[`pid${i}`] = {kind:'pid', index:i};
    if (p && p.name) map[p.name.toLowerCase()] = {kind:'pid', index:i};
  });

  return map;
}

function makeTickFromRow(cols, row, nameMap){
  const obj = { type:'tick' };
  const ai=[], ao=[], dob=[], tc=[];
  const sv={};
  for(let c=0;c<cols.length;c++){
    const col = cols[c];
    const colLow = col.toLowerCase();
    const v = row[c];

    if (colLow === 't' || colLow === 'time' || colLow === 'timestamp') {
      obj.t = v;
    } else if (col.startsWith('sv_')) {
      // Static var: sv_Name
      sv[col.slice(3)] = v;
    } else if (col.startsWith('gvar_')) {
      // Static / global var logged as gvar_Name -- strip the prefix so the key
      // matches the live frame's static_vars (charts look up the bare var name,
      // e.g. simEvapTemp). Without this, replayed static-var charts show NO data.
      sv[col.slice(5)] = v;
    } else if (colLow.startsWith('ai') && !isNaN(col.slice(2))) {
      ai[Number(col.slice(2))] = v;
    } else if (colLow.startsWith('ao') && !isNaN(col.slice(2))) {
      ao[Number(col.slice(2))] = v;
    } else if (colLow.startsWith('do') && !isNaN(col.slice(2))) {
      dob[Number(col.slice(2))] = v;
    } else if (colLow.startsWith('tc') && !isNaN(col.slice(2))) {
      tc[Number(col.slice(2))] = v;
    } else if (/^pid\d+_/.test(colLow)) {
      // pid0_pv, pid0_sp, pid0_out, pid0_u, pid0_err, pid0_p, pid0_i, pid0_d, pid0_enabled
      const pm = colLow.match(/^pid(\d+)_(.+)$/);
      if (pm) {
        const idx = Number(pm[1]);
        const field = pm[2];
        if (!obj.pid) obj.pid = [];
        if (!obj.pid[idx]) obj.pid[idx] = {};
        if (field === 'pv') obj.pid[idx].pv = v;
        else if (field === 'sp') obj.pid[idx].sp = v;
        else if (field === 'out') obj.pid[idx].out = v;
        else if (field === 'u') obj.pid[idx].u = v;
        else if (field === 'err') obj.pid[idx].err = v;
        else if (field === 'p') obj.pid[idx].p = v;
        else if (field === 'i') obj.pid[idx].i = v;
        else if (field === 'd') obj.pid[idx].d = v;
        else if (field === 'enabled') obj.pid[idx].enabled = !!v;
      }
    } else if (/^expr\d+$/.test(colLow)) {
      const idx = Number(colLow.slice(4));
      if (!obj.expr) obj.expr = [];
      obj.expr[idx] = { output: v };
    } else if (/^math\d+$/.test(colLow)) {
      const idx = Number(colLow.slice(4));
      if (!obj.math) obj.math = [];
      obj.math[idx] = { output: v };
    } else if (colLow.startsWith('bvar_')) {
      // Button variables: bvar_Name
      if (!obj.button_vars) obj.button_vars = {};
      obj.button_vars[col.slice(5)] = v;
    } else if (/^scale\d+$/.test(colLow)) {
      // Serial scale: scale0, scale1, ...
      const idx = Number(colLow.slice(5));
      if (!obj.scales) obj.scales = [];
      obj.scales[idx] = v;
    } else if (nameMap) {
      // Try resolving friendly name via the reverse lookup
      const ch = nameMap[colLow];
      if (ch) {
        if      (ch.kind === 'ai')   ai[ch.index]  = v;
        else if (ch.kind === 'ao')   ao[ch.index]  = v;
        else if (ch.kind === 'do')   dob[ch.index] = v;
        else if (ch.kind === 'tc')   tc[ch.index]  = v;
        else if (ch.kind === 'expr') {
          if (!obj.expr) obj.expr = [];
          obj.expr[ch.index] = { output: v };
        }
        else if (ch.kind === 'math') {
          if (!obj.math) obj.math = [];
          obj.math[ch.index] = { output: v };
        }
        else if (ch.kind === 'pid') {
          if (!obj.pid) obj.pid = [];
          obj.pid[ch.index] = { out: v };
        }
      } else {
        // Unrecognised column — store as a static var keyed by the original
        // column name. This catches server-logged static.* variables (e.g.
        // "Test Sequencer") and friendly-named expr outputs from the server.
        sv[col] = v;
      }
    } else {
      // No nameMap at all — still store unknowns as static vars
      sv[col] = v;
    }
  }
  if (ai.length)  obj.ai = ai;
  if (ao.length)  obj.ao = ao;
  if (dob.length) obj.do = dob;
  if (tc.length)  obj.tc = tc;
  if (Object.keys(sv).length) obj.static_vars = sv;
  return obj;
}

function startReplay(cols, rows, friendlyCols){
  // PAUSE live data
  if (ws) {
    try { ws.close(); } catch {}
    ws = null;
    connected = false;
    updateConnectBtn();
  }

  replayData = { cols, rows, friendlyCols: friendlyCols || cols, nameMap: buildNameMap() };
  replayIndex = 0;
  replayMode = 'paused';
  replayPaused = false;

  // Clear existing chart buffers
  chartBuffers.clear();
  chartRawBuffers.clear();
  chartFilters.clear();

  // Reset any clip state from previous log
  for (const p of state.pages){
    for (const ww of p.widgets){
      if (ww.type !== 'chart') continue;
      ww._clippedData = null;
      if (ww._clipBtn) ww._clipBtn.textContent = '✂ Clip';
    }
  }

  // Populate chart marks from any loaded check events (tServer matches log t values)
  window._chartMarks = [];
  if (window.checkEvents && window.checkEvents.length) {
    for (const ev of window.checkEvents) {
      const t = ev.tServer ?? ev.t;
      if (t != null) {
        window._chartMarks.push({ t, label: ev.label || String(ev.itemNum || '') });
      }
    }
  }

  // Load ALL data into charts (decimated), keeping full-res raw buffers
  loadAllReplayDataIntoCharts();

  // Set every chart view to show the full log span immediately
  for (const p of state.pages){
    for (const w of p.widgets){
      if (w.type !== 'chart') continue;
      const buf = chartBuffers.get(w.id);
      if (buf && buf.length) {
        const logSpan = buf[buf.length-1].t - buf[0].t;
        w.view = w.view || {};
        w.view.span = Math.max(0.1, logSpan);
        w.view.tFreeze = buf[buf.length-1].t;
        w.view.paused = true;
      }
    }
  }

  // Set cursor to first frame for gauges/bars
  replayIndex = 0;
  updateGaugesAndBarsFromReplayIndex();
  updateReplayUI();
}

function loadAllReplayDataIntoCharts(){
  if (!replayData) return;

  // Build per-widget full-resolution raw buffers, store them, then set a
  // decimated version as the display buffer for the initial full-log view.
  for (const p of state.pages){
    for (const w of p.widgets){
      if (w.type !== 'chart') continue;
      const rawBuf = [];
      for (let i = 0; i < replayData.rows.length; i++) {
        const row = replayData.rows[i];
        const msg = makeTickFromRow(replayData.cols, row, replayData.nameMap);
        const t = msg.t || (i * 0.01);
        const raw = (w.opts.series||[]).map(sel => {
          switch (sel.kind) {
            case 'ai':  return msg.ai?.[sel.index] ?? 0;
            case 'ao':  return msg.ao?.[sel.index] ?? 0;
            case 'do':  return msg.do?.[sel.index] ? 1 : 0;
            case 'tc':  return msg.tc?.[sel.index] ?? 0;
            case 'expr': return msg.expr?.[sel.index]?.output ?? 0;
            case 'math': return msg.math?.[sel.index]?.output ?? 0;
            case 'pid':  return msg.pid?.[sel.index]?.out ?? 0;
            case 'pid_u': return msg.pid?.[sel.index]?.u ?? 0;
            case 'static':
            case 'global': return msg.static_vars?.[sel.index] ?? 0;
            case 'button': return msg.button_vars?.[sel.index] ?? 0;
            case 'scale':  return msg.scales?.[sel.index] ?? 0;
            default: return 0;
          }
        });
        rawBuf.push({t, v: raw});
      }
      // Keep the full-res buffer so zoom can re-decimate at higher detail
      chartRawBuffers.set(w.id, rawBuf);
      // Decimated version for the initial full-log view
      chartBuffers.set(w.id, lttbDecimate(rawBuf, CHART_MAX_RENDER_PTS));
    }
  }
}

/* Re-decimate the raw replay buffer for a specific time window.
   Called after each zoom/pan settle in replay mode.
   Binary-searches the raw buffer, slices the window, decimates to
   CHART_MAX_RENDER_PTS, and replaces chartBuffers[id]. */
function reDecimateReplayWindow(w, t0, t1){
  const raw = chartRawBuffers.get(w.id);
  if (!raw || !raw.length) return;

  // Binary search for t0
  let lo = 0, hi = raw.length - 1;
  while (lo < hi){ const m=(lo+hi)>>1; if(raw[m].t < t0) lo=m+1; else hi=m; }
  const start = Math.max(0, lo - 1);

  // Binary search for t1
  let lo2 = start, hi2 = raw.length - 1;
  while (lo2 < hi2){ const m=(lo2+hi2+1)>>1; if(raw[m].t > t1) hi2=m-1; else lo2=m; }
  const end = Math.min(raw.length - 1, lo2 + 1);

  const slice = raw.slice(start, end + 1);
  chartBuffers.set(w.id, lttbDecimate(slice, CHART_MAX_RENDER_PTS));
}

function updateGaugesAndBarsFromReplayIndex(){
  if (!replayData || replayIndex >= replayData.rows.length) return;

  const row = replayData.rows[replayIndex];
  const msg = makeTickFromRow(replayData.cols, row, replayData.nameMap);

  // Update state for gauges and bars only
  if (msg.ai) state.ai = msg.ai;
  if (msg.ao) state.ao = msg.ao;
  if (msg.do) state.do = msg.do;
  if (msg.tc) state.tc = msg.tc;
  if (msg.ctr) state.ctr = msg.ctr;
  if (msg.pid) state.pid = msg.pid;
  if (msg.motors) state.motors = msg.motors;

  updateDOButtons();
}

function playReplay(){
  if (!replayData) return;

  // If paused mid-playback, resume from current position
  const resuming = (replayMode === 'paused' && replayIndex > 0 && replayIndex < replayData.rows.length);

  replayMode = 'playing';
  replayPaused = false;

  if (!resuming) {
    // Fresh play from start — clear buffers and reset charts to scrolling mode
    replayIndex = 0;
    chartBuffers.clear();
    chartRawBuffers.clear();
    chartFilters.clear();

    for (const p of state.pages){
      for (const w of p.widgets){
        if (w.type !== 'chart') continue;
        w.view = w.view || {};
        w.view.paused = false;
        w.view.tFreeze = 0;
        w.view.span = w.opts.span || window.GLOBAL_BUFFER_SPAN || 10;
      }
    }
  } else {
    // Resuming — just unfreeze chart views so they scroll again
    for (const p of state.pages){
      for (const w of p.widgets){
        if (w.type !== 'chart') continue;
        if (w.view) {
          w.view.paused = false;
          w.view.tFreeze = 0;
        }
      }
    }
  }

  updateReplayUI();

  const stepMs = Math.max(10, 1000 / replayRate);
  replayTimer = setInterval(() => {
    if (replayIndex >= replayData.rows.length) {
      pauseReplay();
      return;
    }
    const row = replayData.rows[replayIndex];
    const msg = makeTickFromRow(replayData.cols, row, replayData.nameMap);
    window.dispatchEvent(new CustomEvent('tick', { detail: msg }));
    replayIndex++;
    updateReplayUI();
  }, stepMs);
}

function pauseReplay(){
  if (replayTimer) {
    clearInterval(replayTimer);
    replayTimer = null;
  }
  replayMode = 'paused';
  replayPaused = true;

  // Freeze all chart views at the current tail so the display stays put
  for (const p of state.pages){
    for (const w of p.widgets){
      if (w.type !== 'chart') continue;
      const buf = chartBuffers.get(w.id) || [];
      if (buf.length) {
        w.view = w.view || {};
        w.view.paused = true;
        w.view.tFreeze = buf[buf.length - 1].t;
      }
    }
  }

  updateReplayUI();
}

function showFullLog(){
  if (!replayData) return;

  if (replayTimer) {
    clearInterval(replayTimer);
    replayTimer = null;
  }

  replayMode = 'paused';
  replayPaused = false;

  // Reload all data into charts (decimated)
  chartBuffers.clear();
  chartRawBuffers.clear();
  chartFilters.clear();
  loadAllReplayDataIntoCharts();

  // Now set every chart's view to show the full log span
  for (const p of state.pages){
    for (const w of p.widgets){
      if (w.type !== 'chart') continue;
      const buf = chartBuffers.get(w.id);
      if (buf && buf.length) {
        const logSpan = buf[buf.length-1].t - buf[0].t;
        w.view = w.view || {};
        w.view.span = Math.max(0.1, logSpan);
        w.view.tFreeze = buf[buf.length-1].t;
        w.view.paused = true;
      }
    }
  }

  // Keep current cursor position for gauges/bars
  updateGaugesAndBarsFromReplayIndex();
  updateReplayUI();
}

function closeReplay(){
  if (replayTimer) {
    clearInterval(replayTimer);
    replayTimer = null;
  }

  replayData = null;
  replayIndex = 0;
  replayMode = null;
  replayPaused = false;

  // Clear chart buffers and pan state
  chartBuffers.clear();
  chartRawBuffers.clear();
  chartFilters.clear();
  chartPan.clear();
  window.clearChartMarks?.();

  // Reset all chart views to live (unpaused) mode
  for (const p of state.pages){
    for (const ww of p.widgets){
      if (ww.type !== 'chart') continue;
      if (ww.view) {
        ww.view.paused = false;
        ww.view.tFreeze = 0;
        ww.view.span = ww.opts.span || window.GLOBAL_BUFFER_SPAN || 10;
      }
    }
  }

  // Reconnect to live data
  connect();

  updateReplayUI();
}

/* ==================== CLIP & SAVE LOG ==================== */

// Clip the loaded log (or live buffer) to the current chart view window.
// Stores the clipped data on w._clippedData = {cols, rows} and updates button state.
function clipLogToView(w) {
  if (!w.view || !w.view.paused) {
    alert('Zoom/pause the chart first to define a clip window.');
    return;
  }

  const t1 = w.view.tFreeze;
  const t0 = t1 - w.view.span;

  if (replayMode !== null && replayData && replayData.rows.length) {
    // --- Replay mode: slice full-resolution raw rows by time column ---
    const tCol = replayData.cols.findIndex(c => {
      const n = c.toLowerCase();
      return n === 't' || n === 'time' || n === 'timestamp';
    });

    let clipped;
    if (tCol >= 0) {
      clipped = replayData.rows.filter(row => row[tCol] >= t0 && row[tCol] <= t1);
    } else {
      const total = replayData.rows.length;
      const raw = chartRawBuffers.get(w.id) || [];
      if (raw.length) {
        const tRawMin = raw[0].t, tRawMax = raw[raw.length-1].t, tRawSpan = tRawMax - tRawMin || 1;
        const i0 = Math.round(((t0 - tRawMin) / tRawSpan) * total);
        const i1 = Math.round(((t1 - tRawMin) / tRawSpan) * total);
        clipped = replayData.rows.slice(Math.max(0,i0), Math.min(total, i1+1));
      } else {
        clipped = replayData.rows;
      }
    }

    if (!clipped.length) { alert('No data in the current view window.'); return; }
    w._clippedData = { cols: replayData.friendlyCols || replayData.cols, rows: clipped };

  } else {
    // --- Live mode: slice the chart's own display buffer ---
    const buf = chartBuffers.get(w.id) || [];
    const slice = buf.filter(b => b.t >= t0 && b.t <= t1);
    if (!slice.length) { alert('No data in the current view window.'); return; }

    // Use ai0/ao0/do0/tc0 column names so the file round-trips correctly
    // when reopened in the viewer (makeTickFromRow expects this format).
    const series = w.opts.series || [];
    console.log('[Clip] series:', series.map(s => ({kind:s.kind, index:s.index, name:s.name})));
    const cols = ['t', ...series.map(s => labelFor(s))];
    const rows = slice.map(b => [b.t, ...b.v]);
    w._clippedData = { cols, rows };
  }

  const count = w._clippedData.rows.length;
  if (w._clipBtn) w._clipBtn.textContent = `✂ Clipped (${count} rows)`;
  if (w._saveBtn) { w._saveBtn.disabled = false; w._saveBtn.style.opacity = '1'; }
  console.log(`[Clip] ${count} rows from t=${t0.toFixed(3)} to t=${t1.toFixed(3)}`);
}

// Save the clipped (or full) log as a CSV file via browser download dialog.
function saveClippedLog(w) {
  let cols, rows;

  if (w._clippedData) {
    cols = w._clippedData.cols;
    rows = w._clippedData.rows;
  } else if (replayMode !== null && replayData) {
    cols = replayData.friendlyCols || replayData.cols;
    rows = replayData.rows;
  } else {
    // Live fallback: save the entire current buffer for this chart
    const buf = chartBuffers.get(w.id) || [];
    if (!buf.length) { alert('No data to save.'); return; }
    const series = w.opts.series || [];
    cols = ['t', ...series.map(s => labelFor(s))];
    rows = buf.map(b => [b.t, ...b.v]);
  }

  if (!rows || !rows.length || !cols) { alert('Nothing to save.'); return; }

  const lines = [cols.join(',')];
  for (const row of rows) lines.push(row.join(','));
  const csv = lines.join('\n');
  const blob = new Blob([csv], {type: 'text/csv'});
  const url = URL.createObjectURL(blob);

  let filename = 'log_clipped.csv';
  if (w._clippedData && w.view) {
    const t0 = (w.view.tFreeze - w.view.span).toFixed(1);
    const t1 = w.view.tFreeze.toFixed(1);
    filename = `log_t${t0}_to_t${t1}.csv`;
  } else if (replayMode === null) {
    filename = `live_${new Date().toISOString().replace(/[:.]/g,'-').slice(0,19)}.csv`;
  }

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  // Reset clip button text now that the file has been saved
  w._clippedData = null;
  if (w._clipBtn) w._clipBtn.textContent = '✂ Clip';
}

/* ========================================================= */
/* printChart — open a print-friendly preview window with a   */
/* theme toggle (Dark / White). Time labels are already baked */
/* into the live chart via mountChart's draw loop. The user   */
/* picks the theme, then clicks Print — we do NOT auto-fire   */
/* the system print dialog so it can't cover the preview.     */
/* ========================================================= */

/**
 * Build a "white-themed" version of a dark chart snapshot.
 * Operates pixel-by-pixel on the source canvas:
 *   - Desaturated pixels (bg, grid lines, axis text)  → inverted
 *     (e.g. dark bg → near-white; light gray axis text → dark gray)
 *   - Saturated pixels (data lines)                   → kept,
 *     but very-light tints are darkened 25% so they remain
 *     visible against white when printed on paper.
 * Saturation threshold of 40 (in 0–255 channel range) cleanly
 * separates the dark theme's grays from typical line colors
 * (cyan, orange, green, magenta, yellow).
 */
function _buildWhiteVariant(srcCanvas) {
  const W = srcCanvas.width, H = srcCanvas.height;
  const out = document.createElement('canvas');
  out.width = W; out.height = H;
  const octx = out.getContext('2d');

  // Copy source pixels into a working canvas we can read from.
  // (Reading from foreign-origin canvases would taint, but this is
  // same-origin, so getImageData works.)
  octx.drawImage(srcCanvas, 0, 0);
  let imageData;
  try {
    imageData = octx.getImageData(0, 0, W, H);
  } catch (e) {
    // If pixel access ever fails, fall back to a plain copy with a
    // white CSS backdrop — caller will still get a usable image.
    return out;
  }
  const px = imageData.data;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i], g = px[i+1], b = px[i+2];
    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    const sat = maxC - minC;  // chroma proxy; cheaper than full HSL

    if (sat < 40) {
      // Desaturated → invert (dark↔light swap)
      px[i]   = 255 - r;
      px[i+1] = 255 - g;
      px[i+2] = 255 - b;
    } else {
      // Saturated line color → keep, but darken if it's light
      // (typical paper printing tends to wash out bright tints)
      if (maxC > 200) {
        px[i]   = Math.round(r * 0.75);
        px[i+1] = Math.round(g * 0.75);
        px[i+2] = Math.round(b * 0.75);
      }
    }
    // alpha (px[i+3]) untouched
  }
  octx.putImageData(imageData, 0, 0);
  return out;
}

function printChart(w) {
  if (!w || !w._canvas) {
    alert('Chart is not mounted yet — try again after it has rendered.');
    return;
  }

  // Snapshot the live (dark) canvas as a PNG data URL.
  let darkImgData;
  try {
    darkImgData = w._canvas.toDataURL('image/png');
  } catch (e) {
    alert('Failed to capture chart image: ' + e.message);
    return;
  }

  // Build a white-theme variant alongside it so the preview can
  // toggle instantly without round-tripping back to this window.
  let whiteImgData;
  try {
    whiteImgData = _buildWhiteVariant(w._canvas).toDataURL('image/png');
  } catch (e) {
    console.warn('[printChart] White variant failed, falling back to dark:', e);
    whiteImgData = darkImgData;
  }

  // Gather metadata for the printout
  const title = (w.opts && w.opts.title) ? w.opts.title : 'Chart';
  let pageName = '';
  try {
    pageName = (state.pages[activePageIndex] && state.pages[activePageIndex].name) || '';
  } catch (e) {}
  const sessionLabel = (typeof sessionDir === 'string' && sessionDir) ? sessionDir : '';
  const printedAt = new Date().toLocaleString();

  // Visible window (replay shows full range; live shows the configured span)
  let timeRangeText = '';
  try {
    if (w.view && Number.isFinite(w.view.span)) {
      const tEnd = (w.view.paused && Number.isFinite(w.view.tFreeze)) ? w.view.tFreeze : null;
      if (tEnd !== null) {
        const tStart = tEnd - w.view.span;
        timeRangeText = `t = ${tStart.toFixed(2)} → ${tEnd.toFixed(2)} s (span ${w.view.span.toFixed(2)} s)`;
      } else {
        timeRangeText = `Span ${w.view.span.toFixed(2)} s (live)`;
      }
    }
  } catch (e) {}

  // Y range
  let yRangeText = '';
  try {
    if (w.opts && w.opts.scale === 'manual' &&
        Number.isFinite(w.opts.min) && Number.isFinite(w.opts.max)) {
      yRangeText = `Y: ${w.opts.min} → ${w.opts.max}`;
    } else {
      yRangeText = 'Y: auto';
    }
  } catch (e) {}

  // Build legend HTML by walking the configured series + their colors
  // (mirrors the on-screen legend so colors are guaranteed to match).
  const series = (w.opts && w.opts.series) || [];
  const customColors = series.map(s => s && s.color);
  const legendItems = series.map((s, si) => {
    const color = colorFor(si, customColors);
    let label = (s && s.name && s.name.length) ? s.name : '';
    if (!label) {
      try { label = labelFor(s); } catch (e) { label = `Series ${si}`; }
    }
    label = String(label)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    return `<div class="legend-item">
              <span class="swatch" style="background:${color}"></span>
              <span class="label">${label}</span>
            </div>`;
  }).join('');

  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) {
    alert('Could not open print window — check your popup blocker.');
    return;
  }

  const escTitle = String(title)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const escPage = String(pageName)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const escSession = String(sessionLabel)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  // Theme is applied via a body class so both screen preview and the
  // printed page pick it up identically.
  //
  // CRITICAL: text on the printed page uses pt (a physical unit) rather
  // than px, so the print engine can't accidentally shrink it. Earlier
  // versions used px which can render at unexpected sizes when the
  // browser's print fit-to-page logic kicks in — the chart looked huge
  // and all the text proportionally tiny.
  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Print — ${escTitle}</title>
<style>
  @page { margin: 0.5in; }

  /* Force the print engine to honor backgrounds/colors exactly,
     so the dark theme (if chosen) actually prints with its dark
     background instead of being stripped to plain white. */
  html, body {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  body {
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: 11pt;             /* explicit size so children inherit a known base */
    line-height: 1.4;
    margin: 0;
    padding: 16px;
    color: #111;
    background: #fff;
  }
  /* Dark theme: only used when the user picks "Dark background" */
  body.theme-dark {
    color: #e6e6e6;
    background: #0f1115;
  }
  body.theme-dark .meta { color: #b8bccb; }
  body.theme-dark .meta b { color: #e6e6e6; }
  body.theme-dark .legend-item { color: #e6e6e6; }
  body.theme-dark .legend { border-top-color: #2a2f44; }
  body.theme-dark .footer {
    color: #7a7f8f;
    border-top-color: #2a2f44;
  }

  h1 { font-size: 16pt; margin: 0 0 4px 0; }
  .meta {
    font-size: 9pt;
    color: #444;
    margin-bottom: 12px;
    line-height: 1.5;
  }
  .meta .row { display: block; }
  .meta b { color: #111; }

  /* Chart image:
     - width:100% with max-width keeps it from overflowing the print column.
     - On the screen we cap height with vh; on print we cap with a fixed
       physical size so the chart leaves room for the legend + footer
       on the same page (Letter portrait, content area ~10in tall). */
  .chart-img {
    display: block;
    width: 100%;
    max-width: 100%;
    height: auto;
    max-height: 65vh;
    border: 1px solid #ccc;
  }
  body.theme-dark .chart-img { border-color: #2a2f44; }

  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin-top: 12px;
    padding-top: 8px;
    border-top: 1px solid #ddd;
  }
  .legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 10pt;
    color: #111;
  }
  .swatch {
    display: inline-block;
    width: 12pt;
    height: 12pt;
    border-radius: 2px;
    border: 1px solid #888;
    flex-shrink: 0;
  }
  .footer {
    margin-top: 16px;
    padding-top: 6px;
    border-top: 1px solid #eee;
    font-size: 8pt;
    color: #777;
    display: flex;
    justify-content: space-between;
  }

  .toolbar {
    margin-bottom: 12px;
    display: flex;
    gap: 6px;
    align-items: center;
    flex-wrap: wrap;
  }
  .toolbar label {
    font-size: 12px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-right: 8px;
  }
  .toolbar button {
    font-size: 12px;
    padding: 4px 10px;
    cursor: pointer;
  }

  /* Print-time overrides. Sizes in pt above already survive the print
     pipeline; here we just remove screen-only padding and restore the
     image to its natural print size. */
  @media print {
    body { padding: 0; }
    .chart-img { max-height: 6.5in; }   /* leave room for header + legend on Letter */
    .no-print { display: none !important; }
  }
</style>
</head>
<body class="theme-white">
  <div class="toolbar no-print">
    <strong style="margin-right:8px">Background:</strong>
    <label><input type="radio" name="theme" value="white" checked> White</label>
    <label><input type="radio" name="theme" value="dark"> Dark</label>
    <span style="flex:1"></span>
    <button id="printBtn">🖨 Print</button>
    <button onclick="window.close()">Close</button>
  </div>
  <h1>${escTitle}</h1>
  <div class="meta">
    ${escPage    ? `<span class="row"><b>Page:</b> ${escPage}</span>` : ''}
    ${escSession ? `<span class="row"><b>Session:</b> ${escSession}</span>` : ''}
    ${timeRangeText ? `<span class="row"><b>Time:</b> ${timeRangeText}</span>` : ''}
    ${yRangeText    ? `<span class="row"><b>${yRangeText}</b></span>` : ''}
    <span class="row"><b>Printed:</b> ${printedAt}</span>
  </div>
  <img class="chart-img" id="chartImg" alt="${escTitle}">
  ${legendItems ? `<div class="legend">${legendItems}</div>` : ''}
  <div class="footer">
    <span>MCC Web Control</span>
    <span>${printedAt}</span>
  </div>
<script>
  // Two pre-rendered variants are embedded; the toggle just swaps src.
  // No round-trip back to the parent window required.
  var imgWhite = ${JSON.stringify(whiteImgData)};
  var imgDark  = ${JSON.stringify(darkImgData)};
  var img = document.getElementById('chartImg');
  function applyTheme(t) {
    document.body.className = (t === 'dark') ? 'theme-dark' : 'theme-white';
    img.src = (t === 'dark') ? imgDark : imgWhite;
  }
  applyTheme('white');  // default

  Array.prototype.forEach.call(
    document.querySelectorAll('input[name=theme]'),
    function(r){ r.addEventListener('change', function(){ applyTheme(r.value); }); }
  );

  // User must explicitly click Print — we do NOT auto-fire the system
  // print dialog so it can't cover the preview while the user is still
  // choosing a theme.
  document.getElementById('printBtn').addEventListener('click', function(){
    window.focus();
    window.print();
  });
<\/script>
</body>
</html>`;

  win.document.open();
  win.document.write(html);
  win.document.close();
}

/* ========================================================= */

function seekReplay(index){
  if (!replayData) return;
  replayIndex = Math.max(0, Math.min(index, replayData.rows.length - 1));
  updateGaugesAndBarsFromReplayIndex();
  updateReplayUI();
}

function setReplayRate(newRate){
  replayRate = Math.max(1, Math.min(1000, newRate));

  // If currently playing, restart with new rate
  if (replayMode === 'playing' && replayTimer) {
    clearInterval(replayTimer);
    const stepMs = Math.max(10, 1000 / replayRate);
    replayTimer = setInterval(() => {
      if (replayIndex >= replayData.rows.length) {
        pauseReplay();
        return;
      }

      const row = replayData.rows[replayIndex];
      const msg = makeTickFromRow(replayData.cols, row, replayData.nameMap);
      window.dispatchEvent(new CustomEvent('tick', { detail: msg }));

      replayIndex++;
      updateReplayUI();
    }, stepMs);
  }
}

function updateReplayUI(){
  const controls = document.getElementById('replayControls');
  if (!controls) return;

  if (replayData && replayMode !== null){
    controls.style.display = 'flex';

    const progress = document.getElementById('replayProgress');
    const position = document.getElementById('replayPosition');
    const playBtn  = document.getElementById('replayPlayBtn');
    const pauseBtn = document.getElementById('replayPauseBtn');
    const showFullBtn = document.getElementById('replayShowFullBtn');
    const closeBtn = document.getElementById('replayCloseBtn');
    const rateInput = document.getElementById('replayRateInput');

    if (progress){
      progress.max = Math.max(1, replayData.rows.length - 1);
      progress.value = replayIndex;
    }
    if (position){
      position.textContent = `${replayIndex + 1} / ${replayData.rows.length}`;
    }
    if (playBtn){
      // Show "Resume" when paused mid-playback, "Play" otherwise
      const isPausedMid = (replayMode === 'paused' && replayIndex > 0 && replayIndex < replayData.rows.length);
      playBtn.textContent = isPausedMid ? '▶ Resume' : '▶ Play';
      playBtn.disabled = (replayMode === 'playing');
    }
    if (pauseBtn){
      pauseBtn.disabled = (replayMode !== 'playing');
    }
    if (showFullBtn) showFullBtn.disabled = false;
    if (closeBtn)    closeBtn.disabled = false;
    if (rateInput)   rateInput.value = replayRate;
  } else {
    controls.style.display = 'none';
  }
}

function hookLogButtons(){
  const openBtn = document.getElementById('openLogBtn');
  if (openBtn && !openBtn._wired){
    openBtn.addEventListener('click', ()=>{
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = '.csv,.txt';
      inp.onchange = ()=>{
        const f = inp.files?.[0];
        if (!f) return;

        // Size check. CSVs above this threshold are likely to OOM the
        // browser or freeze it for a long time during parse — the file's
        // text content has to fit in a single JS string (V8 caps strings
        // around ~512MB), then we materialise a row-of-numbers array
        // that consumes several times the text size in RAM. So we warn
        // (with an option to push through anyway) above the threshold.
        //
        // The threshold is in BYTES of the input file. Around 150 MB of
        // CSV becomes ~500-800 MB of JS objects after parse, which is
        // already a struggle on modest machines.
        const WARN_BYTES  = 150 * 1024 * 1024;   // 150 MB
        const BLOCK_BYTES = 1024 * 1024 * 1024;  //   1 GB hard ceiling
        const sizeMB = (f.size / (1024*1024)).toFixed(1);

        if (f.size > BLOCK_BYTES) {
          alert(
            `This log file is ${sizeMB} MB.\n\n` +
            `The browser can't reliably load files this large — it would ` +
            `run out of memory during parsing. Please use Excel or a ` +
            `dedicated CSV viewer (e.g. EmEditor, Modern CSV) to inspect it ` +
            `instead, or trim it down to a shorter time window first.`
          );
          return;
        }
        if (f.size > WARN_BYTES) {
          const ok = confirm(
            `This log file is ${sizeMB} MB — larger than the browser handles ` +
            `gracefully (typical limit ~${(WARN_BYTES/1024/1024)|0} MB).\n\n` +
            `Loading may freeze the page for tens of seconds or run out of ` +
            `memory. Excel or another CSV tool will handle it better.\n\n` +
            `Continue anyway?`
          );
          if (!ok) return;
        }

        const rd = new FileReader();
        rd.onload = ()=>{
          (async ()=>{
            try{
              const {cols, rows} = parseCSV(rd.result);
              if (!cols.length || !rows.length) throw new Error('No data');
              // Keep original column names for reliable parsing (ai0, expr7 etc.)
              // Compute friendly names separately for display only
              const friendlyCols = await friendlyColNames(cols);
              startReplay(cols, rows, friendlyCols);
            }catch(e){
              alert('Load failed: '+e.message);
            }
          })();
        };
        rd.onerror = () => {
          alert('Failed to read the file. It may be too large for the ' +
                'browser to load into memory.');
        };
        rd.readAsText(f);
      };
      inp.click();
    });
    openBtn._wired = true;
  }

  // 🖥 Viewer — ask the server to spawn the standalone Python log viewer.
  // The viewer opens on the server machine's display (same box as the
  // browser in the normal setup) and streams huge CSVs the browser can't.
  // We send along every chart series' displayScale/displayOffset keyed by
  // CSV column name, so the viewer can optionally show data the way the
  // in-app charts do (scaled) as well as raw.
  const viewerBtn = document.getElementById('viewerBtn');
  if (viewerBtn && !viewerBtn._wired){
    viewerBtn.addEventListener('click', async ()=>{
      try{
        const names = await _collectSignalNames();      // friendly names for all signals
        const charted = _collectChartedCols(names);     // cols on charts → default-visible
        const r = await fetch('/api/log_viewer/launch', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ scales: _collectChartScales(), names, charted })
        });
        const j = await r.json();
        if (!j.ok) alert('Viewer launch failed:\n' + (j.error || 'unknown error'));
        // Success is silent — the viewer window appears on its own.
      }catch(e){
        alert('Viewer launch failed: ' + e.message);
      }
    });
    viewerBtn._wired = true;
  }

  // 🔗 Merge chk — recovery tool for sessions where the server was
  // terminated before close() embedded the check events into the CSV.
  const mergeBtn = document.getElementById('mergeChkBtn');
  if (mergeBtn && !mergeBtn._wired){
    mergeBtn.addEventListener('click', openChkMergeDialog);
    mergeBtn._wired = true;
  }

  const playBtn = document.getElementById('replayPlayBtn');
  if (playBtn && !playBtn._wired){
    playBtn.addEventListener('click', playReplay);
    playBtn._wired = true;
  }

  const pauseBtn = document.getElementById('replayPauseBtn');
  if (pauseBtn && !pauseBtn._wired){
    pauseBtn.addEventListener('click', pauseReplay);
    pauseBtn._wired = true;
  }

  const showFullBtn = document.getElementById('replayShowFullBtn');
  if (showFullBtn && !showFullBtn._wired){
    showFullBtn.addEventListener('click', showFullLog);
    showFullBtn._wired = true;
  }

  const closeBtn = document.getElementById('replayCloseBtn');
  if (closeBtn && !closeBtn._wired){
    closeBtn.addEventListener('click', closeReplay);
    closeBtn._wired = true;
  }

  const closeLogBtn = document.getElementById('closeLogBtn');
  if (closeLogBtn && !closeLogBtn._wired){
    closeLogBtn.addEventListener('click', async ()=>{
      // 2.1.82: name the new session (default = the usual timestamp convention).
      const now = new Date();
      const p2 = n => String(n).padStart(2, '0');
      const defName = `${now.getFullYear()}${p2(now.getMonth()+1)}${p2(now.getDate())}_${p2(now.getHours())}${p2(now.getMinutes())}${p2(now.getSeconds())}`;
      const name = prompt(
        'Close current log and start a new one.\n\n' +
        'Name for the new log session (letters/numbers/underscore/dash;\n' +
        'keep the default for the usual timestamp naming):', defName);
      if (name === null) return;   // cancelled
      // 2.1.83: optionally restart all clocks at T0 -- the new CSV's t column
      // starts at ~0 and the charts clear + rebase their x-axis to 0.
      const resetT0 = confirm(
        'Reset clocks to T0 for the new session?\n\n' +
        'OK  = log t starts at 0 and charts clear/restart at 0\n' +
        'Cancel = keep the running clocks (old behavior)');
      try {
        const response = await fetch('/api/logs/close', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({name: name, reset_t0: resetT0})
        });
        const result = await response.json();
        if (result.ok && resetT0) {
          // clear every chart's data + filters + marks and rebase the x-axis
          chartBuffers.clear();
          chartFilters.clear();
          window._chartMarks = [];
          window._chartT0 = performance.now() / 1000;
        }
        if (result.ok) {
          alert(result.message || 'Log closed and new session started');
        } else {
          alert(result.message || 'Failed to close log');
        }
      } catch(e) {
        alert('Failed to close log: ' + e.message);
      }
    });
    closeLogBtn._wired = true;
  }

  const progress = document.getElementById('replayProgress');
  if (progress && !progress._wired){
    progress.addEventListener('input', (e)=>{
      seekReplay(parseInt(e.target.value));
    });
    progress._wired = true;
  }

  const rateInput = document.getElementById('replayRateInput');
  if (rateInput && !rateInput._wired){
    rateInput.addEventListener('change', (e)=>{
      const newRate = parseFloat(e.target.value) || 60;
      setReplayRate(newRate);
    });
    rateInput._wired = true;
  }
}

/* ==================== SCRIPT PLAYER ==================== */
let scriptTimer = null;
let scriptData = null;
let scriptIndex = 0;
let scriptPaused = false;
let scriptStartTime = 0;
let scriptLog = []; // Keep a log of executed events
let scriptDurationTimers = {}; // Track duration timers per output: {type:channel -> timerId}

async function loadScript(){
  try {
    const response = await fetch('/api/script');
    const data = await response.json();
    scriptData = data.events || [];
    scriptData.sort((a, b) => (a.time || 0) - (b.time || 0));
    console.log('[Script] Loaded', scriptData.length, 'events:', scriptData);
    updateScriptUI();
    return scriptData.length > 0;
  } catch(e) {
    console.error('[Script] Failed to load:', e);
    scriptData = [];
    updateScriptUI();
    return false;
  }
}

function playScript(){
  if (!scriptData || scriptData.length === 0) {
    alert('No script events to play. Edit script to add events.');
    return;
  }

  // If paused, resume from current position
  if (scriptPaused && scriptTimer) {
    scriptPaused = false;
    const currentTime = performance.now() / 1000;
    const eventTime = scriptData[scriptIndex]?.time || 0;
    scriptStartTime = currentTime - eventTime;
    console.log('[Script] Resuming from event', scriptIndex);
    updateScriptUI();
    runScript();
    return;
  }

  // Start from beginning
  stopScript();
  scriptIndex = 0;
  scriptPaused = false;
  scriptStartTime = performance.now() / 1000;
  scriptLog = [];

  console.log('[Script] Starting playback of', scriptData.length, 'events');
  updateScriptUI();
  runScript();
}

function runScript(){
  if (!scriptData || scriptPaused) return;

  const currentTime = (performance.now() / 1000) - scriptStartTime;

  // Execute all events that should have happened by now
  while (scriptIndex < scriptData.length) {
    const evt = scriptData[scriptIndex];
    const eventTime = evt.time || 0;

    if (eventTime > currentTime) break;

    console.log(`[Script] t=${currentTime.toFixed(2)}s: Executing event ${scriptIndex + 1}:`, evt);
    executeScriptEvent(evt);
    scriptLog.push({time: currentTime, event: evt, index: scriptIndex});
    scriptIndex++;
  }

  updateScriptUI();

  // Check if done
  if (scriptIndex >= scriptData.length) {
    console.log('[Script] Playback complete. Executed', scriptLog.length, 'events');
    stopScript();
    return;
  }

  // Schedule next check
  scriptTimer = setTimeout(runScript, 50); // Check every 50ms
}

async function executeScriptEvent(evt){
  try {
    if (evt.type === 'DO' || !evt.type) { // Default to DO if no type
      const channel = evt.channel || 0;
      const state = !!evt.state;
      const activeHigh = evt.normallyOpen !== false;
      const duration = evt.duration || 0;

      console.log(`[Script] DO${channel}: ${state ? 'ON' : 'OFF'} (${activeHigh ? 'NO' : 'NC'})${duration > 0 ? `, duration ${duration}s` : ''}`);
      console.log(`[Script] Event details:`, {channel, state, activeHigh, duration, evt});

      const response = await fetch('/api/do/set', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          index: channel,
          state: state,
          active_high: activeHigh
        })
      });

      if (!response.ok) {
        console.error('[Script] DO set failed:', await response.text());
        return;
      }

      console.log(`[Script] ✓ DO${channel} set to ${state}`);

      // Cancel any pending duration timer for this DO
      const doKey = `DO:${channel}`;
      if (scriptDurationTimers[doKey]) {
        clearTimeout(scriptDurationTimers[doKey]);
        delete scriptDurationTimers[doKey];
        console.log(`[Script] Cancelled previous duration timer for DO${channel}`);
      }
      
      // If duration > 0, schedule the off event
      if (duration > 0) {
        console.log(`[Script] Scheduling DO${channel} OFF in ${duration}s`);
        scriptDurationTimers[doKey] = setTimeout(async () => {
          console.log(`[Script] Duration expired: DO${channel} -> OFF`);
          delete scriptDurationTimers[doKey];
          
          const offResponse = await fetch('/api/do/set', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
              index: channel,
              state: !state,
              active_high: activeHigh
            })
          });
          if (offResponse.ok) {
            console.log(`[Script] ✓ DO${channel} auto-off complete`);
          } else {
            console.error('[Script] DO auto-off failed:', await offResponse.text());
          }
        }, duration * 1000);
      }

    } else if (evt.type === 'AO') {
      const channel = evt.channel || 0;
      const volts = evt.value || 0;

      console.log(`[Script] AO${channel}: ${volts}V`);

      const response = await fetch('/api/ao/set', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          index: channel,
          volts: volts
        })
      });

      if (!response.ok) {
        console.error('[Script] AO set failed:', await response.text());
        return;
      }

      console.log(`[Script] ✓ AO${channel} set to ${volts}V`);
      
      // Handle duration for AO
      const aoKey = `AO:${channel}`;
      if (scriptDurationTimers[aoKey]) {
        clearTimeout(scriptDurationTimers[aoKey]);
        delete scriptDurationTimers[aoKey];
        console.log(`[Script] Cancelled previous duration timer for AO${channel}`);
      }
      
      const duration = evt.duration || 0;
      if (duration > 0) {
        console.log(`[Script] Scheduling AO${channel} reset to 0V in ${duration}s`);
        scriptDurationTimers[aoKey] = setTimeout(async () => {
          console.log(`[Script] Duration expired: AO${channel} -> 0V`);
          delete scriptDurationTimers[aoKey];
          
          await fetch('/api/ao/set', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({index: channel, volts: 0})
          });
          console.log(`[Script] ✓ AO${channel} duration reset complete`);
        }, duration * 1000);
      }
      
    } else if (evt.type === 'buttonVar') {
      const varName = evt.varName || 'button1';
      const value = evt.value || 0;
      
      console.log(`[Script] buttonVar.${varName}: ${value}`);
      
      // Update local state
      if (!state.buttonVars) state.buttonVars = {};
      state.buttonVars[varName] = value;
      
      // Sync to backend
      const response = await fetch('/api/button_vars', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({vars: state.buttonVars})
      });
      
      if (!response.ok) {
        console.error('[Script] buttonVar set failed:', await response.text());
        return;
      }
      
      console.log(`[Script] ✓ buttonVar.${varName} set to ${value}`);
      
      // Handle duration for buttonVar
      const bvKey = `buttonVar:${varName}`;
      if (scriptDurationTimers[bvKey]) {
        clearTimeout(scriptDurationTimers[bvKey]);
        delete scriptDurationTimers[bvKey];
        console.log(`[Script] Cancelled previous duration timer for buttonVar.${varName}`);
      }
      
      const duration = evt.duration || 0;
      if (duration > 0) {
        console.log(`[Script] Scheduling buttonVar.${varName} reset to 0 in ${duration}s`);
        scriptDurationTimers[bvKey] = setTimeout(async () => {
          console.log(`[Script] Duration expired: buttonVar.${varName} -> 0`);
          delete scriptDurationTimers[bvKey];
          
          // Reset to 0
          if (!state.buttonVars) state.buttonVars = {};
          state.buttonVars[varName] = 0;
          
          await fetch('/api/button_vars', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({vars: state.buttonVars})
          });
          console.log(`[Script] ✓ buttonVar.${varName} duration reset complete`);
        }, duration * 1000);
      }
      
    } else if (evt.type === 'var') {
      const varName = evt.varName || 'var1';
      const value = evt.value || 0;
      
      console.log(`[Script] var.${varName}: ${value}`);
      
      // Update global vars (same as expressions use)
      if (!window.scriptVars) window.scriptVars = {};
      window.scriptVars[varName] = value;
      
      console.log(`[Script] ✓ var.${varName} set to ${value}`);
      
      // Handle duration for var
      const vKey = `var:${varName}`;
      if (scriptDurationTimers[vKey]) {
        clearTimeout(scriptDurationTimers[vKey]);
        delete scriptDurationTimers[vKey];
        console.log(`[Script] Cancelled previous duration timer for var.${varName}`);
      }
      
      const duration = evt.duration || 0;
      if (duration > 0) {
        console.log(`[Script] Scheduling var.${varName} reset to 0 in ${duration}s`);
        scriptDurationTimers[vKey] = setTimeout(() => {
          console.log(`[Script] Duration expired: var.${varName} -> 0`);
          delete scriptDurationTimers[vKey];
          
          if (!window.scriptVars) window.scriptVars = {};
          window.scriptVars[varName] = 0;
          console.log(`[Script] ✓ var.${varName} duration reset complete`);
        }, duration * 1000);
      }
    }
  } catch(e) {
    console.error('[Script] Event execution failed:', e, 'Event:', evt);
  }
}

function pauseScript(){
  if (!scriptTimer || scriptPaused) return;
  scriptPaused = true;
  console.log('[Script] Paused at event', scriptIndex);
  updateScriptUI();
}

function stopScript(){
  if (scriptTimer) {
    clearTimeout(scriptTimer);
    scriptTimer = null;
  }
  
  // Cancel all pending duration timers
  for (const key in scriptDurationTimers) {
    clearTimeout(scriptDurationTimers[key]);
  }
  scriptDurationTimers = {};
  
  scriptIndex = 0;
  scriptPaused = false;
  scriptStartTime = 0;
  if (scriptLog.length > 0) {
    console.log('[Script] Stopped. Log:', scriptLog);
  }
  updateScriptUI();
}

function rewindScript(){
  console.log('[Script] Rewinding to start');
  stopScript();
  scriptIndex = 0;
  scriptLog = [];
  updateScriptUI();
}

function updateScriptUI(){
  const playBtn = document.getElementById('scriptPlayBtn');
  const pauseBtn = document.getElementById('scriptPauseBtn');
  const stopBtn = document.getElementById('scriptStopBtn');
  const rewindBtn = document.getElementById('scriptRewindBtn');
  const status = document.getElementById('scriptStatus');

  const isPlaying = (scriptTimer !== null && !scriptPaused);
  const isStopped = (scriptTimer === null && scriptIndex === 0);

  if (playBtn) {
    playBtn.disabled = isPlaying;
    playBtn.textContent = (scriptPaused && scriptTimer) ? '▶ Resume' : '▶ Play';
  }
  if (pauseBtn) {
    pauseBtn.disabled = !isPlaying;
  }
  if (stopBtn) {
    stopBtn.disabled = isStopped;
  }
  if (rewindBtn) {
    rewindBtn.disabled = isStopped;
  }

  if (status && scriptData) {
    if (isPlaying) {
      status.textContent = `Playing: ${scriptIndex} / ${scriptData.length}`;
      status.className = 'badge playing';
    } else if (scriptPaused && scriptTimer) {
      status.textContent = `Paused: ${scriptIndex} / ${scriptData.length}`;
      status.className = 'badge paused';
    } else if (scriptIndex > 0) {
      status.textContent = `Stopped: ${scriptIndex} / ${scriptData.length}`;
      status.className = 'badge stopped';
    } else if (scriptData.length > 0) {
      status.textContent = `Ready: ${scriptData.length} events`;
      status.className = 'badge ready';
    } else {
      status.textContent = 'No script loaded';
      status.className = 'badge';
    }
  }
}

function hookScriptButtons(){
  const playBtn = document.getElementById('scriptPlayBtn');
  if (playBtn && !playBtn._wired) {
    playBtn.addEventListener('click', async () => {
      await loadScript();
      playScript();
    });
    playBtn._wired = true;
  }

  const pauseBtn = document.getElementById('scriptPauseBtn');
  if (pauseBtn && !pauseBtn._wired) {
    pauseBtn.addEventListener('click', pauseScript);
    pauseBtn._wired = true;
  }

  const stopBtn = document.getElementById('scriptStopBtn');
  if (stopBtn && !stopBtn._wired) {
    stopBtn.addEventListener('click', stopScript);
    stopBtn._wired = true;
  }

  const rewindBtn = document.getElementById('scriptRewindBtn');
  if (rewindBtn && !rewindBtn._wired) {
    rewindBtn.addEventListener('click', rewindScript);
    rewindBtn._wired = true;
  }

  // Load script data initially
  loadScript();
}

// TEST FUNCTION - Call this from browser console to test a single event
window.testScriptEvent = async function(channel, state) {
  console.log('[Test] Sending DO command: channel', channel, 'state', state);
  try {
    const response = await fetch('/api/do/set', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        index: channel,
        state: state,
        active_high: true
      })
    });
    console.log('[Test] Response:', response.ok ? 'OK' : 'FAILED', await response.text());
  } catch(e) {
    console.error('[Test] Error:', e);
  }
};

/* ------------------------------ state ----------------------------------- */
let hwReady = false;
let configCache = null;

// Helper functions to flatten board-centric config for UI compatibility
function getAllAnalogs(cfg) {
  try {
    if (!cfg) return [];
    // Old format fallback
    if (cfg.analogs) return cfg.analogs;
    // New format: flatten from all boards
    const all = [];
    if (cfg.boards1608 && Array.isArray(cfg.boards1608)) {
      cfg.boards1608.forEach(board => {
        if (board && board.enabled && board.analogs && Array.isArray(board.analogs)) {
          all.push(...board.analogs);
        }
      });
    }
    return all;
  } catch (e) {
    console.error('[getAllAnalogs] Error:', e);
    return [];
  }
}

function getAllCounters(cfg) {
  // Hardware counters (CTR) -- a first-class input type, separate from AI.
  try {
    if (!cfg) return [];
    const all = [];
    if (cfg.boards1608 && Array.isArray(cfg.boards1608)) {
      cfg.boards1608.forEach(board => {
        if (board && board.enabled && board.counters && Array.isArray(board.counters)) {
          all.push(...board.counters);
        }
      });
    }
    return all;
  } catch (e) {
    console.error('[getAllCounters] Error:', e);
    return [];
  }
}

function getAllDigitalOutputs(cfg) {
  try {
    if (!cfg) return [];
    if (cfg.digitalOutputs) return cfg.digitalOutputs;
    const all = [];
    if (cfg.boards1608 && Array.isArray(cfg.boards1608)) {
      cfg.boards1608.forEach(board => {
        if (board && board.enabled && board.digitalOutputs && Array.isArray(board.digitalOutputs)) {
          all.push(...board.digitalOutputs);
        }
      });
    }
    return all;
  } catch (e) {
    console.error('[getAllDigitalOutputs] Error:', e);
    return [];
  }
}

function getAllAnalogOutputs(cfg) {
  try {
    if (!cfg) return [];
    if (cfg.analogOutputs) return cfg.analogOutputs;
    const all = [];
    if (cfg.boards1608 && Array.isArray(cfg.boards1608)) {
      cfg.boards1608.forEach(board => {
        if (board && board.enabled && board.analogOutputs && Array.isArray(board.analogOutputs)) {
          all.push(...board.analogOutputs);
        }
      });
    }
    return all;
  } catch (e) {
    console.error('[getAllAnalogOutputs] Error:', e);
    return [];
  }
}

function getAllThermocouples(cfg) {
  try {
    if (!cfg) return [];
    if (cfg.thermocouples) return cfg.thermocouples;
    const all = [];
    if (cfg.boardsetc && Array.isArray(cfg.boardsetc)) {
      cfg.boardsetc.forEach(board => {
        if (board && board.enabled && board.thermocouples && Array.isArray(board.thermocouples)) {
          all.push(...board.thermocouples);
        }
      });
    }
    return all;
  } catch (e) {
    console.error('[getAllThermocouples] Error:', e);
    return [];
  }
}


let ws = null, sessionDir = '', connected = false;

const state = {
  pages: [],
  ai: Array(8).fill(0),
  ao: Array(2).fill(0),
  do: Array(8).fill(0),
  tc: [],
  pid: [],
  motors: [],
  le: [],  // Logic Elements
  // Layout grid: see gridState/_loadGridState below. The actual values live
  // here so saveLayoutToFile / loadLayoutFromFile can round-trip them.
  grid: { enabled: false, size: 10, show: false, color: '#3a4055' },
};

// Z-index management for bringing widgets to front
let topZIndex = 100;
function bringToFront(node) {
  if (!node) return;
  // Locked UI: don't reorder z-stacking on click. Without this, clicking a
  // shape that was sent-to-back would pop it forward and (if it had a fill
  // color) hide the widgets behind it — the exact thing the lock is meant
  // to prevent.
  if (!isUiEditMode()) return;
  topZIndex++;
  node.style.zIndex = topZIndex;
}

/* --------------------------- UI edit mode -------------------------------
 * Global lock/unlock for layout editing. When OFF (the default), widgets
 * can't be dragged or resized, clicks don't reorder z-stacking, and
 * shapes can't be selected for vertex/endpoint editing. Form inputs,
 * buttons, sliders, and other "use the dashboard" interactions all keep
 * working in both modes — only LAYOUT operations are gated.
 *
 * State is persisted in localStorage so a configured page opens locked
 * (which is usually what you want for daily use); the user clicks the
 * toolbar toggle to enter edit mode when they want to rearrange things.
 *
 * Note: this is intentionally per-browser (localStorage), not per-layout
 * (layout file). The lock is a usage-time preference, not a property of
 * the layout itself.                                                     */
const UI_EDIT_MODE_KEY = 'mcc.uiEditMode';
let _uiEditMode = false;
function isUiEditMode() { return _uiEditMode; }
function _loadUiEditMode() {
  try {
    _uiEditMode = (localStorage.getItem(UI_EDIT_MODE_KEY) === 'true');
  } catch { _uiEditMode = false; }
  _applyUiEditMode();
}
function _setUiEditMode(on) {
  _uiEditMode = !!on;
  try { localStorage.setItem(UI_EDIT_MODE_KEY, String(_uiEditMode)); } catch {}
  _applyUiEditMode();
}
function _applyUiEditMode() {
  document.body.classList.toggle('ui-locked', !_uiEditMode);
  document.body.classList.toggle('ui-editing', _uiEditMode);
  // Refresh the toolbar button label/style if it exists yet.
  const btn = document.getElementById('uiEditToggle');
  if (btn) {
    btn.textContent = _uiEditMode ? '🔓 Editing' : '🔒 Locked';
    btn.classList.toggle('ui-edit-toggle-on', _uiEditMode);
    btn.title = _uiEditMode
      ? 'Click to lock the layout (prevents accidental moves/resizes)'
      : 'Click to unlock the layout for moving/resizing widgets';
  }
  // Leaving edit mode: drop any multi-selection (its affordances only
  // exist while editing) ...
  if (!_uiEditMode && typeof msClear === 'function') { try { msClear(); } catch {} }
  // ... and any shape currently in per-shape edit mode should
  // close — otherwise handles would linger when you can't actually use
  // them. Iterate the active page's widgets and clear _editing for shapes.
  if (!_uiEditMode && state && state.pages && Array.isArray(state.pages)) {
    const page = state.pages[activePageIndex];
    if (page && Array.isArray(page.widgets)) {
      for (const w of page.widgets) {
        if (w && w.type === 'shape' && w._editing) {
          // _setShapeEditing applies the visuals (hides handles + outline).
          // It's defined in the shape mount module; guard against early
          // calls before it's reachable.
          if (typeof _setShapeEditing === 'function') {
            try { _setShapeEditing(w, false); } catch {}
          } else {
            w._editing = false;
          }
        }
      }
    }
  }
}

function feedTick(msg){
  // Debug logging (only for first few ticks or when state.expr appears)
  if (msg.expr && (!state.expr || (window._exprDebugCount || 0) < 5)) {
    console.log('[FeedTick] Received expr data:', msg.expr);
    window._exprDebugCount = (window._exprDebugCount || 0) + 1;
  }
  
  if (msg.ai)  state.ai  = msg.ai;
  if (msg.ao)  state.ao  = msg.ao;
  if (msg.do)  state.do  = msg.do;
  if (msg.tc)  state.tc  = msg.tc;
  if (msg.ctr) state.ctr = msg.ctr;
  if (msg.pid) state.pid = msg.pid;
  if (msg.motors) state.motors = msg.motors;
  if (msg.le) state.le = msg.le;
  if (msg.math) state.math = msg.math;
  if (msg.expr) state.expr = msg.expr;
  if (msg.scales) state.scales = msg.scales;
  if (msg.vfd) state.vfd = msg.vfd;
  if (msg.stepper) state.stepper = msg.stepper;
  if (msg.button_vars) state.buttonVars = {...(state.buttonVars||{}), ...msg.button_vars};
  if (msg.t != null) state.lastT = msg.t;  // for checklist _currentT() in live mode
  if (msg.static_vars && Object.keys(msg.static_vars).length > 0) {
    state.static_vars = msg.static_vars;
  } else if (msg.global_vars) {
    state.static_vars = msg.global_vars;
  }
  checkFaultPopups();
  onTick();
}

/* ---- One-shot fault popups -------------------------------------------------
   When a latched fault static goes 0 -> 1 in the live frame, alert the operator
   ONCE (re-arms only after the flag clears, i.e. after they Stop + fix + retry).
   Driven by the control's Interlocks fault flags, so sim and real behave the same. */
const FAULT_MSGS = {
  evapLevelErr: 'Evaporator Level Error\n\n'
    + 'The level sender (EvapLevel) did not reach the low mark after priming.\n'
    + 'Possible sender/wiring or feed peristaltic-pump failure.\n\n'
    + 'Check and try again.',
  evapHighWarn: 'High Level Warning\n\n'
    + 'The evaporator High-Level switch (EvapHighLevel) tripped.\n'
    + 'The feed has been paused to let boil-off draw the level back down.',
  purgeErr: 'Purge Not Emptying\n\n'
    + 'The level sender shows no drop while the purge pump runs.\n'
    + 'Check the feed pump is actually running IN REVERSE (direction),\n'
    + 'the tubing, and the pump head. System tripped.',
  senderErr: 'Level Sender Fault\n\n'
    + 'The evaporator level sender (EvapLevel, AI6) reads open or shorted\n'
    + '(raw ~10V = broken wire, raw 0V = short / no 12V supply).\n'
    + 'System tripped -- check the sender wiring and restart.',
  condMeterErr: 'Condensate Measurement Dead\n\n'
    + 'The condensate pump keeps running but the flow meter counts ~nothing.\n'
    + 'Production control is BLIND (blower held at the seek cap).\n'
    + 'Check: pump actually moving liquid (airlock/tubing), the flow meter,\n'
    + 'or a stuck-wet CondLevel sensor (condensation film). NOT a trip --\n'
    + 'the run continues; clears on a real metered batch or Stop.',
  condSensErr: 'Condensate Level Sensor Bad\n\n'
    + 'The pump cycled for minutes with no clean batch, but the flow meter IS\n'
    + 'counting -- the CondLevel sensor is lying (fog/condensation film).\n'
    + 'TIMED pumping engaged for the rest of the run (condTimedOnS on /\n'
    + 'condTimedOffS off) so batches and production measurement continue.\n'
    + 'NOT a trip. Clean or replace the sensor when convenient.'
};
/* Non-blocking fault notification (2.1.81). window.alert() is MODAL: it froze
   the whole JS thread, so chart data-popup readings stopped and stayed stale
   until dismissed. Faults now stack as dismissible toasts in the top-right --
   charts, inspectors, and the WebSocket keep running underneath. */
function showFaultToast(msg){
  let host = document.getElementById('faultToastHost');
  if (!host){
    host = el('div', {id: 'faultToastHost',
      style: 'position:fixed;top:12px;right:12px;z-index:99999;display:flex;' +
             'flex-direction:column;gap:8px;max-width:420px'});
    document.body.append(host);
  }
  const toast = el('div', {style:
    'background:#1a1d2e;border:1px solid #f7768e;border-left:6px solid #f7768e;' +
    'border-radius:6px;padding:10px 12px;color:#e6e9f2;box-shadow:0 4px 16px rgba(0,0,0,.5);' +
    'font-size:13px;white-space:pre-wrap;line-height:1.35'});
  const btn = el('button', {className:'btn',
    style:'margin-top:8px;padding:2px 12px;font-size:12px',
    onclick: () => toast.remove()}, 'Dismiss');
  toast.append(el('div', {style:'font-weight:700;color:#f7768e;margin-bottom:4px'}, '⚠ FAULT'),
               document.createTextNode(msg), el('div', {}, btn));
  host.append(toast);
}

function checkFaultPopups(){
  const prev = (state._faultPrev = state._faultPrev || {});
  const sv = state.static_vars || {};
  for (const k in FAULT_MSGS){
    const on = (parseFloat(sv[k]) || 0) >= 0.5;
    if (on && !prev[k]) showFaultToast(FAULT_MSGS[k]);
    prev[k] = on;
  }
}

window.GLOBAL_BUFFER_SPAN = window.GLOBAL_BUFFER_SPAN || 10;

/* ---- Chart check-mark overlay ----
   Listens for 'checklist-check' events from checklist_widget.js.
   In live mode: records performance.now()/1000 (matches chartBuffers.t).
   In replay mode: records the tServer from the event (matches replayData row t values).
   Marks are cleared when replay closes / live mode resumes.               */
window._chartMarks = window._chartMarks || [];
window.chartMarkTime = function(label) {
  // Called directly (legacy) — use performance.now()
  window._chartMarks.push({ t: performance.now() / 1000, label: label || '' });
};
window.clearChartMarks = function() {
  window._chartMarks = [];
};

window.addEventListener('checklist-check', (ev) => {
  const detail = ev.detail || {};
  let t;
  if (replayMode !== null && detail.tServer != null) {
    // Replay: tServer matches the log's t column directly
    t = detail.tServer;
  } else {
    // Live: use performance.now() which matches chartBuffers timestamps
    t = performance.now() / 1000;
  }
  const label = detail.label || String(detail.itemNum || '');
  window._chartMarks.push({ t, label });
});

// Uncheck: remove the most recent live mark for that item. (This listener
// was missing entirely before — unchecking left the mark on live charts.)
window.addEventListener('checklist-uncheck', (ev) => {
  const num = String(ev.detail?.itemNum ?? '');
  if (!num || !window._chartMarks) return;
  for (let i = window._chartMarks.length - 1; i >= 0; i--) {
    if (window._chartMarks[i].label === num) {
      window._chartMarks.splice(i, 1);
      break;
    }
  }
});

/* ---------------- cross-window check-event sync (popouts) ----------------
 * window.checkEvents and the 'checklist-check'/'checklist-uncheck' DOM
 * events are per-window, so a chart popped out into its own window never
 * heard about checks made in the main window (and vice versa when the
 * checklist itself is popped out). A BroadcastChannel is shared by all
 * same-origin windows — exactly the main page + its popouts — so we relay
 * every mutation through it and apply it locally in each window.
 *
 * The receiving window re-dispatches the local DOM event, which lets the
 * existing 'checklist-check' listener compute the mark time on the
 * RECEIVING window's own performance.now() clock — correct, because each
 * window's chart buffers run on their own clock and "now" is when the
 * check happened (channel latency is sub-millisecond).
 *
 * Note: BroadcastChannel never delivers a message back to the window that
 * posted it, so the originating window (which already applied the change
 * locally) sees no echo and there's no double-apply. The idempotence
 * checks below are belt-and-suspenders for multi-window race conditions. */
/* Shared applier for check-event mutations arriving from ANOTHER context —
 * a sibling window via BroadcastChannel, or another COMPUTER via the
 * server's WebSocket relay ({type:'check_event'} messages). Both deliver
 * the same {op, ...} shape. Idempotence rules make echo storms harmless:
 *  - 'add' is skipped when the same event (itemNum + timestamp) is present,
 *    which also swallows the server echo in the originating window.
 *  - 'remove' only dispatches the mark-removal DOM event when an event was
 *    actually spliced, so the originator (which already removed its copy)
 *    doesn't pull a second mark off its charts. */
function applyRemoteCheckEvent(d) {
  if (!d) return;
  const sameEv = (a, b) => a && b && a.itemNum === b.itemNum &&
    Math.abs((a.tServer ?? a.t ?? 0) - (b.tServer ?? b.t ?? 0)) < 1e-6;
  window.checkEvents = window.checkEvents || [];
  if (d.op === 'add' && d.ev) {
    if (!window.checkEvents.some(e => sameEv(e, d.ev))) {
      window.checkEvents.push(d.ev);
      window.dispatchEvent(new CustomEvent('checklist-check', { detail: d.ev }));
    }
    // Mirror into a locally-hosted checklist widget, if one is loaded.
    // Deliberately OUTSIDE the duplicate-guard: a late-joining machine
    // may lack the event in checkEvents yet still need its checklist
    // updated; the hook itself is idempotent (no-ops on already-checked),
    // which also swallows the originator's echo.
    window.clApplyRemoteCheck?.(d.ev);
  } else if (d.op === 'remove' && d.itemNum !== undefined) {
    const idx = window.checkEvents.map(e => e.itemNum).lastIndexOf(d.itemNum);
    if (idx >= 0) {
      window.checkEvents.splice(idx, 1);
      window.dispatchEvent(new CustomEvent('checklist-uncheck',
        { detail: { itemNum: d.itemNum } }));
    }
    window.clApplyRemoteUncheck?.(d.itemNum);   // idempotent, see above
  } else if (d.op === 'replace' && Array.isArray(d.events)) {
    window.checkEvents = d.events.slice();
    if (!d.events.length) window._chartMarks = [];   // cleared/new checklist
  }
}

(function () {
  if (typeof BroadcastChannel === 'undefined') return;   // very old browser
  let bc;
  try { bc = new BroadcastChannel('mcc-check-events'); } catch { return; }

  const sameEv = (a, b) => a && b && a.itemNum === b.itemNum &&
    Math.abs((a.tServer ?? a.t ?? 0) - (b.tServer ?? b.t ?? 0)) < 1e-6;

  window.broadcastCheckEvent = (op, payload) => {
    try { bc.postMessage(Object.assign({ op }, payload || {})); } catch {}
  };

  bc.onmessage = (m) => {
    const d = m.data || {};
    if (d.op === 'sync_request') {
      // A freshly-opened window wants current state. Any window that has
      // events answers; identical answers from several windows are fine
      // because 'replace' is idempotent.
      if ((window.checkEvents || []).length) {
        try { bc.postMessage({ op: 'replace', events: window.checkEvents }); } catch {}
      }
    } else {
      applyRemoteCheckEvent(d);
    }
  };

  // New windows — popouts especially — pull existing events from siblings
  // shortly after boot, so a chart popped out mid-session knows about
  // checks that happened before it opened.
  setTimeout(() => { try { bc.postMessage({ op: 'sync_request' }); } catch {} }, 300);
})();

window.addEventListener('tick', (ev)=>{
  if (ev && ev.detail) feedTick(ev.detail);
});

/* ------------------------ boot / wiring --------------------------------- */
document.addEventListener('DOMContentLoaded', () => {
  if (IS_POPOUT) {
    initPopout();
    return;
  }
  wireUI();
  _loadGridState();
  _wirePaletteToggle();
  _wireUiEditToggle();
  _loadUiEditMode();
  ensureStarterPage();
  loadLayoutFromLocal();    // THIS browser's last-saved layout, or starter page
  _wireMultiSelect();
  // Apply grid visual after pages render so #canvas exists.
  _applyGridVisual();
  showVersions();
  loadConfigCache();
  connect();
  hookLogButtons();
  hookScriptButtons();
  // One-time VFD comms check at startup -> warn if a configured drive didn't answer.
  setTimeout(() => {
    fetch('/api/vfd/health').then(r => r.json()).then(h => {
      const bad = (h.drives || []).filter(d => !d.comms_ok);
      if (bad.length) {
        const lines = bad.map(d =>
          `\u2022 ${d.name} (${d.drive || '?'}) on ${d.port || '?'} @ ${d.baud || '?'} baud: ${d.error || 'no reply'}`
        ).join('\n');
        alert('\u26A0 VFD communication problem at startup\n\n' + lines +
          '\n\nCheck the COM port, wiring, baud rate, and node address. The drive ' +
          'will not respond to commands or report status until this is resolved.');
      }
    }).catch(() => {});
  }, 1500);
});

/**
 * Pop-out window init. Runs in /popout.html?popout=<widgetId>. We:
 *   1. Wait for the opener to expose the widget via window.getPopoutWidget(id).
 *      The opener calls postMessage('popout-ready') back to confirm; we also
 *      poll briefly in case the message races.
 *   2. Stuff state.pages with that single widget so updateChartBuffers /
 *      updateDOButtons / etc. find it the way they normally would.
 *   3. Render it into #popout-canvas.
 *   4. Open a WebSocket like the main app and let feedTick drive updates.
 *   5. Tell the opener when the window closes so the widget re-docks.
 */
async function initPopout() {
  // Title once we know which widget — set a placeholder for now
  document.title = 'Widget (loading…)';

  // Special case: ?popout=checklist isn't a widget id, it's a sentinel
  // meaning "this popout window hosts the checklist dock." The checklist
  // owns its DOM and state via checklist_widget.js; all we need to do
  // here is open the WebSocket so state.lastT keeps updating (the
  // checklist's TIME column reads it). The actual mount happens in
  // _clBootChecklistPopout, dispatched from checklist_widget.js's own
  // DOMContentLoaded path.
  if (POPOUT_ID === 'checklist') {
    document.title = 'Checklist';
    connect();
    return;
  }

  let widget = null;
  // Strategy: try the opener's getter immediately, then poll for up to 5s
  // in case the opener hasn't finished its own DOMContentLoaded yet (e.g.
  // if the user opened the popout from a freshly-restored layout).
  const deadline = performance.now() + 5000;
  while (!widget && performance.now() < deadline) {
    try {
      if (window.opener && typeof window.opener.getPopoutWidget === 'function') {
        widget = window.opener.getPopoutWidget(POPOUT_ID);
      }
    } catch { /* cross-origin or opener gone — give up */ }
    if (!widget) await new Promise(r => setTimeout(r, 100));
  }

  if (!widget) {
    document.getElementById('popout-canvas').innerHTML =
      '<div style="padding:24px;color:#cfd6f0;font:14px/1.4 system-ui">' +
      '<h2 style="color:#ff6b6b">Popout failed</h2>' +
      '<p>Could not find widget data from the main window. ' +
      'This usually means the main window was closed or reloaded. ' +
      'Close this window and re-create the popout from the main app.</p>' +
      '</div>';
    document.title = 'Popout failed';
    return;
  }

  document.title = (widget.opts && widget.opts.title) || widget.type;

  // Minimal page model so the existing renderers find what they expect.
  // activePageIndex stays at 0; state.pages has exactly the one widget.
  state.pages = [{ id: 'popout-page', name: '', widgets: [widget] }];
  activePageIndex = 0;

  // Render into the popout canvas, not the main canvas. We reuse the same
  // renderWidget() so everything — chart, gauge, indicator, label, etc. —
  // works identically to the main page.
  const canvas = document.getElementById('popout-canvas');
  const node = renderWidget(widget);
  canvas.append(node);
  // Initial widget node sizing — the popout.html CSS forces
  //   #popout-canvas > .widget { width: 100% !important; height: 100% !important; }
  // so the widget visually fills the window regardless of these inline
  // values. We set them anyway as defensive defaults in case that CSS
  // stops applying for any reason. We do NOT update widget.w / widget.h
  // on resize — those represent the widget's dock-back size on the main
  // page, and the user resizing the popout shouldn't change how big the
  // widget is when it returns home.
  const fit = () => {
    node.style.left = '0px';
    node.style.top = '0px';
    node.style.width = window.innerWidth + 'px';
    node.style.height = window.innerHeight + 'px';
  };
  fit();
  window.addEventListener('resize', fit);

  // Open a WebSocket and feed ticks just like the main app.
  connect();

  // Tell the opener we're closing so it can re-dock the widget.
  window.addEventListener('beforeunload', () => {
    try {
      if (window.opener && typeof window.opener.notifyPopoutClosed === 'function') {
        window.opener.notifyPopoutClosed(POPOUT_ID);
      }
    } catch { /* opener gone */ }
  });
}

function wireUI(){
  $('#connectBtn')?.addEventListener('click', connect);
  // CLOSE UI (russ 7/24, keyboardless kiosk): a page cannot reliably close a
  // browser it didn't open -- but the SERVER runs on the same machine as the
  // rig kiosk, so after a confirm we try window.close() and then ask the
  // server to pkill the kiosk chromium (scoped to localhost:8000 cmdlines so
  // other browsers on that machine survive). Remote viewers clicking this
  // close the RIG display, not their own browser -- hence the confirm text.
  // ON-SCREEN KEYBOARD toggle (russ 7/24, keyboardless kiosk): the server on
  // the rig machine signals wvkbd (SIGRTMIN = toggle). Full QWERTY on demand,
  // deterministic -- no IME protocol negotiation involved.
  $('#oskBtn')?.addEventListener('click', () => {
    fetch('/api/ui/keyboard', {method: 'POST'}).catch(() => {});
  });

  $('#closeUiBtn')?.addEventListener('click', async () => {
    if (!confirm('Close the rig display browser (kiosk) on the server machine?')) return;
    try { window.close(); } catch {}
    setTimeout(() => { fetch('/api/ui/close', {method: 'POST'}).catch(() => {}); }, 300);
  });
  $('#setRate')?.addEventListener('click', setRate);
  $('#fullscreenBtn')?.addEventListener('click', toggleFullscreen);
  $('#exitFullscreenBtn')?.addEventListener('click', toggleFullscreen);
  $('#gridBtn')?.addEventListener('click', openGridDialog);
  $('#editConfig')?.addEventListener('click', ()=>openConfigForm());
  $('#editPID')?.addEventListener('click', ()=>openPidForm());
  $('#editVFD')?.addEventListener('click', ()=>openVfdEditor());
  $('#editScales')?.addEventListener('click', ()=>openScalesEditor());
  $('#editLE')?.addEventListener('click', ()=>openLEEditor());  // Logic Elements (button removed; handler kept harmless)
  $('#editMath')?.addEventListener('click', ()=>openMathEditor());  // Math Operators (button removed; handler kept harmless)
  $('#editExpr')?.addEventListener('click', ()=>openExpressionEditor());  // Expression Editor
  $('#editSim')?.addEventListener('click', ()=>openSimPanel());  // Simulator controls
  $('#exprHelp')?.addEventListener('click', ()=>openExpressionHelp());  // Expression Help
  $('#editScript')?.addEventListener('click', ()=>openScriptEditor());
  $('#zeroAI')?.addEventListener('click', ()=>openZeroAIDialog());  // Zero AI channels
  $('#saveLayout')?.addEventListener('click', saveLayoutToFile);
  $('#loadLayout')?.addEventListener('click', loadLayoutFromFile);
  $('#addPage')?.addEventListener('click', addPage);
  $('#delPage')?.addEventListener('click', removeActivePage);
  applyInitialsFromConfig();
  document.querySelectorAll('[data-add]').forEach(btn => btn.addEventListener('click', ()=>addWidget(btn.dataset.add)));
  
  // F11 key for fullscreen toggle
  document.addEventListener('keydown', (e) => {
    if (e.key === 'F11') {
      e.preventDefault();
      toggleFullscreen();
    }
  });
  
  // ESC key to exit fullscreen
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.body.classList.contains('fullscreen')) {
      toggleFullscreen();
    }
  });
}

async function toggleFullscreen() {
  const isFullscreen = document.body.classList.contains('fullscreen');
  
  if (!isFullscreen) {
    // Enter fullscreen
    document.body.classList.add('fullscreen');
    
    // Try to use browser's native fullscreen API (hides browser chrome)
    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      } else if (document.documentElement.webkitRequestFullscreen) {
        await document.documentElement.webkitRequestFullscreen();
      } else if (document.documentElement.msRequestFullscreen) {
        await document.documentElement.msRequestFullscreen();
      }
    } catch(e) {
      console.log('Native fullscreen not available, using CSS fullscreen');
    }
  } else {
    // Exit fullscreen
    document.body.classList.remove('fullscreen');
    
    // Exit browser's native fullscreen
    try {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        await document.webkitExitFullscreen();
      } else if (document.msExitFullscreen) {
        await document.msExitFullscreen();
      }
    } catch(e) {
      console.log('Native fullscreen exit not available');
    }
  }
  
  const btn = $('#fullscreenBtn');
  if (btn) {
    const nowFullscreen = document.body.classList.contains('fullscreen');
    btn.textContent = nowFullscreen ? '⛶' : '⛶';
    btn.title = nowFullscreen ? 'Exit Fullscreen (F11)' : 'Enter Fullscreen (F11)';
  }
}

async function showVersions(){
  const versions=[`UI ${UI_VERSION}`];
  try{
    const r=await fetch('/api/diag');
    if(r.ok){
      const d=await r.json();
      if(d.server) versions.push(`Server ${d.server}`);
      if(d.bridge) versions.push(`Bridge ${d.bridge}`);
      if(typeof d.expr_dll!=='undefined' && d.expr_dll>0) versions.push(`Expr ${d.expr_dll}`);
      if(typeof d.have_hw!=='undefined') hwReady=!!d.have_hw;
      else if(typeof d.have_mcculw!=='undefined') hwReady=!!d.have_mcculw;
    }
  }catch{}
  $('#versions').textContent=versions.join(' • ');
}

function updateConnectBtn(){
  const b = $('#connectBtn');
  if (!b) return;
  if (connected){
    b.textContent = 'Connected';
    b.classList.add('connected');
  } else {
    b.textContent = 'Connect';
    b.classList.remove('connected');
  }
}

async function loadConfigCache(){
  try { 
    const r=await fetch('/api/config'); 
    if (r.ok) {
      configCache = await r.json();
      const rateInput = $('#rate');
      if (rateInput && configCache && configCache.boards1608) {
        for (let board of configCache.boards1608) {
          if (board.enabled && board.sampleRateHz) {
            rateInput.value = board.sampleRateHz;
            console.log(`[Config] Loaded sample rate: ${board.sampleRateHz} Hz`);
            break;
          }
        }
      }
    }
  } catch {}
  try { const r=await fetch('/api/pid');             if (r.ok) window.pidCache  = await r.json(); } catch {}
  try { const r=await fetch('/api/math_operators');  if (r.ok) window.mathCache = await r.json(); } catch {}
  try { const r=await fetch('/api/expressions');     if (r.ok) window.exprCache = await r.json(); } catch {}
}

async function setRate(){
  const hz=parseFloat($('#rate').value)||0;
  if(hz>=1){
    try{
      await fetch('/api/acq/rate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({hz})});
    }catch(e){ alert('Set rate failed: '+e.message); }
  }
}

function connect(){
  if(ws) try{ ws.close(); }catch{}
  ws = new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host+'/ws');
  ws.onopen = ()=>{ connected=true; updateConnectBtn(); updateDOButtons(); };
  ws.onclose= ()=>{ connected=false; updateConnectBtn(); updateDOButtons(); };
  ws.onmessage=(ev)=>{
    const msg=JSON.parse(ev.data);
    if(msg.type==='session'){ sessionDir=msg.dir; $('#session').textContent=sessionDir; }
    if (msg.type === 'tick') feedTick(msg);
    if (msg.type === 'console') _onConsoleMessage(msg);
    if (msg.type === 'check_event') applyRemoteCheckEvent(msg);   // other computers
    if (msg.type === 'cl_host') window.clHostMessage?.(msg);   // checklist hosting
    if (msg.type === 'hello') {
      // Server tells us hardware status on every (re)connect — this is
      // what flips DO buttons from the grey un-connected look to live
      // red/green. Replaces sole reliance on the boot-time /api/diag
      // fetch, which could fail once and leave hwReady stuck false.
      if (typeof msg.have_hw !== 'undefined') hwReady = !!msg.have_hw;
  else if (typeof msg.have_mcculw !== 'undefined') hwReady = !!msg.have_mcculw;
      if (msg.client_id) window.MCC_CLIENT_ID = msg.client_id;   // identity for host arbitration
      updateDOButtons();
    }
  };
  updateConnectBtn();
}

async function applyInitialsFromConfig(){
  try{
    const cfg = await (await fetch('/api/config')).json();
    const aos = cfg.ao || cfg.analogOutputs || [];
    for(let i=0;i<aos.length;i++){
      const item = aos[i] || {};
      const v = Number.isFinite(item.startup) ? item.startup
            :  Number.isFinite(item.min)     ? item.min
            :  0.0;
      await fetch('/api/ao/set', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ index:i, volts: Number(v)||0 })
      }).catch(()=>{});
    }
    const dos = cfg.do || cfg.digitalOutputs || [];
    for(let i=0;i<dos.length;i++){
      // LOGICAL off; no active_high -> the server applies the channel's configured
      // Invert (an inverted channel's off = pin HIGH). Sending a guessed active_high
      // here used to drive inverted relays ON at boot.
      await fetch('/api/do/set', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ index:i, state:false })
      }).catch(()=>{});
    }
  }catch(e){ console.warn('applyInitialsFromConfig failed', e); }
}

/* ----------------------------- grid ------------------------------------- */
/* Layout grid for widget placement. When enabled, dragging or resizing a
   widget snaps its origin / size to the nearest gridSize-pixel boundary.
   Visibility (the dot pattern overlay) is independent of snap behavior —
   the user might want snap-on with a clean canvas, or visible grid while
   measuring alignment without enforcing snap.

   Preferences are persisted in localStorage (not the layout file) since
   they're a UI preference: two operators sharing the same layout file
   might prefer different grid settings.                                  */

/* ----------------------------- grid ------------------------------------- */
/* Layout grid for widget placement. When enabled, dragging or resizing a
   widget snaps its origin / size to the nearest gridSize-pixel boundary.
   Visibility (the dot pattern overlay) is independent of snap behavior —
   the user might want snap-on with a clean canvas, or visible grid while
   measuring alignment without enforcing snap.

   Storage model:
     - The live values are state.grid (a peer of state.pages).
     - saveLayoutToFile() / loadLayoutFromFile() round-trip them so
       a saved layout remembers its intended grid (you designed a layout
       against a 20px grid, the next session inherits that).
     - localStorage is a per-browser FALLBACK only: applied at startup
       before any layout loads, so a fresh session opens with the user's
       prior preference. Once a layout is loaded that overrides.       */

const GRID_KEYS = {
  enabled: 'mcc.grid.enabled',
  size:    'mcc.grid.size',
  show:    'mcc.grid.show',
  color:   'mcc.grid.color',
};

// Convenience alias for the in-state grid object. NOT a separate copy —
// any mutation to gridState fields directly mutates state.grid.
const gridState = state.grid;

function _loadGridState() {
  // Pull defaults from localStorage so a brand-new session opens with the
  // user's previous preference. A subsequent layout load may overwrite.
  try {
    const e = localStorage.getItem(GRID_KEYS.enabled);
    if (e !== null) gridState.enabled = (e === 'true');
    const s = parseInt(localStorage.getItem(GRID_KEYS.size), 10);
    if (Number.isFinite(s) && s >= 5 && s <= 100) gridState.size = s;
    const sh = localStorage.getItem(GRID_KEYS.show);
    if (sh !== null) gridState.show = (sh === 'true');
    const c = localStorage.getItem(GRID_KEYS.color);
    if (typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c)) gridState.color = c;
  } catch { /* localStorage may be disabled — keep defaults */ }
}

function _saveGridState() {
  // Mirror to localStorage so the next fresh session inherits these,
  // and we don't have to wait for a layout-save to "remember" them.
  try {
    localStorage.setItem(GRID_KEYS.enabled, String(gridState.enabled));
    localStorage.setItem(GRID_KEYS.size,    String(gridState.size));
    localStorage.setItem(GRID_KEYS.show,    String(gridState.show));
    localStorage.setItem(GRID_KEYS.color,   gridState.color);
  } catch { /* non-fatal */ }
}

// Defensive normaliser for grid blobs coming out of a saved layout.
function _normalizeGridBlob(g) {
  const out = { enabled:false, size:10, show:false, color:'#3a4055' };
  if (!g || typeof g !== 'object') return out;
  if (typeof g.enabled === 'boolean') out.enabled = g.enabled;
  if (Number.isFinite(g.size) && g.size >= 5 && g.size <= 100) out.size = g.size | 0;
  if (typeof g.show === 'boolean') out.show = g.show;
  if (typeof g.color === 'string' && /^#[0-9a-f]{6}$/i.test(g.color)) out.color = g.color;
  return out;
}

/**
 * Snap a pixel coordinate to the nearest grid line when grid is enabled.
 * Returns the input unchanged when grid is off. Used by makeDragResize
 * for both x/y (drag) and w/h (resize).
 *
 * Math.round (not floor) so dragging halfway between two grid lines snaps
 * to whichever is closer — feels more natural than always biasing left.
 */
function gridSnap(px) {
  if (!gridState.enabled) return px;
  const g = Math.max(1, gridState.size | 0);
  return Math.round(px / g) * g;
}
// Expose for checklist_widget.js (separate <script>; can't import).
// Both files use the same in-memory state.grid via this shared function.
window.gridSnap = gridSnap;

/* ----------------------- palette toggle --------------------------------- */
/* Lets the user hide the left widgets/pages panel to free up canvas space.
   State is persisted in localStorage so the preference survives reloads.
   Per-browser only — not bound to a layout file (the panel is chrome,
   not part of the layout design). */
const PALETTE_KEY = 'mcc.paletteCollapsed';
function _wirePaletteToggle() {
  const btn = document.getElementById('paletteToggle');
  const ws  = document.querySelector('.workspace');
  if (!btn || !ws) return;
  // Restore previous state. Default: expanded.
  let collapsed = false;
  try { collapsed = (localStorage.getItem(PALETTE_KEY) === 'true'); } catch {}
  const apply = () => {
    ws.classList.toggle('palette-collapsed', collapsed);
    // Chevron direction reflects the action the click will perform — when
    // expanded show ◄ ("click to close"), when collapsed show ► ("click
    // to open"). Title text matches.
    btn.textContent = collapsed ? '►' : '◄';
    btn.title = collapsed ? 'Show widgets panel' : 'Hide widgets panel';
  };
  apply();
  btn.addEventListener('click', () => {
    collapsed = !collapsed;
    try { localStorage.setItem(PALETTE_KEY, String(collapsed)); } catch {}
    apply();
  });
}

/* ------------------------------ id generation ---------------------------
 * crypto.randomUUID() exists ONLY in secure contexts (https or localhost).
 * A second computer reaching the server over plain http://192.168.x.x has
 * no such API — so every call threw, which killed the boot sequence
 * (ensureStarterPage crashed before connect()/loadLayoutFromServer ran)
 * and broke all the add-widget palette buttons on remote machines. This
 * helper uses randomUUID when present and otherwise builds an RFC-4122 v4
 * UUID from crypto.getRandomValues, which works on insecure origins too. */
function genId() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch {}
  const b = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(b);
  } else {
    for (let i = 0; i < 16; i++) b[i] = (Math.random() * 256) | 0;  // last resort
  }
  b[6] = (b[6] & 0x0f) | 0x40;   // version 4
  b[8] = (b[8] & 0x3f) | 0x80;   // variant 10xx
  const h = Array.from(b, x => x.toString(16).padStart(2, '0'));
  return `${h.slice(0,4).join('')}-${h.slice(4,6).join('')}-${h.slice(6,8).join('')}-` +
         `${h.slice(8,10).join('')}-${h.slice(10).join('')}`;
}

/* ----------------------- multi-select & grouping ------------------------
 * Editing aid: Ctrl+click widgets to build a selection, or drag a rubber-
 * band box on empty canvas. Dragging any selected widget moves the whole
 * selection together (relative offsets preserved exactly — only the
 * grabbed widget grid-snaps, the rest follow its delta). Ctrl+G stamps
 * the selection with a persistent groupId (saved in the layout); a
 * grouped widget always drags its whole group, so a background rectangle
 * grouped with its buttons moves as one — without popping to the front,
 * since group/multi drags deliberately skip bringToFront.
 * Selection itself is transient; only groupId persists.                  */
const _msSel = new Set();          // selected widget ids (active page)

function msApplyVisual() {
  document.querySelectorAll('.widget').forEach(n => {
    n.classList.toggle('multi-selected', _msSel.has((n.id || '').slice(2)));
  });
}
function msClear() { _msSel.clear(); msApplyVisual(); }
function msToggle(id) {
  if (_msSel.has(id)) _msSel.delete(id); else _msSel.add(id);
  msApplyVisual();
}
function msSelectGroup(groupId) {
  _msSel.clear();
  const page = state.pages[activePageIndex];
  for (const w of (page?.widgets || []))
    if (w.groupId === groupId) _msSel.add(w.id);
  msApplyVisual();
}
function groupSelected() {
  if (_msSel.size < 2) return;
  const gid = 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const page = state.pages[activePageIndex];
  let n = 0;
  for (const w of (page?.widgets || []))
    if (_msSel.has(w.id)) { w.groupId = gid; n++; }
  console.log(`[Group] grouped ${n} widgets as ${gid}`);
  msApplyVisual();
}
function ungroupSelected(seedW) {
  // Ungroup everything selected; with a seed widget (context menu), also
  // dissolve that widget's whole group even if only one member is selected.
  const gids = new Set();
  const page = state.pages[activePageIndex];
  for (const w of (page?.widgets || []))
    if (_msSel.has(w.id) && w.groupId) gids.add(w.groupId);
  if (seedW?.groupId) gids.add(seedW.groupId);
  let n = 0;
  for (const w of (page?.widgets || []))
    if (w.groupId && gids.has(w.groupId)) { delete w.groupId; n++; }
  if (n) console.log(`[Group] ungrouped ${n} widgets`);
}
/* Pure helper (also unit-tested): do two rects {x,y,w,h} intersect? */
function _rectsIntersect(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x &&
         a.y < b.y + b.h && a.y + a.h > b.y;
}

/* Rubber-band select on empty canvas + keyboard shortcuts. Wired once at
 * boot via document-level delegation so canvas rebuilds can't orphan it. */
function _wireMultiSelect() {
  let band = null, bx = 0, by = 0, additive = false;

  const canvasPoint = (e) => {
    const cv = document.getElementById('canvas');
    if (!cv) return null;
    const r = cv.getBoundingClientRect();
    return { cv, x: e.clientX - r.left + cv.scrollLeft,
                 y: e.clientY - r.top  + cv.scrollTop };
  };

  document.addEventListener('mousedown', (e) => {
    if (!isUiEditMode() || e.button !== 0) return;
    if (!e.target || e.target.id !== 'canvas') return;   // empty canvas only
    const p = canvasPoint(e);
    if (!p) return;
    bx = p.x; by = p.y; additive = e.ctrlKey || e.metaKey;
    band = el('div', { id: 'msRubber' });
    band.style.left = bx + 'px'; band.style.top = by + 'px';
    band.style.width = '0px';    band.style.height = '0px';
    p.cv.append(band);
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) => {
    if (!band) return;
    const p = canvasPoint(e); if (!p) return;
    const x = Math.min(bx, p.x), y = Math.min(by, p.y);
    band.style.left = x + 'px';               band.style.top = y + 'px';
    band.style.width  = Math.abs(p.x - bx) + 'px';
    band.style.height = Math.abs(p.y - by) + 'px';
  });

  window.addEventListener('mouseup', (e) => {
    if (!band) return;
    const p = canvasPoint(e);
    const rect = p ? { x: Math.min(bx, p.x), y: Math.min(by, p.y),
                       w: Math.abs(p.x - bx), h: Math.abs(p.y - by) } : null;
    band.remove(); band = null;
    if (!rect) return;
    if (rect.w < 4 && rect.h < 4) {           // a plain click, not a drag
      if (!additive) msClear();
      return;
    }
    if (!additive) _msSel.clear();
    const page = state.pages[activePageIndex];
    for (const w of (page?.widgets || [])) {
      if (w.popoutId) continue;               // popped-out: not on canvas
      if (_rectsIntersect(rect, { x: w.x, y: w.y, w: w.w, h: w.h }))
        _msSel.add(w.id);
    }
    msApplyVisual();
  });

  document.addEventListener('keydown', (e) => {
    if (!isUiEditMode()) return;
    const tag = (e.target?.tagName || '').toUpperCase();
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || e.target?.isContentEditable) return;
    if (e.key === 'Escape') { msClear(); return; }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'g' || e.key === 'G')) {
      e.preventDefault();                     // hijack browser find-next
      if (e.shiftKey) { ungroupSelected(); msApplyVisual(); }
      else groupSelected();
    }
  });
}

/* Wire the global edit-mode toggle button in the top toolbar. */
function _wireUiEditToggle() {
  const btn = document.getElementById('uiEditToggle');
  if (!btn) return;
  btn.addEventListener('click', () => _setUiEditMode(!isUiEditMode()));
}

/* ---------------------- chart scales → viewer export -------------------- */
/* Friendly display names for every configured signal, keyed by CSV column
   name — same sources friendlyColNames() uses for replay. The standalone
   viewer shows these instead of raw ai0/tc2/expr5 keys.                    */
async function _collectSignalNames() {
  try { const r = await fetch('/api/config');        if (r.ok) configCache      = await r.json(); } catch {}
  try { const r = await fetch('/api/pid');            if (r.ok) window.pidCache  = await r.json(); } catch {}
  try { const r = await fetch('/api/math_operators'); if (r.ok) window.mathCache = await r.json(); } catch {}
  try { const r = await fetch('/api/expressions');    if (r.ok) window.exprCache = await r.json(); } catch {}
  const cfg = configCache || {};
  const names = {};
  const put = (col, n) => { if (n && typeof n === 'string') names[col] = n; };
  getAllAnalogs(cfg).forEach((a, i)        => put('ai' + i, a && a.name));
  getAllAnalogOutputs(cfg).forEach((a, i)  => put('ao' + i, a && a.name));
  getAllDigitalOutputs(cfg).forEach((d, i) => put('do' + i, d && d.name));
  getAllThermocouples(cfg).forEach((t, i)  => put('tc' + i, t && t.name));
  getAllCounters(cfg).forEach((c, i)       => put('ctr' + i, c && c.name));
  (window.exprCache?.expressions || []).forEach((e, i) => put('expr' + i, e && e.name));
  (window.mathCache?.operators   || []).forEach((m, i) => put('math' + i, m && m.name));
  (window.pidCache?.loops        || []).forEach((p, i) => {
    if (p && p.name) { put('pid' + i, p.name); put('pid' + i + '_out', p.name + '_out'); }
  });
  (window.scaleCache?.scales || []).forEach((s, i) => put('scale' + i, s && s.name));
  return names;
}

/* CSV columns that appear as a series on ANY chart, in encounter order.
   The viewer enables exactly these on open (instead of "first 6"). Chart
   series names are folded into namesOut as a fallback for signals the
   config doesn't name.                                                     */
function _collectChartedCols(namesOut) {
  const cols = [], seen = new Set();
  const add = (c, nm) => {
    if (!c || seen.has(c)) return;
    seen.add(c); cols.push(c);
    if (nm && namesOut && namesOut[c] === undefined) namesOut[c] = nm;
  };
  try {
    for (const page of (state.pages || [])) {
      for (const w of (page.widgets || [])) {
        if (!w || w.type !== 'chart') continue;
        for (const s of (w.opts?.series || [])) {
          const nm = s.name;
          switch (s.kind) {
            case 'ai': case 'ao': case 'do': case 'tc':
            case 'expr': case 'math': case 'scale':
              add(`${s.kind}${s.index|0}`, nm); break;
            case 'pid':
              add(`pid${s.index|0}`, nm); add(`pid${s.index|0}_out`, nm); break;
            case 'button':
              add(`bvar_${s.index}`, nm); break;
            case 'static': case 'global':
              add(`gvar_${s.index}`, nm); add(`sv_${s.index}`, nm); break;
          }
        }
      }
    }
  } catch (e) {
    console.warn('[Viewer] charted-cols collection failed:', e);
  }
  return cols;
}

/* Walk every page's chart widgets and build a map of CSV column name →
   {scale, offset, label} from each series' displayScale/displayOffset.
   The standalone log viewer uses this to optionally render data the way
   the in-app charts display it. Only series with a non-identity transform
   (scale ≠ 1 or offset ≠ 0) are included. First occurrence wins when the
   same signal appears in multiple charts with different settings.

   Column-name mapping mirrors the logger/replay conventions:
     ai/ao/do/tc/expr/math/scale + index  →  "ai0", "tc2", "expr5", …
     pid + index   → "pid0" AND "pid0_out" (logger naming varies by version)
     button + name → "bvar_<name>";  static + name → "gvar_<name>" + "sv_<name>"  */
function _collectChartScales() {
  const out = {};
  const add = (col, s, label) => {
    if (col && out[col] === undefined) {
      out[col] = { scale: s.displayScale, offset: s.displayOffset, label: label || col };
    }
  };
  try {
    for (const page of (state.pages || [])) {
      for (const w of (page.widgets || [])) {
        if (!w || w.type !== 'chart') continue;
        for (const s of (w.opts?.series || [])) {
          const sc = (s.displayScale  === undefined) ? 1 : +s.displayScale;
          const of = (s.displayOffset === undefined) ? 0 : +s.displayOffset;
          if (sc === 1 && of === 0) continue;            // identity — skip
          if (!isFinite(sc) || !isFinite(of)) continue;  // garbage — skip
          const norm = { displayScale: sc, displayOffset: of };
          const label = s.name || `${s.kind}${s.index}`;
          switch (s.kind) {
            case 'ai': case 'ao': case 'do': case 'tc':
            case 'expr': case 'math': case 'scale':
              add(`${s.kind}${s.index|0}`, norm, label); break;
            case 'pid':
              add(`pid${s.index|0}`,     norm, label);
              add(`pid${s.index|0}_out`, norm, label); break;
            case 'button':
              add(`bvar_${s.index}`, norm, label); break;
            case 'static': case 'global':
              add(`gvar_${s.index}`, norm, label);
              add(`sv_${s.index}`,   norm, label); break;
          }
        }
      }
    }
  } catch (e) {
    console.warn('[Viewer] scale collection failed:', e);
  }
  return out;
}

/* ------------------------- chk.json merge dialog ------------------------ */
/* Recovery tool: when the server is terminated without a clean close(),
   the session CSV never gets its chk_events column embedded — but chk.json
   (saved on every keypress) still has everything. This dialog lists every
   session that has both files, shows whether the CSV already contains the
   events (none / identical / different), and merges on demand. Conflicts
   and time-range mismatches come back from the server as needs_force and
   are re-submitted only after an explicit confirm().                      */
async function openChkMergeDialog() {
  let data;
  try {
    const r = await fetch('/api/chk_merge/candidates');
    data = await r.json();
  } catch (e) {
    alert('Could not fetch merge candidates: ' + e.message);
    return;
  }
  if (!data.ok) { alert('Server error: ' + (data.error || 'unknown')); return; }
  if (!data.sessions || !data.sessions.length) {
    alert('No sessions found with both a chk.json and a session.csv.');
    return;
  }

  const root = el('div', {style:'min-width:560px'});
  root.append(el('h3', {}, 'Merge chk.json → session.csv'));
  root.append(el('div', {style:'color:#9094a1;font-size:12px;margin-bottom:10px;line-height:1.5'},
    'Embeds a session\'s checklist check events into its CSV. Use this when ' +
    'the server was terminated before it could embed them at close. ' +
    '"Identical" means the CSV already matches chk.json — nothing to do.'));

  const tbl = el('table', {className:'form', style:'width:100%;border-collapse:collapse'});
  const thead = el('tr', {});
  ['Session','Events','CSV (MB)','Embedded','',''].forEach(h =>
    thead.append(el('th', {style:'text-align:left;padding:4px 8px;color:#a8b3cf;font-size:12px'}, h)));
  tbl.append(thead);

  const statusColor = { none:'#f0caca', identical:'#9ad29a', different:'#ffd27f' };

  for (const s of data.sessions) {
    const tr = el('tr', {});
    tr.append(el('td', {style:'padding:4px 8px;font-family:monospace;font-size:12px'}, s.session));
    if (s.error) {
      tr.append(el('td', {colSpan:'5', style:'padding:4px 8px;color:#f0caca;font-size:12px'}, s.error));
      tbl.append(tr);
      continue;
    }
    tr.append(el('td', {style:'padding:4px 8px'}, String(s.events)));
    tr.append(el('td', {style:'padding:4px 8px'}, String(s.csv_mb)));
    tr.append(el('td', {style:`padding:4px 8px;color:${statusColor[s.embedded]||'#e6e6e6'}`},
      s.embedded + (s.is_active ? ' (ACTIVE)' : '')));

    const mergeBtn = el('button', {className:'btn', style:'padding:2px 10px;font-size:12px'}, 'Merge');
    // Identical = nothing to do; active = file is open for writing.
    if (s.embedded === 'identical' || s.is_active) mergeBtn.disabled = true;
    if (s.is_active) mergeBtn.title = 'Active session — use Start New Log instead';
    if (s.embedded === 'identical') mergeBtn.title = 'CSV already contains these exact events';

    const resultCell = el('td', {style:'padding:4px 8px;font-size:11px;color:#9094a1'}, '');

    mergeBtn.onclick = async () => {
      mergeBtn.disabled = true;
      resultCell.textContent = 'Merging…';
      const post = async (force) => {
        const r = await fetch('/api/chk_merge/' + encodeURIComponent(s.session), {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({force})
        });
        return r.json();
      };
      try {
        let j = await post(false);
        if (j.needs_force) {
          // Conflict or time mismatch — show the server's explanation and
          // require an explicit yes before overwriting anything.
          const go = confirm(j.message + '\n\nReally merge anyway?');
          if (!go) { resultCell.textContent = 'Cancelled'; mergeBtn.disabled = false; return; }
          j = await post(true);
        }
        if (j.ok) {
          resultCell.textContent = j.message || j.status;
          resultCell.style.color = j.merged ? '#9ad29a' : '#a8b3cf';
        } else {
          resultCell.textContent = j.error || j.message || 'Failed';
          resultCell.style.color = '#f0caca';
          mergeBtn.disabled = false;
        }
      } catch (e) {
        resultCell.textContent = 'Error: ' + e.message;
        resultCell.style.color = '#f0caca';
        mergeBtn.disabled = false;
      }
    };

    tr.append(el('td', {style:'padding:4px 8px'}, mergeBtn));
    tr.append(resultCell);
    tbl.append(tr);
  }

  root.append(tbl);
  showModal(root, () => {});
}

/**
 * Repaint the dotted grid overlay on the active canvas (or remove it).
 * Uses a CSS background pattern so we don't have to create any DOM —
 * just toggling backgroundImage on/off. The dots are 1px radial gradients
 * tiled at the grid spacing.
 */
function _applyGridVisual() {
  const cv = document.getElementById('canvas');
  if (!cv) return;
  if (gridState.show && gridState.enabled) {
    const g = Math.max(1, gridState.size | 0);
    // Color is fed via CSS-friendly hex; radial-gradient dot in the
    // top-left corner of each gridSize x gridSize tile, transparent
    // everywhere else.
    cv.style.backgroundImage =
      `radial-gradient(circle, ${gridState.color} 1px, transparent 1.5px)`;
    cv.style.backgroundSize = `${g}px ${g}px`;
    cv.style.backgroundPosition = '0 0';
  } else {
    cv.style.backgroundImage = 'none';
  }
}

function openGridDialog() {
  const root = el('div');
  root.append(el('div', { style:'font-size:16px;font-weight:600;margin-bottom:10px' }, '⊞ Layout Grid'));

  // --- Snap enabled checkbox ---
  const enabledChk = el('input', { type:'checkbox' });
  enabledChk.checked = gridState.enabled;
  enabledChk.onchange = () => {
    gridState.enabled = enabledChk.checked;
    _saveGridState();
    _applyGridVisual();
    // Update enabled-state of dependent controls.
    sizeRange.disabled = !gridState.enabled;
    sizeNum.disabled   = !gridState.enabled;
    showChk.disabled   = !gridState.enabled;
    colorSwatch.style.pointerEvents = gridState.enabled && gridState.show ? 'auto' : 'none';
    colorSwatch.style.opacity = gridState.enabled && gridState.show ? '1' : '0.35';
  };

  // --- Grid size: slider + number for precision ---
  const sizeRange = el('input', {
    type:'range', min:'5', max:'100', step:'1',
    value: String(gridState.size),
    style:'width:200px;vertical-align:middle'
  });
  const sizeNum = el('input', {
    type:'number', min:'5', max:'100', step:'1',
    value: String(gridState.size),
    style:'width:60px;margin-left:8px'
  });
  const onSizeChange = (newVal) => {
    const v = Math.max(5, Math.min(100, parseInt(newVal, 10) || gridState.size));
    gridState.size = v;
    sizeRange.value = String(v);
    sizeNum.value   = String(v);
    _saveGridState();
    _applyGridVisual();
  };
  sizeRange.oninput = () => onSizeChange(sizeRange.value);
  sizeNum.oninput   = () => onSizeChange(sizeNum.value);

  // --- Show grid checkbox ---
  const showChk = el('input', { type:'checkbox' });
  showChk.checked = gridState.show;
  showChk.onchange = () => {
    gridState.show = showChk.checked;
    _saveGridState();
    _applyGridVisual();
    colorSwatch.style.pointerEvents = gridState.enabled && gridState.show ? 'auto' : 'none';
    colorSwatch.style.opacity = gridState.enabled && gridState.show ? '1' : '0.35';
  };

  // --- Dot color picker ---
  const colorSwatch = el('div', {
    style:
      `width:32px;height:24px;border-radius:4px;border:1px solid var(--border);` +
      `cursor:pointer;background:${gridState.color};` +
      (gridState.enabled && gridState.show ? '' : 'pointer-events:none;opacity:0.35;'),
    title: 'Click to choose grid dot color'
  });
  colorSwatch.onclick = (e) => {
    e.stopPropagation();
    createColorPicker(gridState.color, (newColor) => {
      gridState.color = newColor;
      colorSwatch.style.background = newColor;
      _saveGridState();
      _applyGridVisual();
    });
  };

  // Apply initial disabled state.
  sizeRange.disabled = !gridState.enabled;
  sizeNum.disabled   = !gridState.enabled;
  showChk.disabled   = !gridState.enabled;

  root.append(
    tableForm([
      ['Snap to grid',  enabledChk],
      ['Grid size (px)', el('span', {}, [sizeRange, sizeNum])],
      ['Show grid',     showChk],
      ['Dot color',     colorSwatch],
    ]),
    el('div', { style:'margin-top:10px;color:#7a7f8f;font-size:11px;line-height:1.5' },
      'When "Snap to grid" is on, dragging or resizing widgets snaps the upper-left corner ' +
      'and the lower-right (resize) handle to the nearest grid intersection. ' +
      'Showing the grid is optional and independent of snap behavior. ' +
      'Settings are stored per-browser, not in the layout file.')
  );

  showModal(root);
}

/* ---------------------------- pages ------------------------------------- */
let activePageIndex = 0;

function ensureStarterPage(){
  if(!state.pages.length){
    state.pages=[{id:genId(), name:'Page 1', widgets:[]}];
  }
  refreshPages();
  setActivePage(0);
}
function refreshPages(){
  const cont=$('#pages');
  cont.innerHTML='';
  state.pages.forEach((p,idx)=>{
    const b=el('button',{className:'btn',onclick:()=>setActivePage(idx)}, p.name || ('Page '+(idx+1)));
    if(idx===activePageIndex) b.classList.add('active');
    cont.append(b);
  });
}
function setActivePage(idx){
  activePageIndex=clamp(idx,0,state.pages.length-1);
  refreshPages();
  renderPage();
}
function addPage(){
  state.pages.push({id:genId(), name:`Page ${state.pages.length+1}`, widgets:[]});
  setActivePage(state.pages.length-1);
}
function removeActivePage(){
  if(state.pages.length<=1){ alert('At least one page is required.'); return; }
  state.pages.splice(activePageIndex,1);
  setActivePage(Math.max(0,activePageIndex-1));
}

/* -------------------------- widgets ------------------------------------- */
function addWidget(type){
  // Special handling for PID Panel - ask which loop to show
  if (type === 'pidpanel') {
    addPIDPanel();
    return;
  }
  
  // Special handling for Motor - fetch motor config for name
  if (type === 'motor') {
    addMotorWidget();
    return;
  }
  
  // Special handling for LE - fetch LE config for name
  if (type === 'le') {
    addLEWidget();
    return;
  }
  
  // Special handling for Math Op - fetch math config for name
  if (type === 'mathop') {
    addMathOpWidget();
    return;
  }
  
  // Special handling for Expression - fetch expr config for name
  if (type === 'expr') {
    addExprWidget();
    return;
  }

  // Special handling for Static Var - prompt for variable name
  if (type === 'staticvar') {
    (async () => {
      // Fetch available static var names from server
      let varNames = [];
      try {
        const resp = await fetch('/api/static_vars');
        const data = await resp.json();
        // Server returns { vars: {name: value, ...} } or { globals: {name: value, ...} }
        const vars = data.vars || data.globals || data.static_vars || {};
        varNames = Object.keys(vars).sort((a, b) =>
          a.toLowerCase().localeCompare(b.toLowerCase()));   // alphabetical -- 280+ vars
      } catch(e) { /* ignore, let user type manually */ }

      const root = el('div', {});
      root.append(el('h3', {}, 'Add Static Variable Widget'));

      let varInput;
      if (varNames.length > 0) {
        varInput = el('select', {style:'width:100%;font-size:14px;padding:6px'});
        varNames.forEach(n => varInput.append(el('option', {value:n}, n)));
      } else {
        varInput = el('input', {type:'text', placeholder:'e.g. pressureSetPoint',
          style:'width:100%;font-size:14px;padding:6px'});
      }

      const decInput = el('input', {type:'number', value:'3', min:'0', max:'10',
        style:'width:80px;font-size:14px;padding:6px'});

      root.append(
        el('div', {style:'margin:12px 0'}, [
          el('label', {}, ['Variable name: ', varInput])
        ]),
        el('div', {style:'margin:12px 0'}, [
          el('label', {}, ['Decimal places: ', decInput])
        ])
      );

      const addBtn = el('button', {
        className:'btn',
        onclick: () => {
          const chosen = varInput.tagName === 'SELECT' ? varInput.value : varInput.value.trim();
          if (!chosen) { alert('Enter a variable name.'); return; }
          const w = {
            id: genId(), type:'staticvar',
            x:40, y:40, w:220, h:90,
            opts: { title: chosen, varName: chosen,
                    decimalPlaces: parseInt(decInput.value) || 3 }
          };
          state.pages[activePageIndex].widgets.push(w);
          renderPage();
          closeModal();
        }
      }, 'Add Widget');

      root.append(el('div', {style:'margin-top:12px'}, addBtn));
      showModal(root);
    })();
    return;
  }

  // Custom default sizes for different widget types
  let defaultW = 460, defaultH = 280;
  if (type === 'gauge') {
    defaultH = 340;
  } else if (type === 'bars') {
    defaultW = 200;  // Narrower bars
    defaultH = 280;
  } else if (type === 'dobutton') {
    defaultW = 120;
    defaultH = 45;  // Reduced from 90
  } else if (type === 'le') {
    defaultW = 280;  // Compact for LE
    defaultH = 20;   // Reduced from 40 (HALF AGAIN!)
  } else if (type === 'mathop') {
    defaultW = 280;
    defaultH = 20;   // Reduced from 40 (HALF AGAIN!)
  } else if (type === 'indicator') {
    // Tiny by default — just enough for a small dot + a one-line label.
    defaultW = 60;
    defaultH = 40;
  } else if (type === 'label') {
    // Wide enough for a few words at default 16px font.
    defaultW = 120;
    defaultH = 36;
  } else if (type === 'statustext') {
    // Auto-sizes to its text on first paint; this is just the pre-mount box.
    defaultW = 140;
    defaultH = 44;
  } else if (type === 'shape') {
    // Reasonable visible default for a circle/polygon. Lines will look
    // proportionally good across this square bounding box too.
    defaultW = 100;
    defaultH = 100;
  } else if (type === 'console') {
    // Wide enough to show server log lines without too much wrapping; tall
    // enough to see ~25 lines at the default 12px font.
    defaultW = 520;
    defaultH = 280;
  }
  
  const w={ id:genId(), type, x:40, y:40, w:defaultW, h:defaultH, opts:defaultsFor(type) };
  // For a fresh line shape, anchor its endpoints to the actual placement
  // position so the line spans the visible area instead of relying on
  // stale x1/y1/x2/y2 defaults.
  if (type === 'shape' && w.opts.kind === 'line') {
    w.opts.x1 = w.x;
    w.opts.y1 = w.y;
    w.opts.x2 = w.x + defaultW;
    w.opts.y2 = w.y + defaultH;
    _recomputeLineBounds(w);
  }
  if (type === 'shape' && w.opts.kind === 'polygon') {
    // Generate the initial regular-polygon vertices now so the widget
    // has its truth data before mount (mountShape would do it lazily,
    // but doing it here makes the widget's state consistent earlier).
    _regenerateRegularPolygon(w);
  }
  state.pages[activePageIndex].widgets.push(w);
  renderPage();
}

async function addPIDPanel() {
  try {
    // Fetch current PID configuration to see how many loops exist
    const pid = await (await fetch('/api/pid')).json();
    const loops = pid.loops || [];
    
    if (loops.length === 0) {
      alert('No PID loops configured. Configure PID loops first.');
      return;
    }
    
    // Create modal with dropdown selector
    const root = el('div', {});
    root.append(el('h3', {}, 'Select PID Loop'));
    
    const selector = el('select', {style: 'width:100%; font-size:14px; padding:8px'});
    loops.forEach((loop, idx) => {
      const name = loop.name || `Loop ${idx}`;
      const enabled = loop.enabled ? '✓' : '✗';
      const label = `${name} (${enabled})`;
      selector.append(el('option', {value: idx}, label));
    });
    
    root.append(
      el('div', {style: 'margin:16px 0'}, [
        el('label', {}, ['PID Loop: ', selector])
      ])
    );
    
    const addBtn = el('button', {
      className: 'btn',
      onclick: () => {
        const loopIndex = parseInt(selector.value);
        const loopName = loops[loopIndex].name || `Loop ${loopIndex}`;
        
        const w = {
          id: genId(),
          type: 'pidpanel',
          x: 40,
          y: 40,
          w: 320,
          h: 600,
          opts: {
            title: `PID: ${loopName}`,
            loopIndex: loopIndex,
            showControls: true
          }
        };
        
        state.pages[activePageIndex].widgets.push(w);
        renderPage();
        closeModal();
      }
    }, 'Add Widget');
    
    root.append(addBtn);
    showModal(root);
    
  } catch(e) {
    console.error('Failed to fetch PID config:', e);
    alert('Failed to load PID configuration.');
  }
}

async function addMotorWidget() {
  try {
    // Fetch motor configuration
    const motorData = await (await fetch('/api/motors')).json();
    const motors = motorData.motors || [];
    
    if (motors.length === 0) {
      alert('No motors configured. Please configure motors first.');
      return;
    }
    
    // Create modal with dropdown selector
    const root = el('div', {});
    root.append(el('h3', {}, 'Select Motor'));
    
    const selector = el('select', {style: 'width:100%; font-size:14px; padding:8px'});
    motors.forEach((m, i) => {
      const included = m.include ? '✓' : '✗';
      const label = `${m.name || `Motor ${i}`} (${included})`;
      selector.append(el('option', {value: i}, label));
    });
    
    root.append(
      el('div', {style: 'margin:16px 0'}, [
        el('label', {}, ['Motor: ', selector])
      ])
    );
    
    const addBtn = el('button', {
      className: 'btn',
      onclick: () => {
        const motorIndex = parseInt(selector.value);
        const motorName = motors[motorIndex].name || `Motor ${motorIndex}`;
        
        const w = {
          id: genId(),
          type: 'motor',
          x: 40,
          y: 40,
          w: 320,
          h: 380,
          opts: {
            title: motorName,
            motorIndex: motorIndex,
            showControls: true
          }
        };
        
        state.pages[activePageIndex].widgets.push(w);
        renderPage();
        closeModal();
      }
    }, 'Add Widget');
    
    root.append(addBtn);
    showModal(root);
    
  } catch(e) {
    console.error('Failed to add motor widget:', e);
    alert('Failed to load motor configuration.');
  }
}

async function addLEWidget() {
  try {
    // Fetch LE configuration
    const leData = await (await fetch('/api/logic_elements')).json();
    const elements = leData.elements || [];
    
    if (elements.length === 0) {
      alert('No Logic Elements configured. Please configure LEs first.');
      return;
    }
    
    // Create modal with dropdown selector
    const root = el('div', {});
    root.append(el('h3', {}, 'Select Logic Element'));
    
    const selector = el('select', {style: 'width:100%; font-size:14px; padding:8px'});
    elements.forEach((le, i) => {
      const name = le.name || `LE${i}`;
      const op = (le.operation || 'and').toUpperCase();
      const label = `${name} (${op})`;
      selector.append(el('option', {value: i}, label));
    });
    
    root.append(
      el('div', {style: 'margin:16px 0'}, [
        el('label', {}, ['Logic Element: ', selector])
      ])
    );
    
    const addBtn = el('button', {
      className: 'btn',
      onclick: () => {
        const leIndex = parseInt(selector.value);
        const leName = elements[leIndex].name || `LE${leIndex}`;
        
        const w = {
          id: genId(),
          type: 'le',
          x: 40,
          y: 40,
          w: 280,
          h: 160,
          opts: {
            title: leName,
            leIndex: leIndex,
            showInputs: true
          }
        };
        
        state.pages[activePageIndex].widgets.push(w);
        renderPage();
        closeModal();
      }
    }, 'Add Widget');
    
    root.append(addBtn);
    showModal(root);
    
  } catch(e) {
    console.error('Failed to add LE widget:', e);
    alert('Failed to load Logic Element configuration.');
  }
}

async function addMathOpWidget() {
  try {
    // Fetch math operator configuration
    const mathData = await (await fetch('/api/math_operators')).json();
    const operators = mathData.operators || [];
    
    if (operators.length === 0) {
      alert('No Math Operators configured. Please configure Math Operators first.');
      return;
    }
    
    // Create modal with dropdown selector
    const root = el('div', {});
    root.append(el('h3', {}, 'Select Math Operator'));
    
    const selector = el('select', {style: 'width:100%; font-size:14px; padding:8px'});
    operators.forEach((m, i) => {
      const name = m.name || `Math${i}`;
      const op = m.operation || 'add';
      const label = `${name} (${op})`;
      selector.append(el('option', {value: i}, label));
    });
    
    root.append(
      el('div', {style: 'margin:16px 0'}, [
        el('label', {}, ['Math Operator: ', selector])
      ])
    );
    
    const addBtn = el('button', {
      className: 'btn',
      onclick: () => {
        const mathIndex = parseInt(selector.value);
        const mathName = operators[mathIndex].name || `Math${mathIndex}`;
        
        const w = {
          id: genId(),
          type: 'mathop',
          x: 40,
          y: 40,
          w: 280,
          h: 160,
          opts: {
            title: mathName,
            mathIndex: mathIndex,
            showInputs: true
          }
        };
        
        state.pages[activePageIndex].widgets.push(w);
        renderPage();
        closeModal();
      }
    }, 'Add Widget');
    
    root.append(addBtn);
    showModal(root);
    
  } catch(e) {
    console.error('Failed to add Math Op widget:', e);
    alert('Failed to load Math Operator configuration.');
  }
}

async function addExprWidget() {
  try {
    // Fetch expression configuration
    const exprData = await (await fetch('/api/expressions')).json();
    const expressions = exprData.expressions || [];
    
    if (expressions.length === 0) {
      alert('No Expressions configured. Please configure Expressions first.');
      return;
    }
    
    // Create modal with dropdown selector
    const root = el('div', {});
    root.append(el('h3', {}, 'Select Expression'));
    
    const selector = el('select', {style: 'width:100%; font-size:14px; padding:8px'});
    expressions.forEach((e, i) => {
      const name = e.name || `Expr${i}`;
      const enabled = e.enabled ? '✓' : '✗';
      const label = `${name} (${enabled})`;
      selector.append(el('option', {value: i}, label));
    });
    
    root.append(
      el('div', {style: 'margin:16px 0'}, [
        el('label', {}, ['Expression: ', selector])
      ])
    );
    
    const addBtn = el('button', {
      className: 'btn',
      onclick: () => {
        const exprIndex = parseInt(selector.value);
        const exprName = expressions[exprIndex].name || `Expr${exprIndex}`;
        
        const w = {
          id: genId(),
          type: 'expr',
          x: 40,
          y: 40,
          w: 350,
          h: 200,
          opts: {
            title: exprName,
            exprIndex: exprIndex,
            showSource: true,
            showOutput: true
          }
        };
        
        state.pages[activePageIndex].widgets.push(w);
        renderPage();
        closeModal();
      }
    }, 'Add Widget');
    
    root.append(addBtn);
    showModal(root);
    
  } catch(e) {
    console.error('Failed to add Expression widget:', e);
    alert('Failed to load Expression configuration.');
  }
}

// Update defaultsFor to give charts reasonable initial spans:
function defaultsFor(type){
  switch(type){
    case 'chart':    return { title:'Chart', series:[], span:60, paused:false, scale:'auto', min:0, max:10, filterHz:0, bufMult:4, cursorMode:'follow' };
    case 'gauge':    return { title:'Gauge', needles:[], scale:'manual', min:0, max:10 };
    case 'bars':     return { title:'Bars', series:[], scale:'manual', min:0, max:10 };
    case 'dobutton': return { title:'Button', outputType:'do', doIndex:0, varName:'button1', mode:'toggle', buzzHz:10, actuationTime:0, _timer:null };  // polarity lives in DO config (Invert), not per-button
    case 'pidpanel': return { title:'PID', loopIndex:0, showControls:true };
    case 'aoslider': return { title:'AO', aoIndex:0, min:0, max:10, step:0.0025, live:true };
    case 'motor':    return { title:'Motor', motorIndex:0, showControls:true };
    case 'vfd':      return { title:'VFD', vfdName:'', showControls:true, rpmStep:50 };
    case 'drive':    return { title:'Drive', driveType:'vfd', driveName:'', showControls:true, rpmStep:50, velStep:50 };
    case 'mathop':   return { title:'Math', mathIndex:0, showInputs:true };
    case 'expr':     return { title:'Expression', exprIndex:0, showSource:true, showOutput:true };
    case 'staticvar': return { title:'Static Var', varName:'', decimalPlaces:3 };
    case 'indicator': return {
      title: 'Indicator',
      shape: 'round',          // 'round' or 'rect'
      size: 14,                // dot/rect diameter in px (~1/8" at 96 DPI is 12)
      colorA: '#2faa60',       // displayed when condA is true (priority 1)
      colorB: '#d84a4a',       // displayed when condB is true (priority 2)
      colorOff: '#3b425e',     // displayed when neither condition is true
      showLabel: true,
      condA: {
        op: '>',                                                       // '>' '<' '=' '!='
        lhs: { mode: 'signal', sel: { kind: 'ai', index: 0 } },
        rhs: { mode: 'fixed', value: 0 }
      },
      condB: {
        op: '<',
        lhs: { mode: 'signal', sel: { kind: 'ai', index: 0 } },
        rhs: { mode: 'fixed', value: 0 }
      }
    };
    case 'label': return {
      text: 'Label',
      fontFamily: 'system-ui',
      fontSize: 16,
      fontWeight: 'normal',    // 'normal' | 'bold'
      fontStyle: 'normal',     // 'normal' | 'italic'
      fgColor: '#e6e6e6',      // matches --fg
      bgColor: 'transparent',  // transparent = inherits main window color
      align: 'left'            // 'left' | 'center' | 'right'
    };
    case 'statustext': return {
      title: 'Status',
      // Signal whose value selects which condition's text/colors to display.
      src: { mode: 'signal', sel: { kind: 'static', index: 'mvrPhase' } },
      // First matching condition (top-down) wins. Each has its own text,
      // text color (fg) and background (bg).
      conds: [
        { op: '=', value: 4, text: 'RUNNING', fg: '#ffffff', bg: '#2faa60' },
        { op: '=', value: 3, text: 'HEATING', fg: '#111111', bg: '#e8b33a' }
      ],
      defText: '—',       // shown when no condition matches
      defFg: '#cfd6f0',
      defBg: '#3b425e',
      fontFamily: 'system-ui',
      fontSize: 18,
      fontWeight: 'bold',
      outline: true,
      outlineColor: '#4c5170',
      pad: 8,                  // px padding around the text (auto-size adds it)
      autoSize: true           // false = keep the user's dragged size (corner grabber in edit mode)
    };
    case 'shape': return {
      // Drawing primitive used as a layout visual aid. Three sub-kinds
      // share common stroke/fill options; each has a few extra knobs.
      kind: 'circle',          // 'line' | 'circle' | 'polygon'
      strokeColor: '#79c0ff',  // matches --accent
      strokeWidth: 2,
      fillColor: 'transparent',
      // line-specific: absolute page coords of the two endpoints. The
      // bounding box (w.x/y/w/h) is derived from these; see
      // _recomputeLineBounds. addWidget sets sensible initial values
      // since defaults here are static.
      x1: 40, y1: 40, x2: 140, y2: 140,
      arrowStart: false,
      arrowEnd:   false,
      // polygon-specific
      sides: 4,
      cornerRadius: 0,         // 0 = sharp corners; up to ~min(w,h)/2 = circle-ish
      rotation: 0,             // user rotation in degrees, added on top of the
                               // side-count-dependent "normal" orientation so
                               // rotation=0 always looks right (flat-top square,
                               // point-up triangle, etc.)
      constrainAngles: true,   // when true, vertex drags preserve the polygon's
                               // angular relationships (rectangle stretches as
                               // a rectangle, hexagon scales uniformly, etc.).
                               // Turn off for freeform vertex-by-vertex editing.
    };
    case 'console': return {
      // Mirror of the server's stdout/stderr — shows whatever the user
      // would see in the terminal or PyCharm console where the server was
      // launched. Output is push-streamed via WebSocket.
      title: 'Console',
      fontSize: 12,
      wrap: false,             // word-wrap long lines
      autoscroll: true,        // stick to bottom unless user has scrolled up
      maxLines: 5000,          // hard cap on rendered lines to bound memory
      showStream: 'both',      // 'stdout' | 'stderr' | 'both'
    };
  }
  return {};
}

/* Build a COM-port <select> plus a 🔄 refresh button that re-queries the OS
 * port list live (no page reload). onPick(value) fires on selection; the
 * control keeps the current value selected across refreshes when still
 * present. Used by the VFD and Motor editors so freshly-plugged adapters
 * appear without an F5. */
async function fetchSerialPorts() {
  try {
    const d = await (await fetch('/api/motors/ports', { cache: 'no-store' })).json();
    return d.ports || [];
  } catch (e) {
    console.warn('port list fetch failed:', e);
    return [];
  }
}

function portSelectControl(currentValue, onPick) {
  const sel = el('select', {});
  const wrap = el('span', { style: 'display:inline-flex;gap:4px;align-items:center' });
  const fill = (ports) => {
    const prev = sel.value || currentValue;
    sel.innerHTML = '';
    const list = ports.length
      ? ports.map(p => ({ v: p.port, t: `${p.port} - ${p.description}` }))
      : Array.from({ length: 20 }, (_, i) => ({ v: `COM${i + 1}`, t: `COM${i + 1}` }));
    list.forEach(o => sel.append(el('option', { value: o.v }, o.t)));
    // keep prior selection if it still exists, else first
    if (prev && list.some(o => o.v === prev)) sel.value = prev;
    else if (list.length) { sel.value = list[0].v; onPick && onPick(sel.value); }
  };
  sel.onchange = () => onPick && onPick(sel.value);
  const refresh = el('button', {
    className: 'btn', title: 'Refresh COM port list',
    style: 'padding:2px 6px',
    onclick: async () => {
      refresh.textContent = '…';
      fill(await fetchSerialPorts());
      refresh.textContent = '🔄';
    }
  }, '🔄');
  wrap.append(sel, refresh);
  // initial fill from a fresh query
  fetchSerialPorts().then(fill);
  return { wrap, sel, fill };
}

function tableForm(pairs) {
  const tbl = el('table', {className: 'form'}), tbody = el('tbody');
  for (const [label, input] of pairs) {
    const tr = el('tr');
    tr.append(el('th', {}, label), el('td', {}, input));
    tbody.append(tr);
  }
  tbl.append(el('thead', {}, el('tr', {}, [el('th', {}, 'Field'), el('th', {}, 'Value')])), tbody);
  return tbl;
}

function tableFormRows(rows) {
  const tbl = el('table', {className: 'form'}), tbody = el('tbody');
  for (const row of rows) {
    const tr = el('tr');
    for (let i = 0; i < row.length; i += 2) {
      tr.append(el('th', {}, row[i]), el('td', {}, row[i + 1]));
    }
    tbody.append(tr);
  }
  tbl.append(el('thead', {}, el('tr', {}, [
    el('th', {}, 'Field'), el('th', {}, 'Value'),
    el('th', {}, 'Field'), el('th', {}, 'Value'),
    el('th', {}, 'Field'), el('th', {}, 'Value'),
    el('th', {}, 'Field'), el('th', {}, 'Value')
  ])), tbody);
  return tbl;
}

function inputText(obj, key) {
  const i = el('input', {type: 'text', value: obj[key] ?? ''});
  i.oninput = () => obj[key] = i.value;
  return i;
}

function inputNum(obj, key, step) {
  const i = el('input', {type: 'number', step: step ?? 'any', value: obj[key] ?? 0});
  i.oninput = () => obj[key] = parseFloat(i.value) || 0;
  return i;
}

function inputChk(obj, key) {
  const i = el('input', {type: 'checkbox', checked: !!obj[key]});
  i.onchange = () => obj[key] = !!i.checked;
  return i;
}

function selectEnum(options, value, onChange) {
  const s = el('select', {});
  options.forEach(opt => s.append(el('option', {value: opt}, opt)));
  s.value = value;
  s.onchange = () => onChange(s.value);
  return s;
}

// Helper to create a name-based selector for signals
async function createSignalSelector(kind, currentIndex, onChange) {
  const select = el('select', {});
  
  try {
    let items = [];
    
    if (kind === 'ai' || kind === 'ao') {
      const cfg = await (await fetch('/api/config')).json();
      const list = kind === 'ai' ? getAllAnalogs(cfg) : getAllAnalogOutputs(cfg);
      items = list.map((item, i) => ({
        index: i,
        name: item.name || `${kind.toUpperCase()}${i}`
      }));
    } else if (kind === 'do') {
      const cfg = await (await fetch('/api/config')).json();
      const list = getAllDigitalOutputs(cfg);
      items = list.map((item, i) => ({
        index: i,
        name: item.name || `DO${i}`
      }));
    } else if (kind === 'tc') {
      const cfg = await (await fetch('/api/config')).json();
      const list = getAllThermocouples(cfg);
      items = list.map((item, i) => ({
        index: i,
        name: item.name || `TC${i}`
      }));
    } else if (kind === 'ctr') {
      const cfg = await (await fetch('/api/config')).json();
      const list = getAllCounters(cfg);
      items = list.map((item, i) => ({
        index: i,
        name: item.name || `CTR${i}`
      }));
    } else if (kind === 'pid' || kind === 'pid_u') {
      const data = await (await fetch('/api/pid')).json();
      items = (data.loops || []).map((loop, i) => ({
        index: i,
        name: loop.name || `PID${i}`
      }));
    } else if (kind === 'math') {
      const data = await (await fetch('/api/math_operators')).json();
      items = (data.operators || []).map((op, i) => ({
        index: i,
        name: op.name || `Math${i}`
      }));
    } else if (kind === 'le') {
      const data = await (await fetch('/api/logic_elements')).json();
      items = (data.elements || []).map((le, i) => ({
        index: i,
        name: le.name || `LE${i}`
      }));
    } else if (kind === 'expr') {
      const data = await (await fetch('/api/expressions')).json();
      items = (data.expressions || []).map((e, i) => ({
        index: i,
        name: e.name || `Expr${i}`
      }));
    } else if (kind === 'static' || kind === 'global') {
      // Global/static variables from expressions -- ALPHABETICAL (case-insensitive):
      // the raw dict arrives in expression/definition order, which made finding a
      // var in ~280 entries a scavenger hunt.
      const data = await (await fetch('/api/expressions/globals')).json();
      const globals = data.globals || {};
      const varNames = Object.keys(globals).sort((a, b) =>
        a.toLowerCase().localeCompare(b.toLowerCase()));

      varNames.forEach((name, i) => {
        const opt = el('option', {value: name}, `static.${name}`);
        select.append(opt);
      });
      
      // For static variables, currentIndex is actually the variable name (string)
      select.value = currentIndex || varNames[0] || '';
      select.onchange = () => onChange(select.value);  // Pass name, not index
      
      return select;
    } else if (kind === 'scale') {
      try {
        const data = await (await fetch('/api/scales')).json();
        window.scaleCache = data;
        items = (data.scales || []).map((s, i) => ({
          index: i,
          name: s.name || `Scale${i}`
        }));
      } catch(e) { items = []; }
    } else if (kind === 'button') {
      const varNames = new Set();
      
      // Scan all pages for DO buttons with outputType='var'
      state.pages?.forEach(page => {
        page.widgets?.forEach(w => {
          if (w.type === 'dobutton' && w.opts?.outputType === 'var' && w.opts?.varName) {
            varNames.add(w.opts.varName);
          }
        });
      });
      
      // Also include any from current state
      if (state.buttonVars) {
        Object.keys(state.buttonVars).forEach(name => varNames.add(name));
      }
      
      const varArray = Array.from(varNames).sort();
      
      if (varArray.length === 0) {
        select.append(el('option', {value: ''}, '(No button vars defined)'));
        select.disabled = true;
      } else {
        varArray.forEach(name => {
          const opt = el('option', {value: name}, `btn:${name}`);
          select.append(opt);
        });
      }
      
      // For button variables, currentIndex is the variable name (string)
      select.value = currentIndex || varArray[0] || '';
      select.onchange = () => onChange(select.value);  // Pass name, not index
      
      return select;
    }
    
    items.forEach(item => {
      const opt = el('option', {value: item.index}, item.name);
      select.append(opt);
    });
    
    select.value = currentIndex || 0;
    select.onchange = () => onChange(parseInt(select.value));
    
  } catch (e) {
    console.error('Failed to load signal names:', e);
    // Fallback to index
    select.append(el('option', {value: currentIndex || 0}, `Index ${currentIndex || 0}`));
    select.value = currentIndex || 0;
  }
  
  return select;
}

function saveLayoutToFile() {
  // Deep-clone state.pages so we can strip transient fields (popoutId)
  // without mutating the live state. JSON round-trip is the easiest
  // safe clone for plain widget data.
  const pagesClone = JSON.parse(JSON.stringify(state.pages));
  for (const p of pagesClone) {
    for (const w of (p.widgets || [])) {
      // popoutId is only meaningful for an open browser window and can't
      // survive a save/load cycle. Strip it so reloads don't pretend
      // widgets are still popped out.
      if (w && w.popoutId) delete w.popoutId;
    }
  }
  const layout = {pages: pagesClone};

  // Grid prefs round-trip with the layout so reopening a saved layout
  // restores the same snap/show/size/color the layout was designed for.
  layout.grid = { ...state.grid };
  
  // Save checklist position, filename, and content if it exists
  const dock = document.querySelector('.cl-dock');
  if (dock && window.checklistLoaded && window.checklistItems && window.checklistItems.length > 0) {
    // Use annotated=true to save check states and times
    const content = window.serializeChecklist ? 
      window.serializeChecklist(window.checklistItems, true) : '';
    
    layout.checklist = {
      top: dock.style.top,
      left: dock.style.left,
      width: dock.style.width,
      height: dock.style.height,
      display: dock.style.display,
      fileName: window.checklistPath || 'checklist.txt',
      content: content
    };
    console.log('[Layout] Saved checklist:', layout.checklist.fileName, 'with', window.checklistItems.length, 'items (annotated)');
  }
  
  // Remember this layout in THIS browser so it auto-restores on refresh.
  // (Deliberately NOT mirrored to the server — each machine owns its own
  // layout; see _persistLayoutLocal/loadLayoutFromLocal.)
  // Persist to THIS browser only, so the layout comes back on refresh.
  // No server mirroring — each machine owns its own layout; sharing
  // happens deliberately via the downloaded file + Load Layout.
  _persistLayoutLocal(layout);

  const blob = new Blob([JSON.stringify(layout, null, 2)], {type: 'application/json'});
  const a = el('a', {href: URL.createObjectURL(blob), download: 'layout.json'});
  a.click();
}


function loadLayoutFromFile() {
  const inp = el('input', {type: 'file', accept: '.json'});
  inp.onchange = () => {
    const f = inp.files?.[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const obj = JSON.parse(rd.result);
        applyLayoutObject(obj);
        _persistLayoutLocal(obj);   // a loaded file becomes this browser's layout
      } catch (e) {
        alert('Load failed: ' + e.message);
      }
    };
    rd.readAsText(f);
  };
  inp.click();
}

/** Apply a parsed layout object (pages, grid prefs, docked checklist incl.
 *  content). Shared by the file-load path and the server-layout path so a
 *  layout behaves identically no matter where it came from. Throws on an
 *  invalid object — callers handle the error. */
function applyLayoutObject(obj) {
        if (!obj.pages || !Array.isArray(obj.pages)) throw new Error('Invalid layout file');
        state.pages = normalizeLayoutPages(obj.pages);

        // Restore grid prefs from the loaded layout if present, falling
        // through to whatever's already in state.grid (from localStorage
        // at startup) when the layout was saved before grid existed.
        if (obj.grid) {
          Object.assign(state.grid, _normalizeGridBlob(obj.grid));
          _saveGridState();    // mirror into localStorage so next session inherits
          _applyGridVisual();
        }

        refreshPages();
        setActivePage(0);
        
        // Restore checklist if it was saved in layout
        if (obj.checklist) {
          console.log('[Layout] Restoring checklist:', obj.checklist);
          
          // Check if checklist already exists
          let dock = document.querySelector('.cl-dock');
          
          // If not, trigger the checklist button to create it
          if (!dock) {
            const checklistBtn = document.getElementById('clOpenDockBtn');
            if (checklistBtn) {
              checklistBtn.click();
              console.log('[Layout] Created checklist widget');
              
              // Wait for it to be created
              setTimeout(() => {
                dock = document.querySelector('.cl-dock');
                if (dock && obj.checklist) {
                  applyChecklistLayout(dock, obj.checklist);
                  
                  // Load the checklist content if it was saved
                  if (obj.checklist.content && window.parseChecklistText) {
                    window.checklistPath = obj.checklist.fileName || 'checklist.txt';
                    window.checklistItems = window.parseChecklistText(obj.checklist.content);
                    window.checklistActiveRow = 0;
                    window.checklistShowRow = 0;
                    window.checklistReturnRow = 0;
                    window.checklistLoaded = true;
                    if (window.checklistItems.length > 0) {
                      window.checklistItems[0].timeIn = new Date().toLocaleTimeString('en-US',{hour12:false});
                    }
                    window.checkEvents = [];
                    window.broadcastCheckEvent?.('replace', { events: [] });
                    if (window._renderTable) window._renderTable();
                    console.log('[Layout] Loaded checklist content:', obj.checklist.fileName);
                  }
                }
              }, 100);
            }
          } else {
            // Checklist already exists, just apply layout
            applyChecklistLayout(dock, obj.checklist);
            
            // Load the checklist content if it was saved
            if (obj.checklist.content && window.parseChecklistText) {
              window.checklistPath = obj.checklist.fileName || 'checklist.txt';
              window.checklistItems = window.parseChecklistText(obj.checklist.content);
              window.checklistActiveRow = 0;
              window.checklistShowRow = 0;
              window.checklistReturnRow = 0;
              window.checklistLoaded = true;
              if (window.checklistItems.length > 0) {
                window.checklistItems[0].timeIn = new Date().toLocaleTimeString('en-US',{hour12:false});
              }
              window.checkEvents = [];
              window.broadcastCheckEvent?.('replace', { events: [] });
              if (window._renderTable) window._renderTable();
              console.log('[Layout] Loaded checklist content:', obj.checklist.fileName);
            }
          }
        }
}

/* Per-browser layout persistence. Each machine keeps ITS OWN last-saved
 * layout in localStorage and restores it at boot — the earlier design
 * auto-loaded a server-shared copy, which meant a save on the remote
 * machine showed up on the host. Layouts now travel between machines
 * only when YOU move them (Save Layout file -> Load Layout), exactly the
 * workflow that existed before, just with "my last layout comes back on
 * refresh" added. */
const LAYOUT_LS_KEY = 'mcc.layout';

function _persistLayoutLocal(layoutObj) {
  try {
    localStorage.setItem(LAYOUT_LS_KEY, JSON.stringify(layoutObj));
  } catch (e) {
    // Quota or privacy mode — non-fatal, the layout just won't survive
    // a refresh on this browser.
    console.warn('[Layout] local persist failed:', e);
  }
}

function loadLayoutFromLocal() {
  try {
    const raw = localStorage.getItem(LAYOUT_LS_KEY);
    if (!raw) {
      console.log('[Layout] no saved layout in this browser — starter page');
      return false;
    }
    const obj = JSON.parse(raw);
    if (!obj || !Array.isArray(obj.pages) || !obj.pages.length) return false;
    applyLayoutObject(obj);
    console.log(`[Layout] restored this browser's last layout (${obj.pages.length} pages)`);
    return true;
  } catch (e) {
    console.warn('[Layout] local restore failed:', e);
    return false;
  }
}

/** Silent, debounced auto-save of the current layout to THIS browser's
 *  localStorage — called by a few settings callbacks (series color
 *  changes) so tweaks survive a refresh without clicking Save Layout. */
let _saveLayoutTimer = null;
function saveLayout() {
  if (_saveLayoutTimer) clearTimeout(_saveLayoutTimer);
  _saveLayoutTimer = setTimeout(() => {
    _saveLayoutTimer = null;
    try {
      const pagesClone = JSON.parse(JSON.stringify(state.pages));
      for (const p of pagesClone)
        for (const w of (p.widgets || []))
          if (w && w.popoutId) delete w.popoutId;
      _persistLayoutLocal({ pages: pagesClone, grid: { ...state.grid } });
    } catch (e) {
      console.warn('[Layout] auto-save failed:', e);
    }
  }, 800);
}

function applyChecklistLayout(dock, layout) {
  if (!dock || !layout) return;
  if (layout.top) dock.style.top = layout.top;
  if (layout.left) dock.style.left = layout.left;
  if (layout.width) dock.style.width = layout.width;
  if (layout.height) dock.style.height = layout.height;
  if (layout.display) dock.style.display = layout.display;
  console.log('[Layout] Applied checklist layout');
}


/* ----------------------- widget settings modal -------------------------- */
function openWidgetSettings(w) {
  const root = el('div', {});
  const titleHeader = el('h3', {}, (w.opts.title || w.type) + ' — Settings');
  const titleInput = inputText(w.opts, 'title');
  titleInput.oninput = () => {
    w.opts.title = titleInput.value;
    const t = document.querySelector('#w_' + w.id + ' header .title');
    if (t) t.textContent = w.opts.title || w.type;
    const b = document.querySelector('#w_' + w.id + ' .do-btn');
    if (b) b.textContent = w.opts.title || 'DO';
  };
  const nameRow = tableForm([['Title', titleInput]]);
  root.append(el('div', {}, [titleHeader]), nameRow, el('hr', {className: 'soft'}));

  // Pop-out action — lives in Settings (not on the widget header) so that
  // the toolbar icon strip doesn't grow per-widget and shove existing
  // layouts around. Action button, not a config value, so we close the
  // dialog after popping out (otherwise the user would be left looking
  // at a settings panel for a widget that just vanished from the page).
  // Suppressed inside an already-popped-out window for obvious reasons.
  if (!IS_POPOUT) {
    const popoutBtn = el('button', {
      className: 'btn',
      style: 'margin: 8px 0; padding: 6px 14px; font-size: 13px; ' +
             'background: #1e2235; color: #cfd6f0; ' +
             'border: 1px solid #4c5170; border-radius: 4px; cursor: pointer;',
      title: 'Open this widget in a separate browser window — drag it to another monitor',
      onclick: () => {
        // Close the settings dialog before popping out so the user
        // isn't left staring at a panel for a widget that just left
        // the page. popOutWidget() already calls renderPage() to remove
        // the widget from view, so we don't need a second renderPage()
        // here — pass an empty callback to closeModal.
        closeModal();
        popOutWidget(w);
      }
    }, '⤴ Pop out to separate window');
    root.append(popoutBtn, el('hr', {className: 'soft'}));
  }

  if (w.type === 'gauge' || w.type === 'bars') {
    const hideChk = el('input', {type: 'checkbox'});
    hideChk.checked = !!w.opts.hideScaleUI;
    hideChk.onchange = () => {
      w.opts.hideScaleUI = hideChk.checked;
      saveLayout();
      renderPage();   // rebuild the widget so the header row updates now
    };
    root.append(el('label', {style: 'display:flex;align-items:center;gap:6px;margin:6px 0;font-size:13px'},
      [hideChk, 'Hide scale controls (Scale/Min/Max' + (w.type === 'gauge' ? '/Decimals' : '') + ')']),
      el('hr', {className: 'soft'}));
  }

  if (w.type === 'chart' || w.type === 'bars' || w.type === 'gauge') {
    const list = el('div', {});
    const items = (w.type === 'gauge') ? (w.opts.needles = w.opts.needles || []) : (w.opts.series = w.opts.series || []);

    function redrawList() {
      list.innerHTML = '';
      items.forEach((s, idx) => {
        // Ensure display scale/offset exist
        s.displayScale = s.displayScale !== undefined ? s.displayScale : 1.0;
        s.displayOffset = s.displayOffset !== undefined ? s.displayOffset : 0.0;

        const kindSel = selectEnum(['ai', 'ao', 'do', 'tc', 'ctr', 'pid', 'math', 'expr', 'button', 'static', 'scale'], s.kind || 'ai', async v => {
          s.kind = v;
          s.name = s.name || labelFor(s);
          // Rebuild selector when kind changes
          // For button/static vars, use empty string if no index, otherwise use 0
          const defaultIndex = (v === 'button' || v === 'static') ? (s.index || '') : (s.index || 0);
          const newSel = await createSignalSelector(v, defaultIndex, newIdx => s.index = newIdx);
          signalSel.replaceWith(newSel);
          signalSel = newSel;
        });
        
        let signalSel = el('select', {style: 'width:100px'});
        signalSel.append(el('option', {value: s.index || 0}, 'Loading...'));
        
        // Async load signal selector
        (async () => {
          const kind = s.kind || 'ai';
          // For button/static vars, use empty string if no index, otherwise use 0
          const defaultIndex = (kind === 'button' || kind === 'static') ? (s.index || '') : (s.index || 0);
          const newSel = await createSignalSelector(kind, defaultIndex, newIdx => {
            s.index = newIdx;
            s.name = s.name || labelFor(s);
          });
          signalSel.replaceWith(newSel);
          signalSel = newSel;
        })();
        
        const nameInput = el('input', {
          type: 'text',
          value: (s.name && s.name.length) ? s.name : labelFor(s),
          placeholder: 'label',
          style: 'width:80px'
        });
        nameInput.oninput = () => s.name = nameInput.value;

        // Display scaling inputs
        const scaleInput = el('input', {
          type: 'number',
          step: 'any',
          value: s.displayScale,
          style: 'width:60px',
          title: 'Display Scale (multiplier)'
        });
        scaleInput.oninput = () => s.displayScale = parseFloat(scaleInput.value) || 1.0;
        const offsetInput = el('input', {
          type: 'number',
          step: 'any',
          value: s.displayOffset,
          style: 'width:60px',
          title: 'Display Offset (added after scale)'
        });
        offsetInput.oninput = () => s.displayOffset = parseFloat(offsetInput.value) || 0.0;

        const rm = el('span', {
          className: 'icon', onclick: () => {
            items.splice(idx, 1);
            redrawList();
          }
        }, '−');

        const row = el('div', {style: 'display:flex;gap:4px;align-items:center;margin:4px 0;flex-wrap:wrap'}, [
          el('span', {style: 'min-width:40px;font-size:11px;color:var(--muted)'}, 'Kind:'),
          kindSel,
          el('span', {style: 'min-width:50px;font-size:11px;color:var(--muted)'}, 'Signal:'),
          signalSel,
          el('span', {style: 'min-width:40px;font-size:11px;color:var(--muted)'}, 'Name:'),
          nameInput,
          el('br', {}),
          el('span', {style: 'min-width:40px;font-size:11px;color:var(--muted)'}, 'Scale:'),
          scaleInput,
          el('span', {style: 'min-width:45px;font-size:11px;color:var(--muted)'}, 'Offset:'),
          offsetInput,
          rm
        ]);
        
        // Color picker button
        const currentColor = s.color || colorFor(idx);
        const colorBtn = el('div', {
          style: `width:30px;height:24px;border-radius:4px;border:1px solid var(--border);cursor:pointer;background:${currentColor};position:relative`,
          title: 'Change color',
          onclick: (e) => {
            e.stopPropagation();
            createColorPicker(currentColor, (newColor) => {
              s.color = newColor;
              colorBtn.style.background = newColor;
              saveLayout();
            });
          }
        });
        
        // Add color reset button if custom color is set
        if (s.color) {
          const resetBtn = el('span', {
            className: 'icon',
            style: 'font-size:11px;color:var(--text);cursor:pointer;margin-left:4px',
            title: 'Reset to default color',
            onclick: (e) => {
              e.stopPropagation();
              delete s.color;
              colorBtn.style.background = colorFor(idx);
              redrawList();
              saveLayout();
            }
          }, '↺');
          row.append(el('span', {style: 'min-width:40px;font-size:11px;color:var(--muted)'}, 'Color:'), colorBtn, resetBtn);
        } else {
          row.append(el('span', {style: 'min-width:40px;font-size:11px;color:var(--muted)'}, 'Color:'), colorBtn);
        }

        // ----- Target line (charts, gauges, and bars) -----
        // Each series can have an optional target line drawn as a redline
        // marker. Target value can be a fixed number or sourced from any
        // signal in the system (AI / AO / TC / DO / PID / Math / Expr /
        // Scale / static / button). The target color is per-series and
        // defaults to the app's chart-cursor red.
        if (w.type === 'chart' || w.type === 'gauge' || w.type === 'bars') {
          const TARGET_DEFAULT_COLOR = '#ff4d4d';

          // Normalize legacy formats so the rest of this block can assume
          // s.target is either undefined (off) or {mode, value|sel}.
          const t0 = s.target;
          let initialEnabled = false;
          let initialMode = 'fixed';
          let initialValue = 0;
          let initialSel = { kind: 'ai', index: 0 };
          if (t0 != null) {
            initialEnabled = true;
            if (typeof t0 === 'number' && Number.isFinite(t0)) {
              initialMode = 'fixed';
              initialValue = t0;
            } else if (typeof t0 === 'object') {
              initialMode = (t0.mode === 'signal') ? 'signal' : 'fixed';
              if (initialMode === 'fixed') {
                initialValue = Number.isFinite(Number(t0.value)) ? Number(t0.value) : 0;
              } else if (t0.sel) {
                initialSel = {
                  kind: t0.sel.kind || 'ai',
                  index: (t0.sel.index !== undefined) ? t0.sel.index : 0
                };
              }
            }
          }

          const targetChk = el('input', {
            type: 'checkbox',
            checked: initialEnabled,
            title: 'Show target line for this series'
          });

          const modeSel = el('select', {
            disabled: !initialEnabled,
            title: 'Fixed: type a number. Signal: pick a live signal whose current value is the target.'
          });
          modeSel.append(el('option', {value: 'fixed'}, 'Fixed'));
          modeSel.append(el('option', {value: 'signal'}, 'Signal'));
          modeSel.value = initialMode;

          // Fixed-mode input
          const fixedInput = el('input', {
            type: 'number',
            step: 'any',
            value: initialValue,
            disabled: !initialEnabled || initialMode !== 'fixed',
            style: 'width:70px',
            title: 'Target value (in display units, after scale & offset)'
          });

          // Signal-mode kind+selector pair
          const signalKindSel = selectEnum(
            ['ai', 'ao', 'do', 'tc', 'ctr', 'pid', 'math', 'expr', 'button', 'static', 'scale'],
            initialSel.kind,
            () => {}  // wired below after we have a closure to rebuild signalSel
          );
          signalKindSel.disabled = !initialEnabled || initialMode !== 'signal';

          // The signal selector is built async. We hold a placeholder until
          // the real one comes back, then swap. Subsequent kind changes do
          // the same swap.
          let signalSel = el('select', {style: 'width:120px',
                                        disabled: !initialEnabled || initialMode !== 'signal'});
          signalSel.append(el('option', {}, 'Loading...'));

          const colorBtn = el('div', {
            style: `width:24px;height:22px;border-radius:4px;border:1px solid var(--border);cursor:pointer;background:${s.targetColor || TARGET_DEFAULT_COLOR};opacity:${initialEnabled ? 1 : 0.4}`,
            title: 'Target line color'
          });

          // Centralised target-state writer — called whenever any control
          // changes, so the persisted s.target stays canonical no matter
          // which input the user touched.
          //
          // Mutations land in s.target / s.targetColor directly. The layout
          // dialog's existing convention is "mutate in place; persistence
          // happens when the user clicks Save Layout, which serializes
          // state.pages to disk via saveLayoutToFile()". Earlier versions of
          // this code called a non-existent saveLayout() helper after every
          // change — those calls threw silently. The mutations themselves
          // were unaffected, but cleaning them up makes the failure mode of
          // future edits obvious.
          const writeTarget = () => {
            if (!targetChk.checked) {
              delete s.target;
              return;
            }
            if (modeSel.value === 'fixed') {
              s.target = { mode: 'fixed', value: parseFloat(fixedInput.value) || 0 };
            } else {
              // For numeric kinds the HTML <select> stores values as strings;
              // coerce to int so the saved layout JSON matches the convention
              // used everywhere else (sel.index is a number for ai/ao/do/tc/
              // pid/math/le/expr/scale, a string name for static/button).
              const kind = signalKindSel.value;
              let rawIdx = signalSel ? signalSel.value : 0;
              if (rawIdx === 'Loading...' || rawIdx == null) {
                // Async selector hasn't finished building yet — keep the old
                // value rather than persisting garbage. The next user change
                // (or the kind-change handler's rebuild) will fix it up.
                return;
              }
              const numericKinds = ['ai','ao','do','tc','ctr','pid','math','le','expr','scale'];
              const index = numericKinds.includes(kind) ? (parseInt(rawIdx, 10) || 0) : rawIdx;
              s.target = { mode: 'signal', sel: { kind, index } };
            }
            if (!s.targetColor) s.targetColor = TARGET_DEFAULT_COLOR;
          };

          // Apply enabled/mode to the per-control disabled flags + opacity.
          const applyEnable = () => {
            const on = targetChk.checked;
            modeSel.disabled = !on;
            const isFixed = (modeSel.value === 'fixed');
            fixedInput.disabled = !on || !isFixed;
            signalKindSel.disabled = !on || isFixed;
            signalSel.disabled = !on || isFixed;
            colorBtn.style.opacity = on ? 1 : 0.4;
          };

          // Build (or rebuild) the signal selector for the current kind.
          const rebuildSignalSel = async (kind, currentIndex) => {
            try {
              const newSel = await createSignalSelector(kind, currentIndex, newIdx => {
                // Keep signalSel's .value in sync with the new selection,
                // then write the canonical s.target. (No explicit save call —
                // mutation in place is what the rest of this dialog does.)
                signalSel.value = newIdx;
                writeTarget();
              });
              newSel.style.width = '120px';
              newSel.disabled = signalSel.disabled;
              signalSel.replaceWith(newSel);
              signalSel = newSel;
              // After the real selector mounts, capture its current value
              // into s.target so a user who never touches it still gets a
              // valid signal reference saved.
              writeTarget();
            } catch (e) {
              console.warn('[target-signal] selector build failed:', e);
            }
          };
          // Initial async build — only relevant when starting in signal mode,
          // but we build either way so switching modes is instant.
          rebuildSignalSel(initialSel.kind, initialSel.index);

          targetChk.onchange = () => {
            applyEnable();
            writeTarget();
          };
          modeSel.onchange = () => {
            applyEnable();
            writeTarget();
          };
          fixedInput.oninput = () => {
            writeTarget();
          };
          signalKindSel.onchange = async () => {
            await rebuildSignalSel(signalKindSel.value, 0);
            writeTarget();
          };
          colorBtn.onclick = (e) => {
            e.stopPropagation();
            const cur = s.targetColor || TARGET_DEFAULT_COLOR;
            createColorPicker(cur, (newColor) => {
              s.targetColor = newColor;
              colorBtn.style.background = newColor;
            });
          };

          row.append(
            el('span', {style: 'min-width:40px;font-size:11px;color:var(--muted)'}, 'Target:'),
            targetChk,
            modeSel,
            fixedInput,
            signalKindSel,
            signalSel,
            colorBtn
          );
        }

        list.append(row);
      });
    }

    const add = el('span', {
      className: 'icon', onclick: () => {
        const s = {
          kind: 'ai',
          index: 0,
          name: labelFor({kind: 'ai', index: 0}),
          displayScale: 1.0,
          displayOffset: 0.0
        };
        items.push(s);
        redrawList();
      }
    }, '+ Add');
    redrawList();
    root.append(el('h4', {}, (w.type === 'gauge' ? 'Needles' : 'Series')), list, el('div', {style: 'margin-top:8px'}, add));
    
    // Add Scale Op checkbox and divisions for gauges
    if (w.type === 'gauge') {
      const scaleOpChk = inputChk(w.opts, 'scaleOp');
      scaleOpChk.onchange = () => {
        w.opts.scaleOp = scaleOpChk.checked;
        if (!w.opts.scaleOp) {
          // Clear tare offsets when disabling
          delete w.opts.tareOffsets;
        }
      };
      
      // Set default divisions if not set
      if (w.opts.divisions === undefined) w.opts.divisions = 5;
      
      root.append(
        el('hr', {className: 'soft', style: 'margin:16px 0'}),
        tableForm([
          ['Scale Operation Mode (enables Tare button)', scaleOpChk],
          ['Number of Divisions (tick marks)', inputNum(w.opts, 'divisions', 1)]
        ])
      );
    }
  }

  if (w.type === 'dobutton') {
    // Ensure outputType exists
    w.opts.outputType = w.opts.outputType || 'do';
    w.opts.varName = w.opts.varName || 'button1';
    
    const outputTypeSel = selectEnum(['do', 'var'], w.opts.outputType, v => {
      w.opts.outputType = v;
      renderSettingsRows();
    });
    
    const renderSettingsRows = () => {
      const isDO = w.opts.outputType === 'do';
      const rows = [
        ['Title', titleInput],
        ['Output Type', outputTypeSel]
      ];
      
      if (isDO) {
        // Create DO selector with channel names
        const doSelect = el('select', {});
        const allDOs = getAllDigitalOutputs(configCache);
        allDOs.forEach((doChannel, idx) => {
          doSelect.append(el('option', {value: idx}, `DO${idx}: ${doChannel.name || 'Unnamed'}`));
        });
        doSelect.value = w.opts.doIndex || 0;
        doSelect.onchange = () => w.opts.doIndex = parseInt(doSelect.value);
        
        rows.push(['DO Channel', doSelect]);
        // Polarity lives in the DO CONFIG ('Invert'), not per-button -- show it read-only
        // so the button can't act as a second logical operator on top of the config.
        const cfgInv = !!(getAllDigitalOutputs(configCache)?.[w.opts.doIndex]?.invert);
        rows.push(['Polarity', el('span', {style:'font-size:12px;color:var(--muted)'},
          cfgInv ? 'INVERTED (from config)' : 'normal (from config)')]);
      } else {
        const varInput = el('input', {type: 'text', value: w.opts.varName || 'button1'});
        varInput.oninput = () => w.opts.varName = varInput.value;
        rows.push(['Variable Name', varInput]);
      }
      
      const modeSel = selectEnum(['toggle', 'momentary', 'buzz'], w.opts.mode || 'toggle', v => w.opts.mode = v);
      rows.push(['Mode', modeSel]);
      
      if (isDO && w.opts.mode === 'buzz') {
        rows.push(['Buzz Hz', inputNum(w.opts, 'buzzHz', 10)]);
      }
      
      if (w.opts.mode === 'toggle') {
        rows.push(['Actuation Time (s)', inputNum(w.opts, 'actuationTime', 0.01)]);
      }
      
      // Clear and rebuild
      const existing = root.querySelector('table');
      if (existing) existing.remove();
      root.append(tableForm(rows));
    };
    
    renderSettingsRows();
  }

  if (w.type === 'aoslider') {
    const minI = inputNum(w.opts, 'min', 0.001);
    const maxI = inputNum(w.opts, 'max', 0.001);
    const stepI = inputNum(w.opts, 'step', 0.0001);
    const applyAOdom = () => {
      const node = document.querySelector('#w_' + w.id);
      if (!node) return;
      const rng = node.querySelector('input[type="range"]');
      const cur = node.querySelector('input[type="number"]');
      if (rng) {
        rng.min = w.opts.min;
        rng.max = w.opts.max;
        rng.step = w.opts.step;
      }
      if (cur) {
        cur.min = w.opts.min;
        cur.max = w.opts.max;
        cur.step = w.opts.step;
      }
      const hdr = node.querySelector('header .title');
      if (hdr) hdr.textContent = w.opts.title || 'AO';
    };
    minI.oninput = () => {
      w.opts.min = parseFloat(minI.value) || 0;
      applyAOdom();
    };
    maxI.oninput = () => {
      w.opts.max = parseFloat(maxI.value) || 10;
      applyAOdom();
    };
    stepI.oninput = () => {
      w.opts.step = parseFloat(stepI.value) || 0.0001;
      applyAOdom();
    };

    root.append(tableForm([
      ['Title', titleInput],
      ['AO Index', inputNum(w.opts, 'aoIndex', 1)],
      ['Min V', minI],
      ['Max V', maxI],
      ['Step V', stepI],
      ['Live (send on move)', inputChk(w.opts, 'live')]
    ]));
  }

  if (w.type === 'pidpanel') {
    // Async load PID loops for dropdown
    (async () => {
      try {
        const pid = await (await fetch('/api/pid')).json();
        const loops = pid.loops || [];

        const loopSelector = el('select', {});
        loops.forEach((loop, idx) => {
          const name = loop.name || `Loop ${idx}`;
          const enabled = loop.enabled ? '✓' : '✗';
          loopSelector.append(el('option', {value: idx}, `${name} (${enabled})`));
        });
        loopSelector.value = w.opts.loopIndex || 0;
        loopSelector.onchange = () => {
          w.opts.loopIndex = parseInt(loopSelector.value);
          renderPage();
        };

        root.append(tableForm([
          ['Loop', loopSelector],
          ['Show Controls', inputChk(w.opts, 'showControls')]
        ]));
      } catch (e) {
        root.append(tableForm([
          ['Loop Index', inputNum(w.opts, 'loopIndex', 1)],
          ['Show Controls', inputChk(w.opts, 'showControls')]
        ]));
      }
    })();
  }

  if (w.type === 'motor') {
    // Async load motors for dropdown
    (async () => {
      try {
        const motorData = await (await fetch('/api/motors')).json();
        const motors = motorData.motors || [];

        const motorSelector = el('select', {});
        motors.forEach((m, i) => {
          const included = m.include ? '✓' : '✗';
          motorSelector.append(el('option', {value: i}, `${m.name || `Motor ${i}`} (${included})`));
        });
        motorSelector.value = w.opts.motorIndex || 0;
        motorSelector.onchange = () => {
          w.opts.motorIndex = parseInt(motorSelector.value);
          renderPage();
        };

        root.append(tableForm([
          ['Motor', motorSelector],
          ['Show Controls', inputChk(w.opts, 'showControls')]
        ]));
      } catch (e) {
        root.append(tableForm([
          ['Motor Index', inputNum(w.opts, 'motorIndex', 1)],
          ['Show Controls', inputChk(w.opts, 'showControls')]
        ]));
      }
    })();
  }

  if (w.type === 'vfd') {
    // Populate a pulldown of configured VFD instance names (re-fetched each
    // time settings opens, so newly-added instances show up immediately).
    (async () => {
      let instances = [];
      try {
        const d = await (await fetch('/api/vfd/instances')).json();
        instances = d.instances || [];
      } catch (e) { /* fall back to a free-text field below */ }

      if (instances.length) {
        const sel = el('select', {});
        instances.forEach(inst => {
          const inc = inst.include ? '✓' : '✗';
          sel.append(el('option', {value: inst.name}, `${inst.name} (${inc})`));
        });
        sel.value = w.opts.vfdName || (instances[0] && instances[0].name) || '';
        sel.onchange = () => { w.opts.vfdName = sel.value; renderPage(); };
        if (!w.opts.vfdName && instances[0]) w.opts.vfdName = instances[0].name;
        root.append(tableForm([
          ['VFD instance', sel],
          ['Show controls', inputChk(w.opts, 'showControls')],
          ['RPM step', inputNum(w.opts, 'rpmStep', 10)],
        ]));
      } else {
        root.append(tableForm([
          ['VFD name', (()=>{ const i=el('input',{type:'text',value:w.opts.vfdName||''}); i.oninput=()=>w.opts.vfdName=i.value; return i; })()],
          ['Show controls', inputChk(w.opts, 'showControls')],
          ['RPM step', inputNum(w.opts, 'rpmStep', 10)],
        ]));
        root.append(el('p',{style:'font-size:12px;color:#e6a23c'},
          'No VFD instances defined yet — add one in the VFDs editor.'));
      }
    })();
  }

  if (w.type === 'drive') {
    // Unified VFD/stepper widget: pick the type, then the instance (pulled
    // from the matching endpoint). Changing the type rebuilds the form.
    const dform = el('div', {});
    root.append(dform);
    const buildDriveSettings = async () => {
      dform.innerHTML = '';
      const isStep = (w.opts.driveType === 'stepper');
      const typeSel = el('select', {});
      [['vfd','VFD'],['stepper','Stepper']].forEach(([v,t])=>typeSel.append(el('option',{value:v},t)));
      typeSel.value = w.opts.driveType || 'vfd';
      typeSel.onchange = () => { w.opts.driveType = typeSel.value; w.opts.driveName=''; buildDriveSettings(); renderPage(); };

      let instances = [];
      try {
        const ep = isStep ? '/api/stepper/instances' : '/api/vfd/instances';
        instances = (await (await fetch(ep)).json()).instances || [];
      } catch(e) { /* free-text fallback */ }

      let instCtl;
      if (instances.length){
        instCtl = el('select', {});
        instances.forEach(inst=>{ const inc=inst.include?'✓':'✗'; instCtl.append(el('option',{value:inst.name}, `${inst.name} (${inc})`)); });
        if (!w.opts.driveName && instances[0]) w.opts.driveName = instances[0].name;
        instCtl.value = w.opts.driveName || (instances[0]&&instances[0].name) || '';
        instCtl.onchange = () => { w.opts.driveName = instCtl.value; renderPage(); };
      } else {
        instCtl = el('input',{type:'text',value:w.opts.driveName||''});
        instCtl.oninput = () => { w.opts.driveName = instCtl.value; };
      }

      dform.append(tableForm([
        ['Drive type', typeSel],
        [isStep?'Stepper instance':'VFD instance', instCtl],
        ['Show controls', inputChk(w.opts,'showControls')],
        [isStep?'Velocity step':'RPM step', inputNum(w.opts, isStep?'velStep':'rpmStep', 10)],
      ]));
      if (!instances.length)
        dform.append(el('p',{style:'font-size:12px;color:#e6a23c'},
          `No ${isStep?'stepper':'VFD'} instances yet — add one in the MOD Drv editor.`));
    };
    buildDriveSettings();
  }

  if (w.type === 'le') {
    // Async load LEs for dropdown
    (async () => {
      try {
        const leData = await (await fetch('/api/logic_elements')).json();
        const elements = leData.elements || [];

        const leSelector = el('select', {});
        elements.forEach((le, i) => {
          const name = le.name || `LE${i}`;
          const op = (le.operation || 'and').toUpperCase();
          leSelector.append(el('option', {value: i}, `${name} (${op})`));
        });
        leSelector.value = w.opts.leIndex || 0;
        leSelector.onchange = () => {
          w.opts.leIndex = parseInt(leSelector.value);
          renderPage();
        };

        root.append(tableForm([
          ['Logic Element', leSelector],
          ['Show Inputs', inputChk(w.opts, 'showInputs')]
        ]));
      } catch (e) {
        root.append(tableForm([
          ['LE Index', inputNum(w.opts, 'leIndex', 1)],
          ['Show Inputs', inputChk(w.opts, 'showInputs')]
        ]));
      }
    })();
  }

  if (w.type === 'mathop') {
    // Async load math operators for dropdown
    (async () => {
      try {
        const mathData = await (await fetch('/api/math_operators')).json();
        const operators = mathData.operators || [];

        const mathSelector = el('select', {});
        operators.forEach((m, i) => {
          const name = m.name || `Math${i}`;
          const op = m.operation || 'add';
          mathSelector.append(el('option', {value: i}, `${name} (${op})`));
        });
        mathSelector.value = w.opts.mathIndex || 0;
        mathSelector.onchange = () => {
          w.opts.mathIndex = parseInt(mathSelector.value);
          renderPage();
        };

        root.append(tableForm([
          ['Math Operator', mathSelector],
          ['Show Inputs', inputChk(w.opts, 'showInputs')]
        ]));
      } catch (e) {
        root.append(tableForm([
          ['Math Index', inputNum(w.opts, 'mathIndex', 1)],
          ['Show Inputs', inputChk(w.opts, 'showInputs')]
        ]));
      }
    })();
  }

  if (w.type === 'expr') {
    // Async load expressions for dropdown
    (async () => {
      try {
        const exprData = await (await fetch('/api/expressions')).json();
        const expressions = exprData.expressions || [];

        const exprSelector = el('select', {});
        expressions.forEach((e, i) => {
          const name = e.name || `Expr${i}`;
          const enabled = e.enabled ? '✓' : '✗';
          exprSelector.append(el('option', {value: i}, `${name} (${enabled})`));
        });
        exprSelector.value = w.opts.exprIndex || 0;
        exprSelector.onchange = () => {
          w.opts.exprIndex = parseInt(exprSelector.value);
          renderPage();
        };

        root.append(tableForm([
          ['Expression', exprSelector],
          ['Show Variables', inputChk(w.opts, 'showSource')],
          ['Show Output', inputChk(w.opts, 'showOutput')]
        ]));
      } catch (e) {
        root.append(tableForm([
          ['Expression Index', inputNum(w.opts, 'exprIndex', 1)],
          ['Show Variables', inputChk(w.opts, 'showSource')],
          ['Show Output', inputChk(w.opts, 'showOutput')]
        ]));
      }
    })();
  }

  if (w.type === 'staticvar') {
    (async () => {
      let varNames = [];
      try {
        const resp = await fetch('/api/static_vars');
        const data = await resp.json();
        const vars = data.vars || data.globals || data.static_vars || {};
        varNames = Object.keys(vars).sort((a, b) =>
          a.toLowerCase().localeCompare(b.toLowerCase()));   // alphabetical -- 280+ vars
      } catch(e) { /* ignore */ }

      const varSelector = el('select', {});
      varNames.forEach(n => {
        varSelector.append(el('option', {value:n}, n));
      });
      // Also add current value if not in list
      if (w.opts.varName && !varNames.includes(w.opts.varName)) {
        varSelector.append(el('option', {value: w.opts.varName}, w.opts.varName + ' (current)'));
      }
      varSelector.value = w.opts.varName || '';
      varSelector.onchange = () => {
        w.opts.varName = varSelector.value;
        w.opts.title   = varSelector.value;
        renderPage();
      };

      const dpInput = inputNum(w.opts, 'decimalPlaces', 1);

      root.append(tableForm([
        ['Variable', varNames.length > 0 ? varSelector : txt(w.opts, 'varName')],
        ['Decimal Places', dpInput]
      ]));
    })();
  }

  if (w.type === 'indicator') {
    // ===== Indicator settings =====
    // Two priority-ordered conditions (A wins ties), each with:
    //   lhs (signal-or-fixed)  op (> < = !=)  rhs (signal-or-fixed)
    // Plus shape, size, three colors, label toggle.
    //
    // The operand picker reuses the same convention as target-line sources
    // (mode 'fixed' = number, mode 'signal' = signal selector). We build the
    // signal selectors asynchronously and swap them in when they mount, same
    // pattern target-line uses.
    const TARGET_KINDS = ['ai','ao','do','tc','ctr','pid','math','expr','button','static','scale'];

    /**
     * Build a row of widgets that lets the user edit one operand of a
     * comparison. The operand object is mutated in place; we never replace it
     * (so the surrounding cond object's reference stays valid).
     */
    const makeOperandRow = (operand) => {
      const wrap = el('span', {style: 'display:inline-flex;gap:4px;align-items:center;flex-wrap:wrap'});

      const modeSel = el('select', {});
      modeSel.append(el('option', {value:'fixed'},  'Fixed'));
      modeSel.append(el('option', {value:'signal'}, 'Signal'));
      modeSel.value = (operand.mode === 'signal') ? 'signal' : 'fixed';

      const fixedInp = el('input', {
        type: 'number', step: 'any',
        value: Number.isFinite(Number(operand.value)) ? operand.value : 0,
        style: 'width:80px'
      });

      const kindSel = selectEnum(TARGET_KINDS,
        (operand.sel && operand.sel.kind) || 'ai',
        () => {});
      let sigSel = el('select', {style: 'min-width:120px'},
                     [el('option', {}, 'Loading...')]);

      const applyEnable = () => {
        const isSignal = (modeSel.value === 'signal');
        fixedInp.disabled = isSignal;
        kindSel.disabled  = !isSignal;
        sigSel.disabled   = !isSignal;
        fixedInp.style.opacity = isSignal ? 0.4 : 1;
        kindSel.style.opacity  = isSignal ? 1 : 0.4;
        sigSel.style.opacity   = isSignal ? 1 : 0.4;
      };

      const writeBack = () => {
        if (modeSel.value === 'fixed') {
          operand.mode = 'fixed';
          operand.value = parseFloat(fixedInp.value) || 0;
        } else {
          operand.mode = 'signal';
          const kind = kindSel.value;
          let rawIdx = sigSel.value;
          if (rawIdx === 'Loading...' || rawIdx == null) return;
          const numericKinds = ['ai','ao','do','tc','ctr','pid','math','le','expr','scale'];
          const index = numericKinds.includes(kind) ? (parseInt(rawIdx, 10) || 0) : rawIdx;
          operand.sel = { kind, index };
        }
      };

      const rebuildSig = async (kind, currentIdx) => {
        try {
          const newSel = await createSignalSelector(kind, currentIdx, (newIdx) => {
            sigSel.value = newIdx;
            writeBack();
          });
          newSel.style.minWidth = '120px';
          newSel.disabled = sigSel.disabled;
          sigSel.replaceWith(newSel);
          sigSel = newSel;
          // After mount, capture current selection back into the operand
          writeBack();
        } catch (e) {
          console.warn('[indicator] signal selector build failed:', e);
        }
      };
      rebuildSig(
        (operand.sel && operand.sel.kind) || 'ai',
        (operand.sel && operand.sel.index !== undefined) ? operand.sel.index : 0
      );

      modeSel.onchange   = () => { applyEnable(); writeBack(); };
      fixedInp.oninput   = () => { writeBack(); };
      kindSel.onchange   = async () => { await rebuildSig(kindSel.value, 0); writeBack(); };

      applyEnable();
      wrap.append(modeSel, fixedInp, kindSel, sigSel);
      return wrap;
    };

    /** Build a full condition editor row: [LHS] [op] [RHS]. */
    const makeConditionRow = (cond) => {
      const lhs = makeOperandRow(cond.lhs);
      const opSel = el('select', {style:'width:60px;font-weight:bold;text-align:center'});
      ['>','<','=','!='].forEach(o => opSel.append(el('option', {value:o}, o)));
      opSel.value = cond.op || '>';
      opSel.onchange = () => { cond.op = opSel.value; };
      const rhs = makeOperandRow(cond.rhs);

      return el('div', {
        style: 'display:flex;gap:6px;align-items:center;flex-wrap:wrap;' +
               'padding:6px;background:#1a1d2e;border-radius:6px'
      }, [lhs, opSel, rhs]);
    };

    // Color pickers — reusing the swatch+picker pattern from elsewhere.
    const makeColorSwatch = (key, defaultColor) => {
      const sw = el('div', {
        style: `width:24px;height:22px;border-radius:4px;border:1px solid var(--border);` +
               `cursor:pointer;background:${w.opts[key] || defaultColor}`,
        title: 'Click to choose color'
      });
      sw.onclick = (e) => {
        e.stopPropagation();
        const cur = w.opts[key] || defaultColor;
        createColorPicker(cur, (newColor) => {
          w.opts[key] = newColor;
          sw.style.background = newColor;
        });
      };
      return sw;
    };

    const shapeSel = selectEnum(['round','rect'], w.opts.shape || 'round',
                                v => { w.opts.shape = v; });
    const sizeInp  = inputNum(w.opts, 'size', 1);
    const showLblChk = inputChk(w.opts, 'showLabel');

    const condARow = makeConditionRow(w.opts.condA);
    const condBRow = makeConditionRow(w.opts.condB);

    root.append(
      tableForm([
        ['Shape',         shapeSel],
        ['Size (px)',     sizeInp],
        ['Show Label',    showLblChk],
        ['Color A (priority 1)', makeColorSwatch('colorA', '#2faa60')],
        ['Color B (priority 2)', makeColorSwatch('colorB', '#d84a4a')],
        ['Off color',            makeColorSwatch('colorOff', '#3b425e')]
      ]),
      el('div', {style: 'margin-top:12px;color:#a8b3cf;font-size:12px'},
        'Condition A — shown in Color A when true. Takes priority over B.'),
      condARow,
      el('div', {style: 'margin-top:8px;color:#a8b3cf;font-size:12px'},
        'Condition B — shown in Color B when true (and A is false).'),
      condBRow,
      el('div', {style: 'margin-top:8px;color:#7a7f8f;font-size:11px'},
        'When neither condition is true, the indicator shows the Off color.')
    );
  }

  if (w.type === 'statustext') {
    // ===== Status Text settings =====
    // One input signal; an ordered list of conditions (first match wins),
    // each with its own display text, text color, and background; a default
    // for when nothing matches; font + optional outline. Auto-sizes to text.
    const TARGET_KINDS = ['static','expr','ai','tc','ao','do','ctr','pid','math','button','scale'];
    if (!w.opts.src || typeof w.opts.src !== 'object') {
      w.opts.src = { mode: 'signal', sel: { kind: 'static', index: 'mvrPhase' } };
    }
    w.opts.src.mode = 'signal';
    if (!w.opts.src.sel) w.opts.src.sel = { kind: 'static', index: 'mvrPhase' };
    if (!Array.isArray(w.opts.conds)) w.opts.conds = [];

    const kindSel = selectEnum(TARGET_KINDS, w.opts.src.sel.kind || 'static', () => {});
    let sigSel = el('select', {style: 'min-width:160px'}, [el('option', {}, 'Loading...')]);
    const writeSig = () => {
      const kind = kindSel.value;
      const rawIdx = sigSel.value;
      if (rawIdx === 'Loading...' || rawIdx == null) return;
      const numericKinds = ['ai','ao','do','tc','ctr','pid','math','le','expr','scale'];
      w.opts.src.sel = { kind, index: numericKinds.includes(kind) ? (parseInt(rawIdx, 10) || 0) : rawIdx };
    };
    const rebuildSig = async (kind, cur) => {
      try {
        const newSel = await createSignalSelector(kind, cur, () => writeSig());
        newSel.style.minWidth = '160px';
        sigSel.replaceWith(newSel);
        sigSel = newSel;
        writeSig();
      } catch (e) { console.warn('[statustext] signal selector build failed:', e); }
    };
    rebuildSig(w.opts.src.sel.kind || 'static',
               (w.opts.src.sel.index !== undefined) ? w.opts.src.sel.index : 0);
    kindSel.onchange = async () => { await rebuildSig(kindSel.value, 0); };

    // Small color swatch bound to obj[key]; empty string = keep default.
    const swatchFor = (obj, key, def) => {
      const sw = el('div', {
        style: `width:24px;height:22px;border-radius:4px;border:1px solid var(--border);` +
               `cursor:pointer;background:${obj[key] || def};flex-shrink:0;`,
        title: 'Click to choose color'
      });
      sw.onclick = (e) => {
        e.stopPropagation();
        createColorPicker(obj[key] || def, (c) => { obj[key] = c; sw.style.background = c; });
      };
      return sw;
    };

    const condsWrap = el('div', {});
    const renderConds = () => {
      condsWrap.innerHTML = '';
      w.opts.conds.forEach((c, i) => {
        const opSel = el('select', {style: 'width:58px;text-align:center'});
        ['=','!=','>','<','>=','<='].forEach(o => opSel.append(el('option', {value:o}, o)));
        opSel.value = c.op || '=';
        opSel.onchange = () => { c.op = opSel.value; };
        const valInp = el('input', {type:'number', step:'any', value: (c.value ?? 0), style:'width:74px'});
        valInp.oninput = () => { c.value = parseFloat(valInp.value) || 0; };
        const txtInp = el('input', {type:'text', value: (c.text ?? ''), style:'flex:1;min-width:110px'});
        txtInp.oninput = () => { c.text = txtInp.value; };
        const upBtn  = el('button', {className:'btn', title:'Raise priority',
          onclick: () => { if (i > 0) { const a = w.opts.conds; [a[i-1], a[i]] = [a[i], a[i-1]]; renderConds(); } }}, '↑');
        const delBtn = el('button', {className:'btn', title:'Delete condition',
          onclick: () => { w.opts.conds.splice(i, 1); renderConds(); }}, '✕');
        condsWrap.append(el('div', {
          style: 'display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin:4px 0;' +
                 'padding:6px;background:#1a1d2e;border-radius:6px'
        }, [
          el('span', {style:'color:#8b949e;font-size:12px'}, 'value'), opSel, valInp,
          el('span', {style:'color:#8b949e;font-size:12px'}, 'show'), txtInp,
          el('span', {style:'color:#8b949e;font-size:12px'}, 'text'), swatchFor(c, 'fg', '#ffffff'),
          el('span', {style:'color:#8b949e;font-size:12px'}, 'bg'),   swatchFor(c, 'bg', '#3b425e'),
          upBtn, delBtn
        ]));
      });
    };
    renderConds();
    const addCondBtn = el('button', {className:'btn', style:'margin-top:4px',
      onclick: () => { w.opts.conds.push({op:'=', value:0, text:'STATE', fg:'#ffffff', bg:'#3b425e'}); renderConds(); }},
      '+ Add condition');

    const defTextInp = el('input', {type:'text', value: (w.opts.defText ?? '—'), style:'width:140px'});
    defTextInp.oninput = () => { w.opts.defText = defTextInp.value; };
    const fontSizeInp = el('input', {type:'number', min:'6', max:'200', step:'1',
      value: Number(w.opts.fontSize) || 18, style:'width:70px'});
    fontSizeInp.oninput = () => {
      const v = parseInt(fontSizeInp.value, 10);
      if (Number.isFinite(v) && v >= 6) w.opts.fontSize = v;
    };
    const boldChk = el('input', {type:'checkbox'});
    boldChk.checked = (w.opts.fontWeight === 'bold');
    boldChk.onchange = () => { w.opts.fontWeight = boldChk.checked ? 'bold' : 'normal'; };
    const outlineChk = el('input', {type:'checkbox'});
    outlineChk.checked = (w.opts.outline !== false);
    outlineChk.onchange = () => { w.opts.outline = outlineChk.checked; };
    const autoSizeChk = el('input', {type:'checkbox'});
    autoSizeChk.checked = (w.opts.autoSize !== false);
    autoSizeChk.onchange = () => { w.opts.autoSize = autoSizeChk.checked; };

    root.append(
      tableForm([
        ['Input kind',    kindSel],
        ['Input signal',  sigSel],
        ['Default text',  defTextInp],
        ['Default text color', swatchFor(w.opts, 'defFg', '#cfd6f0')],
        ['Default background', swatchFor(w.opts, 'defBg', '#3b425e')],
        ['Font size (px)', fontSizeInp],
        ['Bold',          boldChk],
        ['Outline',       outlineChk],
        ['Outline color', swatchFor(w.opts, 'outlineColor', '#4c5170')],
        ['Auto-size to text', autoSizeChk]
      ]),
      el('div', {style: 'margin-top:12px;color:#a8b3cf;font-size:12px'},
        'Conditions — checked top-down against the input value; the FIRST match sets the text and colors. ↑ raises priority.'),
      condsWrap,
      addCondBtn,
      el('div', {style: 'margin-top:8px;color:#7a7f8f;font-size:11px'},
        'No match → the Default text/colors show. The widget auto-sizes to whatever text is displayed.')
    );
  }

  if (w.type === 'label') {
    // ===== Label settings =====
    // Text, font family (curated list), font size, bold/italic toggles,
    // foreground + background color (background defaults to transparent so
    // the main window color shows through), and horizontal alignment.

    // Multi-line text input so users can paste in a longer label if they want.
    const textInp = el('textarea', {
      style: 'width:100%;min-height:54px;resize:vertical;' +
             'background:#1a1d2e;color:#cfd6f0;border:1px solid #2c3150;' +
             'border-radius:4px;padding:6px;font:13px/1.4 system-ui'
    });
    textInp.value = w.opts.text || '';
    textInp.oninput = () => { w.opts.text = textInp.value; };

    // Curated font list. Keeping it short avoids the "pick from 200 system
    // fonts" problem; the stacks here render on every platform we target.
    const FONTS = [
      { id: 'system-ui',  label: 'System UI (default)' },
      { id: '"Segoe UI", system-ui, sans-serif', label: 'Segoe UI' },
      { id: '"Helvetica Neue", Helvetica, Arial, sans-serif', label: 'Helvetica / Arial' },
      { id: 'Georgia, "Times New Roman", serif', label: 'Georgia (serif)' },
      { id: '"Times New Roman", Times, serif', label: 'Times New Roman' },
      { id: 'Consolas, "Courier New", monospace', label: 'Consolas (monospace)' },
      { id: '"Courier New", monospace', label: 'Courier New' },
      { id: 'Impact, "Arial Black", sans-serif', label: 'Impact (heavy)' }
    ];
    const fontSel = el('select', {style:'min-width:200px'});
    for (const f of FONTS) {
      const opt = el('option', {value: f.id}, f.label);
      fontSel.append(opt);
    }
    // If the saved family isn't in the list (older layout / custom value),
    // add it as a one-off option so the picker reflects reality.
    if (!FONTS.find(f => f.id === w.opts.fontFamily) && w.opts.fontFamily) {
      fontSel.append(el('option', {value: w.opts.fontFamily}, `(custom) ${w.opts.fontFamily}`));
    }
    fontSel.value = w.opts.fontFamily || 'system-ui';
    fontSel.onchange = () => { w.opts.fontFamily = fontSel.value; };

    const sizeInp = el('input', {
      type:'number', min:'6', max:'200', step:'1',
      value: Number(w.opts.fontSize) || 16,
      style:'width:70px'
    });
    sizeInp.oninput = () => {
      const v = parseInt(sizeInp.value, 10);
      if (Number.isFinite(v) && v >= 6) w.opts.fontSize = v;
    };

    const boldChk = el('input', {type:'checkbox'});
    boldChk.checked = (w.opts.fontWeight === 'bold');
    boldChk.onchange = () => { w.opts.fontWeight = boldChk.checked ? 'bold' : 'normal'; };

    const italicChk = el('input', {type:'checkbox'});
    italicChk.checked = (w.opts.fontStyle === 'italic');
    italicChk.onchange = () => { w.opts.fontStyle = italicChk.checked ? 'italic' : 'normal'; };

    const alignSel = el('select', {});
    [['left','Left'],['center','Center'],['right','Right']].forEach(([v,l]) => {
      alignSel.append(el('option', {value:v}, l));
    });
    alignSel.value = w.opts.align || 'left';
    alignSel.onchange = () => { w.opts.align = alignSel.value; };

    // Color pickers: foreground always a real color; background can be the
    // sentinel 'transparent' (which the user gets by clicking the
    // "Use window background" button).
    const fgSwatch = el('div', {
      style:`width:32px;height:24px;border-radius:4px;border:1px solid var(--border);` +
            `cursor:pointer;background:${w.opts.fgColor || '#e6e6e6'};`,
      title: 'Click to choose text color'
    });
    fgSwatch.onclick = (e) => {
      e.stopPropagation();
      createColorPicker(w.opts.fgColor || '#e6e6e6', (newColor) => {
        w.opts.fgColor = newColor;
        fgSwatch.style.background = newColor;
      });
    };

    const bgSwatch = el('div', {
      style: `width:32px;height:24px;border-radius:4px;border:1px solid var(--border);` +
             `cursor:pointer;` +
             // Show a checkerboard when transparent so it's visibly distinct
             // from a real dark color.
             ((w.opts.bgColor && w.opts.bgColor !== 'transparent')
                ? `background:${w.opts.bgColor};`
                : `background:repeating-conic-gradient(#333 0% 25%, #555 0% 50%) 50%/8px 8px;`),
      title: 'Click to choose background color'
    });
    bgSwatch.onclick = (e) => {
      e.stopPropagation();
      const cur = (w.opts.bgColor && w.opts.bgColor !== 'transparent') ? w.opts.bgColor : '#0f1115';
      createColorPicker(cur, (newColor) => {
        w.opts.bgColor = newColor;
        bgSwatch.style.background = newColor;
      });
    };

    const bgTransparentBtn = el('button', {
      className: 'btn',
      style: 'padding:3px 8px;font-size:12px',
      onclick: () => {
        w.opts.bgColor = 'transparent';
        bgSwatch.style.background = 'repeating-conic-gradient(#333 0% 25%, #555 0% 50%) 50%/8px 8px';
      }
    }, 'Use window bg');

    root.append(
      tableForm([
        ['Text',          textInp],
        ['Font',          fontSel],
        ['Size (px)',     sizeInp],
        ['Bold',          boldChk],
        ['Italic',        italicChk],
        ['Align',         alignSel],
        ['Text color',    fgSwatch],
        ['Background',    el('span', {style:'display:inline-flex;gap:6px;align-items:center'},
                            [bgSwatch, bgTransparentBtn])]
      ])
    );
  }

  if (w.type === 'shape') {
    // Helper used by every shape control to live-preview changes. Re-renders
    // just this one widget instead of calling renderPage() on every slider
    // tick (which would rebuild the whole page 30+ times per drag).
    const liveUpdate = () => {
      const node = document.getElementById('w_' + w.id);
      if (!node) return;
      const body = node.querySelector('.body');
      if (!body) return;
      body.innerHTML = '';
      mountShape(w, body, node);
    };

    // Kind picker — re-renders the dialog when changed so the kind-specific
    // controls (arrow toggles for line, sides/cornerRadius for polygon)
    // appear/disappear cleanly.
    const kindSel = el('select');
    [['line','Line'],['circle','Circle / Ellipse'],['polygon','Polygon']].forEach(([v,l]) =>
      kindSel.append(el('option', {value:v}, l)));
    kindSel.value = w.opts.kind;
    kindSel.onchange = () => {
      const prevKind = w.opts.kind;
      w.opts.kind = kindSel.value;
      // When switching TO line, make sure endpoints are anchored to the
      // widget's current bounding box. Otherwise the line might appear far
      // from where the user expects it (or zero-length).
      if (prevKind !== 'line' && w.opts.kind === 'line') {
        w.opts.x1 = w.x;
        w.opts.y1 = w.y;
        w.opts.x2 = w.x + (w.w || 100);
        w.opts.y2 = w.y + (w.h || 100);
      }
      if (prevKind !== 'polygon' && w.opts.kind === 'polygon') {
        // Fresh polygon — regenerate from sides/rotation in the current
        // bounding box. Without this, mountShape's lazy generation would
        // still produce vertices, but doing it here means w.opts.vertices
        // is present before liveUpdate runs.
        _regenerateRegularPolygon(w);
      }
      liveUpdate();
      // Re-open the dialog to refresh the kind-specific section. Close
      // first so the modal infrastructure doesn't get two roots.
      closeModal();
      openWidgetSettings(w);
    };

    // Stroke color
    const strokeSwatch = el('div', {
      style:`width:32px;height:24px;border-radius:4px;border:1px solid var(--border);` +
            `cursor:pointer;background:${w.opts.strokeColor};`,
      title: 'Outline color'
    });
    strokeSwatch.onclick = (e) => {
      e.stopPropagation();
      createColorPicker(w.opts.strokeColor, c => {
        w.opts.strokeColor = c;
        strokeSwatch.style.background = c;
        liveUpdate();
      });
    };

    // Stroke width
    const strokeInp = el('input', {
      type:'number', min:'0', max:'40', step:'1',
      value: String(w.opts.strokeWidth),
      style:'width:70px'
    });
    strokeInp.oninput = () => {
      const v = parseInt(strokeInp.value, 10);
      if (Number.isFinite(v) && v >= 0) {
        w.opts.strokeWidth = v;
        liveUpdate();
      }
    };

    // Fill color — supports transparent (with checkerboard swatch like Label)
    const fillSwatch = el('div', {
      style: `width:32px;height:24px;border-radius:4px;border:1px solid var(--border);` +
             `cursor:pointer;` +
             ((w.opts.fillColor && w.opts.fillColor !== 'transparent')
                ? `background:${w.opts.fillColor};`
                : `background:repeating-conic-gradient(#333 0% 25%, #555 0% 50%) 50%/8px 8px;`),
      title: 'Click to choose fill color'
    });
    fillSwatch.onclick = (e) => {
      e.stopPropagation();
      const cur = (w.opts.fillColor && w.opts.fillColor !== 'transparent') ? w.opts.fillColor : '#79c0ff';
      createColorPicker(cur, c => {
        w.opts.fillColor = c;
        fillSwatch.style.background = c;
        liveUpdate();
      });
    };
    const fillTransBtn = el('button', {
      className: 'btn',
      style: 'padding:3px 8px;font-size:12px',
      onclick: () => {
        w.opts.fillColor = 'transparent';
        fillSwatch.style.background = 'repeating-conic-gradient(#333 0% 25%, #555 0% 50%) 50%/8px 8px';
        liveUpdate();
      }
    }, 'No fill');

    const rows = [
      ['Kind',         kindSel],
      ['Outline color', strokeSwatch],
      ['Outline width', strokeInp],
      ['Fill color',   el('span', {style:'display:inline-flex;gap:6px;align-items:center'},
                          [fillSwatch, fillTransBtn])],
    ];

    if (w.opts.kind === 'line') {
      // Line endpoints are draggable directly on the canvas via the small
      // circle handles at each end — no Direction picker needed anymore.

      const arrStart = el('input', {type:'checkbox'});
      arrStart.checked = w.opts.arrowStart;
      arrStart.onchange = () => { w.opts.arrowStart = arrStart.checked; liveUpdate(); };

      const arrEnd = el('input', {type:'checkbox'});
      arrEnd.checked = w.opts.arrowEnd;
      arrEnd.onchange = () => { w.opts.arrowEnd = arrEnd.checked; liveUpdate(); };

      rows.push(
        ['Arrow at start', arrStart],
        ['Arrow at end',   arrEnd],
      );
    } else if (w.opts.kind === 'polygon') {
      // Sides slider + number. 3 = triangle, 4 = square/rect, etc.
      const sidesRange = el('input', {
        type:'range', min:'3', max:'24', step:'1',
        value: String(w.opts.sides),
        style:'width:160px;vertical-align:middle'
      });
      const sidesNum = el('input', {
        type:'number', min:'3', max:'24', step:'1',
        value: String(w.opts.sides),
        style:'width:60px;margin-left:8px'
      });
      const onSidesChange = (v) => {
        const n = Math.max(3, Math.min(24, parseInt(v,10) || w.opts.sides));
        w.opts.sides = n;
        sidesRange.value = String(n); sidesNum.value = String(n);
        // Changing the side count rebuilds the regular polygon from
        // scratch, discarding any freeform vertex edits the user made.
        // (You can't really preserve "freeform with 5 vertices" when
        // switching to "freeform with 7 vertices" without ambiguity.)
        _regenerateRegularPolygon(w);
        liveUpdate();
      };
      sidesRange.oninput = () => onSidesChange(sidesRange.value);
      sidesNum.oninput   = () => onSidesChange(sidesNum.value);

      // Corner radius slider — clamped to half the shorter side at draw
      // time, but settable up to ~100 here so the user can experiment.
      const cornerRange = el('input', {
        type:'range', min:'0', max:'100', step:'1',
        value: String(w.opts.cornerRadius),
        style:'width:160px;vertical-align:middle'
      });
      const cornerNum = el('input', {
        type:'number', min:'0', max:'500', step:'1',
        value: String(w.opts.cornerRadius),
        style:'width:70px;margin-left:8px'
      });
      const onCornerChange = (v) => {
        const r = Math.max(0, parseFloat(v) || 0);
        w.opts.cornerRadius = r;
        cornerRange.value = String(Math.min(100, r)); cornerNum.value = String(r);
        liveUpdate();
      };
      cornerRange.oninput = () => onCornerChange(cornerRange.value);
      cornerNum.oninput   = () => onCornerChange(cornerNum.value);

      // Rotation: in degrees on top of the "normal" orientation. 0 = looks
      // right for the chosen sides (flat-top square, point-up triangle, etc).
      // Range -180..180 covers everything; with a slider this is enough
      // for fine control.
      const rotRange = el('input', {
        type:'range', min:'-180', max:'180', step:'1',
        value: String(w.opts.rotation || 0),
        style:'width:160px;vertical-align:middle'
      });
      const rotNum = el('input', {
        type:'number', min:'-360', max:'360', step:'1',
        value: String(w.opts.rotation || 0),
        style:'width:70px;margin-left:8px'
      });
      const onRotChange = (v) => {
        const r = Number.isFinite(parseFloat(v)) ? parseFloat(v) : 0;
        w.opts.rotation = r;
        rotRange.value = String(Math.max(-180, Math.min(180, r)));
        rotNum.value   = String(r);
        // Rotation only makes sense for regular polygons. Rebuild from
        // scratch — this discards any freeform vertex edits but that's
        // expected since "rotate freeform shape" is ambiguous.
        _regenerateRegularPolygon(w);
        liveUpdate();
      };
      rotRange.oninput = () => onRotChange(rotRange.value);
      rotNum.oninput   = () => onRotChange(rotNum.value);
      const rotResetBtn = el('button', {
        className:'btn',
        style:'padding:3px 8px;font-size:12px;margin-left:8px',
        onclick: () => onRotChange(0)
      }, '0°');

      // "Reset to regular polygon" — discards any freeform vertex
      // dragging and regenerates a regular N-sided polygon with the
      // current sides/rotation settings, fitted to the current bounding
      // box. Lets the user recover from accidental vertex drags.
      const resetShapeBtn = el('button', {
        className:'btn',
        style:'padding:3px 10px;font-size:12px',
        onclick: () => {
          _regenerateRegularPolygon(w);
          liveUpdate();
        }
      }, 'Reset to regular polygon');

      // Constrain-angles toggle. When on, dragging a vertex preserves the
      // polygon's angular relationships (rectangle stretches as a
      // rectangle, hexagon scales uniformly). When off, vertices move
      // independently — full freeform.
      const constrainChk = el('input', { type:'checkbox' });
      constrainChk.checked = (w.opts.constrainAngles !== false);
      constrainChk.onchange = () => {
        w.opts.constrainAngles = constrainChk.checked;
      };

      rows.push(
        ['Constrain angles', constrainChk],
        ['Sides',          el('span', {}, [sidesRange, sidesNum])],
        ['Corner radius',  el('span', {}, [cornerRange, cornerNum])],
        ['Rotation (°)',   el('span', {}, [rotRange, rotNum, rotResetBtn])],
        ['',               resetShapeBtn],
      );
    }

    root.append(tableForm(rows));
    root.append(el('div', { style:'margin-top:8px;color:#7a7f8f;font-size:11px;line-height:1.5' },
      'Shapes are drawing aids: they\'re not connected to any signals and ' +
      'don\'t update during acquisition. Use Move forward / backward from ' +
      'the right-click menu to control which shapes paint on top of others.'));
  }

  if (w.type === 'console') {
    // Console widget settings — font size, wrapping, line cap, stream
    // filter. The pause/clear/autoscroll/stream controls are also in the
    // widget's own toolbar; the dialog exposes the persistent prefs.
    const fontInp = el('input', {
      type:'number', min:'8', max:'24', step:'1',
      value: String(w.opts.fontSize),
      style:'width:70px'
    });
    fontInp.oninput = () => {
      const v = parseInt(fontInp.value, 10);
      if (Number.isFinite(v) && v >= 8 && v <= 24) w.opts.fontSize = v;
    };

    const wrapChk = el('input', { type:'checkbox' });
    wrapChk.checked = !!w.opts.wrap;
    wrapChk.onchange = () => { w.opts.wrap = wrapChk.checked; };

    const autoChk = el('input', { type:'checkbox' });
    autoChk.checked = (w.opts.autoscroll !== false);
    autoChk.onchange = () => { w.opts.autoscroll = autoChk.checked; };

    const maxInp = el('input', {
      type:'number', min:'100', max:'50000', step:'100',
      value: String(w.opts.maxLines),
      style:'width:90px'
    });
    maxInp.oninput = () => {
      const v = parseInt(maxInp.value, 10);
      if (Number.isFinite(v) && v >= 100) w.opts.maxLines = v;
    };

    const streamSel2 = el('select');
    [['both','stdout + stderr'], ['stdout','stdout only'], ['stderr','stderr only']]
      .forEach(([v,l]) => streamSel2.append(el('option', {value:v}, l)));
    streamSel2.value = w.opts.showStream || 'both';
    streamSel2.onchange = () => { w.opts.showStream = streamSel2.value; };

    root.append(tableForm([
      ['Font size (px)',  fontInp],
      ['Word wrap',       wrapChk],
      ['Auto-scroll',     autoChk],
      ['Max lines',       maxInp],
      ['Show streams',    streamSel2],
    ]));
    root.append(el('div', { style:'margin-top:8px;color:#7a7f8f;font-size:11px;line-height:1.5' },
      'Mirrors the server\'s stdout/stderr. The buffer is shared across all ' +
      'console widgets; Clear empties only this widget, not the server\'s ' +
      'history (a fresh connection still shows the last ~1000 lines).'));
  }

  showModal(root, () => {
    renderPage();
  });
}
function renderPage(){
  // In the popout window we don't render at all from this entry point —
  // the popout has its own canvas and a single widget that was mounted
  // once at init time. Widget types with per-frame RAF loops (chart,
  // gauge, bars, indicator) pick up settings changes naturally because
  // their draw routines read w.opts every frame. One-shot widgets like
  // label only refresh on a fresh mount, so settings changes there won't
  // be visible until the popout is closed and re-opened. Acceptable
  // trade-off for keeping the popout init path simple — full re-rendering
  // would also need to tear down chart RAF loops cleanly to avoid leaks.
  if (IS_POPOUT) return;

  const cv=$('#canvas'); cv.innerHTML='';
  const page=state.pages[activePageIndex];
  for(const w of page.widgets){
    if (w.popoutId) {
      // Widget is currently displayed in a separate popout window. Skip
      // rendering it here entirely so the main page has no visual trace
      // of it. The widget data still lives in state.pages, so closing
      // the popout window automatically docks it back into its original
      // slot (see notifyPopoutClosed).
      continue;
    }

    const node=renderWidget(w);
    node.style.left=(w.x||0)+'px';
    node.style.top=(w.y||0)+'px';
    node.style.width=(w.w||300)+'px';
    node.style.height=(w.h||200)+'px';
    cv.append(node);
    // Chromeless widgets fall into two camps:
    //   - indicator/label have no resize handle at all (size is a setting).
    //   - shape does have a corner-drag handle so the user can size the
    //     bounding box, since the rendered drawing fills it.
    if (w.type === 'indicator' || w.type === 'label') {
      makeDragResize(node, w, node.querySelector('.body'), null);
    } else if (w.type === 'statustext') {
      // Status text auto-sizes by default, but carries a shape-style corner
      // grabber (visible only in edit mode via the ui-locked CSS) — dragging
      // it switches the widget to manual size (opts.autoSize=false).
      makeDragResize(node, w, node.querySelector('.body'), node.querySelector('.shape-resize'));
    } else if (w.type === 'shape') {
      makeDragResize(node, w, node.querySelector('.body'), node.querySelector('.shape-resize'));
    } else {
      makeDragResize(node, w, node.querySelector('header'), node.querySelector('.resize'));
    }
  }
  updateDOButtons();
  msApplyVisual();   // re-render rebuilt the nodes; restore selection outlines
}

function renderWidget(w){
  let classList = 'widget';
  if (w.type === 'dobutton') classList += ' dobutton-widget';
  if (w.type === 'le') classList += ' le-widget';
  if (w.type === 'mathop') classList += ' mathop-widget';
  if (w.type === 'pidpanel') classList += ' pidpanel-widget';
  if (w.type === 'bars') classList += ' bars-widget';
  if (w.type === 'expr') classList += ' expr-widget';
  if (w.type === 'staticvar') classList += ' staticvar-widget';
  if (w.type === 'indicator') classList += ' indicator-widget';
  if (w.type === 'label') classList += ' label-widget';
  if (w.type === 'statustext') classList += ' statustext-widget';
  if (w.type === 'shape') classList += ' shape-widget';
  const box=el('div',{className:classList, id:'w_'+w.id});

  // Indicators, labels, status texts, and shapes are intentionally chromeless:
  // no header bar, no settings/close icons, no resize grabber. The whole body
  // is the drag handle, and a right-click (or double-click) opens settings;
  // a context menu lets you delete or reorder them without a visible ×.
  if (w.type === 'indicator' || w.type === 'label' || w.type === 'statustext' || w.type === 'shape') {
    const body = el('div', {className: 'body'});
    box.append(body);
    if      (w.type === 'indicator')  mountIndicator(w, body, box);
    else if (w.type === 'label')      mountLabel(w, body, box);
    else if (w.type === 'statustext') mountStatusText(w, body, box);
    else                              mountShape(w, body, box);
    return box;
  }
  
  const isCompact = (w.type === 'le' || w.type === 'mathop');
  
  let toolButtons;
  if (w.type === 'le') {
    toolButtons = IS_POPOUT ? [] :
      [el('span',{className:'icon', title:'Close', onclick:()=>removeWidget(w.id)}, '×')];
  } else if (w.type === 'expr') {
    // Inside a popout, drop × (would only modify the popout's own state.pages
    // copy). Pop-out lives in Settings, not on the header.
    toolButtons = IS_POPOUT ? [
      el('span',{className:'icon', title:'Debug View', onclick:()=>openExpressionDebug(w)}, '🔍'),
      el('span',{className:'icon', title:'Settings', onclick:()=>openWidgetSettings(w)}, '⚙'),
    ] : [
      el('span',{className:'icon', title:'Debug View', onclick:()=>openExpressionDebug(w)}, '🔍'),
      el('span',{className:'icon', title:'Settings', onclick:()=>openWidgetSettings(w)}, '⚙'),
      el('span',{className:'icon', title:'Close',    onclick:()=>removeWidget(w.id)}, '×')
    ];
  } else {
    toolButtons = IS_POPOUT ? [
      el('span',{className:'icon', title:'Settings', onclick:()=>openWidgetSettings(w)}, '⚙'),
    ] : [
      el('span',{className:'icon', title:'Settings', onclick:()=>openWidgetSettings(w)}, '⚙'),
      el('span',{className:'icon', title:'Close',    onclick:()=>removeWidget(w.id)}, '×')
    ];
  }
  
  const tools = el('div',{className:'tools'}, toolButtons);

  // Chart headers: title | │ | opts (fills remaining, no-wrap) | tools (pushed right)
  // Other widgets: title | spacer | opts | tools  (unchanged)
  let header;
  if (w.type === 'chart') {
    const sep = el('span', {style:'color:#3b425e;font-size:14px;padding:0 4px;align-self:center;flex-shrink:0;user-select:none'}, '│');
    const optsEl = el('div', {
      className:'opts',
      style:'flex:1;min-width:0;flex-wrap:nowrap;overflow:visible;gap:4px'
    }, widgetOptions(w));
    const toolsEl = el('div', {className:'tools', style:'margin-left:auto;flex-shrink:0'}, toolButtons);
    header = el('header', {style:'flex-wrap:nowrap;overflow:hidden'}, [
      el('span',{className:'title',style:'flex-shrink:0'}, w.opts.title||w.type),
      sep,
      optsEl,
      toolsEl
    ]);
  } else {
    header = el('header',{},[
      el('span',{className:'title'}, w.opts.title||w.type),
      el('div',{className:'spacer'}),
      el('div',{className:'opts'}, widgetOptions(w)),
      tools
    ]);
  }

  const body=el('div',{className:'body'});
  const rez=el('div',{className:'resize'});
  box.append(header,body,rez);
  switch(w.type){
    case 'chart':    mountChart(w,body); break;
    case 'gauge':    mountGauge(w,body); break;
    case 'bars':     mountBars(w,body); break;
    case 'dobutton': mountDOButton(w,body); break;
    case 'pidpanel': mountPIDPanel(w,body); break;
    case 'aoslider': mountAOSlider(w,body); break;
    case 'motor':    mountMotorController(w,body); break;
    case 'vfd':      mountVFDWidget(w,body); break;
    case 'drive':    mountDriveWidget(w,body); break;
    case 'le':       mountLEWidget(w,body); break;
    case 'mathop':   mountMathOpWidget(w,body); break;
    case 'expr':     mountExprWidget(w,body); break;
    case 'staticvar': mountStaticVarWidget(w,body); break;
    case 'console':  mountConsole(w,body); break;
    // 'indicator' is handled by the early-return branch at the top of
    // renderWidget (no header / no resize) — don't list it here.
  }
  return box;
}
function removeWidget(id){
  const page=state.pages[activePageIndex];
  const idx=page.widgets.findIndex(x=>x.id===id);
  if(idx>=0){ page.widgets.splice(idx,1); renderPage(); }
}

/**
 * Move a widget one position later in its page's widgets array. Since
 * renderPage iterates the array in order and each subsequent widget is
 * appended on top (later DOM order = later in the paint stack), "later
 * in the array" means "in front of" earlier widgets.
 */
function moveWidgetForward(id) {
  const page = state.pages[activePageIndex];
  const idx = page.widgets.findIndex(x => x.id === id);
  if (idx >= 0 && idx < page.widgets.length - 1) {
    const w = page.widgets.splice(idx, 1)[0];
    page.widgets.splice(idx + 1, 0, w);
    renderPage();
  }
}

/**
 * Move a widget one position earlier in its page's widgets array — i.e.
 * one step further behind the others in paint order.
 */
function moveWidgetBackward(id) {
  const page = state.pages[activePageIndex];
  const idx = page.widgets.findIndex(x => x.id === id);
  if (idx > 0) {
    const w = page.widgets.splice(idx, 1)[0];
    page.widgets.splice(idx - 1, 0, w);
    renderPage();
  }
}

/**
 * Move a widget to the very back of its page — drawn first, everything
 * else paints on top of it. Useful for shapes that act as background
 * highlights behind groups of widgets.
 */
function sendWidgetToBack(id) {
  const page = state.pages[activePageIndex];
  const idx = page.widgets.findIndex(x => x.id === id);
  if (idx > 0) {
    const w = page.widgets.splice(idx, 1)[0];
    page.widgets.unshift(w);
    renderPage();
  }
}

/**
 * Move a widget to the very front of its page — drawn last, in front of
 * everything else on this page.
 */
function sendWidgetToFront(id) {
  const page = state.pages[activePageIndex];
  const idx = page.widgets.findIndex(x => x.id === id);
  if (idx >= 0 && idx < page.widgets.length - 1) {
    const w = page.widgets.splice(idx, 1)[0];
    page.widgets.push(w);
    renderPage();
  }
}

/* ----------------------------- pop-out --------------------------------- */
// Map of popoutId -> { window, widget, ownerPageIndex }. Used to find a
// widget by its popout id when the popout window calls back to us, and to
// clean up if the user closes the popout via the OS close button.
const _popouts = new Map();

/**
 * Pop a widget out into its own browser window. Called from the widget's
 * header (or for chromeless widgets, from their context menu). The widget
 * stays in state.pages (so layout save/load still includes it), but gets
 * a popoutId and is skipped by the main page renderer.
 *
 * Note: window.open() must be called from a direct user gesture (click)
 * to bypass popup blockers — don't call this from any deferred path.
 */
function popOutWidget(w){
  if (IS_POPOUT) return;  // can't pop out from within a popout
  if (w.popoutId) {
    // Already popped — try to focus its window instead.
    const existing = _popouts.get(w.popoutId);
    if (existing && existing.window && !existing.window.closed) {
      existing.window.focus();
      return;
    }
    // Stale reference — clear it and re-pop.
    delete w.popoutId;
  }

  const id = genId();
  w.popoutId = id;

  // Size the window to match the widget's current size, so it pops out
  // looking the same size as the user remembers.
  const winW = Math.max(320, Math.min(2000, (w.w || 600) + 16));
  const winH = Math.max(200, Math.min(1500, (w.h || 400) + 39));
  // Window features:
  //   * popup — strips the browser chrome (no address bar, no tab strip,
  //     no menu, no status bar). The user wanted a clean widget-only
  //     window for multi-monitor layouts.
  //   * resizable=yes — explicitly allow the OS window border to be
  //     dragged. In modern Chrome/Edge this is the default for popups
  //     anyway, but specifying it is harmless and protects against older
  //     browsers or restrictive OS-level policies that would lock the
  //     window to its initial size.
  //   * menubar/toolbar/location/status=no — same goal, belt and braces:
  //     ignored by most modern browsers (popup covers them) but kept for
  //     Firefox and edge cases.
  const features = `popup,width=${winW},height=${winH},resizable=yes,menubar=no,toolbar=no,location=no,status=no`;

  let popWin;
  try {
    popWin = window.open(`/popout.html?popout=${encodeURIComponent(id)}`, '_blank', features);
  } catch (e) {
    console.warn('[popout] window.open failed:', e);
    popWin = null;
  }
  if (!popWin) {
    delete w.popoutId;
    alert('Could not open popout window — please allow popups for this site, then try again.');
    return;
  }

  // Find which page the widget lives on, since renderPage uses
  // activePageIndex and we need to render the right page when the popout
  // closes (which might not be the page that's active at the time).
  let ownerPageIndex = activePageIndex;
  for (let i = 0; i < state.pages.length; i++) {
    if (state.pages[i].widgets.some(x => x.id === w.id)) {
      ownerPageIndex = i;
      break;
    }
  }
  _popouts.set(id, { window: popWin, widget: w, ownerPageIndex });

  // Best-effort cleanup if the popout window gets closed but for some
  // reason doesn't fire its beforeunload notification (e.g. browser quit).
  const watcher = setInterval(() => {
    if (popWin.closed) {
      clearInterval(watcher);
      notifyPopoutClosed(id);
    }
  }, 1000);

  // Re-render the main page so this widget disappears from it.
  renderPage();
}

/**
 * Called by a popout window during its init to grab its widget config.
 * Returns the LIVE widget object (not a clone) so any changes to its
 * `opts` made via Settings in the main window are visible to the popout's
 * per-frame draw code.
 */
window.getPopoutWidget = function(popoutId) {
  const entry = _popouts.get(popoutId);
  if (!entry) return null;
  return entry.widget;
};

/**
 * Called by the popout window's beforeunload (or by our polling watcher
 * when window.closed flips true). Re-docks the widget into its original
 * page by clearing the popoutId and re-rendering.
 */
window.notifyPopoutClosed = function(popoutId) {
  const entry = _popouts.get(popoutId);
  if (!entry) return;
  _popouts.delete(popoutId);
  const w = entry.widget;
  if (w && w.popoutId === popoutId) {
    delete w.popoutId;
  }
  // If the user is currently looking at the owner page, refresh it.
  if (activePageIndex === entry.ownerPageIndex) {
    renderPage();
  }
};

function widgetOptions(w){
  const opts=[];
  if (w.type==='chart'||w.type==='gauge'||w.type==='bars'){
    const sel=el('select',{},[
      el('option',{value:'auto'}, 'Auto'),
      el('option',{value:'manual'}, 'Manual')
    ]);
    sel.value = w.opts.scale || 'auto';
    sel.onchange=e=>{ w.opts.scale=e.target.value; };
    const min=el('input',{type:'number',value:w.opts.min, step:'any', style:'width:90px'});
    const max=el('input',{type:'number',value:w.opts.max, step:'any', style:'width:90px'});
    const sync=()=>{ w.opts.min=parseFloat(min.value)||0; w.opts.max=parseFloat(max.value)||0; };
    min.oninput=sync; max.oninput=sync;
    // hideScaleUI (russ 7/26, kiosk): gauges/bars can hide the Scale/Min/Max
    // (and gauge Decimals) edit boxes -- checkbox in Settings. Charts keep them.
    if (!((w.type==='gauge'||w.type==='bars') && w.opts.hideScaleUI)) {
      opts.push(el('span',{},'Scale:'), sel, el('span',{},'Min:'), min, el('span',{},'Max:'), max);
    }

    // Gauge-only: place the Tare button on this header line so it sits
    // alongside (and resizes with) the Scale/Min/Max controls instead of
    // floating in the middle of the gauge graphic.
    if (w.type === 'gauge' && w.opts.scaleOp) {
      const tareBtn = el('button', {
        className: 'btn',
        style: 'font-size:11px;padding:4px 8px;background:#4a9eff;color:#0d1117'
      }, 'Tare');
      tareBtn.onclick = () => performGaugeTare(w, tareBtn);
      opts.push(tareBtn);
    }
  }
  if (w.type==='chart'){
    const span=el('input',{type:'number', value:w.opts.span, min:1, step:1, style:'width:70px'});
    span.oninput=()=>{
      const newSpan = parseFloat(span.value)||10;
      w.opts.span = newSpan;
      if (!w.view || !w.view.paused) {
        if (w.view) w.view.span = newSpan;
      }
      const buf = chartBuffers.get(w.id);
      if (buf && buf.length) {
        const frozen = (w.view && w.view.paused) || (w.opts && w.opts.paused);
        if (!frozen) {
          const t = performance.now()/1000;
          const bufferDepth = newSpan * 1.2;
          while (buf.length && (t - buf[0].t) > bufferDepth) buf.shift();
        }
      }
    };

    const filt=el('input',{type:'number', value:w.opts.filterHz||0, min:0, step:'any', style:'width:52px'});
    filt.oninput=()=>{ w.opts.filterHz=parseFloat(filt.value)||0; };

    // History-retention multiplier ("Keep×"): how much data to keep, in
    // multiples of the chart span (1-100). Live keeps keep*span of scrollback;
    // paused keeps ~keep*span split around the freeze. Default 4 (~4 spans).
    const keep=el('input',{type:'number', value:(w.opts.bufMult||4), min:1, max:100, step:1,
      title:'History kept = this × span (1–100). e.g. 100 ≈ 100 spans of data.',
      style:'width:46px'});
    keep.oninput=()=>{ w.opts.bufMult = Math.max(1, Math.min(100, parseInt(keep.value)||4)); };

    const yGrid=el('input',{type:'number', value:w.opts.yGridLines||5, min:2, max:20, step:1, style:'width:60px'});
    yGrid.oninput=()=>{ w.opts.yGridLines=parseInt(yGrid.value)||5; };

    const pause=el('button',{
      className:'btn',
      style:'padding:3px 7px;font-size:11px',
      onclick:()=>{
      if (replayMode === 'playing') {
        // In replay playback: pause the whole playback
        pauseReplay();
        pause.textContent = '▶ Resume';
      } else if (replayMode === 'paused' && replayIndex > 0 && replayIndex < (replayData?.rows?.length ?? 0)) {
        // Mid-playback pause: resume
        playReplay();
        pause.textContent = '⏸ Pause';
      } else {
        // Live mode: freeze/unfreeze just this chart's view
        w.opts.paused = !w.opts.paused;
        if (w.opts.paused) {
          const buf = chartBuffers.get(w.id) || [];
          if (buf.length) w.opts.tFreeze = buf[buf.length - 1].t;
        } else {
          w.opts.tFreeze = null;
        }
        pause.textContent = w.opts.paused ? '▶ Resume' : '⏸ Pause';
      }
    }}, w.opts.paused ? '▶ Resume' : '⏸ Pause');
    // Store ref so draw() can keep button text in sync with replay state
    w._pauseBtn = pause;

    // Zoom level badge — mountChart stores a ref to update it each frame
    const zoomBadge = el('span', {
      style: 'font-size:11px;padding:2px 6px;background:#1e2235;border-radius:4px;color:#a8b3cf;cursor:default;user-select:none',
      title: 'Current zoom level (1.00× = full span)'
    }, '🔍 1.00×');
    w._zoomBadgeEl = zoomBadge;

    // Full-span button
    const fullSpanBtn = el('button', {
      className: 'btn',
      title: 'Reset to full span (also: double-click chart)',
      style: 'padding:3px 7px;font-size:11px',
      onclick: () => { if (w._resetZoom) w._resetZoom(); }
    }, '⟷ Full');

    opts.push(
      el('span',{},'Span[s]:'), span,
      el('span',{},'Filter[Hz]:'), filt,
      el('span',{title:'History kept = this × span (1–100)'},'Keep×:'), keep,
      el('span',{},'Y Grid:'), yGrid,
      pause,
      zoomBadge,
      fullSpanBtn
    );

    // Clip/Save buttons — only meaningful in replay mode, but always present
    // so the header layout is stable; they're greyed out when no log is loaded.
    const clipBtn = el('button', {
      className: 'btn',
      title: 'Clip log to current view window (full detail)',
      style: 'padding:3px 7px;font-size:11px',
      onclick: () => clipLogToView(w)
    }, '✂ Clip');

    const saveBtn = el('button', {
      className: 'btn',
      title: 'Save clipped log to CSV file',
      style: 'padding:3px 7px;font-size:11px',
      onclick: () => saveClippedLog(w)
    }, '💾 Save');

    // Store refs so we can update enabled state from draw()
    w._clipBtn = clipBtn;
    w._saveBtn = saveBtn;

    // Initial enabled state — clip needs paused view, save always available if buffer has data
    const isPaused = w.view && w.view.paused;
    clipBtn.disabled = !isPaused;
    saveBtn.disabled = false; // always available; saveClippedLog handles empty case gracefully
    if (!isPaused) { clipBtn.style.opacity='0.4'; }

    // Print button — captures the chart canvas + legend and opens a print
    // dialog in a new window. Works in both live and replay mode.
    const printBtn = el('button', {
      className: 'btn',
      title: 'Print this chart',
      style: 'padding:3px 7px;font-size:11px',
      onclick: () => printChart(w)
    }, '🖨 Print');

    opts.push(clipBtn, saveBtn, printBtn);
  }
  if (w.type==='bars'){
    const yGrid=el('input',{type:'number', value:w.opts.yGridLines||5, min:2, max:20, step:1, style:'width:60px'});
    yGrid.oninput=()=>{ w.opts.yGridLines=parseInt(yGrid.value)||5; };
    opts.push(el('span',{},'Y Grid:'), yGrid);
  }
  return opts;
}
const chartBuffers=new Map();
const chartRawBuffers=new Map(); // w.id -> full-resolution replay buffer (never decimated)
const chartFilters=new Map();
const chartCursor=new Map(); // w.id -> {x: number|null, mode:'follow'|'current', ctxEl:HTMLElement|null}
const chartRAFHandles=new Map(); // w.id -> {rafId: number, isRunning: boolean}
// Pan state stored per widget-id so it survives mountChart re-renders
const chartPan=new Map(); // w.id -> {dragging,startX,startTFreeze,reDecimateTimer}


function mountChart(w, body){
  const legend=el('div',{className:'legend'}); body.append(legend);
  const canvas=el('canvas'); body.append(canvas);
  const ctx=canvas.getContext('2d');

  // Stash refs so the Print button (and any other external action) can grab
  // the rendered image and the legend HTML.
  w._canvas = canvas;
  w._legend = legend;

  // Initialize view state
  w.view = w.view || { span: (window.GLOBAL_BUFFER_SPAN || 10), paused: false, tFreeze: 0 };
  w.opts.yGridLines = w.opts.yGridLines || 5;

  // Sync initial span
  if (!w.opts.span) {
    w.opts.span = w.view.span;
  } else {
    w.view.span = w.opts.span;
  }

  w._zoomBadgeEl = w._zoomBadgeEl || null;

  /* ---- getZoomRatio: >1 means zoomed IN (viewing less than full span) ---- */
  function getZoomRatio() {
    const fullSpan = w.opts.span || window.GLOBAL_BUFFER_SPAN || 10;
    return fullSpan / Math.max(0.001, w.view.span);
  }

  /* ---- resetToFullSpan: show everything, resume live if no log ---- */
  function resetToFullSpan() {
    if (replayMode !== null) {
      // Replay mode: show the entire loaded log, re-decimate from full raw buffer
      const raw = chartRawBuffers.get(w.id);
      if (raw && raw.length) {
        chartBuffers.set(w.id, lttbDecimate(raw, CHART_MAX_RENDER_PTS));
      }
      const buf = chartBuffers.get(w.id) || [];
      if (buf.length) {
        const logSpan = buf[buf.length-1].t - buf[0].t;
        w.view.span = Math.max(0.1, logSpan);
        w.view.tFreeze = buf[buf.length-1].t;
        w.view.paused = true;
      }
    } else {
      // Live mode: restore to configured span and resume scrolling
      w.view.span = w.opts.span || window.GLOBAL_BUFFER_SPAN || 10;
      w.view.paused = false;
      w.view.tFreeze = 0;
      w.opts.paused = false;
      w.opts.tFreeze = null;
    }
  }

  /* ---- MOUSE WHEEL: zoom centered on cursor ---- */
  // Track last known cursor X for centering
  let lastCursorX = null;
  // Debounce re-decimation: only re-slice raw buffer after wheel stops
  let reDecimateTimer = null;

  canvas.addEventListener('wheel', (ev)=>{
    ev.preventDefault();
    const buf = chartBuffers.get(w.id) || [];
    const latestT = buf.length ? buf[buf.length-1].t : performance.now()/1000;

    if (ev.shiftKey){
      // Shift+wheel: change base opts.span globally
      window.GLOBAL_BUFFER_SPAN = Math.max(1, Math.min(3600,
        (window.GLOBAL_BUFFER_SPAN || 10) * (ev.deltaY > 0 ? 1.15 : 1/1.15)));
      for (const p of state.pages){
        for (const w2 of p.widgets){
          if (w2.type !== 'chart') continue;
          w2.view = w2.view || { span: window.GLOBAL_BUFFER_SPAN, paused:false, tFreeze:0 };
          if (!w2.view.paused) {
            w2.view.span = window.GLOBAL_BUFFER_SPAN;
            w2.opts.span = window.GLOBAL_BUFFER_SPAN;
          }
        }
      }
      return;
    }

    // --- Compute the anchor fraction (cursor position for both zoom in AND out) ---
    const rect = canvas.getBoundingClientRect();
    const cursorPx = (lastCursorX !== null) ? lastCursorX : (rect.width / 2);
    const plotL = 60, plotR = rect.width - 10;
    const plotW = plotR - plotL;
    const frac = Math.max(0, Math.min(1, (cursorPx - plotL) / Math.max(1, plotW)));

    // Current view window
    const curSpan = w.view.paused ? w.view.span : (w.opts.span || window.GLOBAL_BUFFER_SPAN || 10);
    const curT1 = w.view.paused
      ? (w.view.tFreeze || latestT)
      : (w.opts.paused && w.opts.tFreeze != null ? w.opts.tFreeze : latestT);
    const curT0 = curT1 - curSpan;
    const tUnderCursor = curT0 + frac * curSpan;

    // New span after zoom
    const newSpan = Math.max(0.1, Math.min(3600, curSpan * (ev.deltaY > 0 ? 1.15 : 1/1.15)));

    // Recompute tFreeze so tUnderCursor stays under the cursor
    // tUnderCursor = newT0 + frac * newSpan  =>  newT1 = tUnderCursor + (1-frac)*newSpan
    let newT1 = tUnderCursor + (1 - frac) * newSpan;

    // Clamp using raw buffer bounds when in replay (true extent), else display buffer
    const clampBuf = (chartRawBuffers.get(w.id) || buf);
    if (clampBuf.length) {
      const tMax = clampBuf[clampBuf.length-1].t;
      const tMin = clampBuf[0].t;
      // If right edge would exceed tMax, slide the whole window left
      // (preserves cursor-relative position instead of pinning right edge)
      if (newT1 > tMax) newT1 = tMax;
      // If left edge would go before tMin, push right edge forward to compensate
      if (newT1 - newSpan < tMin) newT1 = tMin + newSpan;
      // Final safety clamp
      newT1 = Math.min(tMax, newT1);
    }

    w.view.span = newSpan;
    w.view.tFreeze = newT1;
    w.view.paused = true;

    // In replay mode, schedule a re-decimation from the raw buffer after
    // the user stops scrolling (300 ms debounce)
    if (replayMode !== null && chartRawBuffers.has(w.id)) {
      if (reDecimateTimer) clearTimeout(reDecimateTimer);
      reDecimateTimer = setTimeout(() => {
        reDecimateTimer = null;
        const t1 = w.view.tFreeze;
        const t0 = t1 - w.view.span;
        reDecimateReplayWindow(w, t0, t1);
      }, 300);
    }

  }, {passive:false});

  /* ---- DOUBLE-CLICK: reset to full span ---- */
  canvas.addEventListener('dblclick', resetToFullSpan);

  /* ---- PAN: left-button drag while paused ----
     State is stored in chartPan map (keyed by w.id) so it survives
     mountChart being called again on re-render. Each mount replaces
     the canvas element, so we attach fresh listeners to the new canvas
     but read/write shared state from the map.                         */
  if (!chartPan.has(w.id)) chartPan.set(w.id, {dragging:false, startX:0, startTFreeze:0, reDecimateTimer:null});

  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    if (!w.view || !w.view.paused) return;
    const pan = chartPan.get(w.id);
    const buf = chartBuffers.get(w.id) || [];
    pan.dragging = true;
    pan.startX = e.clientX;
    pan.startTFreeze = w.view.tFreeze || (buf.length ? buf[buf.length-1].t : performance.now()/1000);
    canvas.style.cursor = 'grabbing';
    e.preventDefault();
  });

  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    lastCursorX = x;
    const cur = chartCursor.get(w.id);
    if (cur) { cur.x = x; chartCursor.set(w.id, cur); }

    const pan = chartPan.get(w.id);
    if (!pan || !pan.dragging || !w.view || !w.view.paused) return;

    const plotW = rect.width - 70;
    const dtPerPx = w.view.span / Math.max(1, plotW);
    const dx = e.clientX - pan.startX;
    let newFreeze = pan.startTFreeze - dx * dtPerPx;

    // Clamp using raw buffer when available (true time extent of log)
    const raw = chartRawBuffers.get(w.id);
    const buf = (raw && raw.length) ? raw : (chartBuffers.get(w.id) || []);
    if (buf.length) {
      const tMax = buf[buf.length-1].t;
      const tMin = buf[0].t + w.view.span;
      newFreeze = (tMax > tMin) ? Math.max(tMin, Math.min(tMax, newFreeze)) : tMax;
    }
    w.view.tFreeze = newFreeze;
  });

  const endPan = (e) => {
    const pan = chartPan.get(w.id);
    if (!pan || !pan.dragging) return;
    pan.dragging = false;
    canvas.style.cursor = '';
    // Re-decimate after pan in replay mode
    if (replayMode !== null && chartRawBuffers.has(w.id)) {
      if (pan.reDecimateTimer) clearTimeout(pan.reDecimateTimer);
      pan.reDecimateTimer = setTimeout(() => {
        pan.reDecimateTimer = null;
        const t1 = w.view.tFreeze;
        const t0 = t1 - w.view.span;
        reDecimateReplayWindow(w, t0, t1);
      }, 150);
    }
  };
  canvas.addEventListener('mouseup', endPan);
  // Also catch mouseup outside canvas (user drags beyond boundary then releases)
  // endPan is a no-op when pan.dragging is false so this is safe.
  document.addEventListener('mouseup', endPan);
  // Do NOT call endPan on mouseleave — dragging outside the canvas is normal.
  canvas.addEventListener('mouseleave', (e) => {
    const cur = chartCursor.get(w.id);
    if (cur) { cur.x = null; chartCursor.set(w.id, cur); }
  });

  canvas.addEventListener('contextmenu', (e)=>{
    e.preventDefault();
    const cur = chartCursor.get(w.id) || {x:null, mode:'follow', ctxEl:null};
    if (cur.ctxEl && cur.ctxEl.parentNode) cur.ctxEl.parentNode.removeChild(cur.ctxEl);
    const menu = buildChartContextMenu(w, canvas, legend);
    document.body.append(menu);
    menu.style.left = e.pageX + 'px';
    menu.style.top  = e.pageY + 'px';
    cur.ctxEl = menu; chartCursor.set(w.id, cur);
  });

  chartCursor.set(w.id, {x:null, mode:w.opts.cursorMode||'follow', ctxEl:null});

  w._resetZoom = resetToFullSpan;
  w._getZoomRatio = getZoomRatio;

  function draw(){
    const buf = chartBuffers.get(w.id) || [];
    const W = canvas.clientWidth, H = canvas.clientHeight;
    canvas.width = W; canvas.height = H;
    const plotL = 60, plotR = W - 10, plotT = 10, plotB = H - 30;

    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = '#3b425e'; ctx.lineWidth = 1;
    ctx.strokeRect(plotL, plotT, plotR - plotL, plotB - plotT);

    // Update zoom badge
    if (w._zoomBadgeEl) {
      const zr = getZoomRatio();
      const txt = `🔍 ${zr.toFixed(2)}×`;
      if (w._zoomBadgeEl.textContent !== txt) w._zoomBadgeEl.textContent = txt;
      w._zoomBadgeEl.style.color = (zr > 1.02) ? '#f7768e' : '#a8b3cf';
    }
    // Update clip/save button enabled state
    if (w._pauseBtn) {
      if (replayMode === 'playing') {
        w._pauseBtn.textContent = '⏸ Pause';
      } else if (replayMode === 'paused' && replayIndex > 0 && replayIndex < (replayData?.rows?.length ?? 0)) {
        w._pauseBtn.textContent = '▶ Resume';
      } else if (replayMode === null) {
        w._pauseBtn.textContent = w.opts.paused ? '▶ Resume' : '⏸ Pause';
      }
    }
    if (w._clipBtn) {
      const canClip = w.view && w.view.paused;
      w._clipBtn.disabled = !canClip;
      w._clipBtn.style.opacity = canClip ? '1' : '0.4';
    }
    if (w._saveBtn) {
      // Save is always available when there's any data
      const hasBuf = (chartBuffers.get(w.id) || []).length > 0;
      w._saveBtn.disabled = !hasBuf;
      w._saveBtn.style.opacity = hasBuf ? '1' : '0.4';
    }

    if (!buf.length) {
      const rafState = chartRAFHandles.get(w.id) || {isRunning: false};
      rafState.isRunning = true;
      rafState.rafId = requestAnimationFrame(draw);
      chartRAFHandles.set(w.id, rafState);
      return;
    }

    // ---- Determine the time window to display ----
    // viewSpan: how many seconds are shown
    // t1: the right edge (latest visible time)
    // t0: the left edge
    const viewSpan = w.view.paused
      ? w.view.span
      : (w.opts.span || window.GLOBAL_BUFFER_SPAN || 10);

    let t1;
    if (w.view.paused) {
      // Zoom/pan paused: tFreeze is the right edge, held fixed
      t1 = w.view.tFreeze;
      if (!t1) {
        t1 = buf[buf.length-1].t;
        w.view.tFreeze = t1;
      }
    } else if (w.opts.paused && w.opts.tFreeze != null) {
      // Manual pause button
      t1 = w.opts.tFreeze;
    } else {
      // Live: right edge always tracks the latest sample
      t1 = buf[buf.length-1].t;
    }
    const t0 = t1 - viewSpan;

    // ---- Slice visible window from buffer ----
    // Use binary search for performance on large buffers
    let lo = 0, hi = buf.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (buf[mid].t < t0) lo = mid + 1; else hi = mid;
    }
    // lo is now the first index with t >= t0
    // Find last index with t <= t1
    let hi2 = buf.length - 1;
    let lo2 = lo;
    while (lo2 < hi2) {
      const mid = (lo2 + hi2 + 1) >> 1;
      if (buf[mid].t > t1) hi2 = mid - 1; else lo2 = mid;
    }
    const viewBufRaw = buf.slice(lo, lo2 + 1);

    if (!viewBufRaw.length) {
      const rafState = chartRAFHandles.get(w.id) || {isRunning: false};
      rafState.isRunning = true;
      rafState.rafId = requestAnimationFrame(draw);
      chartRAFHandles.set(w.id, rafState);
      return;
    }

    // ---- Decimation on the visible slice ----
    // Pixel-stride (stable, flicker-free) for live scrolling and replay playback.
    // LTTB (best visual shape) only for paused replay where the buffer is static.
    const plotW = Math.max(1, plotR - plotL);
    let viewBuf;
    if (replayMode === 'paused') {
      // Static full-log view: LTTB for best shape fidelity
      const fullSpan = w.opts.span || window.GLOBAL_BUFFER_SPAN || 10;
      const zoomRatio = fullSpan / Math.max(0.001, viewSpan);
      const targetPts = decimTargetForZoom(zoomRatio);
      viewBuf = lttbDecimate(viewBufRaw, targetPts);
    } else {
      // Live scrolling or animated replay playback: pixel-stride, no flicker
      viewBuf = pixelStride(viewBufRaw, plotW);
    }

    const dt = Math.max(1e-6, t1 - t0);

    // ---- Y range ----
    let ymin = Infinity, ymax = -Infinity;
    for (let si = 0; si < w.opts.series.length; si++){
      const s = w.opts.series[si];
      const dScale  = s.displayScale  !== undefined ? s.displayScale  : 1.0;
      const dOffset = s.displayOffset !== undefined ? s.displayOffset : 0.0;
      for (const b of viewBuf){
        const dv = (b.v[si] * dScale) + dOffset;
        if (dv < ymin) ymin = dv;
        if (dv > ymax) ymax = dv;
      }
    }
    if (w.opts.scale === 'manual') { ymin = w.opts.min; ymax = w.opts.max; }
    if (!isFinite(ymin) || !isFinite(ymax) || ymin === ymax) { ymin -= 1; ymax += 1; }

    const yscale = (plotB - plotT) / (ymax - ymin);
    const xscale = (plotR - plotL) / dt;

    // ---- X grid ----
    const gridDt = viewSpan / 10;
    const firstGrid = Math.ceil(t0 / gridDt) * gridDt;
    ctx.strokeStyle = (getComputedStyle(document.documentElement).getPropertyValue('--grid') || '#2a2f44').trim();
    ctx.lineWidth = 1;
    for (let gx = firstGrid; gx <= t1 + 1e-6; gx += gridDt){
      const x = plotL + (gx - t0) * xscale;
      ctx.beginPath(); ctx.moveTo(x, plotT); ctx.lineTo(x, plotB); ctx.stroke();
    }

    // ---- X-axis time labels (at major grid positions) ----
    // Adaptive precision: tight zooms get more decimals, wide spans get fewer.
    // gridDt is the spacing between major grid lines, in seconds.
    let xDecimals;
    if      (gridDt >= 60)  xDecimals = 0;
    else if (gridDt >= 1)   xDecimals = 1;
    else if (gridDt >= 0.1) xDecimals = 2;
    else                    xDecimals = 3;

    ctx.fillStyle = '#7a8199';
    ctx.font = '11px system-ui';
    ctx.textBaseline = 'top';
    const labelY = plotB + 4;  // sits in the 30px bottom margin
    for (let gx = firstGrid; gx <= t1 + 1e-6; gx += gridDt){
      const x = plotL + (gx - t0) * xscale;
      // Edge-aware alignment so labels at the extremes don't clip
      if (x < plotL + 18) {
        ctx.textAlign = 'left';
      } else if (x > plotR - 18) {
        ctx.textAlign = 'right';
      } else {
        ctx.textAlign = 'center';
      }
      // x labels are relative to the session clock origin (Start New Log with
      // 'reset clocks' sets _chartT0 so the axis reads from 0)
      ctx.fillText((gx - (window._chartT0 || 0)).toFixed(xDecimals), x, labelY);
    }
    ctx.textAlign = 'left';   // restore default for downstream draws
    ctx.textBaseline = 'alphabetic';

    // ---- Y grid ----
    const yGridLines = Math.max(2, Math.min(20, w.opts.yGridLines || 5));
    ctx.strokeStyle = (getComputedStyle(document.documentElement).getPropertyValue('--grid') || '#2a2f44').trim();
    ctx.lineWidth = 1;
    ctx.fillStyle = '#7a8199';
    ctx.font = '11px system-ui';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= yGridLines; i++){
      const frac = i / yGridLines;
      const y = plotB - frac * (plotB - plotT);
      const val = ymin + frac * (ymax - ymin);
      ctx.beginPath(); ctx.moveTo(plotL, y); ctx.lineTo(plotR, y); ctx.stroke();
      ctx.fillText(val.toFixed(2), plotL - 5, y);
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(122, 129, 153, 0.6)';
      ctx.fillText(val.toFixed(2), (plotL + plotR) / 2, y - 2);
      ctx.fillStyle = '#7a8199';
      ctx.textAlign = 'right';
    }

    // ---- Draw series ----
    legend.innerHTML = '';
    const customColors = (w.opts.series || []).map(s => s.color);
    (w.opts.series || []).forEach((s, si) => {
      const dScale  = s.displayScale  !== undefined ? s.displayScale  : 1.0;
      const dOffset = s.displayOffset !== undefined ? s.displayOffset : 0.0;
      ctx.beginPath();
      let first = true;
      for (const b of viewBuf){
        const dv = (b.v[si] * dScale) + dOffset;
        const x = plotL + (b.t - t0) * xscale;
        const y = plotB - (dv - ymin) * yscale;
        if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = colorFor(si, customColors);
      ctx.lineWidth = 2;
      ctx.stroke();
      const lab = (s.name && s.name.length) ? s.name : labelFor(s);
      legend.append(el('div', {className:'item'}, [
        el('span', {className:'swatch', style:`background:${colorFor(si, customColors)}`}, ''),
        lab
      ]));
    });

    // ---- Per-series target lines (optional) ----
    // Drawn as a horizontal line across the whole plot area at the target's
    // Y position, in the user-chosen target color (defaults to red). Each
    // series has its own optional target so multiple redlines can stack.
    // The label sits at the right edge so it doesn't clip series data.
    (w.opts.series || []).forEach((s, si) => {
      const targetVal = resolveTargetValue(s);
      if (targetVal === null) return;
      if (targetVal < ymin || targetVal > ymax) return;  // off-screen, skip
      const targetColor = s.targetColor || '#ff4d4d';
      const y = plotB - (targetVal - ymin) * yscale;
      ctx.save();
      ctx.strokeStyle = targetColor;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);  // dashed so it's distinguishable from data lines
      ctx.beginPath();
      ctx.moveTo(plotL, y);
      ctx.lineTo(plotR, y);
      ctx.stroke();
      ctx.setLineDash([]);
      // Tiny label at the right edge so it's clear which series this targets
      const lab = (s.name && s.name.length) ? s.name : labelFor(s);
      const labelText = `▸ ${lab}: ${targetVal.toFixed(2)}`;
      ctx.fillStyle = targetColor;
      ctx.font = '10px system-ui';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText(labelText, plotR - 2, y - 2);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.restore();
    });

    // ---- Checklist check-mark overlay ----
    // Draw a vertical dashed amber line for each checklist mark in the view window
    const marks = window._chartMarks || [];
    if (marks.length) {
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#e8a030'; // amber/orange-yellow
      ctx.fillStyle = '#e8a030';
      ctx.font = '9px system-ui';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      for (const mark of marks) {
        if (mark.t < t0 || mark.t > t1) continue;
        const mx = plotL + (mark.t - t0) * xscale;
        ctx.beginPath(); ctx.moveTo(mx, plotT); ctx.lineTo(mx, plotB); ctx.stroke();
        if (mark.label) {
          ctx.fillText(mark.label.slice(0, 20), mx + 2, plotT + 2);
        }
      }
      ctx.setLineDash([]);
      ctx.restore();
    }

    // ---- Cursor & popup ----
    const cur = chartCursor.get(w.id);
    if (cur && cur.x !== null && cur.x >= plotL && cur.x <= plotR){
      ctx.strokeStyle = (getComputedStyle(document.documentElement).getPropertyValue('--cursor') || '#ff4d4d').trim();
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cur.x, plotT); ctx.lineTo(cur.x, plotB); ctx.stroke();
      if (cur.ctxEl && cur.ctxEl.parentNode){
        updateChartPopupValues(w, cur.ctxEl, viewBuf, t0, xscale, plotL, ymin, ymax,
          (plotB - plotT) / (ymax - ymin), cur.x);
      }
    } else if (cur && cur.ctxEl && cur.ctxEl.parentNode && getPopupMode(cur.ctxEl) === 'current'){
      updateChartPopupValues(w, cur.ctxEl, viewBuf, t0, xscale, plotL, ymin, ymax,
        (plotB - plotT) / (ymax - ymin), null);
    }

    // ---- Hint when paused ----
    const _pan = chartPan.get(w.id);
    if (w.view.paused && !(_pan && _pan.dragging)){
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.font = '10px system-ui';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText('drag to pan  •  dbl-click to reset', plotR - 4, plotT + 2);
    }

    const rafState = chartRAFHandles.get(w.id) || {isRunning: false};
    rafState.isRunning = true;
    rafState.rafId = requestAnimationFrame(draw);
    chartRAFHandles.set(w.id, rafState);
  }

  draw();
}


function buildChartContextMenu(w, canvas, legend){
  const menu=el('div',{className:'ctx persistent'});

  // Add close button at top right
  const closeBtn = el('button', {
    className: 'ctx-close',
    onclick: () => {
      if (menu.parentNode) {
        menu.parentNode.removeChild(menu);
      }
      const cur = chartCursor.get(w.id);
      if (cur) {
        cur.ctxEl = null;
        chartCursor.set(w.id, cur);
      }
    }
  }, '×');

  const header = el('div', {className: 'ctx-header'}, [
    el('h4', {}, (w.opts.title||'Chart')+' – Data'),
    closeBtn
  ]);

  const cur=chartCursor.get(w.id)||{mode:'follow', sigDigits:2, showSlope:false};

  // Compact layout: Follow / Slope on one line, Current / Digits on second line.
  // Radio group name is PER-WIDGET: radio groups are document-global, so a shared
  // name:'mode' made every open data popup one group -- selecting Current on one
  // chart blanked the selection on all the others.
  const modeGroup = `mode_${w.id}`;
  const follow=el('label',{style:'margin-right:12px'},[
    el('input',{type:'radio',name:modeGroup,value:'follow'}),
    'Follow'
  ]);

  const slope=el('label',{},[
    el('input',{type:'checkbox',name:'showSlope'}),
    'Slope'
  ]);

  const current=el('label',{style:'margin-right:8px'},[
    el('input',{type:'radio',name:modeGroup,value:'current'}),
    'Current'
  ]);

  // Sig digits: just spinner + "#.##"
  const sigDigits = el('input', {
    type:'number', 
    name:'sigDigits', 
    min:0, 
    max:10, 
    step:1, 
    value:cur.sigDigits||2,
    style:'width:45px;margin-right:4px'
  });
  
  const digitsLabel = el('span', {style:'display:inline-flex;align-items:center;gap:4px'}, [
    sigDigits,
    el('span', {style:'color:#7a8199;font-size:11px'}, '#.##')
  ]);

  setTimeout(()=>{
    const radios=menu.querySelectorAll(`input[type=radio][name="${modeGroup}"]`);
    radios.forEach(r=>{ if (r.value=== (cur.mode||'follow')) r.checked=true; });
    const slopeChk = menu.querySelector('input[name=showSlope]');
    if (slopeChk) slopeChk.checked = cur.showSlope || false;
  });

  menu.append(
    header, 
    el('div',{className:'row', style:'display:flex;gap:8px;align-items:center'}, [follow, slope]),
    el('div',{className:'row', style:'display:flex;gap:8px;align-items:center'}, [current, digitsLabel])
  );

  const table=el('table',{},[
    el('thead',{}, el('tr',{}, [
      el('th',{},'Series'), 
      el('th',{},'Value'),
      el('th',{id:`slope-header-${w.id}`, style:'display:none'},'Slope')
    ])),
    el('tbody',{})
  ]);
  menu.append(table);

  menu.addEventListener('change',(e)=>{
    if (e.target && String(e.target.name).startsWith('mode')){
      const cur=chartCursor.get(w.id)||{x:null, mode:'follow', ctxEl:menu, sigDigits:2, showSlope:false};
      cur.mode=e.target.value;
      chartCursor.set(w.id,cur);
    }
    if (e.target && e.target.name==='sigDigits'){
      const cur=chartCursor.get(w.id)||{x:null, mode:'follow', ctxEl:menu, sigDigits:2, showSlope:false};
      cur.sigDigits=parseInt(e.target.value)||2;
      chartCursor.set(w.id,cur);
    }
    if (e.target && e.target.name==='showSlope'){
      const cur=chartCursor.get(w.id)||{x:null, mode:'follow', ctxEl:menu, sigDigits:2, showSlope:false};
      cur.showSlope=e.target.checked;
      chartCursor.set(w.id,cur);
      // Show/hide slope column
      const slopeHeader = menu.querySelector(`#slope-header-${w.id}`);
      if (slopeHeader) slopeHeader.style.display = cur.showSlope ? '' : 'none';
      const slopeCells = menu.querySelectorAll('.slope-cell');
      slopeCells.forEach(cell => cell.style.display = cur.showSlope ? '' : 'none');
    }
  });

  // Make it draggable by the header
  makeDraggable(menu, header);

  return menu;
}

// Add a simple draggable function for the popup:
function makeDraggable(element, handle){
  let isDragging = false;
  let startX, startY, initialLeft, initialTop;

  handle.style.cursor = 'move';

  handle.addEventListener('mousedown', (e)=>{
    // Don't drag if clicking on close button or inputs
    if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') return;

    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;

    const rect = element.getBoundingClientRect();
    initialLeft = rect.left;
    initialTop = rect.top;

    e.preventDefault();
  });

  document.addEventListener('mousemove', (e)=>{
    if (!isDragging) return;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    element.style.left = (initialLeft + dx) + 'px';
    element.style.top = (initialTop + dy) + 'px';
  });

  document.addEventListener('mouseup', ()=>{
    isDragging = false;
  });
}

function getPopupMode(menu){
  const v=menu.querySelector('input[type=radio][name^="mode"]:checked'); return v ? v.value : 'follow';
}
function updateChartPopupValues(w, menu, buf, t0, xscale, plotL, ymin, ymax, yscale, cursorX){
  const mode=getPopupMode(menu);
  const tbody = menu.querySelector('tbody'); if(!tbody) return;
  
  // Get sig digits and showSlope from cursor state or menu
  const cur = chartCursor.get(w.id);
  let sigDigits = cur?.sigDigits || 2;
  let showSlope = cur?.showSlope || false;
  
  const sigInput = menu.querySelector('input[name=sigDigits]');
  if (sigInput && sigInput.value) {
    sigDigits = parseInt(sigInput.value) || 2;
  }
  
  const slopeChk = menu.querySelector('input[name=showSlope]');
  if (slopeChk) {
    showSlope = slopeChk.checked;
  }
  
  // Update slope header visibility
  const slopeHeader = menu.querySelector(`#slope-header-${w.id}`);
  if (slopeHeader) slopeHeader.style.display = showSlope ? '' : 'none';
  
  const vals=[];
  if (!buf.length){ tbody.innerHTML=''; return; }
  
  let targetIdx = buf.length - 1; // Current by default
  if (mode==='follow' && cursorX!==null){
    const t = t0 + (cursorX-plotL)/xscale;
    targetIdx = findNearestIndex(buf, t);
  }
  
  const v = buf[targetIdx].v;
  const t_current = buf[targetIdx].t;
  
  // Calculate slopes (units/second) averaged over 1s window or chart span if < 1s
  const slopeWindow = Math.min(1.0, w.opts.span || 1.0);
  const t_past = t_current - slopeWindow;
  
  (w.opts.series||[]).forEach((s,si)=>{ 
    let slope = null;
    if (showSlope && buf.length > 1) {
      // Collect all points in the 1s window
      const windowPoints = [];
      for (let i = 0; i < buf.length; i++) {
        if (buf[i].t >= t_past && buf[i].t <= t_current) {
          const val = buf[i].v[si];
          if (val !== null && isFinite(val)) {
            windowPoints.push({t: buf[i].t, v: val});
          }
        }
      }
      
      // Calculate average slope using linear regression
      if (windowPoints.length >= 2) {
        const n = windowPoints.length;
        let sum_t = 0, sum_v = 0, sum_tv = 0, sum_tt = 0;
        
        for (const pt of windowPoints) {
          sum_t += pt.t;
          sum_v += pt.v;
          sum_tv += pt.t * pt.v;
          sum_tt += pt.t * pt.t;
        }
        
        // Linear regression: slope = (n*sum_tv - sum_t*sum_v) / (n*sum_tt - sum_t*sum_t)
        const denominator = n * sum_tt - sum_t * sum_t;
        if (Math.abs(denominator) > 1e-10) {
          slope = (n * sum_tv - sum_t * sum_v) / denominator;
        }
      }
    }
    
    // Get units for this series
    let units = '';
    if (showSlope && slope !== null) {
      if (s.kind === 'tc') {
        units = '°C/s';
      } else if (s.kind === 'ai' && configCache && configCache.analogs && configCache.analogs[s.index]) {
        const aiUnits = configCache.analogs[s.index].units || '';
        units = aiUnits ? `${aiUnits}/s` : '/s';
      } else {
        units = '/s';
      }
    }
    
    vals.push([s, v[si], slope, units]); 
  });
  
  tbody.innerHTML='';
  vals.forEach(([s,v,slope,units],si)=>{
    const lab = s.name && s.name.length ? s.name : labelFor(s);
    const valueStr = (v!=null && isFinite(v))? v.toFixed(sigDigits) : '—';
    const slopeStr = showSlope && slope !== null && isFinite(slope) ? `${slope.toFixed(sigDigits)} ${units}` : '—';
    
    const cells = [
      el('td',{}, lab), 
      el('td',{}, valueStr)
    ];
    
    if (showSlope) {
      cells.push(el('td',{className:'slope-cell'}, slopeStr));
    } else {
      cells.push(el('td',{className:'slope-cell', style:'display:none'}, slopeStr));
    }
    
    const tr=el('tr',{}, cells);
    tbody.append(tr);
  });
}
function findNearestIndex(buf, t){
  let lo=0, hi=buf.length-1;
  while (lo<hi){
    const mid=(lo+hi)>>1;
    if (buf[mid].t < t) lo=mid+1; else hi=mid;
  }
  if (lo>0 && Math.abs(buf[lo].t - t) > Math.abs(buf[lo-1].t - t)) return lo-1;
  return lo;
}

function updateChartBuffers(){
  // Block during paused replay — chart buffers are pre-loaded from the full log.
  // Allow during 'playing' replay so animated playback feeds charts frame by frame.
  if (replayMode === 'paused') return;

  for (const p of state.pages){
    for (const w of p.widgets){
      if (w.type !== 'chart') continue;
      const buf = chartBuffers.get(w.id) || [];
      const t = performance.now() / 1000;
      const raw = (w.opts.series || []).map(sel => readSelection(sel));
      let filtered = raw;
      const fc = w.opts.filterHz || 0;
      if (fc > 0){
        const RC = 1 / (2 * Math.PI * fc);
        const cf = chartFilters.get(w.id) || { _t: t };
        const dt = Math.max(1e-6, t - (cf._t || t));
        const alpha = dt / (RC + dt);
        filtered = raw.map((v, si) => {
          const prev = (cf[si] === undefined) ? v : cf[si];
          const y = prev + alpha * (v - prev);
          cf[si] = y; return y;
        });
        cf._t = t;
        chartFilters.set(w.id, cf);
      }
      const chartSpan = Math.max(1, w.opts.span || 10);
      // History retention is user-controlled via the "Keep×" spinner: keep
      // bufMult spans of data (1-100, default 4). maxDepth is the total kept;
      // when paused it is split half/half around the freeze edge so you can pan
      // both back and forward. Memory scales with bufMult, by design.
      const bufMult = Math.max(1, Math.min(100, Math.round(w.opts.bufMult || 4)));
      const maxDepth = chartSpan * bufMult;
      const half = maxDepth / 2;

      // Pause state and the frozen right edge (the Pause button uses
      // w.opts.tFreeze; a zoom/pan freeze uses w.view.tFreeze).
      const frozen = (w.view && w.view.paused) || (w.opts && w.opts.paused);
      const tF = (w.opts && w.opts.paused && Number.isFinite(w.opts.tFreeze)) ? w.opts.tFreeze
               : (w.view && w.view.paused && Number.isFinite(w.view.tFreeze)) ? w.view.tFreeze
               : t;

      // Append. While paused, keep recording up to `half` past the freeze edge
      // (so you can pan forward into what happened during the pause), then stop,
      // so a long pause stays bounded to ~maxDepth total. Short pauses never
      // reach the cap. The filter state above still advances, so resume stays
      // continuous.
      const newest = buf.length ? buf[buf.length - 1].t : t;
      if (!frozen || (newest - tF) <= half) {
        buf.push({ t, v: filtered });
      }

      // Trim the front. Live: rolling maxDepth ending at "now" (= bufMult spans
      // of scrollback). Paused: keep `half` before the frozen edge (with the
      // forward margin above, net retention ~= maxDepth = bufMult * span). The
      // pause check honors BOTH the Pause button (w.opts.paused) and a zoom/pan
      // freeze (w.view.paused) -- checking only the latter is what used to let a
      // button-paused chart keep trimming and wipe its left edge.
      if (frozen) {
        while (buf.length > 1 && (tF - buf[0].t) > half) buf.shift();
      } else {
        while (buf.length > 1 && (t - buf[0].t) > maxDepth) buf.shift();
      }

      chartBuffers.set(w.id, buf);
    }
  }
}

function labelFor(sel){
  if (!configCache) return `${sel.kind.toUpperCase()}${sel.index}`;
  try{
    if(sel.kind==='ai'){ return getAllAnalogs(configCache)?.[sel.index]?.name || `AI${sel.index}`; }
    if(sel.kind==='ao'){ return getAllAnalogOutputs(configCache)?.[sel.index]?.name || `AO${sel.index}`; }
    if(sel.kind==='do'){ return getAllDigitalOutputs(configCache)?.[sel.index]?.name || `DO${sel.index}`; }
    if(sel.kind==='tc'){ return getAllThermocouples(configCache)?.[sel.index]?.name || `TC${sel.index}`; }
    if(sel.kind==='ctr'){ return getAllCounters(configCache)?.[sel.index]?.name || `CTR${sel.index}`; }
    if(sel.kind==='pid'){ 
      // Fetch PID name from cache if available
      if (window.pidCache && window.pidCache.loops && window.pidCache.loops[sel.index]) {
        return window.pidCache.loops[sel.index].name || `PID${sel.index}`;
      }
      return `PID${sel.index}`;
    }
    if(sel.kind==='math'){
      if (window.mathCache && window.mathCache.operators && window.mathCache.operators[sel.index]) {
        return window.mathCache.operators[sel.index].name || `Math${sel.index}`;
      }
      return `Math${sel.index}`;
    }
    if(sel.kind==='expr'){
      if (window.exprCache && window.exprCache.expressions && window.exprCache.expressions[sel.index]) {
        return window.exprCache.expressions[sel.index].name || `Expr${sel.index}`;
      }
      return `Expr${sel.index}`;
    }
    if(sel.kind==='button'){
      // For button vars, sel.index is the variable name
      return `btn:${sel.index}`;
    }
    if(sel.kind==='static' || sel.kind==='global'){
      return String(sel.index);
    }
    if(sel.kind==='scale'){
      if(window.scaleCache?.scales?.[sel.index]) {
        return window.scaleCache.scales[sel.index].name || `Scale${sel.index}`;
      }
      return `Scale${sel.index}`;
    }
  }catch{}
  return `${sel.kind.toUpperCase()}${sel.index}`;
}

/* ------------------------------- gauge ---------------------------------- */

// Tare logic, factored out of mountGauge so the header-bar Tare button
// (created in widgetOptions) can call it without needing to dig into the
// gauge body. The button itself is passed in so we can disable/relabel
// it during the network round-trip.
async function performGaugeTare(w, btn) {
  if (!w || !w.opts) return;
  if (btn) {
    if (btn.disabled) return;
    btn.disabled = true;
    btn.textContent = 'Taring...';
  }
  try {
    const needles = w.opts.needles || [];
    const aiChannels = [];
    needles.forEach(needle => {
      if (needle.kind === 'ai' && Number.isInteger(needle.index)) {
        aiChannels.push(needle.index);
      }
    });
    if (aiChannels.length === 0) {
      alert('No AI channels to tare in this gauge');
      return;
    }
    const resp = await fetch('/api/zero_ai', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        channels: aiChannels,
        averaging_period: 2.0,
        balance_to_value: 0.0
      })
    });
    const result = await resp.json();
    if (result.ok) {
      delete w.opts.tareOffsets;
      alert(`Tared ${aiChannels.length} channel(s). Config offsets updated!`);
    } else {
      alert('Tare failed: ' + (result.error || 'Unknown error'));
    }
  } catch (e) {
    console.error('[GAUGE] Tare error:', e);
    alert('Tare failed: ' + e.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Tare';
    }
  }
}

function mountGauge(w, body){
  // Set default decimal places
  if (w.opts.decimals === undefined) w.opts.decimals = 3;
  
  // Add decimal places control
  const decimalsControl = el('div', {style: 'display:flex;align-items:center;gap:8px;margin-bottom:4px;font-size:12px'}, [
    el('label', {}, 'Decimals:'),
    el('input', {
      type: 'number',
      min: 0,
      max: 6,
      value: w.opts.decimals,
      style: 'width:50px;padding:2px 4px',
      oninput: (e) => {
        w.opts.decimals = parseInt(e.target.value) || 0;
        saveLayout();
      }
    })
  ]);
  if (!w.opts.hideScaleUI) body.append(decimalsControl);

  // NOTE: the Tare button used to live here as an absolutely-positioned
  // overlay on the gauge body. As of 2.1.6 it's been moved into the
  // widget header (widgetOptions) so it sits in line with the
  // Scale/Min/Max controls and resizes naturally with them. The actual
  // tare logic is in performGaugeTare(w) below.

  const legend=el('div',{className:'legend'}); body.append(legend);
  const canvas=el('canvas'); body.append(canvas);
  const ctx=canvas.getContext('2d');

  function draw(){
    const W=canvas.clientWidth, H=canvas.clientHeight;
    canvas.width=W; canvas.height=H;
    ctx.clearRect(0,0,W,H);

    // skip tiny first-frame sizes to avoid negative radii
    if (W < 40 || H < 40) { requestAnimationFrame(draw); return; }

    let lo=w.opts.min, hi=w.opts.max;
    if (w.opts.scale==='auto'){
      const vals=(w.opts.needles||[]).map((needle, idx) => {
        const v = readSelection(needle);
        const tareOffset = (w.opts.tareOffsets && w.opts.tareOffsets[idx]) || 0;
        const displayScale = needle.displayScale !== undefined ? needle.displayScale : 1.0;
        const displayOffset = needle.displayOffset !== undefined ? needle.displayOffset : 0.0;
        return ((v + tareOffset) * displayScale) + displayOffset;
      });
      lo=Math.min(...vals,0); hi=Math.max(...vals,1);
      if(lo===hi){ lo-=1; hi+=1; }
    }
    const span = (hi===lo)?1:(hi-lo);

    // geometry - ensure semicircle fits within canvas
    const cx=W/2;
    const padding = 12;
    // Outer radius must fit: top needs rOuter space, bottom needs rOuter space
    // cy is positioned so the semicircle's bottom edge doesn't exceed H
    let rOuter = Math.min((W - 2*padding)/2, H - padding - 20); // 20px for labels at top
    if (!Number.isFinite(rOuter) || rOuter < 8) { requestAnimationFrame(draw); return; }
    
    // Position cy so bottom of semicircle is just above widget bottom
    const cy = padding + rOuter; // Center is rOuter from top
    
    let band = Math.max(6, Math.round(rOuter * 0.18));
    if (band >= rOuter - 2) band = Math.max(6, Math.floor((rOuter - 2) * 0.6));
    let rInner = rOuter - band;
    if (rInner < 2) rInner = 2;

    // background rings / grid
    ctx.save();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath(); if (safeArc(ctx, cx, cy, rOuter, Math.PI, 0)) ctx.stroke();
    ctx.beginPath(); if (safeArc(ctx, cx, cy, rInner, Math.PI, 0)) ctx.stroke();

    // secondary rings
    ctx.strokeStyle = (getComputedStyle(document.documentElement).getPropertyValue('--grid2')||'#1e2235').trim();
    for(let t=1;t<=4;t++){
      const rr=rOuter - t*8;
      if (rr <= 2) break;
      ctx.beginPath(); if (safeArc(ctx, cx, cy, rr, Math.PI, 0)) ctx.stroke();
    }

    // ticks + labels (upper semicircle; canvas Y is downward, so subtract sin)
    ctx.fillStyle='#a8b3cf'; ctx.font='12px system-ui';
    ctx.strokeStyle='#3b425e';
    const tickCount = w.opts.divisions !== undefined ? w.opts.divisions : 5;
    const tickLen=Math.max(3, Math.min(16, Math.floor(rOuter * 0.12)));
    for(let i=0;i<=tickCount;i++){
      const t = i / tickCount;
      const ang = Math.PI + (0 - Math.PI)*t; // map 0..1 -> π..0 (upper semicircle)
      const cos=Math.cos(ang), sin=Math.sin(ang);
      const r0 = Math.max(1, rInner - 2);
      const r1 = Math.max(1, r0 - tickLen);
      ctx.beginPath();
      ctx.moveTo(cx + r0*cos, cy - r0*sin);
      ctx.lineTo(cx + r1*cos, cy - r1*sin);
      ctx.stroke();

      const decimals = w.opts.decimals !== undefined ? w.opts.decimals : 3;
      const val=(lo + t*span).toFixed(decimals);
      ctx.textAlign='center';
      ctx.fillText(val, cx + (rInner - 30)*cos, cy - (rInner - 30)*sin + 4);
    }

    // title
    if (w.opts.title){
      ctx.fillStyle='rgba(255,255,255,0.9)';
      ctx.font='12px system-ui, sans-serif';
      ctx.textAlign='center';
      ctx.fillText(w.opts.title, cx, 14);
    }

    // legend + needles
    legend.innerHTML='';
    const needles = Array.isArray(w.opts.needles) ? w.opts.needles : [];
    ctx.lineWidth=3;
    needles.forEach((s,si)=>{
      const v = readSelection(s);
      const tareOffset = (w.opts.tareOffsets && w.opts.tareOffsets[si]) || 0;
      const displayScale = s.displayScale !== undefined ? s.displayScale : 1.0;
      const displayOffset = s.displayOffset !== undefined ? s.displayOffset : 0.0;
      const displayValue = ((v + tareOffset) * displayScale) + displayOffset;
      
      const frac = clamp((displayValue - lo)/span, 0, 1);
      const ang = Math.PI + (0 - Math.PI) * frac;
      const nx = Math.cos(ang), ny = Math.sin(ang);
      const customColors = (w.opts.needles || []).map(n => n.color);
      ctx.strokeStyle=colorFor(si, customColors);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + (rInner + band*0.9)*nx, cy - (rInner + band*0.9)*ny);
      ctx.stroke();

      // ----- Target marker (optional, per-series) -----
      // Drawn as a short radial line in the outer band at the target's
      // angle, in the user-chosen target color (defaults to red). Only
      // rendered when target is in the visible scale range so it doesn't
      // get clamped to 0 or 1 and lie about its position.
      const targetVal = resolveTargetValue(s);
      if (targetVal !== null && targetVal >= lo && targetVal <= hi) {
        const tFrac = (targetVal - lo) / span;
        const tAng = Math.PI + (0 - Math.PI) * tFrac;
        const tx = Math.cos(tAng), ty = Math.sin(tAng);
        const targetColor = s.targetColor || '#ff4d4d';
        const r0 = rInner + 1;
        const r1 = rOuter - 1;
        ctx.save();
        ctx.lineWidth = 3;
        ctx.strokeStyle = targetColor;
        ctx.beginPath();
        ctx.moveTo(cx + r0 * tx, cy - r0 * ty);
        ctx.lineTo(cx + r1 * tx, cy - r1 * ty);
        ctx.stroke();
        ctx.restore();
      }

      const lab = s.name && s.name.length ? s.name : labelFor(s);
      const decimals = w.opts.decimals !== undefined ? w.opts.decimals : 3;
      legend.append(el('div',{className:'item'},[
        el('span',{className:'swatch', style:`background:${colorFor(si, customColors)}`},''), `${lab}: ${Number.isFinite(displayValue)?displayValue.toFixed(decimals):'—'}`
      ]));
    });

    ctx.restore();
    requestAnimationFrame(draw);
  }
  draw();
}

/* -------------------------------- bars ---------------------------------- */
/* ==================== ENHANCED BARS WITH GRID LABELS ==================== */
// Replace your mountBars function with this

function mountBars(w, body){
  const canvas = el('canvas'); body.append(canvas);
  const ctx = canvas.getContext('2d');

  w.opts.yGridLines = w.opts.yGridLines || 5; // Default 5 horizontal lines

  function draw(){
    const W = canvas.clientWidth, H = canvas.clientHeight;
    canvas.width = W; canvas.height = H;
    ctx.clearRect(0, 0, W, H);

    const plotL = 60, plotR = W - 10, plotT = 10, plotB = H - 30;
    ctx.strokeStyle = '#3b425e';
    ctx.lineWidth = 1;
    ctx.strokeRect(plotL, plotT, plotR - plotL, plotB - plotT);

    // Determine scale
    let lo = w.opts.min, hi = w.opts.max;
    if (w.opts.scale === 'auto') {
      const vals = (w.opts.series || []).map(s => {
        const v = readSelection(s);
        const displayScale = s.displayScale !== undefined ? s.displayScale : 1.0;
        const displayOffset = s.displayOffset !== undefined ? s.displayOffset : 0.0;
        return (v * displayScale) + displayOffset;
      });
      lo = Math.min(...vals, 0);
      hi = Math.max(...vals, 1);
      if (lo === hi) { lo -= 1; hi += 1; }
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo === hi) {
      lo = 0; hi = 1;
    }
    const span = hi - lo || 1;

    // Y grid with labels
    const yGridLines = Math.max(2, Math.min(20, w.opts.yGridLines || 5));
    ctx.strokeStyle = (getComputedStyle(document.documentElement)
                       .getPropertyValue('--grid') || '#2a2f44').trim();
    ctx.lineWidth = 1;
    ctx.fillStyle='#7a8199';
    ctx.font='11px system-ui';
    ctx.textAlign='right';
    ctx.textBaseline='middle';

    for (let i = 0; i <= yGridLines; i++) {
      const frac = i / yGridLines;
      const y = plotB - frac * (plotB - plotT);
      const val = lo + frac * (hi - lo);

      // Draw horizontal line
      ctx.beginPath();
      ctx.moveTo(plotL, y);
      ctx.lineTo(plotR, y);
      ctx.stroke();

      // Draw value label on the left axis
      ctx.fillText(val.toFixed(2), plotL - 5, y);

      // Draw value label in the middle
      ctx.textAlign='center';
      ctx.fillStyle='rgba(122, 129, 153, 0.6)';
      ctx.fillText(val.toFixed(2), (plotL + plotR) / 2, y - 2);
      ctx.fillStyle='#7a8199';
      ctx.textAlign='right';
    }

    const series = w.opts.series || [];
    const N = Math.max(1, series.length);
    const barW = Math.max(5, (plotR - plotL) / N - 20); // Reduced width: min 5px, more spacing

    // Draw bars
    ctx.font = '10px system-ui, sans-serif';
    ctx.textBaseline = 'top';

    series.forEach((sel, idx) => {
      const v = readSelection(sel);
      const displayScale = sel.displayScale !== undefined ? sel.displayScale : 1.0;
      const displayOffset = sel.displayOffset !== undefined ? sel.displayOffset : 0.0;
      const displayValue = (v * displayScale) + displayOffset;
      
      const t = Math.max(0, Math.min(1, (displayValue - lo) / span));
      const x = plotL + (idx + 0.5) * ((plotR - plotL) / N);
      const y = plotB - t * (plotB - plotT);
      const h = plotB - y;

      const customColors = (w.opts.series || []).map(s => s.color);
      ctx.fillStyle = colorFor(idx, customColors);
      ctx.fillRect(x - barW / 2, y, barW, h);

      // ----- Target line (optional, per-series) -----
      // Drawn as a horizontal line across this bar's column at the target's
      // Y position, in the user-chosen target color. Extends slightly beyond
      // the bar edges (barW * 0.6 each side) so it's clearly readable as a
      // target marker rather than just another bar element.
      const targetVal = resolveTargetValue(sel);
      const hasTarget = (targetVal !== null);
      if (hasTarget && targetVal >= lo && targetVal <= hi) {
        const tt = (targetVal - lo) / span;
        const targetY = plotB - tt * (plotB - plotT);
        const targetColor = sel.targetColor || '#ff4d4d';
        const halfWidth = barW * 0.6;
        ctx.save();
        ctx.lineWidth = 2;
        ctx.strokeStyle = targetColor;
        ctx.beginPath();
        ctx.moveTo(x - halfWidth, targetY);
        ctx.lineTo(x + halfWidth, targetY);
        ctx.stroke();
        ctx.restore();
      }

      // Draw series label at bottom
      const label = sel.name || labelFor(sel);
      if (label) {
        ctx.fillStyle = '#a8b3cf';
        ctx.textAlign = 'center';
        ctx.fillText(label, x, plotB + 2);
      }

      // Draw value on top of bar — colored in the target color when a
      // target is set, so the relationship between the bar value and the
      // target redline is visually obvious.
      if (Number.isFinite(displayValue)) {
        ctx.fillStyle = hasTarget ? (sel.targetColor || '#ff4d4d') : '#e6e6e6';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(displayValue.toFixed(2), x, y - 2);
        ctx.textBaseline = 'top';
      }
    });

    requestAnimationFrame(draw);
  }
  draw();
}

/* -------------------------------- DO ------------------------------------ */
function logicalActive(bit,activeHigh){ return activeHigh ? !!bit : !bit; }

function mountDOButton(w, body){
  console.log(`[DO Button] Mounting widget "${w.opts.title}": DO${w.opts.doIndex} (logical; polarity = config Invert)`);
  const b=el('button',{className:'do-btn default'}, w.opts.title||'Button');
  body.append(b);

  let actTimer=null;
  let isDown = false;
  let buzzing = false;
  
  // Initialize variable state if using var mode
  if (w.opts.outputType === 'var' && !state.buttonVars) {
    state.buttonVars = {};
  }
  if (w.opts.outputType === 'var') {
    state.buttonVars[w.opts.varName] = state.buttonVars[w.opts.varName] || 0;
  }

  const clearActTimer=()=>{ if (actTimer){ clearTimeout(actTimer); actTimer=null; } };

  const setOutput = async(value)=>{
    if (w.opts.outputType === 'var') {
      // Set variable state
      if (!state.buttonVars) state.buttonVars = {};
      state.buttonVars[w.opts.varName] = value ? 1 : 0;
      
      // Sync to backend for expressions
      try {
        await fetch('/api/button_vars', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({vars: state.buttonVars})
        });
      } catch(e) { console.warn('ButtonVars sync failed', e); }
    } else {
      // Set DO hardware -- LOGICAL state only. No active_high: the server applies the
      // channel's configured Invert, so the button never double-inverts.
      try{
        await fetch('/api/do/set',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({index:w.opts.doIndex, state:!!value})
        });
      }catch(e){ console.warn('DO set failed', e); }
    }
  };

  const startBuzz = async()=>{
    if (w.opts.outputType === 'var') return; // Buzz only works with DO
    if (buzzing) return;
    buzzing=true;
    try{
      await fetch('/api/do/buzz/start',{
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({index:w.opts.doIndex, hz:w.opts.buzzHz||10})
      });
      b.dataset.buzz='1';
    }catch(e){ console.warn('Buzz start failed', e); }
  };

  const stopBuzz = async()=>{
    if (w.opts.outputType === 'var') return; // Buzz only works with DO
    try{
      await fetch('/api/do/buzz/stop', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ index: w.opts.doIndex })
      });
    }catch(e){ console.warn('Buzz stop failed', e); }
    buzzing = false;
    b.dataset.buzz = '0';
  };

  // Toggle with optional actuationTime (auto-off)
  b.addEventListener('click', async ()=>{
    if(!connected) return;
    if(w.opts.mode!=='toggle') return;

    // Always cancel any running actuation timer first.
    // If the user clicks again during the countdown they are manually
    // overriding — we must NOT let the old timer fire afterwards.
    clearActTimer();

    // Get current logical state and toggle it
    let desiredLogicalState;
    if (w.opts.outputType === 'var') {
      const bit = state.buttonVars?.[w.opts.varName] || 0;
      desiredLogicalState = !bit;
      await setOutput(desiredLogicalState);
    } else {
      // state.do[] carries the LOGICAL command; toggle it and send logical. The
      // configured Invert sets pin polarity server-side (no widget-level inversion).
      const bit = state.do[w.opts.doIndex]|0;
      desiredLogicalState = !bit;
      console.log(`[DO Click] DO${w.opts.doIndex}: logical ${bit} -> ${desiredLogicalState?1:0}`);
      await setOutput(desiredLogicalState ? 1 : 0);
    }

    // Only start the auto-revert timer when turning ON.
    // If the user clicked to turn it OFF, the timer was already cleared above
    // and must NOT restart — they are manually stopping early.
    const ms = Math.max(0, (w.opts.actuationTime||0) * 1000);
    if (ms > 0 && desiredLogicalState) {
      // Revert to OFF (logical false) after the actuation time
      actTimer = setTimeout(() => { setOutput(0); }, ms);
    }
  });

  // Momentary & Buzz via pointer events
  const onDown = ()=>{
    if (!connected) return;
    if (isDown) return;
    isDown = true;
    if (w.opts.mode === 'momentary'){ clearActTimer(); setOutput(1); }
    if (w.opts.mode === 'buzz'){ stopBuzz().finally(startBuzz); }
  };

  const onUp = ()=>{
    if (!connected) return;
    if (!isDown) return;
    isDown = false;

    if (w.opts.mode === 'momentary'){ setOutput(0); }
    if (w.opts.mode === 'buzz'){
      stopBuzz().finally(()=>{
        setOutput(0).finally(()=>{ setTimeout(()=>stopBuzz(), 150); });
      });
    }
  };

  b.addEventListener('pointerdown', onDown);
  b.addEventListener('pointerup', onUp);
  b.addEventListener('pointerleave', onUp);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('blur', onUp);
  document.addEventListener('visibilitychange', ()=>{ if(document.hidden) onUp(); });
  window.addEventListener('beforeunload', ()=>{ if (buzzing) { navigator.sendBeacon && navigator.sendBeacon('/api/do/buzz/stop', JSON.stringify({index:w.opts.doIndex})); } });

  updateDOButtons();
}

function updateDOButtons(){
  document.querySelectorAll('.do-btn').forEach(b=>{
    if(!connected||!hwReady){ b.className='do-btn default'; return; }
    const id=b.closest('.widget').id.slice(2);
    const page=state.pages[activePageIndex];
    const w=page.widgets.find(x=>x.id===id);
    if(!w){ b.className='do-btn default'; return; }
    
    let bit, active;
    if (w.opts.outputType === 'var') {
      // Variables: simple logic, 1 = active (green), 0 = inactive (red)
      bit = state.buttonVars?.[w.opts.varName] || 0;
      active = !!bit;  // 1 = true = active
    } else {
      // Hardware DOs: state.do[] is the LOGICAL command -- show it directly. Pin
      // polarity (config Invert) is a hardware concern; the button shows logic.
      bit = state.do[w.opts.doIndex]|0;
      active = !!bit;
      if (w.debugCount === undefined) w.debugCount = 0;
      if (w.debugCount < 8) {
        console.log(`[DO Button "${w.opts.title}"] DO${w.opts.doIndex}: logical=${active?'ON':'OFF'}`);
        w.debugCount++;
      }
    }
    
    // Map logical state to color: ON=green, OFF=red
    const newClass = 'do-btn ' + (active ? 'active' : 'inactive');
    if (b.className !== newClass && w.debugCount < 8) {
      console.log(`[DO Button "${w.opts.title}"] Class: "${b.className}" -> "${newClass}"`);
    }
    b.className = newClass;
    b.textContent = w.opts.title || 'Button';
  });
}

/* -------------------------------- PID ----------------------------------- */
function mountPIDPanel(w, body){
  const line=el('div',{
    className:'small', 
    id:'pid_'+w.id, 
    style:'display:inline-block;cursor:pointer',
    title:'Click to toggle PID details',
    onclick: () => {
      const detailsDiv = document.getElementById('pid_details_' + w.id);
      if (detailsDiv) {
        if (detailsDiv.style.display === 'none') {
          detailsDiv.style.display = 'block';
          // Position near the widget
          const widgetEl = document.getElementById('w_' + w.id);
          if (widgetEl) {
            const rect = widgetEl.getBoundingClientRect();
            detailsDiv.style.left = (rect.right + 10) + 'px';
            detailsDiv.style.top = rect.top + 'px';
          }
        } else {
          detailsDiv.style.display = 'none';
        }
      }
    }
  }, 'pv=—, err=—, out=—');
  
  // Create floating draggable details panel
  const detailsPanel = el('div', {
    id: 'pid_details_' + w.id,
    style: 'display:none;position:fixed;z-index:10000;padding:8px;background:#1a1d2e;border:2px solid #7aa2f7;border-radius:6px;font-family:monospace;font-size:11px;box-shadow:0 4px 12px rgba(0,0,0,0.5);min-width:200px'
  });
  
  // Add draggable header
  const header = el('div', {
    style: 'cursor:move;padding:4px;margin:-8px -8px 8px -8px;background:#2a3046;border-radius:4px 4px 0 0;font-weight:bold;color:#7aa2f7;display:flex;justify-content:space-between;align-items:center'
  });
  
  const headerTitle = el('span', {}, 'PID Details');
  const closeBtn = el('span', {
    style: 'cursor:pointer;padding:0 4px;color:#d84a4a;font-size:16px',
    onclick: () => {
      detailsPanel.style.display = 'none';
    }
  }, '×');
  
  header.append(headerTitle, closeBtn);
  
  const content = el('div', {id: 'pid_details_content_' + w.id});
  detailsPanel.append(header, content);
  
  // Make draggable
  let isDragging = false;
  let dragOffsetX = 0, dragOffsetY = 0;
  
  header.onmousedown = (e) => {
    isDragging = true;
    dragOffsetX = e.clientX - detailsPanel.offsetLeft;
    dragOffsetY = e.clientY - detailsPanel.offsetTop;
    e.preventDefault();
  };
  
  document.addEventListener('mousemove', (e) => {
    if (isDragging) {
      detailsPanel.style.left = (e.clientX - dragOffsetX) + 'px';
      detailsPanel.style.top = (e.clientY - dragOffsetY) + 'px';
    }
  });
  
  document.addEventListener('mouseup', () => {
    isDragging = false;
  });
  
  // Append to body (not to widget)
  document.body.append(detailsPanel);
  
  // Enable indicator container (will be populated if gating is configured)
  const enableContainer = el('div', {style:'display:inline-block;margin-left:8px;vertical-align:middle'});
  
  body.append(el('div', {style:'display:flex;align-items:center'}, [line, enableContainer]));

  // Fetch PID config to check if enable gate is configured
  let pidConfig = null;
  (async () => {
    try {
      const resp = await fetch('/api/pid');
      const data = await resp.json();
      pidConfig = data.loops?.[w.opts.loopIndex ?? 0];
    } catch(e) {
      console.warn('Failed to load PID config:', e);
    }
  })();

  if (w.opts.showControls){
    const ctr=el('div',{className:'compact'});
    const tbl=el('table',{className:'form'}); const tb=el('tbody');
    const row=(label,input)=>{ const tr=el('tr'); tr.append(el('th',{},label), el('td',{},input)); tb.append(tr); return tr; };
    const L={enabled:false,name:'',kind:'analog',src:'ai',ai_ch:0,out_ch:0,target:0,kp:0,ki:0,kd:0,d_filter_hz:null,out_min:0,out_max:1,out_min_source:'fixed',out_min_channel:0,out_max_source:'fixed',out_max_channel:0,i_min:-1,i_max:1,enable_gate:false,enable_kind:'do',enable_index:0,sp_source:'fixed',sp_channel:0};

    fetch('/api/pid').then(r=>r.json()).then(async pid=>{
      const idx=w.opts.loopIndex|0; Object.assign(L, pid.loops?.[idx]||{});
      
      // Create async signal selectors
      let inputChSel = await createSignalSelector(L.src || 'ai', L.ai_ch || 0, newIdx => L.ai_ch = newIdx);
      let outputChSel = await createSignalSelector(L.kind === 'analog' ? 'ao' : 'do', L.out_ch || 0, newIdx => L.out_ch = newIdx);
      
      // Create SP channel selector (will be rebuilt when sp_source changes)
      let spChSel = (L.sp_source === 'ao' || L.sp_source === 'math' || L.sp_source === 'pid' || L.sp_source === 'expr' || L.sp_source === 'static') 
        ? await createSignalSelector(L.sp_source, L.sp_channel || 0, newIdx => L.sp_channel = newIdx)
        : num(L, 'sp_channel', 1);
      
      // Create out_min channel selector
      let outMinChSel = (L.out_min_source === 'math' || L.out_min_source === 'expr')
        ? await createSignalSelector(L.out_min_source, L.out_min_channel || 0, newIdx => L.out_min_channel = newIdx)
        : num(L, 'out_min_channel', 1);
      
      // Create out_max channel selector
      let outMaxChSel = (L.out_max_source === 'math' || L.out_max_source === 'expr')
        ? await createSignalSelector(L.out_max_source, L.out_max_channel || 0, newIdx => L.out_max_channel = newIdx)
        : num(L, 'out_max_channel', 1);
      
      // Function to update visibility (will be called after rows are created)
      let outputRow, spValueRow, spChRow, outMinValueRow, outMinChRow, outMaxValueRow, outMaxChRow;
      const updateVisibility = () => {
        if (outputRow) outputRow.style.display = (L.kind === 'var') ? 'none' : '';
        if (spValueRow) spValueRow.style.display = (L.sp_source === 'fixed') ? '' : 'none';
        if (spChRow) spChRow.style.display = (L.sp_source === 'fixed') ? 'none' : '';
        if (outMinValueRow) outMinValueRow.style.display = (L.out_min_source === 'fixed') ? '' : 'none';
        if (outMinChRow) outMinChRow.style.display = (L.out_min_source === 'fixed') ? 'none' : '';
        if (outMaxValueRow) outMaxValueRow.style.display = (L.out_max_source === 'fixed') ? '' : 'none';
        if (outMaxChRow) outMaxChRow.style.display = (L.out_max_source === 'fixed') ? 'none' : '';
      };
      
      const selKind = selectEnum(['analog','digital','var'], L.kind||'analog', async v => {
        L.kind = v;
        // Rebuild output selector when kind changes
        const newOutputSel = await createSignalSelector(v === 'analog' ? 'ao' : 'do', L.out_ch || 0, newIdx => L.out_ch = newIdx);
        outputChSel.replaceWith(newOutputSel);
        outputChSel = newOutputSel;
        updateVisibility();
      });
      
      const selSrc = selectEnum(['ai','ao','tc','pid','math','expr','static'], L.src ||'ai', async v => {
        L.src = v;
        // Rebuild input selector when source changes
        const newInputSel = await createSignalSelector(v, L.ai_ch || 0, newIdx => L.ai_ch = newIdx);
        inputChSel.replaceWith(newInputSel);
        inputChSel = newInputSel;
      });
      
      // Build form rows
      row('enabled', chk(L,'enabled'));
      row('name', txt(L,'name'));
      row('kind', selKind);
      row('src',  selSrc);
      row('input',  inputChSel);
      outputRow = row('output', outputChSel);
      spValueRow = row('SP Value', num(L,'target',0.0001));
      row('SP Src', selectEnum(['fixed','ao','pid','math','expr','static'], L.sp_source||'fixed', async v => {
        L.sp_source = v;
        // Rebuild SP channel selector when source changes
        const newSpChSel = (v === 'ao' || v === 'math' || v === 'pid' || v === 'expr')
          ? await createSignalSelector(v, L.sp_channel || 0, newIdx => L.sp_channel = newIdx)
          : num(L, 'sp_channel', 1);
        spChSel.replaceWith(newSpChSel);
        spChSel = newSpChSel;
        updateVisibility();
      }));
      spChRow = row('SP Ch', spChSel);
      
      row('kp',     num(L,'kp',0.0001));
      row('ki',     num(L,'ki',0.0001));
      row('kd',     num(L,'kd',0.0001));
      row('D Filt Hz', num(L,'d_filter_hz',0.1));

      outMinValueRow = row('Out Min', num(L,'out_min',0.0001));
      row('Out Min Src', selectEnum(['fixed','math','expr'], L.out_min_source||'fixed', async v => {
        L.out_min_source = v;
        const newSel = (v === 'math' || v === 'expr')
          ? await createSignalSelector(v, L.out_min_channel || 0, newIdx => L.out_min_channel = newIdx)
          : num(L, 'out_min_channel', 1);
        outMinChSel.replaceWith(newSel);
        outMinChSel = newSel;
        updateVisibility();
      }));
      outMinChRow = row('Out Min Ch', outMinChSel);
      
      outMaxValueRow = row('Out Max', num(L,'out_max',0.0001));
      row('Out Max Src', selectEnum(['fixed','math','expr'], L.out_max_source||'fixed', async v => {
        L.out_max_source = v;
        const newSel = (v === 'math' || v === 'expr')
          ? await createSignalSelector(v, L.out_max_channel || 0, newIdx => L.out_max_channel = newIdx)
          : num(L, 'out_max_channel', 1);
        outMaxChSel.replaceWith(newSel);
        outMaxChSel = newSel;
        updateVisibility();
      }));
      outMaxChRow = row('Out Max Ch', outMaxChSel);
      
      updateVisibility(); // Set initial visibility AFTER all row variables are assigned
      
      // Removed err_min/err_max - only I and output limits needed
      row('i_min',  num(L,'i_min',0.0001));
      row('i_max',  num(L,'i_max',0.0001));
      // Enable gate fields removed - edit in main PID editor only
      tbl.append(tb);

      const save=el('button',{className:'btn',onclick:async()=>{
        const pid2=await (await fetch('/api/pid')).json();
        pid2.loops = pid2.loops||[];
        pid2.loops[w.opts.loopIndex|0] = L;
        await fetch('/api/pid',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(pid2)});
      }}, 'Apply');

      ctr.append(tbl, el('div',{style:'margin-top:6px'}, save));
    });

    body.append(ctr);
  }

  (function update(){
    const loop=state.pid[w.opts.loopIndex]||null;
    const p=$('#pid_'+w.id);
    if(loop&&p){ 
      p.textContent=`pv=${(loop.pv??0).toFixed(3)}, err=${(loop.err??0).toFixed(3)}, out=${(loop.out??0).toFixed(3)}`;
      
      // Update enable indicator if gating is configured
      if (pidConfig && pidConfig.enable_gate) {
        // Use gate_value from telemetry (more accurate, includes math/expr)
        const gateValue = loop.gate_value !== undefined ? loop.gate_value : 0.0;
        const enabled = gateValue >= 1.0;
        
        const statusText = gateValue.toFixed(1);
        const color = enabled ? '#2faa60' : '#d84a4a';
        const gated = loop.gated ? ' (GATED)' : '';
        
        enableContainer.innerHTML = `
          <div style="display:inline-block;text-align:center;padding:2px 4px;border:1px solid ${color};border-radius:3px;background:#1a1d2e;min-width:35px;vertical-align:middle">
            <div style="font-size:7px;color:#9aa1b9;line-height:1.1">EN</div>
            <div style="font-size:14px;font-weight:bold;line-height:1.1;color:${color}">${statusText}</div>
            <div style="font-size:6px;color:#7a7f8f;line-height:1.1">${pidConfig.enable_kind.toUpperCase()}${pidConfig.enable_index}</div>
          </div>
        `;
      } else {
        enableContainer.innerHTML = '';
      }
      
      // Update details panel content if visible
      const detailsDiv = document.getElementById('pid_details_' + w.id);
      const contentDiv = document.getElementById('pid_details_content_' + w.id);
      if (detailsDiv && contentDiv && detailsDiv.style.display !== 'none') {
        contentDiv.innerHTML = `
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="padding:2px;font-size:10px">PV:</td><td style="padding:2px;text-align:right;font-weight:bold">${(loop.pv??0).toFixed(4)}</td></tr>
            <tr style="background:#0d1117"><td style="padding:2px;font-size:10px">SP:</td><td style="padding:2px;text-align:right">${(loop.target??0).toFixed(4)}</td></tr>
            <tr><td style="padding:2px;font-size:10px;color:#ff9e64">Error:</td><td style="padding:2px;text-align:right;color:#ff9e64;font-weight:bold">${(loop.err??0).toFixed(4)}</td></tr>
            <tr style="background:#0d1117"><td style="padding:2px;font-size:10px">P:</td><td style="padding:2px;text-align:right">${(loop.p_term??0).toFixed(4)}</td></tr>
            <tr><td style="padding:2px;font-size:10px">I:</td><td style="padding:2px;text-align:right">${(loop.i_term??0).toFixed(4)}</td></tr>
            <tr style="background:#0d1117"><td style="padding:2px;font-size:10px">D:</td><td style="padding:2px;text-align:right">${(loop.d_term??0).toFixed(4)}</td></tr>
            <tr><td style="padding:2px;font-size:10px;color:#7aa2f7">u:</td><td style="padding:2px;text-align:right;color:#7aa2f7;font-weight:bold">${(loop.u??0).toFixed(4)}</td></tr>
            <tr style="background:#0d1117"><td style="padding:2px;font-size:10px;color:#2faa60">Out:</td><td style="padding:2px;text-align:right;color:#2faa60;font-weight:bold">${(loop.out??0).toFixed(4)}</td></tr>
          </table>
        `;
      }
    }
    requestAnimationFrame(update);
  })();
}

function selectEnum(options, value, onChange){
  const s=el('select',{}); options.forEach(opt=>s.append(el('option',{value:opt},opt)));
  s.value=value; s.onchange=()=>onChange(s.value); return s;
}
function txt(o,k){ const i=el('input',{type:'text',value:o[k]??''}); i.oninput=()=>o[k]=i.value; return i; }
function num(o,k,step){ const i=el('input',{type:'number',step:step??'any',value:o[k]??0}); i.oninput=()=>o[k]=parseFloat(i.value)||0; return i; }
function chk(o,k){ const i=el('input',{type:'checkbox',checked:!!o[k]}); i.onchange=()=>o[k]=!!i.checked; return i; }

/* -------------------------------- AO ------------------------------------ */
function mountAOSlider(w, body){
  const step=w.opts.step ?? 0.0025;
  const cur=el('input',{type:'number', min:w.opts.min, max:w.opts.max, step:step, value:state.ao[w.opts.aoIndex]||0, style:'width:90px'});
  const rng=el('input',{type:'range',  min:w.opts.min, max:w.opts.max, step:step, value:state.ao[w.opts.aoIndex]||0, style:'width:100%'});
  
  // Enable indicator (if gating is enabled in config)
  let enableBox = null;
  let aoConfig = null;
  
  // Fetch AO config to check if enable gate is active
  (async () => {
    try {
      const resp = await fetch('/api/config');
      const cfg = await resp.json();
      aoConfig = cfg.analogOutputs?.[w.opts.aoIndex];
      
      // If enable gate is configured, show enable indicator
      if (aoConfig && aoConfig.enable_gate) {
        enableBox = el('div', {
          style: 'display:inline-block;text-align:center;padding:3px;border:2px solid #2a3046;border-radius:3px;background:#1a1d2e;min-width:50px;vertical-align:middle;margin-left:8px'
        });
        const row = body.querySelector('.row');
        if (row) row.appendChild(enableBox);
      }
    } catch(e) {
      console.warn('Failed to load AO config:', e);
    }
  })();
  
  const send=async(v)=>{
    try{
      await fetch('/api/ao/set',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({index:w.opts.aoIndex, volts:parseFloat(v)})});
    }catch(e){ console.warn('AO set failed', e); }
  };
  rng.oninput=()=>{ cur.value=rng.value; if (w.opts.live) send(rng.value); };
  cur.onchange=()=>{ rng.value=cur.value; send(cur.value); };
  
  const row = el('div',{className:'row'},[rng,cur]);
  body.append(row);
  
  // Update enable indicator
  (function updateEnable() {
    if (enableBox && aoConfig) {
      let enabled = false;
      
      if (aoConfig.enable_kind === 'do') {
        enabled = state.do?.[aoConfig.enable_index] ? true : false;
      } else if (aoConfig.enable_kind === 'le') {
        enabled = state.le?.[aoConfig.enable_index]?.output ? true : false;
      }
      
      const statusText = enabled ? '1' : '0';
      const color = enabled ? '#2faa60' : '#d84a4a';
      
      enableBox.innerHTML = `
        <div style="font-size:8px;color:#9aa1b9;line-height:1.2">ENABLE</div>
        <div style="font-size:18px;font-weight:bold;line-height:1.2;color:${color}">${statusText}</div>
        <div style="font-size:7px;color:#7a7f8f;line-height:1.2">${aoConfig.enable_kind.toUpperCase()}${aoConfig.enable_index}</div>
      `;
      enableBox.style.borderColor = color;
    }
    
    requestAnimationFrame(updateEnable);
  })();
}

/* -------------------------------- Motor Controller ------------------------------------ */
function mountMotorController(w, body){
  const status=el('div',{className:'small', id:'motor_'+w.id}, 'Input: —, RPM Cmd: —, Status: —');
  body.append(status);

  // Track current motor config for enable state
  let currentConfig = null;
  
  const refreshConfig = async () => {
    try {
      const data = await (await fetch('/api/motors')).json();
      const motors = data.motors || [];
      currentConfig = motors[w.opts.motorIndex];
    } catch(e) {
      console.warn('Failed to refresh motor config:', e);
    }
  };
  
  refreshConfig(); // Initial load

  if (w.opts.showControls){
    const ctr=el('div',{className:'compact'});
    
    // Fetch current motor config
    let motorConfig = null;
    fetch('/api/motors').then(r=>r.json()).then(data=>{
      const motors = data.motors || [];
      motorConfig = motors[w.opts.motorIndex];
      if (!motorConfig) return;
      
      // Build editable config table
      const tbl=el('table',{className:'form'}); 
      const tb=el('tbody');
      const row=(label,input)=>{ 
        const tr=el('tr'); 
        tr.append(el('th',{},label), el('td',{},input)); 
        tb.append(tr); 
      };
      
      row('Min RPM', num(motorConfig,'min_rpm',1));
      row('Max RPM', num(motorConfig,'max_rpm',1));
      row('Scale', num(motorConfig,'scale_factor',0.1));
      row('Offset', num(motorConfig,'offset',0.1));
      
      const saveConfigBtn = el('button',{className:'btn', onclick:async()=>{
        try {
          // Update the specific motor in the array
          const fullData = await (await fetch('/api/motors')).json();
          fullData.motors[w.opts.motorIndex] = motorConfig;
          await fetch('/api/motors',{
            method:'PUT',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify(fullData)
          });
          alert('Motor config saved');
          await refreshConfig(); // Refresh after save
        } catch(e) { 
          console.warn('Motor config save failed', e);
          alert('Save failed: ' + e.message);
        }
      }}, 'Save Config');
      
      tbl.append(tb);
      ctr.append(tbl, el('div',{style:'margin:6px 0'}, saveConfigBtn));
    });
    
    // Manual control section
    const manualRPM = el('input',{type:'number', value:0, step:10, style:'width:100px'});
    const setBtn = el('button',{className:'btn', onclick:async()=>{
      try {
        const response = await fetch(`/api/motors/${w.opts.motorIndex}/rpm`, {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({rpm: parseFloat(manualRPM.value)||0})
        });
        if (!response.ok) {
          const text = await response.text();
          console.error('Motor set RPM failed:', text);
        }
      } catch(e) { 
        console.warn('Motor set failed', e); 
      }
    }}, 'Set RPM');
    
    const enableBtn = el('button',{className:'btn', onclick:async()=>{
      try {
        const response = await fetch(`/api/motors/${w.opts.motorIndex}/enable`, {
          method:'POST',
          headers:{'Content-Type':'application/json'}
        });
        if (!response.ok) {
          const text = await response.text();
          console.error('Motor enable failed:', text);
        } else {
          const result = await response.json();
          console.log('Motor enable response:', result);
          await refreshConfig(); // Refresh config after enable
        }
      } catch(e) { 
        console.warn('Motor enable failed', e); 
      }
    }}, 'Enable');
    
    const disableBtn = el('button',{className:'btn danger', onclick:async()=>{
      try {
        const response = await fetch(`/api/motors/${w.opts.motorIndex}/disable`, {
          method:'POST',
          headers:{'Content-Type':'application/json'}
        });
        if (!response.ok) {
          const text = await response.text();
          console.error('Motor disable failed:', text);
        } else {
          const result = await response.json();
          console.log('Motor disable response:', result);
          await refreshConfig(); // Refresh config after disable
        }
      } catch(e) { 
        console.warn('Motor disable failed', e); 
      }
    }}, 'Disable');
    
    ctr.append(
      el('hr',{className:'soft'}),
      el('div',{style:'margin:6px 0'}, [
        el('label',{},'Manual RPM: '),
        manualRPM,
        setBtn
      ]),
      el('div',{style:'margin:6px 0;display:flex;gap:6px'}, [enableBtn, disableBtn])
    );
    body.append(ctr);
  }

  (function update(){
    if (state.motors && state.motors[w.opts.motorIndex]) {
      const motor = state.motors[w.opts.motorIndex];
      const p=$('#motor_'+w.id);
      if(p){
        const enabledText = currentConfig ? (currentConfig.enabled ? 'EN' : 'DIS') : '?';
        p.textContent=`Input: ${(motor.input??0).toFixed(3)}, RPM: ${(motor.rpm_cmd??0).toFixed(1)}, ${enabledText}, ${motor.success?'OK':'ERR'}`;
      }
    }
    requestAnimationFrame(update);
  })();
}

/* ------------------------ LE Widget ---------------------------- */

/* ------------------------------- VFD widget -----------------------------
 * Live status + manual control for one configured VFD instance (selected by
 * name in widget settings). Status arrives in the tick frame under
 * state.vfd[name]; commands go through the REST endpoints
 * /api/vfd/{name}/{enable,disable,rpm,direction,fault_reset}. The instance
 * itself (drive, motor, port) is configured in the VFDs editor; this widget
 * just drives and displays it. */
function mountVFDWidget(w, body){
  const name = w.opts.vfdName || '';
  const wrap = el('div', {className:'vfd-wrap', style:'display:flex;flex-direction:column;gap:6px;font-size:12px'});

  // live readout grid
  const grid = el('div', {style:'display:grid;grid-template-columns:auto auto;gap:2px 10px'});
  const cells = {};
  const addRow = (label, key) => {
    grid.append(el('div',{style:'color:var(--muted)'}, label));
    const v = el('div',{style:'font-variant-numeric:tabular-nums'}, '—');
    cells[key] = v; grid.append(v);
  };
  addRow('RPM', 'rpm');
  addRow('Output Hz', 'output_hz');
  addRow('Current (A)', 'output_current_a');
  addRow('Voltage (V)', 'output_voltage_v');
  addRow('Bus (V)', 'bus_voltage_v');
  addRow('Power (W)', 'output_power_w');
  addRow('Direction', 'direction');
  addRow('State', '_state');
  addRow('Fault', 'fault_text');
  wrap.append(grid);

  let controlsBuilt = false, rpmInput = null;
  if (w.opts.showControls && !IS_POPOUT){
    const ctr = el('div', {style:'display:flex;flex-wrap:wrap;gap:4px;align-items:center;margin-top:4px'});
    rpmInput = el('input', {type:'number', step:String(w.opts.rpmStep||50), value:'0',
      style:'width:72px', title:'Target RPM'});
    const post = (path, bodyObj) => fetch(`/api/vfd/${encodeURIComponent(name)}/${path}`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify(bodyObj||{})
      }).then(r=>r.json()).then(j=>{ if(!j.ok) alert(`VFD ${path} failed: ${j.error||'?'}`); })
        .catch(e=>alert(`VFD ${path} failed: ${e.message}`));

    const setRpmBtn = el('button',{className:'btn',onclick:()=>post('rpm',{rpm:parseFloat(rpmInput.value)||0})}, 'Set RPM');
    const fwdBtn = el('button',{className:'btn',title:'Run forward',onclick:()=>post('enable',{reverse:false})}, '▶ Fwd');
    const revBtn = el('button',{className:'btn',title:'Run reverse',onclick:()=>post('enable',{reverse:true})}, '◀ Rev');
    const stopBtn = el('button',{className:'btn',title:'Stop',style:'background:#7a2233',onclick:()=>post('disable')}, '■ Stop');
    const rstBtn = el('button',{className:'btn',title:'Fault reset',onclick:()=>post('fault_reset')}, '⟲ Reset');
    ctr.append(rpmInput, setRpmBtn, fwdBtn, revBtn, stopBtn, rstBtn);
    wrap.append(ctr);
    controlsBuilt = true;
  }
  if (!name){
    wrap.append(el('div',{style:'color:#e6a23c;margin-top:4px'},
      '⚠ No VFD selected — open Settings and choose an instance.'));
  }

  body.append(wrap);

  // live update hook: called every tick via onTick -> updateVFDWidgets
  w._updateVfd = () => {
    const st = (state.vfd || {})[name];
    if (!st){ for (const k in cells) cells[k].textContent = '—'; return; }
    const fmt = (v) => (v===null||v===undefined) ? '—' : v;
    cells.rpm.textContent              = fmt(st.rpm);
    cells.output_hz.textContent        = fmt(st.output_hz);
    cells.output_current_a.textContent = fmt(st.output_current_a);
    cells.output_voltage_v.textContent = fmt(st.output_voltage_v);
    cells.bus_voltage_v.textContent    = fmt(st.bus_voltage_v);
    cells.output_power_w.textContent   = fmt(st.output_power_w);
    cells.direction.textContent        = fmt(st.direction);
    cells._state.textContent           = st.enabled ? 'RUNNING' : 'stopped';
    cells._state.style.color           = st.enabled ? '#9ece6a' : 'var(--muted)';
    cells.fault_text.textContent       = fmt(st.fault_text);
    cells.fault_text.style.color       = st.faulted ? '#f7768e' : 'var(--muted)';
  };
  w._updateVfd();
}

/* Called from onTick so every VFD widget refreshes from the latest frame. */
function updateVFDWidgets(){
  try {
    document.querySelectorAll('.widget').forEach(node=>{
      const id = (node.id||'').slice(2);
      const pg = state.pages[activePageIndex];
      const w = pg && (pg.widgets||[]).find(x=>x.id===id);
      if (w && w.type==='vfd' && typeof w._updateVfd==='function') w._updateVfd();
    });
  } catch(e){}
}

/* --------------------------- Unified drive widget -----------------------
 * One widget that drives EITHER a VFD or a stepper, chosen in settings
 * (driveType) -- mirrors the MOD Drv editor's "pick a type" idea. Status comes
 * from the tick frame: state.vfd[name] for VFDs, state.stepper[name] for
 * steppers; commands POST to /api/vfd/{name}/* or /api/stepper/{name}/*. The
 * instance (drive/motor/port) is configured in the MOD Drv editor. */
function mountDriveWidget(w, body){
  const isStep = (w.opts.driveType === 'stepper');
  const name = w.opts.driveName || '';
  const wrap = el('div', {style:'display:flex;flex-direction:column;gap:6px;font-size:12px'});

  const grid = el('div', {style:'display:grid;grid-template-columns:auto auto;gap:2px 10px'});
  const cells = {};
  const addRow = (label, key) => {
    grid.append(el('div',{style:'color:var(--muted)'}, label));
    const v = el('div',{style:'font-variant-numeric:tabular-nums'}, '—');
    cells[key] = v; grid.append(v);
  };
  if (isStep){
    addRow('Velocity (rpm)','velocity'); addRow('Position','position');
    addRow('State','_state'); addRow('Alarm','alarm'); addRow('Comms','_comms');
  } else {
    addRow('RPM','rpm'); addRow('Output Hz','output_hz');
    addRow('Current (A)','output_current_a'); addRow('Voltage (V)','output_voltage_v');
    addRow('Bus (V)','bus_voltage_v'); addRow('Power (W)','output_power_w');
    addRow('Direction','direction'); addRow('State','_state'); addRow('Fault','fault_text');
  }
  wrap.append(grid);

  const base = isStep ? 'stepper' : 'vfd';
  const post = (path, bodyObj) => fetch(`/api/${base}/${encodeURIComponent(name)}/${path}`, {
      method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(bodyObj||{})
    }).then(r=>r.json()).then(j=>{ if(!j.ok) alert(`${path} failed: ${j.error||'?'}`); })
      .catch(e=>alert(`${path} failed: ${e.message}`));

  let velInput = null;
  if (w.opts.showControls && !IS_POPOUT && name){
    const ctr = el('div', {style:'display:flex;flex-wrap:wrap;gap:4px;align-items:center;margin-top:4px'});
    if (isStep){
      velInput = el('input',{type:'number',step:String(w.opts.velStep||50),value:'200',style:'width:72px',title:'Velocity (rpm)'});
      const mag = () => Math.abs(parseFloat(velInput.value)||0);
      ctr.append(velInput,
        el('button',{className:'btn',title:'Enable drive',onclick:()=>post('enable')},'⏻ Enable'),
        el('button',{className:'btn',title:'Run forward at velocity',onclick:()=>post('velocity',{rpm:mag()})},'▶ Fwd'),
        el('button',{className:'btn',title:'Run reverse at velocity',onclick:()=>post('velocity',{rpm:-mag()})},'◀ Rev'),
        el('button',{className:'btn',title:'Quick-stop',style:'background:#7a2233',onclick:()=>post('stop')},'■ Stop'),
        el('button',{className:'btn',title:'Disable drive',onclick:()=>post('disable')},'⭘ Disable'),
        el('button',{className:'btn',title:'Reset alarm + zero the step count',
          onclick:()=>{ post('alarm_reset'); post('zero_position'); }},'⟲ Reset'));
    } else {
      velInput = el('input',{type:'number',step:String(w.opts.rpmStep||50),value:'0',style:'width:72px',title:'Target RPM'});
      ctr.append(velInput,
        el('button',{className:'btn',onclick:()=>post('rpm',{rpm:parseFloat(velInput.value)||0})},'Set RPM'),
        el('button',{className:'btn',title:'Run forward',onclick:()=>post('enable',{reverse:false})},'▶ Fwd'),
        el('button',{className:'btn',title:'Run reverse',onclick:()=>post('enable',{reverse:true})},'◀ Rev'),
        el('button',{className:'btn',title:'Stop',style:'background:#7a2233',onclick:()=>post('disable')},'■ Stop'),
        el('button',{className:'btn',title:'Fault reset',onclick:()=>post('fault_reset')},'⟲ Reset'));
    }
    wrap.append(ctr);
  }
  if (!name){
    wrap.append(el('div',{style:'color:#e6a23c;margin-top:4px'},
      '⚠ No drive selected — open Settings and choose type + instance.'));
  }
  body.append(wrap);

  w._updateDrive = () => {
    const st = ((isStep ? state.stepper : state.vfd) || {})[name];
    const fmt = (v,dp) => (v===null||v===undefined) ? '—'
      : (typeof v==='number' && dp!=null ? v.toFixed(dp) : v);
    if (!st){ for (const k in cells) cells[k].textContent='—'; return; }
    if (isStep){
      cells.velocity.textContent = fmt(st.velocity,0);
      cells.position.textContent = fmt(st.position,0);
      const running = !!st.running, enabled = !!st.enabled;
      cells._state.textContent = running ? 'RUNNING' : (enabled ? 'enabled' : 'stopped');
      cells._state.style.color = running ? '#9ece6a' : (enabled ? '#e0af68' : 'var(--muted)');
      cells.alarm.textContent = st.fault ? ('FAULT '+fmt(st.alarm,0)) : fmt(st.alarm,0);
      cells.alarm.style.color = (st.fault || st.alarm) ? '#f7768e' : 'var(--muted)';
      cells._comms.textContent = (st.ok===false) ? ('no reply'+(st.error?': '+st.error:'')) : 'ok';
      cells._comms.style.color = (st.ok===false) ? '#f7768e' : 'var(--muted)';
    } else {
      const f = (v)=>fmt(v);
      cells.rpm.textContent = f(st.rpm); cells.output_hz.textContent = f(st.output_hz);
      cells.output_current_a.textContent = f(st.output_current_a);
      cells.output_voltage_v.textContent = f(st.output_voltage_v);
      cells.bus_voltage_v.textContent = f(st.bus_voltage_v);
      cells.output_power_w.textContent = f(st.output_power_w);
      cells.direction.textContent = f(st.direction);
      cells._state.textContent = st.enabled ? 'RUNNING' : 'stopped';
      cells._state.style.color = st.enabled ? '#9ece6a' : 'var(--muted)';
      cells.fault_text.textContent = f(st.fault_text);
      cells.fault_text.style.color = st.faulted ? '#f7768e' : 'var(--muted)';
    }
  };
  w._updateDrive();
}

/* Called from onTick so every unified drive widget refreshes from the frame. */
function updateDriveWidgets(){
  try {
    document.querySelectorAll('.widget').forEach(node=>{
      const id = (node.id||'').slice(2);
      const pg = state.pages[activePageIndex];
      const w = pg && (pg.widgets||[]).find(x=>x.id===id);
      if (w && w.type==='drive' && typeof w._updateDrive==='function') w._updateDrive();
    });
  } catch(e){}
}

function mountLEWidget(w, body){
  body.style.padding = '4px';
  body.style.fontSize = '10px';
  body.style.fontFamily = 'monospace';
  
  let leConfig = null;
  
  // Fetch LE configuration
  (async () => {
    try {
      const resp = await fetch('/api/logic_elements');
      const data = await resp.json();
      leConfig = data.elements?.[w.opts.leIndex ?? 0];
      
      // Update widget title with LE name
      if (leConfig && leConfig.name) {
        const titleEl = document.querySelector(`#w_${w.id} .title`);
        if (titleEl) {
          titleEl.textContent = leConfig.name;
        }
      }
    } catch(e) {
      console.error('Failed to load LE config:', e);
    }
  })();
  
  (function update(){
    const idx = w.opts.leIndex ?? 0;
    const le = state.le?.[idx];
    
    if (!leConfig) {
      body.innerHTML = `<div style="text-align:center;color:var(--muted);padding:20px;font-size:11px">LE${idx}<br>Loading...</div>`;
      setTimeout(update, 100);
      return;
    }
    
    if (!le) {
      body.innerHTML = `<div style="text-align:center;color:var(--muted);padding:20px;font-size:11px">LE${idx}<br>Waiting for data...<br><small style="font-size:9px">Check server logs</small></div>`;
      setTimeout(update, 500);
      return;
    }

    // Process Input A
    const getInputInfo = (inputCfg) => {
      if (!inputCfg) return {label: '?', val: '?', detail: ''};
      
      const kind = inputCfg.kind || 'do';
      const ch = inputCfg.index || 0;
      let val = '?';
      let detail = '';
      
      if (kind === 'do') {
        const raw = state.do?.[ch] ?? 0;
        val = raw ? '1' : '0';
        return {label: `DO${ch}`, val, detail};
      }
      else if (kind === 'le') {
        const raw = state.le?.[ch]?.output ?? false;
        val = raw ? '1' : '0';
        return {label: `LE${ch}`, val, detail};
      }
      else if (kind === 'ai') {
        const rawVal = state.ai?.[ch] ?? 0;
        const comp = inputCfg.comparison || 'gt';
        let compVal = 0;
        
        if (inputCfg.compare_to_type === 'signal') {
          const cKind = inputCfg.compare_to_kind || 'ai';
          const cCh = inputCfg.compare_to_index || 0;
          if (cKind === 'ai') compVal = state.ai?.[cCh] ?? 0;
          else if (cKind === 'ao') compVal = state.ao?.[cCh] ?? 0;
          else if (cKind === 'tc') compVal = state.tc?.[cCh] ?? 0;
          else if (cKind === 'pid_u') compVal = state.pid?.[cCh]?.u ?? 0;
          else if (cKind === 'math') compVal = state.math?.[cCh]?.output ?? 0;
        } else {
          compVal = inputCfg.compare_value ?? 0;
        }
        
        let result = false;
        if (comp === 'lt') result = rawVal < compVal;
        else if (comp === 'eq') result = Math.abs(rawVal - compVal) < 0.001;
        else result = rawVal > compVal;
        
        val = result ? '1' : '0';
        const compSym = comp === 'lt' ? '<' : (comp === 'eq' ? '=' : '>');
        detail = `${rawVal.toFixed(1)}${compSym}${compVal.toFixed(1)}`;
        return {label: `AI${ch}`, val, detail};
      }
      else if (kind === 'ao') {
        const rawVal = state.ao?.[ch] ?? 0;
        const comp = inputCfg.comparison || 'gt';
        let compVal = 0;
        
        if (inputCfg.compare_to_type === 'signal') {
          const cKind = inputCfg.compare_to_kind || 'ai';
          const cCh = inputCfg.compare_to_index || 0;
          if (cKind === 'ai') compVal = state.ai?.[cCh] ?? 0;
          else if (cKind === 'ao') compVal = state.ao?.[cCh] ?? 0;
          else if (cKind === 'tc') compVal = state.tc?.[cCh] ?? 0;
          else if (cKind === 'pid_u') compVal = state.pid?.[cCh]?.u ?? 0;
          else if (cKind === 'math') compVal = state.math?.[cCh]?.output ?? 0;
        } else {
          compVal = inputCfg.compare_value ?? 0;
        }
        
        let result = false;
        if (comp === 'lt') result = rawVal < compVal;
        else if (comp === 'eq') result = Math.abs(rawVal - compVal) < 0.001;
        else result = rawVal > compVal;
        
        val = result ? '1' : '0';
        const compSym = comp === 'lt' ? '<' : (comp === 'eq' ? '=' : '>');
        detail = `${rawVal.toFixed(1)}${compSym}${compVal.toFixed(1)}`;
        return {label: `AO${ch}`, val, detail};
      }
      else if (kind === 'tc') {
        const rawVal = state.tc?.[ch];
        
        // Check for null/undefined/NaN (missing TC)
        if (rawVal === null || rawVal === undefined || !Number.isFinite(rawVal)) {
          return {label: `TC${ch}`, val: 'X', detail: 'not detected', isInvalid: true};
        }
        
        const comp = inputCfg.comparison || 'gt';
        let compVal = 0;
        
        if (inputCfg.compare_to_type === 'signal') {
          const cKind = inputCfg.compare_to_kind || 'ai';
          const cCh = inputCfg.compare_to_index || 0;
          if (cKind === 'ai') compVal = state.ai?.[cCh] ?? 0;
          else if (cKind === 'ao') compVal = state.ao?.[cCh] ?? 0;
          else if (cKind === 'tc') compVal = state.tc?.[cCh] ?? 0;
          else if (cKind === 'pid_u') compVal = state.pid?.[cCh]?.u ?? 0;
          else if (cKind === 'math') compVal = state.math?.[cCh]?.output ?? 0;
        } else {
          compVal = inputCfg.compare_value ?? 0;
        }
        
        let result = false;
        if (comp === 'lt') result = rawVal < compVal;
        else if (comp === 'eq') result = Math.abs(rawVal - compVal) < 0.001;
        else result = rawVal > compVal;
        
        val = result ? '1' : '0';
        const compSym = comp === 'lt' ? '<' : (comp === 'eq' ? '=' : '>');
        detail = `${rawVal.toFixed(1)}${compSym}${compVal.toFixed(1)}`;
        return {label: `TC${ch}`, val, detail};
      }
      else if (kind === 'pid_u') {
        const rawVal = state.pid?.[ch]?.u ?? 0;
        const comp = inputCfg.comparison || 'gt';
        let compVal = 0;
        
        if (inputCfg.compare_to_type === 'signal') {
          const cKind = inputCfg.compare_to_kind || 'ai';
          const cCh = inputCfg.compare_to_index || 0;
          if (cKind === 'ai') compVal = state.ai?.[cCh] ?? 0;
          else if (cKind === 'ao') compVal = state.ao?.[cCh] ?? 0;
          else if (cKind === 'tc') compVal = state.tc?.[cCh] ?? 0;
          else if (cKind === 'pid_u') compVal = state.pid?.[cCh]?.u ?? 0;
          else if (cKind === 'math') compVal = state.math?.[cCh]?.output ?? 0;
        } else {
          compVal = inputCfg.compare_value ?? 0;
        }
        
        let result = false;
        if (comp === 'lt') result = rawVal < compVal;
        else if (comp === 'eq') result = Math.abs(rawVal - compVal) < 0.001;
        else result = rawVal > compVal;
        
        val = result ? '1' : '0';
        const compSym = comp === 'lt' ? '<' : (comp === 'eq' ? '=' : '>');
        detail = `${rawVal.toFixed(1)}${compSym}${compVal.toFixed(1)}`;
        return {label: `PID${ch}`, val, detail};
      }
      else if (kind === 'math') {
        const rawVal = state.math?.[ch]?.output ?? 0;
        
        // Check if there's a comparison configured
        if (inputCfg.comparison) {
          const comp = inputCfg.comparison;
          let compVal = 0;
          
          if (inputCfg.compare_to_type === 'signal') {
            const cKind = inputCfg.compare_to_kind || 'ai';
            const cCh = inputCfg.compare_to_index || 0;
            if (cKind === 'ai') compVal = state.ai?.[cCh] ?? 0;
            else if (cKind === 'ao') compVal = state.ao?.[cCh] ?? 0;
            else if (cKind === 'tc') compVal = state.tc?.[cCh] ?? 0;
            else if (cKind === 'pid_u') compVal = state.pid?.[cCh]?.u ?? 0;
            else if (cKind === 'math') compVal = state.math?.[cCh]?.output ?? 0;
          } else {
            compVal = inputCfg.compare_value ?? 0;
          }
          
          let result = false;
          if (comp === 'lt') result = rawVal < compVal;
          else if (comp === 'eq') result = Math.abs(rawVal - compVal) < 0.001;
          else result = rawVal > compVal;
          
          val = result ? '1' : '0';
          const compSym = comp === 'lt' ? '<' : (comp === 'eq' ? '=' : '>');
          detail = `${rawVal.toFixed(1)}${compSym}${compVal.toFixed(1)}`;
          return {label: `Math${ch}`, val, detail};
        } else {
          // No comparison - just use the value as boolean (non-zero = 1)
          val = rawVal !== 0 ? '1' : '0';
          detail = rawVal.toFixed(2);
          return {label: `Math${ch}`, val, detail};
        }
      }
      else if (kind === 'expr') {
        // Expression output
        const exprData = state.expr?.[ch];
        const rawVal = exprData?.output ?? (typeof exprData === 'number' ? exprData : 0);
        
        // Check if there's a comparison configured
        if (inputCfg.comparison) {
          const comp = inputCfg.comparison;
          let compVal = 0;
          
          if (inputCfg.compare_to_type === 'signal') {
            const cKind = inputCfg.compare_to_kind || 'ai';
            const cCh = inputCfg.compare_to_index || 0;
            if (cKind === 'ai') compVal = state.ai?.[cCh] ?? 0;
            else if (cKind === 'ao') compVal = state.ao?.[cCh] ?? 0;
            else if (cKind === 'tc') compVal = state.tc?.[cCh] ?? 0;
            else if (cKind === 'pid_u') compVal = state.pid?.[cCh]?.u ?? 0;
            else if (cKind === 'math') compVal = state.math?.[cCh]?.output ?? 0;
            else if (cKind === 'expr') compVal = state.expr?.[cCh]?.output ?? 0;
          } else {
            compVal = inputCfg.compare_value ?? 0;
          }
          
          let result = false;
          if (comp === 'lt') result = rawVal < compVal;
          else if (comp === 'eq') result = Math.abs(rawVal - compVal) < 0.001;
          else result = rawVal > compVal;
          
          val = result ? '1' : '0';
          const compSym = comp === 'lt' ? '<' : (comp === 'eq' ? '=' : '>');
          detail = `${rawVal.toFixed(1)}${compSym}${compVal.toFixed(1)}`;
          return {label: `Expr${ch}`, val, detail};
        } else {
          // No comparison - use >= 1.0 as boolean
          val = rawVal >= 1.0 ? '1' : '0';
          detail = rawVal.toFixed(2);
          return {label: `Expr${ch}`, val, detail};
        }
      }
      
      return {label: '?', val: '?', detail: ''};
    };
    
    // For now, always use input_a/input_b (inputs array has wrong defaults from Pydantic)
    const inputA = leConfig.input_a;
    const inputB = leConfig.input_b;
    
    const inA = getInputInfo(inputA);
    const inB = getInputInfo(inputB);
    const output = le.output ? '1' : '0';
    const op = (leConfig.operation || 'and').toUpperCase();
    
    // Helper to get color for input value
    const getInputColor = (inp) => {
      if (inp.val === 'X') return '#ff9e64'; // Orange for invalid
      return inp.val === '1' ? '#2faa60' : '#d84a4a';
    };
    
    // Compact 5-box layout: [A][OP][B][=][OUT] - using flex for scaling
    body.innerHTML = `
      <div style="display:flex;gap:2px;justify-content:center;align-items:center;height:100%;padding:2px">
        <div style="text-align:center;padding:3px;border:1px solid ${inA.val==='X'?'#ff9e64':'#2a3046'};border-radius:3px;background:#1a1d2e;flex:1;min-width:0;overflow:hidden">
          <div style="font-size:8px;color:#79c0ff;line-height:1.2">${inA.label}</div>
          <div style="font-size:20px;font-weight:bold;line-height:1.2;color:${getInputColor(inA)}">${inA.val}</div>
          ${inA.detail ? `<div style="font-size:7px;color:#7a7f8f;line-height:1.2;margin-top:1px">${inA.detail}</div>` : ''}
        </div>
        <div style="text-align:center;padding:3px;border:1px solid #2a3046;border-radius:3px;background:#1a1d2e;flex:0 0 35px;overflow:hidden">
          <div style="font-size:11px;font-weight:bold;color:#e0af68;line-height:1.4">${op}</div>
        </div>
        <div style="text-align:center;padding:3px;border:1px solid ${inB.val==='X'?'#ff9e64':'#2a3046'};border-radius:3px;background:#1a1d2e;flex:1;min-width:0;overflow:hidden">
          <div style="font-size:8px;color:#79c0ff;line-height:1.2">${inB.label}</div>
          <div style="font-size:20px;font-weight:bold;line-height:1.2;color:${getInputColor(inB)}">${inB.val}</div>
          ${inB.detail ? `<div style="font-size:7px;color:#7a7f8f;line-height:1.2;margin-top:1px">${inB.detail}</div>` : ''}
        </div>
        <div style="text-align:center;padding:3px;flex:0 0 15px">
          <div style="font-size:14px;color:#9aa1b9;line-height:1.4">=</div>
        </div>
        <div style="text-align:center;padding:3px;border:2px solid ${output==='1'?'#2faa60':'#d84a4a'};border-radius:3px;background:#1a1d2e;flex:1;min-width:0;overflow:hidden">
          <div style="font-size:8px;color:#9aa1b9;line-height:1.2">OUT</div>
          <div style="font-size:22px;font-weight:bold;line-height:1.2;color:${output==='1'?'#2faa60':'#d84a4a'}">${output}</div>
        </div>
      </div>
    `;
    
    requestAnimationFrame(update);
  })();
}

function mountMathOpWidget(w, body){
  body.style.padding = '4px';
  body.style.fontSize = '10px';
  body.style.fontFamily = 'monospace';
  
  let mathConfig = null;
  
  // Fetch math operator configuration once on mount
  (async () => {
    try {
      const resp = await fetch('/api/math_operators');
      const data = await resp.json();
      mathConfig = data.operators?.[w.opts.mathIndex ?? 0];
      
      // Update widget title with op name
      if (mathConfig && mathConfig.name) {
        const titleEl = document.querySelector(`#w_${w.id} .title`);
        if (titleEl) {
          titleEl.textContent = mathConfig.name;
        }
      }
    } catch(e) {
      console.error('Failed to load math op config:', e);
    }
  })();
  
  (function update(){
    const idx = w.opts.mathIndex ?? 0;
    const mathOp = state.math?.[idx];
    
    if (!mathConfig) {
      body.innerHTML = `<div style="text-align:center;color:var(--muted);padding:20px;font-size:11px">Math${idx}<br>Loading config...</div>`;
      setTimeout(update, 100);
      return;
    }
    
    // Check if state.math exists at all
    if (!state.math) {
      body.innerHTML = `<div style="text-align:center;color:#ff9e64;padding:20px;font-size:11px">Math system not initialized<br><span style="font-size:9px">Create operators in Math editor</span></div>`;
      setTimeout(update, 1000);
      return;
    }
    
    // Check if this specific operator exists
    if (!mathOp) {
      body.innerHTML = `<div style="text-align:center;color:#ff9e64;padding:20px;font-size:11px">Math${idx} not found<br><span style="font-size:9px">${state.math.length} operators configured</span></div>`;
      setTimeout(update, 1000);
      return;
    }

    // Get operation symbol/name
    const opSymbols = {
      'add': '+', 'sub': '−', 'mul': '×', 'div': '÷',
      'mod': 'mod', 'pow': '^', 'min': 'min', 'max': 'max',
      'sqr': 'x²', 'sqrt': '√', 'log10': 'log₁₀', 'ln': 'ln',
      'exp': 'exp', 'sin': 'sin', 'cos': 'cos', 'tan': 'tan',
      'asin': 'asin', 'acos': 'acos', 'atan': 'atan', 'atan2': 'atan2',
      'abs': '|x|', 'neg': '−x', 'filter': '🔽'
    };
    const opDisplay = opSymbols[mathConfig.operation] || mathConfig.operation;
    
    // Check if binary or unary
    const isBinary = mathOp.input_b !== null && mathOp.input_b !== undefined;
    
    // Format values
    const valA = Number.isFinite(mathOp.input_a) ? mathOp.input_a.toFixed(3) : '---';
    const valB = isBinary && Number.isFinite(mathOp.input_b) ? mathOp.input_b.toFixed(3) : null;
    const output = Number.isFinite(mathOp.output) ? mathOp.output.toFixed(3) : '---';
    
    // Get input labels
    const getLabel = (inp) => {
      if (!inp) return '?';
      const k = inp.kind || 'ai';
      const i = inp.index || 0;
      if (k === 'ai') return `AI${i}`;
      if (k === 'ao') return `AO${i}`;
      if (k === 'tc') return `TC${i}`;
      if (k === 'pid_u') return `PID${i}`;
      if (k === 'math') return `M${i}`;
      return '?';
    };
    
    const labelA = getLabel(mathConfig.input_a);
    const labelB = isBinary ? getLabel(mathConfig.input_b) : null;
    
    if (w.opts.showInputs) {
      // Show detailed layout with inputs
      if (isBinary) {
        // Binary: [A] [OP] [B] = [OUT]
        body.innerHTML = `
          <div style="display:flex;gap:2px;justify-content:center;align-items:center;height:100%;padding:2px">
            <div style="text-align:center;padding:3px;border:1px solid #2a3046;border-radius:3px;background:#1a1d2e;flex:1;min-width:0;overflow:hidden">
              <div style="font-size:7px;color:#79c0ff;line-height:1.2">${labelA}</div>
              <div style="font-size:14px;font-weight:bold;line-height:1.2;color:#9aa1b9">${valA}</div>
            </div>
            <div style="text-align:center;padding:3px;border:1px solid #2a3046;border-radius:3px;background:#1a1d2e;flex:0 0 35px;overflow:hidden">
              <div style="font-size:14px;font-weight:bold;color:#e0af68;line-height:1.4">${opDisplay}</div>
            </div>
            <div style="text-align:center;padding:3px;border:1px solid #2a3046;border-radius:3px;background:#1a1d2e;flex:1;min-width:0;overflow:hidden">
              <div style="font-size:7px;color:#79c0ff;line-height:1.2">${labelB}</div>
              <div style="font-size:14px;font-weight:bold;line-height:1.2;color:#9aa1b9">${valB}</div>
            </div>
            <div style="text-align:center;padding:3px;flex:0 0 15px">
              <div style="font-size:14px;color:#9aa1b9;line-height:1.4">=</div>
            </div>
            <div style="text-align:center;padding:3px;border:2px solid #7aa2f7;border-radius:3px;background:#1a1d2e;flex:1;min-width:0;overflow:hidden">
              <div style="font-size:7px;color:#9aa1b9;line-height:1.2">OUT</div>
              <div style="font-size:16px;font-weight:bold;line-height:1.2;color:#7aa2f7">${output}</div>
            </div>
          </div>
        `;
      } else {
        // Unary: [OP]([A]) = [OUT]
        // Special layout for filter operation
        if (mathConfig.operation === 'filter') {
          const rawVal = mathOp.raw_value !== undefined ? mathOp.raw_value.toFixed(3) : valA;
          const filterHz = mathOp.filter_hz || 1.0;
          body.innerHTML = `
            <div style="display:flex;gap:2px;justify-content:center;align-items:center;height:100%;padding:2px">
              <div style="text-align:center;padding:3px;border:1px solid #2a3046;border-radius:3px;background:#1a1d2e;flex:1;min-width:0;overflow:hidden">
                <div style="font-size:7px;color:#79c0ff;line-height:1.2">${labelA}</div>
                <div style="font-size:14px;font-weight:bold;line-height:1.2;color:#9aa1b9">${rawVal}</div>
                <div style="font-size:6px;color:#7a7f8f;line-height:1.2;margin-top:1px">${filterHz}Hz</div>
              </div>
              <div style="text-align:center;padding:3px;border:1px solid #2a3046;border-radius:3px;background:#1a1d2e;flex:0 0 35px;overflow:hidden">
                <div style="font-size:12px;font-weight:bold;color:#e0af68;line-height:1.4">${opDisplay}</div>
              </div>
              <div style="text-align:center;padding:3px;border:2px solid #7aa2f7;border-radius:3px;background:#1a1d2e;flex:1;min-width:0;overflow:hidden">
                <div style="font-size:7px;color:#9aa1b9;line-height:1.2">FILT</div>
                <div style="font-size:16px;font-weight:bold;line-height:1.2;color:#7aa2f7">${output}</div>
              </div>
            </div>
          `;
        } else {
          // Standard unary: [OP]([A]) = [OUT]
          body.innerHTML = `
            <div style="display:flex;gap:2px;justify-content:center;align-items:center;height:100%;padding:2px">
              <div style="text-align:center;padding:3px;border:1px solid #2a3046;border-radius:3px;background:#1a1d2e;flex:0 0 45px;overflow:hidden">
                <div style="font-size:12px;font-weight:bold;color:#e0af68;line-height:1.4">${opDisplay}</div>
              </div>
              <div style="text-align:center;padding:2px;flex:0 0 10px">
                <div style="font-size:16px;color:#7a7f8f;line-height:1.4">(</div>
              </div>
              <div style="text-align:center;padding:3px;border:1px solid #2a3046;border-radius:3px;background:#1a1d2e;flex:1;min-width:0;overflow:hidden">
                <div style="font-size:7px;color:#79c0ff;line-height:1.2">${labelA}</div>
                <div style="font-size:14px;font-weight:bold;line-height:1.2;color:#9aa1b9">${valA}</div>
              </div>
              <div style="text-align:center;padding:2px;flex:0 0 10px">
                <div style="font-size:16px;color:#7a7f8f;line-height:1.4">)</div>
              </div>
              <div style="text-align:center;padding:2px;flex:0 0 15px">
                <div style="font-size:14px;color:#9aa1b9;line-height:1.4">=</div>
              </div>
              <div style="text-align:center;padding:3px;border:2px solid #7aa2f7;border-radius:3px;background:#1a1d2e;flex:1;min-width:0;overflow:hidden">
                <div style="font-size:7px;color:#9aa1b9;line-height:1.2">OUT</div>
                <div style="font-size:16px;font-weight:bold;line-height:1.2;color:#7aa2f7">${output}</div>
              </div>
            </div>
          `;
        }
      }
    } else {
      // Compact: just show output
      body.innerHTML = `
        <div style="display:flex;flex-direction:column;justify-content:center;align-items:center;height:100%;gap:2px">
          <div style="font-size:9px;color:#9aa1b9">${opDisplay}</div>
          <div style="font-size:22px;font-weight:bold;color:#7aa2f7">${output}</div>
          <div style="font-size:8px;color:#7a7f8f">${mathConfig.name || 'Math'}</div>
        </div>
      `;
    }
    
    requestAnimationFrame(update);
  })();
}

/* ------------------------ Expression Widget ---------------------------- */
function mountExprWidget(w, body){
  body.style.padding = '8px';
  body.style.fontSize = '12px';
  body.style.fontFamily = 'Consolas, Monaco, Courier New, monospace';
  
  (function update(){
    const idx = w.opts.exprIndex ?? 0;
    const showSource = w.opts.showSource !== false;
    const showOutput = w.opts.showOutput !== false;
    
    // Clear body
    body.innerHTML = '';
    
    // Debug logging
    
    if (!state.expr || !Array.isArray(state.expr) || state.expr.length === 0) {
      body.append(el('div', {
        className:'expr-error',
        textContent: 'Expression system not initialized'
      }));
      setTimeout(update, 1000);
      return;
    }
    
    const exprData = state.expr[idx];
    
    // Debug logging for exprData
    
    // Check if data is a number (initial state) vs object (real telemetry)
    if (typeof exprData === 'number') {
      body.append(el('div', {
        className:'expr-error',
        textContent: 'Waiting for expression data...'
      }));
      setTimeout(update, 1000);
      return;
    }
    
    if (!exprData) {
      body.append(el('div', {
        className:'expr-error',
        textContent: `Expression ${idx} not found`
      }));
      setTimeout(update, 1000);
      return;
    }
    
    if (!exprData.enabled) {
      body.append(el('div', {
        className:'expr-disabled',
        textContent: 'Expression disabled'
      }));
      setTimeout(update, 1000);
      return;
    }
    
    if (exprData.error) {
      const errorDiv = el('div', {className:'expr-error'});
      errorDiv.append(
        el('div', {style:'font-weight:600;margin-bottom:4px'}, '⚠️ Error'),
        el('div', {style:'font-size:11px'}, exprData.error)
      );
      body.append(errorDiv);
      setTimeout(update, 1000);
      return;
    }
    
    // Display variables
    if (showSource && exprData.locals) {
      
      const varsDiv = el('div', {className:'expr-vars'});
      
      const locals = exprData.locals || {};
      for (const [name, value] of Object.entries(locals)) {

        const varRow = el('div', {className:'expr-var-row'});
        varRow.append(
          el('span', {className:'expr-var-name'}, name),
          el('span', {className:'expr-var-eq'}, ' = '),
          el('span', {
            className:'expr-var-value',
            style: `color: ${getValueColor(value)}`
          }, formatValue(value))
        );
        varsDiv.append(varRow);
      }
      
      body.append(varsDiv);
    }
    
    // Display hardware writes
    const hwWrites = exprData.hw_writes || [];
    if (hwWrites.length > 0) {
      const hwDiv = el('div', {className:'expr-hw-writes'});
      hwDiv.append(el('div', {className:'expr-section-label'}, '⚡ Hardware Writes'));
      
      for (const hw of hwWrites) {
        const hwRow = el('div', {className:'expr-hw-row'});
        hwRow.append(
          el('span', {className:'expr-hw-type'}, hw.type.toUpperCase()),
          el('span', {className:'expr-hw-ch'}, `[${hw.channel}]`),
          el('span', {className:'expr-hw-eq'}, ' ← '),
          el('span', {
            className:'expr-hw-value',
            style: hw.type === 'do' 
              ? `color:${hw.value ? '#2faa60' : '#d84a4a'}` 
              : `color: ${getValueColor(hw.value)}`
          }, hw.type === 'do' ? (hw.value ? 'ON' : 'OFF') : formatValue(hw.value))
        );
        hwDiv.append(hwRow);
      }
      
      body.append(hwDiv);
    }
    
    // Show output
    if (showOutput) {
      const outputDiv = el('div', {className:'expr-output'});
      outputDiv.append(
        el('span', {className:'expr-output-label'}, '► Output: '),
        el('span', {
          className:'expr-output-value',
          style: `color: ${getValueColor(exprData.output)};font-weight:700;font-size:16px`
        }, formatValue(exprData.output))
      );
      body.append(outputDiv);
    }
    
    requestAnimationFrame(update);
  })();
}

/* =========================== console widget ============================ */
/* Mirror of the server's stdout/stderr. The server pushes new lines via
   {type:'console'} WebSocket messages; we route them through
   _onConsoleMessage which fans out to every mounted console widget on
   the active page.

   Each console widget maintains its own DOM (a scrolling <div> of lines)
   so layout/font settings are independent per widget. Filtering by stream
   ('stdout'/'stderr'/'both') is also per-widget.

   Sticky scroll: if the user is within 4px of the bottom when a new line
   arrives, we keep scrolling them along. If they've scrolled up to read
   something, we leave them alone — but a small "▼ N new" badge appears
   so they know more lines arrived. Clicking the badge jumps to bottom.

   The widget registry is keyed by widget id and points at a `controller`
   object with append/replace/clear methods. When a widget is replaced
   by renderPage (rebuild), the old controller is naturally orphaned —
   its DOM is gone — and a fresh one replaces it in the registry. */

const _consoleControllers = new Map();   // widget.id → controller

/**
 * Dispatch a {type:'console'} WS message to every mounted console widget
 * on the active page. Called from the WebSocket onmessage handler.
 */
function _onConsoleMessage(msg) {
  if (!msg || !Array.isArray(msg.lines)) return;
  for (const ctrl of _consoleControllers.values()) {
    try {
      if (msg.replace) ctrl.replace(msg.lines);
      else             ctrl.append(msg.lines);
    } catch (e) {
      console.warn('console widget feed failed:', e);
    }
  }
}

function mountConsole(w, body) {
  // Use a clean monospace layout. The "screen" div is where lines render;
  // its scroll position drives sticky-scroll detection. A small toolbar
  // sits above with pause/clear/autoscroll controls.
  body.style.cssText = 'display:flex;flex-direction:column;padding:0;background:#0c0e16;overflow:hidden;';

  // Toolbar — minimal, monochrome so it doesn't compete with log content.
  const toolbar = el('div', {
    style: 'display:flex;align-items:center;gap:6px;padding:4px 6px;background:#11141d;' +
           'border-bottom:1px solid #1f2330;flex-shrink:0;font-size:11px;color:#7a8199;'
  });

  const pauseBtn = el('button', {
    className:'btn',
    style:'padding:3px 7px;font-size:11px',
    title:'Pause line appending (does not stop server output)'
  }, '⏸ Pause');
  let _paused = false;            // transient: pause is per-mount, not saved
  pauseBtn.onclick = () => {
    _paused = !_paused;
    pauseBtn.textContent = _paused ? '▶ Resume' : '⏸ Pause';
    if (!_paused) flushQueued();
  };

  const clearBtn = el('button', {
    className:'btn',
    style:'padding:3px 7px;font-size:11px',
    title:'Clear this widget (server buffer is unaffected)'
  }, '🗑 Clear');
  clearBtn.onclick = () => {
    screen.innerHTML = '';
    _lineCount = 0;
    _hideNewBadge();
  };

  const asLabel = el('label', { style:'display:inline-flex;align-items:center;gap:4px;cursor:pointer' });
  const asChk = el('input', { type:'checkbox' });
  asChk.checked = (w.opts.autoscroll !== false);
  asChk.onchange = () => {
    w.opts.autoscroll = asChk.checked;
    if (asChk.checked) {
      screen.scrollTop = screen.scrollHeight;
      _hideNewBadge();
    }
  };
  asLabel.append(asChk, document.createTextNode('Auto-scroll'));

  // Stream filter — quick toggle without opening settings.
  const streamSel = el('select', {
    style:'background:#1a1d2e;color:#cfd3e0;border:1px solid #2b2f45;border-radius:3px;font-size:11px;padding:1px 4px;'
  });
  [['both','stdout+stderr'],['stdout','stdout only'],['stderr','stderr only']]
    .forEach(([v,l]) => streamSel.append(el('option', {value:v}, l)));
  streamSel.value = w.opts.showStream || 'both';
  streamSel.onchange = () => {
    w.opts.showStream = streamSel.value;
    // Re-apply visibility for already-rendered lines without rebuilding
    // the entire DOM (the lines are tagged with their stream label).
    for (const node of screen.children) {
      const s = node.dataset.stream;
      node.style.display = _streamVisible(s) ? '' : 'none';
    }
    if (asChk.checked) screen.scrollTop = screen.scrollHeight;
  };

  const spacer = el('span', { style:'flex:1' });
  const seqLabel = el('span', { style:'font-family:monospace;color:#5a6075' }, '');

  // "Test" — hits /api/console/test which forces a stdout + stderr print
  // on the server. If the live WS stream is healthy the user sees the
  // two prints arrive within a fraction of a second. If they don't, the
  // problem is the live broadcast path, not the widget.
  const testBtn = el('button', {
    className:'btn',
    style:'padding:3px 7px;font-size:11px',
    title:'Force a server-side stdout+stderr print to verify the live stream'
  }, '🔧 Test');
  testBtn.onclick = async () => {
    try {
      const r = await fetch('/api/console/test', { method: 'POST' });
      if (!r.ok) {
        // Show this directly in the widget so the user gets feedback even
        // if the server is in a state where the print itself isn't reaching us.
        controller.append([[Date.now(), 'stderr',
          `[CONSOLE-TEST] /api/console/test returned HTTP ${r.status}`]]);
      }
    } catch (e) {
      controller.append([[Date.now(), 'stderr',
        `[CONSOLE-TEST] fetch failed: ${e.message || e}`]]);
    }
  };

  toolbar.append(pauseBtn, clearBtn, asLabel, streamSel, testBtn, spacer, seqLabel);

  // The screen where lines render. White-space mode honors opts.wrap.
  const screen = el('div', {
    style: 'flex:1;overflow:auto;padding:4px 6px;font-family:Consolas,Menlo,monospace;' +
           `font-size:${w.opts.fontSize || 12}px;line-height:1.35;color:#cfd3e0;` +
           (w.opts.wrap ? 'white-space:pre-wrap;word-break:break-all;'
                        : 'white-space:pre;') +
           'background:#0c0e16;'
  });

  // "▼ N new lines" badge that appears when autoscroll is off and the
  // user has scrolled up. Click to jump to bottom.
  const newBadge = el('div', {
    style: 'position:absolute;right:14px;bottom:10px;background:#79c0ff;color:#0c0e16;' +
           'padding:3px 8px;border-radius:11px;font-size:11px;font-family:system-ui;' +
           'cursor:pointer;font-weight:600;display:none;box-shadow:0 1px 4px rgba(0,0,0,0.4);z-index:5;'
  }, '');
  newBadge.onclick = () => {
    screen.scrollTop = screen.scrollHeight;
    _hideNewBadge();
  };

  body.style.position = 'relative';   // so the absolute-positioned badge anchors here
  body.append(toolbar, screen, newBadge);

  // --- internal state -----------------------------------------------------
  let _lineCount  = 0;            // current rendered line count (DOM children)
  let _queued     = [];           // lines arriving while paused
  let _newCount   = 0;            // unseen lines while scrolled up
  let _userScrolledUp = false;    // sticky-scroll state

  function _streamVisible(s) {
    const f = w.opts.showStream || 'both';
    if (f === 'both') return true;
    return s === f;
  }
  function _isAtBottom() {
    // Within 4px counts as "at bottom" — accounts for sub-pixel scroll quirks.
    return (screen.scrollHeight - screen.scrollTop - screen.clientHeight) < 4;
  }
  function _showNewBadge() {
    newBadge.style.display = '';
    newBadge.textContent = `▼ ${_newCount} new`;
  }
  function _hideNewBadge() {
    newBadge.style.display = 'none';
    _newCount = 0;
  }

  // Track user scroll so we know whether to auto-scroll on append.
  screen.addEventListener('scroll', () => {
    _userScrolledUp = !_isAtBottom();
    if (!_userScrolledUp) _hideNewBadge();
  });

  function _appendOne(seq, stream, text) {
    const node = document.createElement('div');
    node.dataset.stream = stream;
    node.dataset.seq    = String(seq);
    // Tag stderr lines with a distinguishing color so error output stands
    // out from regular output (matches how PyCharm/terminal usually
    // differentiate). stdout uses the default body color.
    if (stream === 'stderr') node.style.color = '#ff8b8b';
    node.textContent = text;
    if (!_streamVisible(stream)) node.style.display = 'none';
    screen.appendChild(node);
    _lineCount++;
    // Cap rendered lines to bound DOM size. Remove from the top
    // (oldest) when over the limit.
    const cap = Math.max(100, w.opts.maxLines | 0 || 5000);
    while (_lineCount > cap && screen.firstChild) {
      screen.removeChild(screen.firstChild);
      _lineCount--;
    }
  }

  function appendLines(lines) {
    if (!lines || !lines.length) return;
    const wasAtBottom = _isAtBottom();
    for (const t of lines) {
      // Each tuple is [seq, stream_label, text]; fail-soft on malformed.
      if (!Array.isArray(t) || t.length < 3) continue;
      _appendOne(t[0], t[1], t[2]);
    }
    seqLabel.textContent = `#${lines[lines.length - 1][0]}`;
    // Scroll handling:
    //   - autoscroll off → never scroll; show badge with count
    //   - autoscroll on, was at bottom → follow to new bottom
    //   - autoscroll on, user scrolled up → leave alone; show badge
    if (!asChk.checked || _userScrolledUp) {
      // Count only visible (filtered) lines for the badge
      const visibleAdded = lines.filter(t => _streamVisible(t[1])).length;
      if (visibleAdded > 0) {
        _newCount += visibleAdded;
        _showNewBadge();
      }
    } else if (wasAtBottom || asChk.checked) {
      screen.scrollTop = screen.scrollHeight;
    }
  }

  function flushQueued() {
    if (_queued.length) {
      appendLines(_queued);
      _queued = [];
    }
  }

  // --- controller API exposed via the registry ---------------------------
  const controller = {
    append(lines) {
      if (_paused) { _queued.push(...lines); return; }
      appendLines(lines);
    },
    replace(lines) {
      // Full re-sync (e.g. on initial WS connect). Clear and load.
      screen.innerHTML = '';
      _lineCount = 0;
      _hideNewBadge();
      _queued = [];
      appendLines(lines);
    },
  };
  _consoleControllers.set(w.id, controller);

  // Pull the buffered server-side history so this widget shows recent
  // output immediately, not only lines that arrive AFTER mount. The WS
  // 'replace' message that gets sent on connect doesn't help here because
  // by then the widget didn't exist yet — this fetch fills the gap.
  fetch('/api/console/snapshot')
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      if (!data || !Array.isArray(data.lines)) return;
      // Only apply if this widget is still mounted (user might have
      // deleted it between mount and fetch completion).
      if (_consoleControllers.get(w.id) === controller) {
        controller.replace(data.lines);
      }
    })
    .catch(err => console.warn('console snapshot fetch failed:', err));

  // Clean up the registry entry when this DOM node disappears. We use a
  // MutationObserver on the canvas to notice when our widget gets removed
  // by renderPage. Cheaper alternative would be a hook in renderPage,
  // but the observer keeps this module self-contained.
  //
  // Identity check is critical: renderPage rebuilds the widget, mounting
  // a fresh controller before our old observer fires. If we deleted
  // unconditionally by id, we'd wipe out the fresh controller. So we
  // only delete when the registry still points at OUR (now-stale)
  // controller — meaning no replacement has been installed yet.
  const cv = document.getElementById('canvas');
  if (cv && cv !== body) {
    const obs = new MutationObserver(() => {
      if (!body.isConnected) {
        if (_consoleControllers.get(w.id) === controller) {
          _consoleControllers.delete(w.id);
        }
        obs.disconnect();
      }
    });
    obs.observe(cv, { childList: true, subtree: true });
  }
}

function mountStaticVarWidget(w, body) {
  body.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;padding:8px;';

  const valueEl = el('div', {
    style: 'font-size:28px;font-weight:700;font-family:Consolas,Monaco,monospace;color:#a8f0a8;cursor:pointer;line-height:1;',
    title: 'Click to edit'
  }, '—');
  
  const nameEl  = el('div', {style: 'font-size:11px;color:#9094a1;margin-top:-2px;'}, w.opts.varName || '');
  
  // Click to edit
  valueEl.onclick = () => {
    const varName = w.opts.varName;
    if (!varName) return;
    
    const currentValue = (state.static_vars && state.static_vars[varName]) || 0;
    const newValue = prompt(`Enter new value for ${varName}:`, currentValue);
    
    if (newValue !== null && newValue.trim() !== '') {
      const numValue = parseFloat(newValue);
      if (!isNaN(numValue)) {
        // Update via API
        fetch('/api/static_vars', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({name: varName, value: numValue})
        }).then(r => {
          if (r.ok) {
            console.log(`[STATIC-VAR] Updated ${varName} = ${numValue}`);
          } else {
            alert('Failed to update static variable');
          }
        }).catch(err => {
          console.error('Failed to update static var:', err);
          alert('Failed to update variable');
        });
      } else {
        alert('Invalid number');
      }
    }
  };
  
  body.append(valueEl, nameEl);

  (function update() {
    const varName = w.opts.varName;
    if (!varName) {
      valueEl.textContent = '—';
      nameEl.textContent  = '(no var)';
      setTimeout(update, 500);
      return;
    }
    const vars = state.static_vars || {};
    if (varName in vars) {
      const raw = vars[varName];
      const dp  = Number.isInteger(w.opts.decimalPlaces) ? w.opts.decimalPlaces : 3;
      valueEl.textContent = (typeof raw === 'number') ? raw.toFixed(dp) : String(raw);
      valueEl.style.color = getValueColor(raw);
    } else {
      valueEl.textContent = 'N/A';
      valueEl.style.color = '#9094a1';
    }
    nameEl.textContent = varName;
    requestAnimationFrame(update);
  })();
}

/* ----------------------------- indicator -------------------------------- */

/**
 * Resolve one side of a condition (lhs or rhs) to a number.
 *  - { mode:'fixed', value:N }                 -> N
 *  - { mode:'signal', sel:{kind,index} }       -> readSelection(sel)
 * Anything malformed yields 0.
 */
function _indicatorReadOperand(operand) {
  if (!operand || typeof operand !== 'object') return 0;
  if (operand.mode === 'fixed') {
    const v = Number(operand.value);
    return Number.isFinite(v) ? v : 0;
  }
  if (operand.mode === 'signal') return readSelection(operand.sel);
  return 0;
}

/**
 * Evaluate one comparison: { op, lhs, rhs } -> bool.
 * Floats are compared with a 1e-9 tolerance for '=' and '!='.
 */
function _indicatorEvalCondition(cond) {
  if (!cond || typeof cond !== 'object') return false;
  const a = _indicatorReadOperand(cond.lhs);
  const b = _indicatorReadOperand(cond.rhs);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  switch (cond.op) {
    case '>':  return a >  b;
    case '<':  return a <  b;
    case '=':  return Math.abs(a - b) < 1e-9;
    case '!=': return Math.abs(a - b) >= 1e-9;
  }
  return false;
}

/* If a condition watches a DO that's currently holding a PARTIAL duty
 * (0 < v < 1, i.e. a PWM channel), return that duty so the indicator can blink
 * it. Digital DOs (0 or 1) and non-DO signals return null (solid). */
function _indicatorPwmDuty(cond) {
  const sel = (cond && cond.lhs && cond.lhs.mode === 'signal') ? cond.lhs.sel : null;
  if (!sel || sel.kind !== 'do') return null;
  const v = (state.do || [])[sel.index | 0];
  return (typeof v === 'number' && v > 0 && v < 1) ? v : null;
}

/**
 * Indicator widget — small status dot/rect with two priority-ordered
 * conditions. Drag from the body, right-click (or double-click) to edit,
 * right-click also offers Delete.
 *
 * `box` is the widget root; we attach a contextmenu handler so users can
 * still reach Settings/Delete even though there's no header bar.
 */
function mountIndicator(w, body, box) {
  body.style.cssText =
    'display:flex;flex-direction:column;align-items:center;justify-content:center;' +
    'padding:4px;cursor:grab;user-select:none;overflow:hidden;text-align:center;';

  // The dot/rect element. Size and shape are applied in update() so changes
  // from the settings dialog take effect without a full re-render.
  const dot = el('div', {});

  // Label below the dot (the widget title).
  const labelEl = el('div', {
    style: 'font-size:11px;color:#cfd6f0;margin-top:3px;line-height:1.1;' +
           'white-space:nowrap;text-overflow:ellipsis;overflow:hidden;max-width:100%;'
  }, w.opts.title || '');

  body.append(dot, labelEl);

  // Right-click → settings (and Delete). Double-click → settings.
  // We attach to the box (not body) so the menu fires anywhere in the widget.
  box.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    _showChromelessContextMenu(w, e.clientX, e.clientY);
  });
  body.addEventListener('dblclick', (e) => {
    e.preventDefault();
    openWidgetSettings(w);
  });

  // Live update loop — recompute state, repaint dot every frame.
  //
  // CAREFUL: mountIndicator() runs inside renderWidget() BEFORE the widget
  // box is appended to the canvas, so on the very first call dot.isConnected
  // is false. We must NOT short-circuit on that — if we do, no frame ever
  // schedules and the dot stays an empty <div> with no width/height/color
  // (which is what "I see text but no dot" looked like). Instead we paint
  // unconditionally, then only stop scheduling once the dot HAS been in the
  // DOM and is no longer (i.e. the widget was actually removed).
  let _everConnected = false;
  let _lastSizeKey = '';
  const update = () => {
    if (dot.isConnected) _everConnected = true;
    else if (_everConnected) return;  // widget was removed — stop the loop

    const size = Math.max(6, Number(w.opts.size) || 14);
    const shape = (w.opts.shape === 'rect') ? 'rect' : 'round';

    // Decide which color to show. condA wins ties (it's priority 1).
    let color = w.opts.colorOff || '#3b425e';
    let activeCond = null;
    if (_indicatorEvalCondition(w.opts.condA)) {
      color = w.opts.colorA || '#2faa60'; activeCond = w.opts.condA;
    } else if (_indicatorEvalCondition(w.opts.condB)) {
      color = w.opts.colorB || '#d84a4a'; activeCond = w.opts.condB;
    }

    // PWM flash: if the active condition watches a DO holding a partial duty
    // (a PWM channel, 0<duty<1), blink the lit color on for `duty` of each
    // cycle -- a PWM heater reads as flashing instead of a solid lamp, and the
    // flash rate visually tracks the duty. Full duty (=1) stays solid.
    if (activeCond) {
      const duty = _indicatorPwmDuty(activeCond);
      if (duty != null) {
        const period = 800;  // ms
        const now = (typeof performance !== 'undefined') ? performance.now() : Date.now();
        if (((now % period) / period) >= duty) color = w.opts.colorOff || '#3b425e';
      }
    }

    // No border, no glow — just a clean colored dot or rectangle.
    dot.style.cssText =
      `width:${size}px;height:${size}px;background:${color};` +
      `border-radius:${shape === 'round' ? '50%' : '3px'};flex-shrink:0;`;

    // Title might have been edited via Settings — reflect it.
    const desiredLabel = (w.opts.showLabel === false) ? '' : (w.opts.title || '');
    if (labelEl.textContent !== desiredLabel) labelEl.textContent = desiredLabel;
    labelEl.style.display = desiredLabel ? '' : 'none';

    // AUTO-SIZE (rig 7/23, per russ): fit the box to dot + label text — the
    // fixed 60px box forced abbreviated labels. Re-measured only when the
    // label or dot size changes (cheap key check per frame).
    const sizeKey = size + '|' + desiredLabel;
    if (sizeKey !== _lastSizeKey) {
      _lastSizeKey = sizeKey;
      const m = desiredLabel ? _measureTextStyled(desiredLabel, {family: 'system-ui', size: 11}) : {w: 0, h: 0};
      const W = Math.max(size, Math.ceil(m.w)) + 12;
      const H = size + (desiredLabel ? Math.ceil(m.h) + 3 : 0) + 10;
      box.style.width = W + 'px';
      box.style.height = H + 'px';
      w.w = W; w.h = H;
    }

    requestAnimationFrame(update);
  };
  update();
}

/**
 * Small custom context menu (Edit / Delete) for chromeless widgets like
 * indicators and labels — anything that lacks a visible header bar with
 * settings/close icons. We can't reuse a generic browser menu since
 * right-click is preventDefaulted to keep the page's default menu out
 * of the way.
 */
function _showChromelessContextMenu(w, x, y) {
  // Remove any existing one
  document.querySelectorAll('.chromeless-ctxmenu').forEach(n => n.remove());

  const menu = el('div', {
    className: 'chromeless-ctxmenu',
    style: `position:fixed;left:${x}px;top:${y}px;z-index:99999;` +
           'background:#1a1d2e;border:1px solid #2c3150;border-radius:6px;' +
           'box-shadow:0 4px 16px rgba(0,0,0,0.5);padding:4px;min-width:140px;font-size:13px;'
  });
  const mkItem = (label, onClick, danger) => {
    const it = el('div', {
      style: 'padding:6px 12px;cursor:pointer;border-radius:4px;color:' +
             (danger ? '#f0caca' : '#cfd6f0') + ';',
      onmouseenter: e => e.currentTarget.style.background = '#262b44',
      onmouseleave: e => e.currentTarget.style.background = 'transparent',
      onclick: () => { menu.remove(); onClick(); }
    }, label);
    return it;
  };
  const items = [
    mkItem('⚙ Edit Settings', () => openWidgetSettings(w)),
  ];
  // For shape widgets: a toggle between "editing" mode (handles visible,
  // shape is malleable) and "fixed" mode (handles hidden, shape looks
  // clean). Hidden for non-shape chromeless widgets (indicator, label).
  if (w.type === 'shape') {
    if (w._editing) {
      items.push(mkItem('🔒 Fix shape',  () => _setShapeEditing(w, false)));
    } else {
      items.push(mkItem('✏ Edit shape',  () => _setShapeEditing(w, true)));
    }
  }
  // Pop out / Move forward / Move backward / Delete only apply in the
  // main window — inside a popout the widget IS the window, so reordering
  // and deletion only affect a temporary minimal state-copy.
  if (!IS_POPOUT && isUiEditMode()) {
    if (_msSel.size > 1) {
      items.push(mkItem('⛓ Group selected (Ctrl+G)', () => groupSelected()));
    }
    if (w.groupId) {
      items.push(mkItem('⛓ Ungroup (Ctrl+Shift+G)', () => { ungroupSelected(w); msApplyVisual(); }));
    }
  }
  if (!IS_POPOUT) {
    if (w.type !== 'shape') {
      // Static shapes don't need their own window. Indicators and labels
      // could still be useful as standalone status displays on a separate
      // monitor, so they keep pop-out.
      items.push(mkItem('⤴ Pop out',       () => popOutWidget(w)));
    }
    items.push(mkItem('⬆ Move forward',    () => moveWidgetForward(w.id)));
    items.push(mkItem('⬇ Move backward',   () => moveWidgetBackward(w.id)));
    items.push(mkItem('⬆⬆ Send to front',  () => sendWidgetToFront(w.id)));
    items.push(mkItem('⬇⬇ Send to back',   () => sendWidgetToBack(w.id)));
    items.push(mkItem('🗑 Delete',          () => removeWidget(w.id), true));
  }
  menu.append(...items);
  document.body.append(menu);

  // Dismiss on any click outside
  const dismiss = (e) => {
    if (!menu.contains(e.target)) {
      menu.remove();
      document.removeEventListener('mousedown', dismiss, true);
    }
  };
  // Defer one tick so the right-click that opened the menu doesn't immediately close it
  setTimeout(() => document.addEventListener('mousedown', dismiss, true), 0);
}

/* ----------------------------- status text ------------------------------ */

/** Measure text at explicit font settings (off-DOM probe). white-space:pre so
 *  explicit newlines count; returns {w, h} in px. */
function _measureTextStyled(text, f) {
  const probe = document.createElement('span');
  probe.style.cssText =
    'position:absolute;visibility:hidden;left:-9999px;top:-9999px;' +
    'white-space:pre;line-height:1.25;';
  probe.style.fontFamily = (f && f.family) || 'system-ui';
  probe.style.fontSize   = ((f && f.size) || 16) + 'px';
  probe.style.fontWeight = (f && f.weight) || 'normal';
  probe.style.fontStyle  = (f && f.style) || 'normal';
  probe.textContent = text || ' ';
  document.body.appendChild(probe);
  const r = { w: probe.offsetWidth, h: probe.offsetHeight };
  probe.remove();
  return r;
}

/** value OP threshold, with float tolerance on equality. */
function _statusCondTrue(v, c) {
  if (!c || typeof c !== 'object' || !Number.isFinite(v)) return false;
  const b = Number(c.value);
  if (!Number.isFinite(b)) return false;
  switch (c.op) {
    case '=':  return Math.abs(v - b) < 1e-9;
    case '!=': return Math.abs(v - b) >= 1e-9;
    case '>':  return v >  b;
    case '<':  return v <  b;
    case '>=': return v >= b + -1e-9;
    case '<=': return v <= b + 1e-9;
  }
  return false;
}

/**
 * Status Text widget (rig 7/23, per russ) — displays per-condition text with
 * its own text/background colors for one input signal ("All good" white on
 * green, "Error Trip" black on red, ...). First matching condition top-down
 * wins; a default shows when nothing matches. Optional outline. Chromeless
 * like indicator/label; AUTO-SIZES to the currently displayed text.
 */
function mountStatusText(w, body, box) {
  body.style.cssText =
    'display:flex;align-items:center;justify-content:center;width:100%;height:100%;' +
    'cursor:grab;user-select:none;overflow:hidden;';
  box.style.boxShadow = 'none';

  const span = el('div', {style: 'white-space:pre;line-height:1.25;'});
  body.append(span);

  // Corner resize grabber (edit mode only — body.ui-locked CSS hides the
  // .shape-resize class). Dragging it hands sizing to the user: autoSize
  // turns off and the widget keeps whatever box you drag out (text stays
  // centered). Re-enable "Auto-size to text" in Settings to snap back.
  const grab = el('div', {
    className: 'shape-resize',
    title: 'Drag to resize (switches off auto-size)',
    style:
      'position:absolute;right:0;bottom:0;width:14px;height:14px;' +
      'cursor:nwse-resize;' +
      'background:linear-gradient(135deg,transparent 50%,rgba(170,180,210,0.45) 50%);' +
      'opacity:0.55;'
  });
  grab.addEventListener('mousedown', () => { w.opts.autoSize = false; });
  body.append(grab);

  box.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    _showChromelessContextMenu(w, e.clientX, e.clientY);
  });
  body.addEventListener('dblclick', (e) => {
    e.preventDefault();
    openWidgetSettings(w);
  });

  // Same first-paint rule as mountIndicator: paint unconditionally, only stop
  // once the node HAS been in the DOM and is no longer.
  let _everConnected = false;
  let _lastKey = '';
  const update = () => {
    if (span.isConnected) _everConnected = true;
    else if (_everConnected) return;   // widget removed — stop the loop

    const v = _indicatorReadOperand(w.opts.src);
    let text = (w.opts.defText != null) ? w.opts.defText : '—';
    let fg = w.opts.defFg || '#cfd6f0';
    let bg = w.opts.defBg || '#3b425e';
    const conds = Array.isArray(w.opts.conds) ? w.opts.conds : [];
    for (const c of conds) {
      if (_statusCondTrue(v, c)) {
        text = (c.text != null) ? c.text : '';
        if (c.fg) fg = c.fg;
        if (c.bg) bg = c.bg;
        break;
      }
    }

    const fs = Math.max(6, Number(w.opts.fontSize) || 18);
    const weight = (w.opts.fontWeight === 'bold') ? 'bold' : 'normal';
    const fam = w.opts.fontFamily || 'system-ui';
    const outline = (w.opts.outline !== false);
    const oc = w.opts.outlineColor || '#4c5170';
    const key = [text, fg, bg, fs, weight, fam, outline, oc, w.opts.pad].join('|');
    if (key !== _lastKey) {
      _lastKey = key;
      span.textContent = text;
      span.style.color = fg;
      span.style.fontSize = fs + 'px';
      span.style.fontWeight = weight;
      span.style.fontFamily = fam;
      box.style.background = bg;
      box.style.border = outline ? `1.5px solid ${oc}` : 'none';
      box.style.borderRadius = '6px';
      // AUTO-SIZE the widget to the displayed text + padding — unless the
      // user dragged the corner grabber (autoSize=false): then the box is
      // theirs and the text just centers inside it.
      if (w.opts.autoSize !== false) {
        const m = _measureTextStyled(text, {family: fam, size: fs, weight});
        const pad = Number.isFinite(Number(w.opts.pad)) ? Number(w.opts.pad) : 8;
        const W = Math.ceil(m.w) + pad * 2;
        const H = Math.ceil(m.h) + pad * 2;
        box.style.width = W + 'px';
        box.style.height = H + 'px';
        w.w = W; w.h = H;
      }
    }
    requestAnimationFrame(update);
  };
  update();
}

/* -------------------------------- label --------------------------------- */

/**
 * Label widget — plain text with adjustable font, foreground and
 * background colors. No border, no chrome; drag from the body, right-click
 * (or double-click) for Edit/Delete.
 *
 * Re-renders on demand whenever Settings closes (openWidgetSettings's
 * showModal callback calls renderPage(), which rebuilds the widget).
 * No animation frame loop needed — labels are static between edits.
 */
function mountLabel(w, body, box) {
  body.style.cssText =
    'display:flex;align-items:center;justify-content:center;' +
    'padding:4px;cursor:grab;user-select:none;overflow:hidden;' +
    'width:100%;height:100%;box-sizing:border-box;';

  const justify = (w.opts.align === 'center') ? 'center'
                : (w.opts.align === 'right')  ? 'flex-end'
                : 'flex-start';
  body.style.justifyContent = justify;

  // Background applies to the whole widget shell so it fills the box even
  // when the text doesn't reach the edges. 'transparent' inherits the main
  // window background, which is the user's requested default.
  box.style.background = w.opts.bgColor || 'transparent';
  box.style.border = 'none';
  box.style.boxShadow = 'none';

  const span = el('span', {
    style:
      `color:${w.opts.fgColor || '#e6e6e6'};` +
      `font-family:${w.opts.fontFamily || 'system-ui'};` +
      `font-size:${Math.max(6, Number(w.opts.fontSize) || 16)}px;` +
      `font-weight:${w.opts.fontWeight === 'bold' ? 'bold' : 'normal'};` +
      `font-style:${w.opts.fontStyle === 'italic' ? 'italic' : 'normal'};` +
      'line-height:1.2;white-space:pre-wrap;word-break:break-word;' +
      `text-align:${w.opts.align || 'left'};`
  }, w.opts.text || '');

  body.append(span);

  // AUTO-SIZE (rig 7/23, per russ): size the widget box to the text at the
  // chosen font — the fixed box forced abbreviations. Measured off-DOM so it
  // works before the box is appended; explicit newlines respected.
  requestAnimationFrame(() => {
    const m = _measureTextStyled(w.opts.text || ' ', {
      family: w.opts.fontFamily || 'system-ui',
      size: Math.max(6, Number(w.opts.fontSize) || 16),
      weight: (w.opts.fontWeight === 'bold') ? 'bold' : 'normal',
      style: (w.opts.fontStyle === 'italic') ? 'italic' : 'normal'
    });
    const W = Math.ceil(m.w) + 12;
    const H = Math.ceil(m.h) + 8;
    box.style.width = W + 'px';
    box.style.height = H + 'px';
    w.w = W; w.h = H;
  });

  // Right-click → settings (and Delete). Double-click → settings.
  box.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    _showChromelessContextMenu(w, e.clientX, e.clientY);
  });
  body.addEventListener('dblclick', (e) => {
    e.preventDefault();
    openWidgetSettings(w);
  });
}

/* ------------------------------ shape ----------------------------------- */
/* Layout drawing aids: lines, circles, and N-sided polygons with optional
   rounded corners. Chromeless like indicator/label (no header), but with
   a small bottom-right corner grabber so the user can size the bounding
   box. Rendered as inline SVG so the strokes stay crisp at any zoom and
   we don't need a canvas / RAF loop — repainted only on Settings change
   or window resize.                                                       */

/**
 * Returns the rotation (radians) that makes an N-sided polygon look "normal"
 * to a person — a flat top edge for even-sided polygons (square, hexagon,
 * octagon), and a single point at the top for odd-sided polygons (triangle,
 * pentagon).
 *
 * Without this offset, _shapeRoundedPolyPath puts vertex 0 at the top of the
 * box, which is right for odd N (point up) but wrong for even N (vertex up =
 * diamond instead of flat-topped square). Adding π/N for even N rotates the
 * polygon by half a side-arc, putting the midpoint of an edge at the top.
 */
function _polygonNormalRotation(sides) {
  const n = Math.max(3, sides | 0);
  return (n % 2 === 0) ? (Math.PI / n) : 0;
}

/**
 * Build a path string for an N-sided polygon inscribed in a (w x h) bounding
 * box, with optional corner rounding. cornerRadius is clamped to
 * min(w,h)/2 so a large radius just yields a smooth circle-ish shape.
 *
 * Algorithm: for each vertex v(i) at angle θ_i, find unit vectors toward
 * the previous and next vertices. The actual drawing points are v(i) shifted
 * by r along each direction (so the corner is "cut" by r). We draw straight
 * segments between adjacent cut points and a quadratic curve through v(i)
 * to round the corner.
 */
/**
 * Build a path string for an arbitrary polygon defined by an explicit
 * vertex list, with optional corner rounding. This is the general
 * helper used at render time — _shapeRoundedPolyPath wraps it for the
 * "regular polygon inscribed in an ellipse" case used by the polygon
 * regenerator.
 *
 * cornerRadius is clamped to half the shortest side so the corner
 * offset points never cross each other.
 */
function _polygonPathFromVertices(pts, cornerRadius) {
  const n = pts.length;
  if (n < 3) return '';

  // Side lengths to clamp cornerRadius.
  let minSide = Infinity;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < minSide) minSide = len;
  }
  const r = Math.max(0, Math.min(cornerRadius, minSide / 2));

  if (r === 0) {
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < n; i++) d += ` L ${pts[i].x} ${pts[i].y}`;
    return d + ' Z';
  }

  // Rounded: for each vertex v, walk r along the edge toward the prev
  // vertex (pre-corner point), then draw a quadratic curve through v to
  // a post-corner point r toward the next vertex.
  const post = [], pre = [];
  for (let i = 0; i < n; i++) {
    const v    = pts[i];
    const prev = pts[(i - 1 + n) % n];
    const next = pts[(i + 1) % n];
    const dPrev = { x: prev.x - v.x, y: prev.y - v.y };
    const dNext = { x: next.x - v.x, y: next.y - v.y };
    const lP = Math.hypot(dPrev.x, dPrev.y) || 1;
    const lN = Math.hypot(dNext.x, dNext.y) || 1;
    pre.push({  x: v.x + (dPrev.x / lP) * r, y: v.y + (dPrev.y / lP) * r });
    post.push({ x: v.x + (dNext.x / lN) * r, y: v.y + (dNext.y / lN) * r });
  }

  let d = `M ${post[0].x} ${post[0].y}`;
  for (let i = 1; i <= n; i++) {
    const idx = i % n;
    d += ` L ${pre[idx].x} ${pre[idx].y}`;
    d += ` Q ${pts[idx].x} ${pts[idx].y} ${post[idx].x} ${post[idx].y}`;
  }
  return d + ' Z';
}

function _shapeRoundedPolyPath(cx, cy, rx, ry, sides, cornerRadius, rotationRad) {
  const n = Math.max(3, sides | 0);
  const rot = Number.isFinite(rotationRad) ? rotationRad : 0;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2 + rot;
    pts.push({ x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) });
  }
  return _polygonPathFromVertices(pts, cornerRadius);
}

/**
 * For a line widget, derive (w.x, w.y, w.w, w.h) from the two endpoint
 * coordinates stored in opts. A pad is added on every side so the
 * endpoint drag handles have room to sit inside the bounding box even
 * for nearly-horizontal or nearly-vertical lines. The actual <line>
 * inside the SVG is drawn from (x1-w.x, y1-w.y) to (x2-w.x, y2-w.y).
 */
const _LINE_BOUNDS_PAD = 16;
function _recomputeLineBounds(w) {
  const x1 = +w.opts.x1, y1 = +w.opts.y1, x2 = +w.opts.x2, y2 = +w.opts.y2;
  const minX = Math.min(x1, x2), minY = Math.min(y1, y2);
  const maxX = Math.max(x1, x2), maxY = Math.max(y1, y2);
  const P = _LINE_BOUNDS_PAD;
  w.x = minX - P;
  w.y = minY - P;
  w.w = Math.max(2 * P, maxX - minX + 2 * P);
  w.h = Math.max(2 * P, maxY - minY + 2 * P);
}

/**
 * For a polygon widget, derive (w.x, w.y, w.w, w.h) from its vertex
 * list (absolute page coords in opts.vertices). Same padding model
 * as lines so the vertex handles stay clickable even when one vertex
 * sits right on the edge of the bounding box.
 */
const _POLY_BOUNDS_PAD = 16;
function _recomputePolygonBounds(w) {
  const v = w.opts.vertices;
  if (!Array.isArray(v) || v.length < 1) return;
  let minX =  Infinity, minY =  Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of v) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y;
  }
  if (!Number.isFinite(minX)) return;
  const P = _POLY_BOUNDS_PAD;
  w.x = minX - P;
  w.y = minY - P;
  w.w = Math.max(2 * P, maxX - minX + 2 * P);
  w.h = Math.max(2 * P, maxY - minY + 2 * P);
}

/**
 * Regenerate opts.vertices for a regular polygon based on the current
 * sides/rotation values, fitting it inside the current bounding box.
 * Called when:
 *   - the polygon is first created (no vertices yet)
 *   - the user changes 'sides' in settings (the freeform shape is
 *     discarded in favor of a fresh regular polygon)
 *   - the user adjusts 'rotation' (same — regenerate)
 *
 * Corner-radius is NOT a generator input — it stays as a render-time
 * effect that works on any vertex list, regular or freeform.
 */
function _regenerateRegularPolygon(w) {
  const sides = Math.max(3, Math.min(24, (w.opts.sides | 0) || 4));
  const userRot = (Number(w.opts.rotation) || 0) * Math.PI / 180;
  const totalRot = _polygonNormalRotation(sides) + userRot;
  // Fit inside the CURRENT bounding box so regenerating doesn't move
  // the polygon visually. The box itself was set when the widget was
  // first added (default 100x100 at the placement point).
  const cx = (Number.isFinite(w.x) ? w.x : 40) + (Number.isFinite(w.w) ? w.w : 100) / 2;
  const cy = (Number.isFinite(w.y) ? w.y : 40) + (Number.isFinite(w.h) ? w.h : 100) / 2;
  const rx = Math.max(8, (Number.isFinite(w.w) ? w.w : 100) / 2 - _POLY_BOUNDS_PAD);
  const ry = Math.max(8, (Number.isFinite(w.h) ? w.h : 100) / 2 - _POLY_BOUNDS_PAD);
  const v = [];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2 - Math.PI / 2 + totalRot;
    v.push({ x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) });
  }
  w.opts.vertices = v;
  _recomputePolygonBounds(w);
}

/**
 * Constrained vertex drag for polygons. Updates w.opts.vertices in place
 * so the polygon's "shape" is preserved while the dragged vertex follows
 * the cursor.
 *
 * Two behaviors depending on side count:
 *
 *   For sides === 4 (rectangle): the opposite corner is the anchor and
 *   stays put. The two adjacent corners slide along the rectangle's two
 *   edge axes (which were perpendicular by construction). The dragged
 *   vertex lands at the cursor; the dimensions of the rectangle (in its
 *   own local frame) become (proj_u, proj_v) where proj_* is the cursor
 *   position decomposed onto the rectangle's local axes. The rectangle's
 *   rotation is preserved.
 *
 *   For other side counts: similarity transform (uniform scale + rotation)
 *   around the dragged vertex's *opposite point*. For odd-sided polygons,
 *   the opposite point is the midpoint of the opposite edge. The transform
 *   takes the dragged vertex from its old position to the cursor; all
 *   other vertices follow the same transform, keeping the anchor fixed
 *   and preserving all interior angles.
 */
function _polygonDragConstrained(w, vidx, cursor) {
  const vs = w.opts.vertices;
  const n = vs.length;
  if (n < 3) return;

  if (n === 4) {
    // ----- Rectangle case -----
    // Anchor is the diagonally-opposite corner.
    const iA = (vidx + 2) % 4;             // anchor
    const iU = (vidx + 1) % 4;             // adjacent via the "u" edge
    const iV = (vidx + 3) % 4;             // adjacent via the "v" edge
    const A = vs[iA];

    // Local axes: unit vectors along the two edges from anchor.
    // (anchor → iU) and (anchor → iV). These are perpendicular for a
    // proper rectangle. If they've drifted from perpendicular due to a
    // prior freeform edit, we orthogonalize by using their original
    // directions and projecting the cursor onto them.
    const eU = { x: vs[iU].x - A.x, y: vs[iU].y - A.y };
    const eV = { x: vs[iV].x - A.x, y: vs[iV].y - A.y };
    const lU = Math.hypot(eU.x, eU.y) || 1;
    const lV = Math.hypot(eV.x, eV.y) || 1;
    const uHat = { x: eU.x / lU, y: eU.y / lU };
    const vHat = { x: eV.x / lV, y: eV.y / lV };

    // Decompose cursor position relative to anchor onto the local axes.
    const cx = cursor.x - A.x;
    const cy = cursor.y - A.y;
    const newU = cx * uHat.x + cy * uHat.y;   // signed length along u
    const newV = cx * vHat.x + cy * vHat.y;   // signed length along v

    // New corners:
    //   anchor stays at A
    //   adjacent-via-u (iU) sits at A + newU * uHat
    //   adjacent-via-v (iV) sits at A + newV * vHat
    //   dragged    (vidx) sits at A + newU * uHat + newV * vHat
    vs[iU] = { x: A.x + newU * uHat.x, y: A.y + newU * uHat.y };
    vs[iV] = { x: A.x + newV * vHat.x, y: A.y + newV * vHat.y };
    vs[vidx] = { x: A.x + newU * uHat.x + newV * vHat.x,
                 y: A.y + newU * uHat.y + newV * vHat.y };
    return;
  }

  // ----- General case (sides ≠ 4): similarity transform around the
  // opposite point. ------------------------------------------------------
  // Opposite point: for even N it's the diametrically opposite vertex.
  // For odd N (no opposite vertex) it's the midpoint of the opposite edge.
  let anchor;
  if (n % 2 === 0) {
    anchor = vs[(vidx + n / 2) % n];
  } else {
    const a = vs[(vidx + Math.floor(n / 2)) % n];
    const b = vs[(vidx + Math.ceil(n / 2)) % n];
    anchor = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  // Vector from anchor to old vertex position.
  const oldV = vs[vidx];
  const oldDx = oldV.x - anchor.x, oldDy = oldV.y - anchor.y;
  const oldLen = Math.hypot(oldDx, oldDy);
  if (oldLen < 1e-6) return;               // degenerate; nothing to do

  // Vector from anchor to cursor.
  const newDx = cursor.x - anchor.x, newDy = cursor.y - anchor.y;
  const newLen = Math.hypot(newDx, newDy);

  // Similarity transform: scale = newLen / oldLen, rotation = atan2 diff.
  // Combined as a 2D linear map represented by the complex multiplication
  // (oldV-anchor) → (cursor-anchor). Equivalent matrix multiply works too.
  // Let s = newVec / oldVec where both are complex numbers. Then for any
  // point P: P' = anchor + s * (P - anchor).
  // s = (newDx + i*newDy) / (oldDx + i*oldDy)
  //   = ((newDx*oldDx + newDy*oldDy) + i*(newDy*oldDx - newDx*oldDy)) / (oldDx² + oldDy²)
  const denom = oldDx * oldDx + oldDy * oldDy;
  const sReal = (newDx * oldDx + newDy * oldDy) / denom;
  const sImag = (newDy * oldDx - newDx * oldDy) / denom;

  for (let k = 0; k < n; k++) {
    if (k === vidx) continue;              // we'll set this one explicitly
    const p = vs[k];
    const dx = p.x - anchor.x, dy = p.y - anchor.y;
    // (dx + i*dy) * (sReal + i*sImag) = (dx*sReal - dy*sImag) + i*(dx*sImag + dy*sReal)
    vs[k] = {
      x: anchor.x + dx * sReal - dy * sImag,
      y: anchor.y + dx * sImag + dy * sReal,
    };
  }
  vs[vidx] = { x: cursor.x, y: cursor.y };
}

function mountShape(w, body, box) {
  // The widget itself is chromeless: no border, no background. Per the CSS
  // rule .widget.shape-widget { background:transparent; border:none; }.
  // The SVG inside fills the body and draws the chosen shape.

  body.style.cssText =
    'padding:0;cursor:grab;user-select:none;overflow:visible;' +
    'width:100%;height:100%;box-sizing:border-box;position:relative;';
  box.style.background = 'transparent';
  box.style.border = 'none';
  box.style.boxShadow = 'none';

  // ============================== editing mode =============================
  // Drag handles for resizing/reshaping the widget are only shown when the
  // widget is in "editing" mode. Default state is fixed (handles hidden) so
  // the shape looks clean. Click the shape body to enter editing; click
  // outside the shape (or use the right-click "Fix shape" item) to exit.
  //
  // Each kind-specific branch below pushes its drag handles into the
  // _editHandles array and (for circles) the corner grabber into
  // _editGrabbers. _setShapeEditing(w, on) toggles their display.
  //
  // _editing is a transient runtime field; it's NOT serialized to the
  // layout file (a saved layout always opens in "fixed" mode).
  w._editHandles  = [];
  w._editGrabbers = [];
  if (typeof w._editing !== 'boolean') w._editing = false;

  const NS = 'http://www.w3.org/2000/svg';

  // Build SVG fresh each mount. renderPage rebuilds the widget after any
  // settings change, so we don't need an internal update loop.
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  // Preserve aspect ratio false so SVG fills the box and stretches.
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('viewBox', `0 0 ${w.w || 100} ${w.h || 100}`);
  svg.style.display = 'block';
  svg.style.overflow = 'visible';
  body.append(svg);

  const W = w.w || 100, H = w.h || 100;
  const sw = Math.max(0, Number(w.opts.strokeWidth) || 0);
  const stroke = w.opts.strokeColor || '#79c0ff';
  const fill   = w.opts.fillColor   || 'transparent';

  if (w.opts.kind === 'line') {
    // Lines store absolute page coordinates for each endpoint in opts. The
    // bounding box (w.x/y/w/h) is derived from them — see
    // _recomputeLineBounds. We draw the line into that local box and put
    // two small circle handles at the endpoints. Dragging a handle moves
    // that endpoint only; dragging the body moves both endpoints together.

    // Arrow marker definition (shared by both possible markers).
    const mkId = `arrow_${w.id}`;
    const defs = document.createElementNS(NS, 'defs');
    const mk = document.createElementNS(NS, 'marker');
    mk.setAttribute('id', mkId);
    mk.setAttribute('viewBox', '0 0 10 10');
    mk.setAttribute('refX', '8');
    mk.setAttribute('refY', '5');
    mk.setAttribute('markerWidth', '6');
    mk.setAttribute('markerHeight', '6');
    mk.setAttribute('orient', 'auto-start-reverse');
    const head = document.createElementNS(NS, 'path');
    head.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
    head.setAttribute('fill', stroke);
    mk.append(head);
    defs.append(mk);
    svg.append(defs);

    const lineEl = document.createElementNS(NS, 'line');
    lineEl.setAttribute('stroke', stroke);
    lineEl.setAttribute('stroke-width', String(sw));
    lineEl.setAttribute('stroke-linecap', 'round');
    if (w.opts.arrowStart) lineEl.setAttribute('marker-start', `url(#${mkId})`);
    if (w.opts.arrowEnd)   lineEl.setAttribute('marker-end',   `url(#${mkId})`);
    svg.append(lineEl);

    // Endpoint handles. Sized in proportion to the stroke so a thin line
    // gets small unobtrusive dots and a thick line gets bigger, still-
    // clickable ones. Minimum 2.5px so they stay grabbable at sw=0.
    const handleR = Math.max(2.5, sw * 0.8 + 1);
    const mkHandle = (which) => {
      const h = document.createElementNS(NS, 'circle');
      h.setAttribute('r', String(handleR));
      h.setAttribute('fill', '#79c0ff');
      h.setAttribute('stroke', '#0f1115');
      h.setAttribute('stroke-width', String(Math.max(1, handleR * 0.3)));
      h.setAttribute('cursor', 'move');
      h.setAttribute('data-endpoint', which);
      h.style.pointerEvents = 'all';
      svg.append(h);
      return h;
    };
    const hA = mkHandle('a');
    const hB = mkHandle('b');
    w._editHandles.push(hA, hB);

    // Redraws the SVG geometry from opts and updates the widget's bounding
    // box. Called on initial mount, on any drag (endpoint or body), and
    // when settings change.
    const redraw = () => {
      _recomputeLineBounds(w);
      // Update outer node so the bounding box matches new endpoints.
      box.style.left   = w.x + 'px';
      box.style.top    = w.y + 'px';
      box.style.width  = w.w + 'px';
      box.style.height = w.h + 'px';
      svg.setAttribute('viewBox', `0 0 ${w.w} ${w.h}`);

      // Endpoint positions in local coords (subtract bounds origin)
      const ax = w.opts.x1 - w.x, ay = w.opts.y1 - w.y;
      const bx = w.opts.x2 - w.x, by = w.opts.y2 - w.y;
      // Inset the visible line a hair so the stroke doesn't cover the
      // handles, which are the same color and would look fused otherwise.
      const dx = bx - ax, dy = by - ay, dlen = Math.hypot(dx, dy) || 1;
      const ux = dx / dlen, uy = dy / dlen;
      const inset = Math.min(handleR - 1, dlen / 2 - 1);
      lineEl.setAttribute('x1', ax + ux * Math.max(0, inset));
      lineEl.setAttribute('y1', ay + uy * Math.max(0, inset));
      lineEl.setAttribute('x2', bx - ux * Math.max(0, inset));
      lineEl.setAttribute('y2', by - uy * Math.max(0, inset));
      hA.setAttribute('cx', ax); hA.setAttribute('cy', ay);
      hB.setAttribute('cx', bx); hB.setAttribute('cy', by);
    };

    // Initial draw (in case bounds weren't pre-computed by caller).
    redraw();

    // Endpoint drag. Each handle gets its own mousedown that takes over
    // from the body drag (stopPropagation) and updates only that endpoint.
    const startEndpointDrag = (which, evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      const move = (e) => {
        const cv = document.getElementById('canvas');
        if (!cv) return;
        const r = cv.getBoundingClientRect();
        // Mouse position in canvas-local coords (page coords for the widget
        // model). Account for canvas scroll offset since the canvas can
        // scroll its contents.
        const px = e.clientX - r.left + cv.scrollLeft;
        const py = e.clientY - r.top  + cv.scrollTop;
        // Snap if grid is on.
        const snap = (typeof gridSnap === 'function') ? gridSnap : (n => n);
        if (which === 'a') {
          w.opts.x1 = snap(px);
          w.opts.y1 = snap(py);
        } else {
          w.opts.x2 = snap(px);
          w.opts.y2 = snap(py);
        }
        redraw();
      };
      const up = () => {
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
      };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    };
    hA.addEventListener('mousedown', (e) => startEndpointDrag('a', e));
    hB.addEventListener('mousedown', (e) => startEndpointDrag('b', e));

    // Skip the corner-grabber for lines — they size from endpoints, not
    // from a bottom-right drag. The flag is read by renderPage.
    w._shapeNoCornerResize = true;

    // When the user drags the widget body, makeDragResize moves w.x/w.y
    // but doesn't know about our endpoints. This hook shifts both
    // endpoints by the same delta so they stay glued to the bounding box.
    w._onDrag = (dx, dy) => {
      w.opts.x1 += dx; w.opts.y1 += dy;
      w.opts.x2 += dx; w.opts.y2 += dy;
      // No need to call redraw() — _recomputeLineBounds isn't needed
      // because the bounds already moved as a whole, and the line's
      // local-coord drawing inside the SVG didn't change relative to
      // the (also-translated) box. The endpoint handles stay where they
      // were within the SVG, which is correct.
    };

  } else if (w.opts.kind === 'circle') {
    // Ellipse inscribed in the bounding box so non-square sizes look natural.
    // Inset by stroke width so the line doesn't get clipped.
    const inset = sw / 2 + 1;
    const ell = document.createElementNS(NS, 'ellipse');
    ell.setAttribute('cx', W / 2);
    ell.setAttribute('cy', H / 2);
    ell.setAttribute('rx', Math.max(1, W / 2 - inset));
    ell.setAttribute('ry', Math.max(1, H / 2 - inset));
    ell.setAttribute('stroke', stroke);
    ell.setAttribute('stroke-width', String(sw));
    ell.setAttribute('fill', fill);
    svg.append(ell);

  } else { // 'polygon'
    // Vertex-driven model. The polygon's truth is opts.vertices — an
    // array of absolute page coordinates, one per vertex. Sides/rotation
    // are *generators*: changing them in Settings rebuilds opts.vertices
    // from a regular-polygon template. Corner-radius is a render-time
    // effect that works on any vertex list.
    if (!Array.isArray(w.opts.vertices) || w.opts.vertices.length < 3) {
      _regenerateRegularPolygon(w);
    }

    const path = document.createElementNS(NS, 'path');
    path.setAttribute('stroke', stroke);
    path.setAttribute('stroke-width', String(sw));
    path.setAttribute('stroke-linejoin', 'round');
    path.setAttribute('fill', fill);
    svg.append(path);

    // Vertex handles. Sized to match the line-handle scaling rule so a
    // thin polygon stroke gets small dots, a thick one gets larger.
    const handleR = Math.max(2.5, sw * 0.8 + 1);
    const handles = [];
    for (let i = 0; i < w.opts.vertices.length; i++) {
      const h = document.createElementNS(NS, 'circle');
      h.setAttribute('r', String(handleR));
      h.setAttribute('fill', '#79c0ff');
      h.setAttribute('stroke', '#0f1115');
      h.setAttribute('stroke-width', String(Math.max(1, handleR * 0.3)));
      h.setAttribute('cursor', 'move');
      h.setAttribute('data-vidx', String(i));
      h.style.pointerEvents = 'all';
      svg.append(h);
      handles.push(h);
      w._editHandles.push(h);
    }

    // Redraw geometry from opts.vertices. Updates bounding box, viewBox,
    // path data, and handle positions. Called on initial mount and on
    // every vertex drag.
    const redraw = () => {
      _recomputePolygonBounds(w);
      box.style.left   = w.x + 'px';
      box.style.top    = w.y + 'px';
      box.style.width  = w.w + 'px';
      box.style.height = w.h + 'px';
      svg.setAttribute('viewBox', `0 0 ${w.w} ${w.h}`);

      // Convert absolute page coords to SVG-local coords for the path.
      const local = w.opts.vertices.map(p => ({ x: p.x - w.x, y: p.y - w.y }));
      const d = _polygonPathFromVertices(local,
                                         Math.max(0, +w.opts.cornerRadius || 0));
      path.setAttribute('d', d);
      // Position handles in local coords too.
      for (let i = 0; i < handles.length; i++) {
        handles[i].setAttribute('cx', local[i].x);
        handles[i].setAttribute('cy', local[i].y);
      }
    };
    redraw();

    // Vertex drag. Same pattern as line endpoints: each handle's
    // mousedown stops propagation so the body drag doesn't engage.
    // Vertex drag. In constrained-angle mode (the default), dragging a
    // vertex preserves the polygon's angular relationships:
    //   - For sides=4 (rectangle): the opposite corner stays anchored;
    //     the two adjacent corners slide along the rectangle's own two
    //     edge axes (which were perpendicular at construction time). The
    //     shape stretches longer/wider while keeping right angles.
    //   - For other side counts: uniform scale + rotation around the
    //     centroid. The polygon stays similar to itself (same interior
    //     angles), just scaled and possibly rotated.
    // In freeform mode, each vertex moves independently — the original
    // behavior.
    const startVertexDrag = (vidx, evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      const move = (e) => {
        const cv = document.getElementById('canvas');
        if (!cv) return;
        const r = cv.getBoundingClientRect();
        const px = e.clientX - r.left + cv.scrollLeft;
        const py = e.clientY - r.top  + cv.scrollTop;
        const snap = (typeof gridSnap === 'function') ? gridSnap : (n => n);
        const cursor = { x: snap(px), y: snap(py) };

        if (w.opts.constrainAngles !== false) {
          _polygonDragConstrained(w, vidx, cursor);
        } else {
          // Freeform: move just this vertex.
          w.opts.vertices[vidx] = cursor;
        }
        redraw();
      };
      const up = () => {
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
      };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    };
    for (let i = 0; i < handles.length; i++) {
      const idx = i;
      handles[i].addEventListener('mousedown', (e) => startVertexDrag(idx, e));
    }

    // Translate every vertex when the user drags the body of the widget.
    // Same hook the line uses — keeps drag-the-whole-shape working.
    w._onDrag = (dx, dy) => {
      for (const p of w.opts.vertices) { p.x += dx; p.y += dy; }
    };

    // Skip the corner grabber — vertex handles drive resizing for polygons.
    w._shapeNoCornerResize = true;
  }

  // Small resize grabber in the bottom-right (circles only — lines and
  // polygons size from their own handles). Hidden by default; only visible
  // in editing mode, same as the vertex/endpoint handles.
  if (!w._shapeNoCornerResize) {
    const grab = el('div', {
      className: 'shape-resize',
      title: 'Drag to resize',
      style:
        'position:absolute;right:0;bottom:0;width:14px;height:14px;' +
        'cursor:nwse-resize;' +
        'background:linear-gradient(135deg,transparent 50%,rgba(170,180,210,0.45) 50%);' +
        'opacity:0.55;'
    });
    body.append(grab);
    w._editGrabbers.push(grab);
  }

  // Right-click / double-click → settings + reorder/delete menu.
  box.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    _showChromelessContextMenu(w, e.clientX, e.clientY);
  });
  body.addEventListener('dblclick', (e) => {
    if (e.target.classList && e.target.classList.contains('shape-resize')) return;
    e.preventDefault();
    openWidgetSettings(w);
  });

  // ===================== editing-mode wiring =============================
  // Apply current editing state to the handles/grabber. By default they're
  // hidden — the user clicks the shape to enter editing.
  _applyShapeEditingVisuals(w);

  // Body click (vs drag): a click without movement toggles editing mode.
  // A drag is left to makeDragResize. We track the down-position and on
  // mouseup measure the displacement — anything under 4px counts as a
  // click; otherwise it was a drag and we leave editing state alone.
  let _downX = null, _downY = null;
  body.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;            // left button only
    // Global UI lock: per-shape editing is also gated. If the layout is
    // locked, clicks on shapes do nothing — preventing accidental
    // bring-to-front and accidental entering-edit-mode.
    if (!isUiEditMode()) return;
    // Ctrl+click is a multi-select toggle, never a shape-edit toggle.
    if (e.ctrlKey || e.metaKey) { _downX = null; return; }
    // If the click landed on a registered handle/grabber, that's a
    // drag-handle interaction — leave editing state alone. We check by
    // identity against w._editHandles and w._editGrabbers because the
    // target could be any of: SVG circle (handle), .shape-resize div,
    // the SVG itself, the body, or one of the shape primitives.
    const isHandle =
      (w._editHandles && w._editHandles.indexOf(e.target) >= 0) ||
      (w._editGrabbers && w._editGrabbers.indexOf(e.target) >= 0);
    if (isHandle) {
      _downX = null;
      return;
    }
    _downX = e.clientX;
    _downY = e.clientY;
  });
  // Listen on window because the mouseup may fire outside the body if the
  // user moved the cursor away (drag case). We compare distance to decide.
  const onWinUp = (e) => {
    if (_downX == null) return;
    const dx = e.clientX - _downX, dy = e.clientY - _downY;
    _downX = _downY = null;
    if (Math.hypot(dx, dy) < 4) {
      // Click, not a drag — toggle editing mode.
      _setShapeEditing(w, !w._editing);
    }
  };
  window.addEventListener('mouseup', onWinUp);
  // Clean up the global listener when the widget node is removed by
  // renderPage. A MutationObserver is overkill here; instead we tie the
  // listener's lifetime to the box via a small "is the box still in the
  // DOM" check on each invocation. (Cheaper alternative: store the
  // function and explicitly remove on a re-mount. The check below is
  // fine because mouseup is rare.)
  const _checkAlive = () => {
    if (!box.isConnected) window.removeEventListener('mouseup', onWinUp);
  };
  window.addEventListener('mouseup', _checkAlive);

  // Click outside the shape (anywhere else on the page) → exit editing.
  // Exception: clicks inside an open modal dialog don't count — the user
  // is editing the shape, so clicking around in Settings shouldn't dismiss
  // edit mode.
  const onOutsideMouseDown = (e) => {
    if (!w._editing) return;
    if (box.contains(e.target)) return;     // click was on this shape
    if (e.target.closest && e.target.closest('#modal')) return;  // inside settings
    if (e.target.closest && e.target.closest('.chromeless-ctxmenu')) return;  // context menu
    // Click was elsewhere — exit editing.
    _setShapeEditing(w, false);
  };
  document.addEventListener('mousedown', onOutsideMouseDown, true);
  // Same cleanup pattern.
  const _checkAlive2 = () => {
    if (!box.isConnected) document.removeEventListener('mousedown', onOutsideMouseDown, true);
  };
  window.addEventListener('mouseup', _checkAlive2);
}

/**
 * Toggle a shape widget's editing-mode handles on or off. Updates the
 * transient _editing flag (not persisted) and the visibility of every
 * handle/grabber registered during mount.
 */
function _setShapeEditing(w, on) {
  w._editing = !!on;
  _applyShapeEditingVisuals(w);
}

function _applyShapeEditingVisuals(w) {
  const visible = !!w._editing;
  for (const h of (w._editHandles || [])) {
    h.style.display = visible ? '' : 'none';
  }
  for (const g of (w._editGrabbers || [])) {
    g.style.display = visible ? '' : 'none';
  }
  // Subtle outline glow on the widget node when editing, so the user can
  // see at a glance that the shape is malleable. Done as a transient box-
  // shadow on the widget DOM node (not the SVG) so it doesn't interfere
  // with the SVG content.
  const node = document.getElementById('w_' + w.id);
  if (node) {
    node.style.outline = visible ? '1px dashed rgba(121, 192, 255, 0.6)' : '';
    node.style.outlineOffset = visible ? '2px' : '';
  }
}

/* ------------------------ tick / read / drag ---------------------------- */
function onTick(){
  if (replayMode !== null) {
    // In replay mode, only update charts during playback
    if (replayMode === 'playing') {
      updateChartBuffers();
    }
    // Don't update gauges/bars here - they're controlled by seekReplay
  } else {
    // Live mode - update everything normally
    updateChartBuffers();
    updateDOButtons();
    updateVFDWidgets();
    updateDriveWidgets();
  }
}

function readSelection(sel){
  if(!sel) return 0;
  switch(sel.kind){
    case 'ai': return state.ai[sel.index|0]??0;
    case 'ao': return state.ao[sel.index|0]??0;
    case 'do': return state.do[sel.index|0] ?? 0;   // raw (PWM duty 0..1, or 0/1 digital)
    case 'tc': return state.tc[sel.index|0]??0;
    case 'ctr': return state.ctr?.[sel.index|0] ?? 0;   // hardware counter (rate or total)
    case 'pid':
      const pidLoop = state.pid[sel.index|0];
      return pidLoop ? (pidLoop.out ?? 0) : 0;
    case 'math':
      const mathOp = state.math?.[sel.index|0];
      return mathOp ? (mathOp.output ?? 0) : 0;
    case 'expr':
      const expr = state.expr?.[sel.index|0];
      return expr ? (expr.output ?? 0) : 0;
    case 'button':
      // For button vars, sel.index is the variable name (string)
      return state.buttonVars?.[sel.index] ?? 0;
    case 'static':
    case 'global':
      // sel.index is the variable name (string)
      return state.static_vars?.[sel.index] ?? 0;
    case 'scale':
      return state.scales?.[sel.index|0] ?? 0;
  }
  return 0;
}

/**
 * Resolve a series' target value to a number, or return null if no target.
 *
 * Supports three storage shapes:
 *   - undefined / null              → no target (returns null)
 *   - plain number (legacy, ≤2.1.7) → fixed value
 *   - { mode: 'fixed', value }      → fixed value (new)
 *   - { mode: 'signal', sel }       → live read via readSelection() (new)
 *
 * Signal-mode targets read the raw signal value as-is. Display scale/offset
 * configured on the series itself are NOT applied to the target — the
 * assumption is that the picked signal is already in the correct unit space
 * (e.g. picking "AO:Setpoint" gives you whatever AO:Setpoint reads, in its
 * own units). If you need to rescale a signal target, feed it through a
 * Math operator and pick the Math output.
 */
function resolveTargetValue(s) {
  if (s == null || s.target == null) return null;
  // Legacy: bare number
  if (typeof s.target === 'number') return Number.isFinite(s.target) ? s.target : null;
  // New: object form
  if (typeof s.target === 'object') {
    if (s.target.mode === 'fixed') {
      const v = Number(s.target.value);
      return Number.isFinite(v) ? v : null;
    }
    if (s.target.mode === 'signal' && s.target.sel) {
      const v = readSelection(s.target.sel);
      return Number.isFinite(v) ? v : null;
    }
  }
  return null;
}

// drag/resize — block drag when interacting with inputs
function makeDragResize(node, w, header, handle){
  let dragging=false,resizing=false,sx=0,sy=0,ox=0,oy=0,ow=0,oh=0;
  let groupTargets=null;   // other members moving with this drag
  
  // Set minimum sizes based on widget type
  let minW = 280;
  if (w.type === 'dobutton') minW = 70;
  else if (w.type === 'bars') minW = 100;  // Allow narrow bar graphs
  else if (w.type === 'le' || w.type === 'mathop') minW = 140;  // 50% of default 280
  else if (w.type === 'pidpanel') minW = 168;  // 60% of default 280
  else if (w.type === 'staticvar') minW = 196;  // 70% of default 280
  else if (w.type === 'indicator') minW = 20;   // small dot+label allowance
  else if (w.type === 'label') minW = 24;       // narrow but not invisible
  else if (w.type === 'statustext') minW = 10;   // tiny pills allowed (per russ)
  else if (w.type === 'shape') minW = 16;        // enough room for a tiny shape
  else if (w.type === 'console') minW = 200;     // unreadable below this
  
  let minH = 180;
  if (w.type === 'dobutton') minH = 45;
  else if (w.type === 'le' || w.type === 'mathop') minH = 10;  // Half of default 20
  else if (w.type === 'staticvar') minH = 90;  // Half of default 180
  else if (w.type === 'indicator') minH = 16;  // dot only, no label
  else if (w.type === 'label') minH = 14;      // about one line at 12px
  else if (w.type === 'statustext') minH = 10;
  else if (w.type === 'shape') minH = 16;
  else if (w.type === 'console') minH = 80;
  
  // Bring to front when clicking anywhere on widget — EXCEPT during
  // multi-select/group interactions: a grouped background shape must keep
  // its sent-to-back position while being moved (the whole reason groups
  // exist), and ctrl-clicks are selection edits, not focus changes.
  node.addEventListener('mousedown', (e)=>{
    if (isUiEditMode() && (e.ctrlKey || e.metaKey ||
        w.groupId || (_msSel.size > 1 && _msSel.has(w.id)))) return;
    bringToFront(node);
  });
  
  if (header) {
    header.addEventListener('mousedown', (e)=>{
      // Layout drag is locked outside edit mode. Clicks on inputs /
      // buttons / icons still work below.
      if (!isUiEditMode()) return;
      // A mousedown on the RESIZE handle must never also start a drag: the
      // handle sits inside the drag surface, so the event bubbles here and
      // used to set dragging+resizing simultaneously. Harmless when snap
      // anchored the left corner (the phantom drag was a no-op), but with
      // CENTER-anchored snap (2.1.87) the changing width re-derived the
      // position every frame and the widget danced around while resizing.
      if (handle && (e.target === handle || (handle.contains && handle.contains(e.target)))) return;
      const tag=(e.target.tagName||'').toUpperCase();
      // Allow clicking on icon spans (settings/close buttons)
      if (e.target.classList && e.target.classList.contains('icon')) return;
      if (['INPUT','SELECT','BUTTON','TEXTAREA','LABEL','OPTION'].includes(tag)) return;
      // Ctrl+click = selection toggle, never a drag.
      if (e.ctrlKey || e.metaKey) { msToggle(w.id); e.preventDefault(); return; }
      // Establish the move-set BEFORE dragging: an explicit selection that
      // includes this widget wins; otherwise a persistent group implies
      // its members; otherwise this drag is solo (and clears selection).
      if (!_msSel.has(w.id)) {
        if (w.groupId) msSelectGroup(w.groupId); else msClear();
      }
      groupTargets = null;
      if (_msSel.has(w.id) && _msSel.size > 1) {
        const page = state.pages[activePageIndex];
        groupTargets = [];
        for (const other of (page?.widgets || [])) {
          if (other.id !== w.id && _msSel.has(other.id) && !other.popoutId) {
            groupTargets.push({ w: other,
                                node: document.getElementById('w_' + other.id) });
          }
        }
      }
      dragging=true; ox=w.x; oy=w.y; sx=e.clientX; sy=e.clientY; e.preventDefault();
    });
  }
  if (handle) {
    handle.addEventListener('mousedown', (e)=>{
      // Resize is also a layout operation — locked outside edit mode.
      if (!isUiEditMode()) return;
      resizing=true; ow=w.w; oh=w.h; sx=e.clientX; sy=e.clientY; e.preventDefault();
    });
  }
  window.addEventListener('mousemove',(e)=>{
    if(dragging){
      // Snap to the grid when enabled. gridSnap is a no-op when the grid is
      // disabled, so this branch behaves identically with the grid off.
      //
      // ANCHOR-AWARE SNAP (rig 7/23, per russ): auto-sized widgets have
      // text-dependent widths, so snapping the LEFT edge can never line a
      // column up. Indicators and status texts snap by their CENTER (their
      // content is centered); labels snap by their text justification
      // (left edge / center / right edge). Everything else keeps upper-left.
      const rawX = ox + (e.clientX - sx);
      let anchor = 'left';
      if (w.type === 'indicator' || w.type === 'statustext') anchor = 'center';
      else if (w.type === 'label') {
        anchor = (w.opts.align === 'center') ? 'center'
               : (w.opts.align === 'right')  ? 'right' : 'left';
      }
      let nx;
      if (anchor === 'center')     nx = gridSnap(rawX + w.w / 2) - w.w / 2;
      else if (anchor === 'right') nx = gridSnap(rawX + w.w) - w.w;
      else                         nx = gridSnap(rawX);
      const ny = gridSnap(oy + (e.clientY - sy));
      const dx = nx - w.x, dy = ny - w.y;
      w.x = nx; w.y = ny;
      node.style.left = w.x + 'px';
      node.style.top  = w.y + 'px';
      // Per-widget drag hook — lines use this to translate their stored
      // endpoint coordinates so they stay in sync with the moved bounding
      // box. Other widgets don't set _onDrag and the call is a no-op.
      if (typeof w._onDrag === 'function') {
        try { w._onDrag(dx, dy); } catch (e2) { console.warn(e2); }
      }
      // Group move: every other member follows the grabbed widget's
      // INCREMENTAL delta. Only the grabbed widget grid-snaps; followers
      // inherit its snapped motion, so relative offsets are preserved
      // bit-exactly (no per-member re-snapping drift). Shapes' absolute
      // endpoint/vertex coords ride along via their own _onDrag hooks.
      if (groupTargets) {
        for (const gt of groupTargets) {
          gt.w.x += dx; gt.w.y += dy;
          if (gt.node) {
            gt.node.style.left = gt.w.x + 'px';
            gt.node.style.top  = gt.w.y + 'px';
          }
          if (typeof gt.w._onDrag === 'function') {
            try { gt.w._onDrag(dx, dy); } catch (e3) { console.warn(e3); }
          }
        }
      }
    }
    if(resizing){
      // Snap the new width/height so the lower-right resize handle lands
      // on a grid intersection. Min-size constraints still apply: we
      // snap first, then floor to minW/minH so the widget never gets
      // dragged below its usable size.
      let nw = gridSnap(ow + (e.clientX - sx));
      let nh = gridSnap(oh + (e.clientY - sy));
      w.w = Math.max(minW, nw);
      w.h = Math.max(minH, nh);
      node.style.width  = w.w + 'px';
      node.style.height = w.h + 'px';
    }
  });
  window.addEventListener('mouseup',()=>{ dragging=false; resizing=false; groupTargets=null; });
}

function normalizeLayoutPages(pages){
  const norm = (w) => {
    w.opts = w.opts || {};
    // A popoutId is only meaningful for the lifetime of an open popout
    // window. Reloading the page or loading a saved layout invalidates
    // any previously-recorded popout — clear it so the widget docks
    // back into the main page rather than showing a "popped out"
    // placeholder forever.
    if (w.popoutId) delete w.popoutId;
    switch (w.type) {
      case 'chart':
        w.opts.title      = w.opts.title ?? 'Chart';
        w.opts.series     = Array.isArray(w.opts.series) ? w.opts.series : [];
        w.opts.span       = Number.isFinite(w.opts.span) ? w.opts.span : 10;
        w.opts.scale      = w.opts.scale ?? 'auto';
        w.opts.min        = Number.isFinite(w.opts.min) ? w.opts.min : 0;
        w.opts.max        = Number.isFinite(w.opts.max) ? w.opts.max : 10;
        w.opts.filterHz   = Number.isFinite(w.opts.filterHz) ? w.opts.filterHz : 0;
        w.opts.cursorMode = w.opts.cursorMode ?? 'follow';
        break;
      case 'gauge':
        w.opts.title  = w.opts.title ?? 'Gauge';
        w.opts.needles= Array.isArray(w.opts.needles) ? w.opts.needles : [];
        w.opts.scale  = w.opts.scale ?? 'manual';
        w.opts.min    = Number.isFinite(w.opts.min) ? w.opts.min : 0;
        w.opts.max    = Number.isFinite(w.opts.max) ? w.opts.max : 10;
        break;
      case 'bars':
        w.opts.title  = w.opts.title ?? 'Bars';
        w.opts.scale  = w.opts.scale ?? 'auto';
        w.opts.min    = Number.isFinite(w.opts.min) ? w.opts.min : 0;
        w.opts.max    = Number.isFinite(w.opts.max) ? w.opts.max : 10;
        break;
      case 'dobutton':
        w.opts.title     = w.opts.title ?? 'Button';
        w.opts.outputType= w.opts.outputType ?? 'do';
        w.opts.doIndex   = Number.isInteger(w.opts.doIndex) ? w.opts.doIndex : 0;
        w.opts.varName   = w.opts.varName || 'button1';
        w.opts.activeHigh= (w.opts.activeHigh !== false);
        w.opts.mode      = w.opts.mode ?? 'momentary';
        w.opts.actuationTime = Number.isFinite(w.opts.actuationTime) ? w.opts.actuationTime : 0;
        break;
      case 'aoslider':
        w.opts.title   = w.opts.title ?? 'AO';
        w.opts.aoIndex = Number.isInteger(w.opts.aoIndex) ? w.opts.aoIndex : 0;
        w.opts.minV    = Number.isFinite(w.opts.minV) ? w.opts.minV : 0;
        w.opts.maxV    = Number.isFinite(w.opts.maxV) ? w.opts.maxV : 10;
        break;
      case 'pidpanel':
        w.opts.title = w.opts.title ?? 'PID';
        // leave other PID fields as-is; panel reads current config
        break;
      case 'motor':
        w.opts.title = w.opts.title ?? 'Motor';
        w.opts.motorIndex = Number.isInteger(w.opts.motorIndex) ? w.opts.motorIndex : 0;
        w.opts.showControls = (w.opts.showControls !== false);
        break;
      case 'le':
        w.opts.title = w.opts.title ?? 'Logic Element';
        w.opts.leIndex = Number.isInteger(w.opts.leIndex) ? w.opts.leIndex : 0;
        w.opts.showInputs = (w.opts.showInputs !== false);
        break;
      case 'mathop':
        w.opts.title = w.opts.title ?? 'Math';
        w.opts.mathIndex = Number.isInteger(w.opts.mathIndex) ? w.opts.mathIndex : 0;
        w.opts.showInputs = (w.opts.showInputs !== false);
        break;
      case 'staticvar':
        w.opts.varName       = w.opts.varName || '';
        w.opts.title         = w.opts.title || w.opts.varName || 'Static Var';
        w.opts.decimalPlaces = Number.isInteger(w.opts.decimalPlaces) ? w.opts.decimalPlaces : 3;
        break;
      case 'indicator': {
        // Indicator: small two-color status dot/rect with two priority-ordered
        // conditions. Each condition has an op and two operands (signal-or-fixed).
        // Normalize defensively so older saved layouts get sensible defaults.
        const defOpA = {
          op: '>',
          lhs: { mode: 'signal', sel: { kind: 'ai', index: 0 } },
          rhs: { mode: 'fixed', value: 0 }
        };
        const defOpB = {
          op: '<',
          lhs: { mode: 'signal', sel: { kind: 'ai', index: 0 } },
          rhs: { mode: 'fixed', value: 0 }
        };
        const fixCond = (c, def) => {
          if (!c || typeof c !== 'object') return JSON.parse(JSON.stringify(def));
          if (!['>','<','=','!='].includes(c.op)) c.op = def.op;
          if (!c.lhs || typeof c.lhs !== 'object') c.lhs = JSON.parse(JSON.stringify(def.lhs));
          if (!c.rhs || typeof c.rhs !== 'object') c.rhs = JSON.parse(JSON.stringify(def.rhs));
          for (const side of ['lhs','rhs']) {
            const s = c[side];
            if (s.mode !== 'signal' && s.mode !== 'fixed') s.mode = 'fixed';
            if (s.mode === 'signal' && (!s.sel || typeof s.sel !== 'object')) {
              s.sel = { kind: 'ai', index: 0 };
            }
            if (s.mode === 'fixed' && !Number.isFinite(s.value)) s.value = 0;
          }
          return c;
        };
        w.opts.title    = w.opts.title || 'Indicator';
        w.opts.shape    = (w.opts.shape === 'rect') ? 'rect' : 'round';
        w.opts.size     = Number.isFinite(w.opts.size) && w.opts.size >= 6 ? w.opts.size : 14;
        w.opts.colorA   = (typeof w.opts.colorA === 'string') ? w.opts.colorA : '#2faa60';
        w.opts.colorB   = (typeof w.opts.colorB === 'string') ? w.opts.colorB : '#d84a4a';
        w.opts.colorOff = (typeof w.opts.colorOff === 'string') ? w.opts.colorOff : '#3b425e';
        w.opts.showLabel= (w.opts.showLabel !== false);
        w.opts.condA    = fixCond(w.opts.condA, defOpA);
        w.opts.condB    = fixCond(w.opts.condB, defOpB);
        break;
      }
      case 'statustext': {
        // Conditional status text. Defensive normalize so hand-edited or
        // older layouts don't crash the render loop.
        if (!w.opts.src || typeof w.opts.src !== 'object') {
          w.opts.src = { mode: 'signal', sel: { kind: 'static', index: 'mvrPhase' } };
        }
        w.opts.src.mode = 'signal';
        if (!w.opts.src.sel || typeof w.opts.src.sel !== 'object') {
          w.opts.src.sel = { kind: 'static', index: 'mvrPhase' };
        }
        if (!Array.isArray(w.opts.conds)) w.opts.conds = [];
        w.opts.conds = w.opts.conds.filter(c => c && typeof c === 'object');
        for (const c of w.opts.conds) {
          if (!['=','!=','>','<','>=','<='].includes(c.op)) c.op = '=';
          if (!Number.isFinite(Number(c.value))) c.value = 0;
          if (typeof c.text !== 'string') c.text = '';
        }
        w.opts.defText  = (typeof w.opts.defText === 'string') ? w.opts.defText : '—';
        if (typeof w.opts.autoSize !== 'boolean') w.opts.autoSize = true;
        w.opts.fontSize = (Number.isFinite(w.opts.fontSize) && w.opts.fontSize >= 6) ? w.opts.fontSize : 18;
        break;
      }
      case 'label': {
        // Simple text label — no border, no chrome. Defensive normalize so
        // older layouts don't crash on missing fields.
        w.opts.text       = (typeof w.opts.text === 'string') ? w.opts.text : 'Label';
        w.opts.fontFamily = (typeof w.opts.fontFamily === 'string' && w.opts.fontFamily) ? w.opts.fontFamily : 'system-ui';
        w.opts.fontSize   = (Number.isFinite(w.opts.fontSize) && w.opts.fontSize >= 6) ? w.opts.fontSize : 16;
        w.opts.fontWeight = (w.opts.fontWeight === 'bold') ? 'bold' : 'normal';
        w.opts.fontStyle  = (w.opts.fontStyle === 'italic') ? 'italic' : 'normal';
        w.opts.fgColor    = (typeof w.opts.fgColor === 'string') ? w.opts.fgColor : '#e6e6e6';
        w.opts.bgColor    = (typeof w.opts.bgColor === 'string') ? w.opts.bgColor : 'transparent';
        w.opts.align      = (['left','center','right'].includes(w.opts.align)) ? w.opts.align : 'left';
        break;
      }
      case 'shape': {
        // Drawing aid. Defensive normalize for older layouts that might
        // be missing fields. kind defaults to circle.
        const okKind = ['line','circle','polygon'];
        w.opts.kind = okKind.includes(w.opts.kind) ? w.opts.kind : 'circle';
        w.opts.strokeColor = (typeof w.opts.strokeColor === 'string') ? w.opts.strokeColor : '#79c0ff';
        w.opts.strokeWidth = (Number.isFinite(w.opts.strokeWidth) && w.opts.strokeWidth >= 0) ? w.opts.strokeWidth : 2;
        w.opts.fillColor   = (typeof w.opts.fillColor === 'string') ? w.opts.fillColor : 'transparent';
        // line-specific. The endpoint coords ARE the line; the bounding
        // box is derived from them. If endpoints are missing (older
        // layouts that stored only `direction`), synthesize them from
        // the bounding box so the line still renders sensibly.
        w.opts.arrowStart = (w.opts.arrowStart === true);
        w.opts.arrowEnd   = (w.opts.arrowEnd === true);
        const hasEndpoints =
          Number.isFinite(w.opts.x1) && Number.isFinite(w.opts.y1) &&
          Number.isFinite(w.opts.x2) && Number.isFinite(w.opts.y2);
        if (!hasEndpoints) {
          // Use the saved bounding box (w.x/y/w/h) plus direction (if any)
          // to pick endpoint positions. Defaults give a top-left → bottom-
          // right diagonal across the box.
          const bx = Number.isFinite(w.x) ? w.x : 40;
          const by = Number.isFinite(w.y) ? w.y : 40;
          const bw = Number.isFinite(w.w) && w.w > 0 ? w.w : 100;
          const bh = Number.isFinite(w.h) && w.h > 0 ? w.h : 100;
          if (w.opts.direction === 'bltr') {
            w.opts.x1 = bx;       w.opts.y1 = by + bh;
            w.opts.x2 = bx + bw;  w.opts.y2 = by;
          } else {
            w.opts.x1 = bx;       w.opts.y1 = by;
            w.opts.x2 = bx + bw;  w.opts.y2 = by + bh;
          }
        }
        // `direction` is no longer used at render time — leave it in place
        // for backcompat but don't enforce.
        // polygon-specific. sides minimum 3 (triangle).
        w.opts.sides = (Number.isFinite(w.opts.sides) && w.opts.sides >= 3 && w.opts.sides <= 24)
                       ? (w.opts.sides | 0) : 4;
        w.opts.cornerRadius = (Number.isFinite(w.opts.cornerRadius) && w.opts.cornerRadius >= 0)
                              ? w.opts.cornerRadius : 0;
        w.opts.rotation     = Number.isFinite(w.opts.rotation) ? w.opts.rotation : 0;
        // Constrain-angles default is true so legacy layouts that pre-date
        // this field get the new "preserve angles" behavior automatically.
        w.opts.constrainAngles = (w.opts.constrainAngles !== false);
        // Recompute the bounding box from endpoints for lines (whether
        // they came in or we synthesized them just now).
        if (w.opts.kind === 'line') _recomputeLineBounds(w);
        // Polygons: clean up vertex list if present, otherwise synthesize
        // one from generators. Older layouts without vertex data get
        // upgraded transparently here.
        if (w.opts.kind === 'polygon') {
          let vs = w.opts.vertices;
          if (Array.isArray(vs) && vs.length >= 3) {
            vs = vs
              .filter(p => p && Number.isFinite(p.x) && Number.isFinite(p.y))
              .map(p => ({ x: +p.x, y: +p.y }));
            if (vs.length >= 3) {
              w.opts.vertices = vs;
              _recomputePolygonBounds(w);
            } else {
              _regenerateRegularPolygon(w);
            }
          } else {
            _regenerateRegularPolygon(w);
          }
        }
        break;
      }
      case 'console': {
        // Console widget — server stdout/stderr mirror. Defensive defaults.
        w.opts = w.opts || {};
        w.opts.title     = (typeof w.opts.title === 'string') ? w.opts.title : 'Console';
        w.opts.fontSize  = (Number.isFinite(w.opts.fontSize) && w.opts.fontSize >= 8 && w.opts.fontSize <= 24) ? w.opts.fontSize : 12;
        w.opts.wrap      = (w.opts.wrap === true);
        w.opts.autoscroll = (w.opts.autoscroll !== false);  // default true
        w.opts.maxLines  = (Number.isFinite(w.opts.maxLines) && w.opts.maxLines >= 100) ? w.opts.maxLines | 0 : 5000;
        w.opts.showStream = (['stdout','stderr','both'].includes(w.opts.showStream)) ? w.opts.showStream : 'both';
        break;
      }
    }
    // ensure position/size exist so renderPage doesn’t choke
    w.x = Number.isFinite(w.x) ? w.x : 40;
    w.y = Number.isFinite(w.y) ? w.y : 40;
    w.w = Number.isFinite(w.w) ? w.w : 460;
    w.h = Number.isFinite(w.h) ? w.h : 280;
    return w;
  };
  return pages.map(p => ({
    name: p.name || '',
    widgets: Array.isArray(p.widgets) ? p.widgets.map(norm) : []
  }));
}

/* -------------------------- modal / editors ----------------------------- */
function _ensureModalRoot() {
  // The main index.html declares <div id="modal" class="modal hidden"></div>
  // up front, but popout.html doesn't (it's a stripped-down template that
  // hosts a single widget). Without this lazy creation, clicking the ⚙
  // gear in a popped-out widget would hit `null.classList.remove(...)`
  // and silently fail (with PyCharm's JS debugger or browser dev tools
  // attached, that null deref might trigger a breakpoint). Returning a
  // ready-to-use modal element here means showModal works in any context
  // that loads app.js.
  let m = document.getElementById('modal');
  if (!m) {
    m = document.createElement('div');
    m.id = 'modal';
    m.className = 'modal hidden';
    document.body.append(m);
  }
  return m;
}

/* ----------------------------- Simulator panel ----------------------------
 * Two checkboxes backed by static vars (the server reads them):
 *   simEnable  -> feed controllers from the MVR plant model vs real AI/TC
 *   simDriveHW -> in sim, also drive the real relays/heaters/VFD/stepper (HIL)
 * A live status line makes the active mode unmistakable so suppressed outputs
 * are never a mystery. */
function openSimPanel(){
  const cur = (name) => parseFloat((state.static_vars||{})[name]) || 0;
  const setVar = (name, value) => fetch('/api/static_vars', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({name, value})
    }).then(r=>{ if(!r.ok) alert('Failed to set '+name); });

  const simCb = el('input', {type:'checkbox'});
  const hwCb  = el('input', {type:'checkbox'});
  simCb.checked = cur('simEnable')  >= 0.5;
  hwCb.checked  = cur('simDriveHW') >= 0.5;

  const status = el('div', {style:'margin-top:16px;padding:10px;border-radius:6px;font-weight:600;text-align:center'});
  const refresh = () => {
    const s = simCb.checked, h = hwCb.checked;
    hwCb.disabled = !s;   // HIL only applies while simulating
    if (!s){
      status.textContent = 'REAL OPERATION — live sensors, hardware driven';
      status.style.background = '#1f3a2a'; status.style.color = '#9ece6a';
    } else if (!h){
      status.textContent = '⚠ SIMULATING — real outputs SUPPRESSED (dry run)';
      status.style.background = '#3a341f'; status.style.color = '#e0af68';
    } else {
      status.textContent = '⚠ SIMULATING — HARDWARE IN THE LOOP (real outputs driven!)';
      status.style.background = '#3a1f24'; status.style.color = '#f7768e';
    }
  };
  simCb.onchange = () => { setVar('simEnable',  simCb.checked?1:0); refresh(); };
  hwCb.onchange  = () => { setVar('simDriveHW', hwCb.checked?1:0); refresh(); };
  refresh();

  const row = (cb, title, help) => el('label',
    {style:'display:flex;align-items:flex-start;gap:10px;margin:12px 0;cursor:pointer'},
    [cb, el('div',{}, [el('div',{style:'font-weight:600'}, title),
                       el('div',{style:'font-size:12px;color:var(--muted)'}, help)])]);

  // Reset the simulator to cold/ambient startup (one-shot static.simReset; the
  // MVR System expression snaps the plant + control state back and self-clears).
  const resetBtn = el('button', {className:'btn', style:'margin-top:14px;width:100%',
    onclick:()=>{
      setVar('simReset', 1);
      const orig = resetBtn.textContent;
      resetBtn.textContent = 'Reset → cold/ambient ✓';
      setTimeout(()=>{ resetBtn.textContent = orig; }, 1500);
    }}, 'Reset sim to ambient (instant cool-down)');

  showModal(el('div', {style:'min-width:460px'}, [
    el('h2', {}, 'Simulator'),
    row(simCb, 'Simulate inputs',
        'Feed the controllers from the MVR plant model instead of the real AI/TC sensors. Real operation is unaffected when this is off.'),
    row(hwCb, 'Hardware enabled (hardware-in-the-loop)',
        'While simulating, also drive the REAL relays / heaters / VFD / stepper. Unchecked = dry run (no physical actuation).'),
    status,
    resetBtn,
    el('div',{style:'font-size:12px;color:var(--muted);margin-top:6px'},
        'Snaps all sim temps to ambient and clears the run (inventory, condensate, integrators, calibration, phase). Only acts while simulating.'),
  ]));
}

function showModal(content, onClose){
  const m=_ensureModalRoot(); m.classList.remove('hidden'); m.innerHTML='';
  const panel=el('div',{className:'panel'});
  const closeBtn=el('button',{className:'btn',onclick:()=>{ closeModal(onClose); }},'Close');
  const close=el('div',{style:'text-align:right;margin-bottom:8px;'}, closeBtn);
  panel.append(close,content); m.append(panel);
}

function closeModal(onClose){
  const m=document.getElementById('modal');
  if (m) m.classList.add('hidden');
  if (typeof onClose==='function') onClose();
}
function openJsonEditor(title,url){
  fetch(url).then(r=>r.json()).then(obj=>{
    const ta=el('textarea',{style:'width:100%;height:60vh'}, JSON.stringify(obj,null,2));
    const save=el('button',{className:'btn',onclick:async()=>{
      try{ await fetch(url,{method:'PUT',headers:{'Content-Type':'application/json'},body:ta.value}); alert('Saved'); }
      catch(e){ alert('Save failed: '+e.message); }
    }},'Save');
    showModal(el('div',{},[el('h2',{},title), ta, el('div',{style:'margin-top:8px'},save)]), ()=>{ renderPage(); });
  }).catch(()=>{
    const ta=el('textarea',{style:'width:100%;height:60vh'}, '// Paste your script JSON here');
    const save=el('button',{className:'btn',onclick:()=>alert('No /api/script endpoint; server needs implementing.')},'Save');
    showModal(el('div',{},[el('h2',{},title), ta, el('div',{style:'margin-top:8px'},save)]));
  });
}


/* ==================== EDITORS WITH LOAD FROM FILE ==================== */
// Replace your openConfigForm, openPidForm, and openScriptEditor functions

async function openConfigForm(providedConfig = null, banner = null){
  let cfg;
  if (providedConfig) {    cfg = providedConfig;
  } else {    cfg = await (await fetch('/api/config')).json();
  }
  console.log('[CONFIG-DEBUG] Using config:', {
    boards1608: cfg.boards1608 || cfg.board1608,
    boardsetc: cfg.boardsetc || cfg.boardetc,
    analogCount: (cfg.analogs || []).length,
    doCount: (cfg.digitalOutputs || []).length
  });
  configCache = cfg;
  const root=el('div',{});
  
  // Add banner if provided (from Load button)
  if (banner) {
    root.append(banner);
  }

  // Add Load from File button
  const loadBtn = createLoadButton((loaded, filename) => {    console.log('[CONFIG-DEBUG] Loaded data:', {
      boards1608: loaded.boards1608 || loaded.board1608,
      boardsetc: loaded.boardsetc || loaded.boardetc,
      analogCount: (loaded.analogs || []).length,
      doCount: (loaded.digitalOutputs || []).length
    });
    closeModal();    
    // Show banner with Apply button
    const applyBanner = el('div', {
      style: 'background:#3a5a1a;border:2px solid #4a9eff;border-radius:6px;padding:12px;margin-bottom:12px;display:flex;align-items:center;justify-content:space-between'
    });
    
    const msg = el('div', {}, [
      el('strong', {style: 'color:#4a9eff'}, `📁 Loaded: ${filename}`),
      el('div', {style: 'font-size:12px;margin-top:4px;color:#ccc'}, 
        'Config loaded from file. Will be applied when you close this window. You can edit first if needed.')
    ]);
    
    applyBanner.append(msg);
    
    openConfigForm(loaded, applyBanner); // Pass banner to show at top
  });

  // Support both single-board (old) and array (new) formats
  // Determine which format we're using
  const usingSingleBoards = (cfg.board1608 && !Array.isArray(cfg.board1608));
  
  // If using single boards, ensure they exist
  if (usingSingleBoards) {
    if (!cfg.board1608) cfg.board1608 = {boardNum: 0, sampleRateHz: 100, blockSize: 128, enabled: true};
    if (!cfg.boardetc) cfg.boardetc = {boardNum: 1, sampleRateHz: 10, blockSize: 1, enabled: true};
    // Only set enabled=true if field is completely missing (not if it's false!)
    // This preserves the user's choice to disable a board
    if (!('enabled' in cfg.board1608)) cfg.board1608.enabled = true;
    if (!('enabled' in cfg.boardetc)) cfg.boardetc.enabled = true;
  } else {
    // Using array format
    if (!cfg.boards1608) cfg.boards1608 = [{boardNum: 0, sampleRateHz: 100, blockSize: 128, enabled: true}];
    if (!cfg.boardsetc) cfg.boardsetc = [{boardNum: 1, sampleRateHz: 10, blockSize: 1, enabled: true}];
  }
  
  const boardsContainer = el('div', {});
  
  function renderBoards() {
    boardsContainer.innerHTML = '';
    
    if (usingSingleBoards) {
      // OLD FORMAT: Single board objects
      const b1608Card = el('div', {style: 'border:1px solid #2a3046;border-radius:6px;padding:12px;margin:8px 0;background:#1a2030'});
      b1608Card.append(
        el('strong', {style: 'display:block;margin-bottom:8px'}, 'E-1608 Board (AI/DO/AO)'),
        tableForm([
          ['Enabled',      inputChk(cfg.board1608,'enabled')],
          ['Board Number', inputNum(cfg.board1608,'boardNum',0)],
          ['Sample Rate (Hz)', inputNum(cfg.board1608,'sampleRateHz',1)],
          ['Block Size',   inputNum(cfg.board1608,'blockSize',1)]
        ])
      );
      
      const btcCard = el('div', {style: 'border:1px solid #2a3046;border-radius:6px;padding:12px;margin:8px 0;background:#1a2030'});
      btcCard.append(
        el('strong', {style: 'display:block;margin-bottom:8px'}, 'E-TC Board (Thermocouples)'),
        tableForm([
          ['Enabled',      inputChk(cfg.boardetc,'enabled')],
          ['Board Number', inputNum(cfg.boardetc,'boardNum',0)],
          ['Sample Rate (Hz)', inputNum(cfg.boardetc,'sampleRateHz',1)],
          ['Block Size',   inputNum(cfg.boardetc,'blockSize',1)]
        ])
      );
      
      const enableMultiBtn = el('button', {
        className: 'btn',
        style: 'margin-top:12px',
        onclick: () => {
          if (confirm('Convert to multiple boards format? This will allow adding more boards. Your current boards will be preserved.')) {
            // Convert single boards to arrays
            cfg.boards1608 = [cfg.board1608];
            cfg.boardsetc = [cfg.boardetc];
            delete cfg.board1608;
            delete cfg.boardetc;
            // Reload the form
            closeModal();
            openConfigForm(cfg);
          }
        }
      }, '🔧 Enable Multiple Boards (Advanced)');
      
      boardsContainer.append(
        el('p', {style: 'font-size:12px;color:var(--muted);margin-bottom:12px'}, 
          'Using single-board format (one E-1608, one E-TC). Click below to enable multiple boards.'),
        b1608Card,
        btcCard,
        enableMultiBtn
      );
      return;
    }
    
    // NEW FORMAT: Array of boards
    // E-1608 Boards
    const b1608Title = el('h4', {style: 'margin:12px 0 8px 0'}, 'E-1608 Boards (AI/DO/AO)');
    const b1608Add = el('button', {
      className: 'btn',
      onclick: () => {
        const boardIdx = cfg.boards1608.length;
        
        // Create arrays for channels
        const analogs = [];
        const digitalOutputs = [];
        const analogOutputs = [];
        
        // Add 8 AI channels
        for (let i = 0; i < 8; i++) {
          analogs.push({
            name: `AI${i}`,
            slope: 1.0,
            offset: 0.0,
            cutoffHz: 0.1,
            units: 'V',
            include: true
          });
        }
        // Counters (CTR) are their own type, separate from AI -- default empty;
        // the E-1608 has one 32-bit event counter (CTR0). Add via the Counters editor.
        const counters = [];
        
        // Add 8 DO channels
        for (let i = 0; i < 8; i++) {
          digitalOutputs.push({
            name: `DO${i}`,
            mode: 'toggle',
            invert: false,
            actuationTime: 0.1,
            include: true
          });
        }
        
        // Add 2 AO channels
        for (let i = 0; i < 2; i++) {
          analogOutputs.push({
            name: `AO${i}`,
            minV: 0.0,
            maxV: 10.0,
            startupV: 0.0,
            enable_gate: false,
            enable_kind: 'do',
            enable_index: 0,
            include: true
          });
        }
        
        // Add the board with its channels
        cfg.boards1608.push({
          boardNum: boardIdx,
          sampleRateHz: 100,
          blockSize: 128,
          enabled: true,
          analogs: analogs,
          digitalOutputs: digitalOutputs,
          analogOutputs: analogOutputs,
          counters: counters
        });
        
        console.log(`[CONFIG] Added E-1608 board #${boardIdx} with 8 AI, 8 DO, 2 AO`);
        alert(`Added E-1608 board #${boardIdx}\n+8 AI (AI0-AI7)\n+8 DO (DO0-DO7)\n+2 AO (AO0-AO1)`);
        
        renderBoards();
      }
    }, '+ Add E-1608');
    
    const b1608List = el('div', {});
    cfg.boards1608.forEach((board, idx) => {
      const card = el('div', {style: 'border:1px solid #2a3046;border-radius:6px;padding:12px;margin:8px 0;background:#1a2030'});
      const cardTitle = el('div', {style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px'});
      cardTitle.append(
        el('strong', {}, `E-1608 #${idx}`),
        el('button', {
          className: 'btn danger',
          style: 'font-size:11px;padding:4px 8px',
          onclick: () => {
            if (confirm(`Remove E-1608 board #${board.boardNum}?\n\nThis will remove the board and all its channels!`)) {
              cfg.boards1608.splice(idx, 1);
              console.log(`[CONFIG] Removed E-1608 board #${board.boardNum}`);
              renderBoards();
            }
          }
        }, '✕ Remove')
      );
      
      const fields = tableForm([
        ['Enabled',      inputChk(board,'enabled')],
        ['Board Number', inputNum(board,'boardNum',0)],
        ['Sample Rate (Hz)', inputNum(board,'sampleRateHz',1)],
        ['Block Size',   inputNum(board,'blockSize',1)]
      ]);
      
      card.append(cardTitle, fields);
      b1608List.append(card);
    });
    
    // E-TC Boards
    const btcTitle = el('h4', {style: 'margin:20px 0 8px 0'}, 'E-TC Boards (Thermocouples)');
    const btcAdd = el('button', {
      className: 'btn',
      onclick: () => {
        const boardIdx = cfg.boardsetc.length;
        
        // Create array for TC channels
        const thermocouples = [];
        
        // Add 8 TC channels
        for (let i = 0; i < 8; i++) {
          thermocouples.push({
            name: `TC${i}`,
            ch: i,
            type: 'K',
            offset: 0.0,
            cutoffHz: 0.1,
            include: true
          });
        }
        
        // Add the board with its channels
        cfg.boardsetc.push({
          boardNum: boardIdx,
          sampleRateHz: 10,
          blockSize: 1,
          enabled: true,
          thermocouples: thermocouples
        });
        
        console.log(`[CONFIG] Added E-TC board #${boardIdx} with 8 TC channels`);
        alert(`Added E-TC board #${boardIdx}\n+8 TC channels (TC0-TC7)`);
        
        renderBoards();
      }
    }, '+ Add E-TC');
    
    const btcList = el('div', {});
    cfg.boardsetc.forEach((board, idx) => {
      const card = el('div', {style: 'border:1px solid #2a3046;border-radius:6px;padding:12px;margin:8px 0;background:#1a2030'});
      const cardTitle = el('div', {style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px'});
      cardTitle.append(
        el('strong', {}, `E-TC #${idx}`),
        el('button', {
          className: 'btn danger',
          style: 'font-size:11px;padding:4px 8px',
          onclick: () => {
            if (confirm(`Remove E-TC board #${board.boardNum}?\n\nThis will remove the board and all its channels!`)) {
              cfg.boardsetc.splice(idx, 1);
              console.log(`[CONFIG] Removed E-TC board #${board.boardNum}`);
              renderBoards();
            }
          }
        }, '✕ Remove')
      );
      
      const fields = tableForm([
        ['Enabled',      inputChk(board,'enabled')],
        ['Board Number', inputNum(board,'boardNum',0)],
        ['Sample Rate (Hz)', inputNum(board,'sampleRateHz',1)],
        ['Block Size',   inputNum(board,'blockSize',1)]
      ]);
      
      // Digital Inputs (E-TC DIO configured as inputs -> stamped into a static var)
      if (!Array.isArray(board.digitalInputs)) board.digitalInputs = [];
      const dinWrap = el('div', {style:'margin-top:10px;border-top:1px solid #2a3046;padding-top:8px'});
      const dinHdr = el('div', {style:'display:flex;justify-content:space-between;align-items:center;margin-bottom:4px'});
      dinHdr.append(
        el('strong', {style:'font-size:12px'}, 'Digital Inputs (DIO → static var)'),
        el('button', {className:'btn', style:'font-size:11px;padding:3px 8px',
          onclick: () => { board.digitalInputs.push({name:'EvapHighLevel', bit:0, static_var:'dinEvapHigh', invert:false, include:true}); renderBoards(); }
        }, '+ Add DIN')
      );
      const dinBody = el('div', {});
      board.digitalInputs.forEach((din, di) => {
        const row = el('div', {style:'display:flex;gap:6px;align-items:center;margin:3px 0;flex-wrap:wrap'});
        const lbl = (t) => el('span', {style:'font-size:11px;color:var(--muted)'}, t);
        row.append(
          inputChk(din,'include'),
          inputText(din,'name'),
          lbl('bit'), inputNum(din,'bit',0),
          lbl('→ static'), inputText(din,'static_var'),
          lbl('invert'), inputChk(din,'invert'),
          el('button', {className:'btn danger', style:'font-size:11px;padding:3px 6px',
            onclick: () => { board.digitalInputs.splice(di,1); renderBoards(); }}, '✕')
        );
        dinBody.append(row);
      });
      dinWrap.append(dinHdr, dinBody);
      card.append(cardTitle, fields, dinWrap);
      btcList.append(card);
    });
    
    boardsContainer.append(
      b1608Title,
      el('div', {style: 'margin-bottom:8px'}, b1608Add),
      b1608List,
      btcTitle,
      el('div', {style: 'margin-bottom:8px'}, btcAdd),
      btcList
    );
  }
  
  renderBoards();
  
  const boards=fieldset('Hardware Boards', el('div', {}, [
    el('p', {style: 'font-size:12px;color:var(--muted);margin-bottom:12px'},
      'Add multiple E-1608 and E-TC boards as needed. Each board requires a unique board number.'),
    boardsContainer
  ]));

  // ---- Logging mode (server 2.13.14): full = every tick, one session.csv
  // (development); eco = decimated + daily-rotated files with retention --
  // for self-hosted rigs (Raspberry Pi on SD/limited storage).
  const logModeSel = el('select', {});
  [['full','Full (every tick — development)'],['eco','Eco (decimated + daily rotation — self-hosted rig)']]
    .forEach(([v,l]) => logModeSel.append(el('option', {value:v}, l)));
  logModeSel.value = (cfg.logMode === 'eco') ? 'eco' : 'full';
  logModeSel.onchange = () => { cfg.logMode = logModeSel.value; };
  const logHzInp = el('input', {type:'number', min:'0.1', max:'20', step:'0.1',
    value: Number(cfg.logHz) || 1.0, style:'width:80px'});
  logHzInp.oninput = () => { const v = parseFloat(logHzInp.value); if (v > 0) cfg.logHz = v; };
  const logRetInp = el('input', {type:'number', min:'1', max:'365', step:'1',
    value: Number(cfg.logRetainDays) || 30, style:'width:80px'});
  logRetInp.oninput = () => { const v = parseInt(logRetInp.value, 10); if (v > 0) cfg.logRetainDays = v; };
  const logging = fieldset('Logging', el('div', {}, [
    el('p', {style:'font-size:12px;color:var(--muted);margin-bottom:8px'},
      'Eco mode logs at the given rate into daily files (session_YYYYMMDD.csv) and prunes files older than the retention. Takes effect on server restart or Start New Log.'),
    tableForm([
      ['Mode', logModeSel],
      ['Eco rate (Hz)', logHzInp],
      ['Eco retention (days)', logRetInp]
    ])
  ]));

  // Build analog sections per board
  const analogSections = [];
  if (cfg.boards1608) {
    cfg.boards1608.forEach((board, boardIdx) => {
      const analogRows = (board.analogs||[]).map((a,i)=>{
        return [
          `AI${i}`, inputText(a,'name'),
          `slope`,    inputNum(a,'slope',0.000001),
          `offset`,   inputNum(a,'offset',0.000001),
          `cutoffHz`, inputNum(a,'cutoffHz',0.1),
          `units`,    inputText(a,'units'),
          `include`,  inputChk(a,'include'),
        ];
      });
      if (analogRows.length > 0) {
        analogSections.push(fieldset(`Analogs - Board #${board.boardNum} (Y = m·X + b)`, tableFormRows(analogRows)));
      }

      // --- Counters (CTR) -- first-class hardware-counter inputs (E-1608 has CTR0).
      // Own container + local re-render so Add/Delete update in place (this section is
      // built outside renderBoards(), so it can't rely on renderBoards to refresh). ---
      if (!Array.isArray(board.counters)) board.counters = [];
      const ctrBody = el('div', {});
      const renderCtr = () => {
        ctrBody.innerHTML = '';
        const ctrRows = board.counters.map((c,i)=>{
          const del = el('button', {title:'Remove this counter', style:'color:#e88;font-weight:bold'}, '✕');
          del.onclick = () => { board.counters.splice(i,1); renderCtr(); };
          return [
            `CTR${i}`,  inputText(c,'name'),
            `ctr#`,     selectEnum(['0'], String(c.ctr_num!=null?c.ctr_num:0), v=>{ c.ctr_num = parseInt(v,10); }),
            `K (pulses/unit)`, inputNum(c,'pulses_per_unit',1),
            `mode`,     selectEnum(['rate','total'], c.mode||'rate', v=>{ c.mode = v; }),
            `win (s)`,  inputNum(c,'window_s',0.1),
            `units`,    inputText(c,'units'),
            `include`,  inputChk(c,'include'),
            ``,         del,
          ];
        });
        const CTRS_PER_BOARD = 1;   // E-1608 has a single 32-bit hardware counter (CTR0)
        const atLimit = board.counters.length >= CTRS_PER_BOARD;
        const addCtrBtn = el('button', {style:'margin-top:6px'+(atLimit?';opacity:0.5':'')}, '+ Add CTR');
        addCtrBtn.onclick = () => {
          if (board.counters.length >= CTRS_PER_BOARD) {
            alert(`This board (E-1608) has only one hardware counter (CTR0) — you can configure just one CTR per board.`);
            return;
          }
          board.counters.push({ name:`CTR${board.counters.length}`, include:true, ctr_num:0,
            pulses_per_unit:1.0, window_s:1.0, mode:'rate', units:'' });
          renderCtr();
        };
        ctrBody.append(
          ctrRows.length ? tableFormRows(ctrRows)
                         : el('div',{style:'color:var(--muted);font-size:12px'},'No counters configured'),
          addCtrBtn,
          el('div',{style:'color:var(--muted);font-size:11px;margin-top:4px'},
             'E-1608 has one hardware counter (CTR0).')
        );
      };
      renderCtr();
      analogSections.push(fieldset(`Counters (CTR) - Board #${board.boardNum}`, ctrBody));
    });
  }
  const analogs = analogSections.length > 0 ? el('div', {}, analogSections) : el('div', {}, 'No analog channels configured');

  const DO_MODES=['toggle','momentary','buzz','pwm'];
  const doSections = [];
  if (cfg.boards1608) {
    cfg.boards1608.forEach((board, boardIdx) => {
      (board.digitalOutputs||[]).forEach(d=>{ if(!d.mode){ d.mode = d.momentary ? 'momentary' : 'toggle'; } });
      const doRows = (board.digitalOutputs||[]).map((d,i)=>{
        // PWM period field only shows when mode === 'pwm'. Duty = write 0..1 to the DO.
        const pwmInp = el('input',{type:'number',step:10,value:(d.pwmPeriodMs!=null?d.pwmPeriodMs:1000),
          style:'width:80px;display:'+(d.mode==='pwm'?'inline-block':'none'),
          title:'PWM period (ms). Set duty by writing 0..1 to this DO in an expression.'});
        pwmInp.oninput=()=>{ const v=parseFloat(pwmInp.value); d.pwmPeriodMs=Number.isFinite(v)?v:1000; };
        const modeSel = selectEnum(DO_MODES,d.mode||'toggle',v=>{
          d.mode=v; d.momentary=(v==='momentary');
          pwmInp.style.display = (v==='pwm'?'inline-block':'none');
        });
        return [
          `DO${i}`, inputText(d,'name'),
          `mode`,        modeSel,
          `Invert`,      inputChk(d,'invert'),   // drive the PIN 1 when the expression says 0 (and vice versa)
          `actuationTime (s)`, inputNum(d,'actuationTime',0.1),
          `PWM ms`,      pwmInp,
          `include`,     inputChk(d,'include')
        ];
      });
      if (doRows.length > 0) {
        doSections.push(fieldset(`Digital Outputs - Board #${board.boardNum}`, tableFormRows(doRows)));
      }
    });
  }
  const dig = doSections.length > 0 ? el('div', {}, doSections) : el('div', {}, 'No digital outputs');

  const aoSections = [];
  if (cfg.boards1608) {
    cfg.boards1608.forEach((board, boardIdx) => {
      const aoRows = (board.analogOutputs||[]).map((a,i)=>[
        `AO${i}`, inputText(a,'name'),
        `minV`,        inputNum(a,'minV',0.001),
        `maxV`,        inputNum(a,'maxV',0.001),
        `startupV`,    inputNum(a,'startupV',0.001),
        `enable gate`, inputChk(a,'enable_gate'),
        `gate type`,   selectEnum(['do','le','math','expr'], a.enable_kind||'do', v=>a.enable_kind=v),
        `gate index`,  inputNum(a,'enable_index',1),
        `include`,     inputChk(a,'include')
      ]);
      if (aoRows.length > 0) {
        aoSections.push(fieldset(`Analog Outputs (0-10V) - Board #${board.boardNum}`, tableFormRows(aoRows)));
      }
    });
  }
  const aos = aoSections.length > 0 ? el('div', {}, aoSections) : el('div', {}, 'No analog outputs');

  const tcSections = [];
  if (cfg.boardsetc) {
    cfg.boardsetc.forEach((board, boardIdx) => {
      const tcRows = (board.thermocouples||[]).map((t,i)=>[
        `TC${i}`, inputText(t,'name'),
        `include`, inputChk(t,'include'),
        `ch`,             inputNum(t,'ch',1),
        `type`,           selectEnum(['K','J','T','E','R','S','B','N','C'], t.type||'K', v=>t.type=v),
        `offset`,         inputNum(t,'offset',0.001),
        `cutoffHz`,       inputNum(t,'cutoffHz',0.1)
      ]);
      if (tcRows.length > 0) {
        tcSections.push(fieldset(`Thermocouples - Board #${board.boardNum}`, tableFormRows(tcRows)));
      }
    });
  }
  const tcs = tcSections.length > 0 ? el('div', {}, tcSections) : el('div', {}, 'No thermocouples');

  const save=el('button',{className:'btn',onclick:async()=>{
    try{ await fetch('/api/config',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(cfg)}); alert('Saved'); }
    catch(e){ alert('Save failed: '+e.message); }
  }},'Save');
  
  const saveAs = createSaveAsButton(() => cfg, 'config.json');

  root.append(
    el('div', {style: 'display:flex;gap:8px;margin-bottom:12px'}, [loadBtn]),
    boards,logging,analogs,dig,aos,tcs,
    el('div',{style:'display:flex;gap:8px;margin-top:8px'}, [save, saveAs])
  );
  
  // If config was loaded from file (has banner), auto-apply on close
  const onClose = async () => {
    if (banner && providedConfig) {      try {
        await fetch('/api/config', {
          method: 'PUT',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(providedConfig)
        });      } catch(e) {
        console.error('[CONFIG-DEBUG] Failed to apply loaded config:', e);
      }
    }
    renderPage();
  };
  
  showModal(root, onClose);
}

async function openPidForm(){
  const pid=await (await fetch('/api/pid')).json();
  const loops = pid.loops || [];
  
  // Ensure all loops have enable_gate defaults
  loops.forEach(L => {
    if (L.enable_gate === undefined) L.enable_gate = false;
    if (L.enable_kind === undefined) L.enable_kind = 'do';
    if (L.enable_index === undefined) L.enable_index = 0;
  });

  const root = el('div', {});
  const title = el('h2', {}, 'PID Loops');

  // Add Load from File button
  const loadBtn = createLoadButton((loaded, filename) => {
    Object.assign(pid, loaded);
    closeModal();
    openPidForm(); // Re-open with loaded data
  });

  // Add Loop button
  const addBtn = el('button', {
    className: 'btn',
    onclick: () => {
      loops.push({
        enabled: false,
        kind: 'analog',
        src: 'ai',
        ai_ch: 0,
        out_ch: 0,
        target: 0.0,
        sp_source: 'fixed',
        sp_channel: 0,
        kp: 1.0,
        ki: 0.0,
        kd: 0.0,
        d_filter_hz: null,  // derivative low-pass cutoff Hz; null/0 = off
        out_min: -10.0,
        out_max: 10.0,
        out_min_source: 'fixed',
        out_min_channel: 0,
        out_max_source: 'fixed',
        out_max_channel: 0,
        // Removed err_min/err_max - only I and output limits needed
        i_min: null,
        i_max: null,
        name: `Loop${loops.length}`,
        enable_gate: false,
        enable_kind: 'do',
        enable_index: 0,
        execution_rate_hz: null  // null = sample rate
      });
      // Rebuild the form
      buildForm();
    }
  }, '+ Add Loop');

  const formContainer = el('div', {});

  const buildForm = async () => {
    formContainer.innerHTML = '';
    
    const table = el('table', {className:'form', style:'table-layout:auto'});
    const thead = el('thead');
    thead.append(el('tr', {}, [
      el('th', {}, '#'),
      el('th', {}, 'Enabled'),
      el('th', {}, 'Name'),
      el('th', {}, 'Kind'),
      el('th', {}, 'Src'),
      el('th', {}, 'AI Ch'),
      el('th', {}, 'Out Ch'),
      el('th', {}, 'Set Point'),  // Changed from Target
      el('th', {}, 'SP Src'),     // New: SP source selector
      el('th', {}, 'SP Ch'),      // New: SP channel
      el('th', {}, 'Kp'),
      el('th', {}, 'Ki'),
      el('th', {}, 'Kd'),
      el('th', {}, 'D Filt Hz'),
      el('th', {}, 'Out Min'),
      el('th', {}, 'Out Max'),
      // Removed Err Min/Err Max - only I and output limits needed
      el('th', {}, 'I Min'),
      el('th', {}, 'I Max'),
      el('th', {}, 'Exec Hz'),
      el('th', {}, 'En Gate'),
      el('th', {}, 'Gate Type'),
      el('th', {}, 'Gate #'),
      el('th', {}, 'Actions')
    ]));
    
    const tbody = el('tbody');
    
    // Build rows asynchronously to use signal selectors
    for (let idx = 0; idx < loops.length; idx++) {
      const L = loops[idx];
      
      const removeBtn = el('button', {
        className: 'btn danger',
        onclick: () => {
          if (confirm(`Remove Loop ${idx} (${L.name})?`)) {
            loops.splice(idx, 1);
            buildForm();
          }
        }
      }, '×');
      
      // Create signal selectors
      const aiChSel = await createSignalSelector(L.src || 'ai', L.ai_ch || 0, v => L.ai_ch = v);
      const outChSel = await createSignalSelector(L.kind === 'analog' ? 'ao' : 'do', L.out_ch || 0, v => L.out_ch = v);
      const spChSel = (L.sp_source === 'ao' || L.sp_source === 'math' || L.sp_source === 'pid' || L.sp_source === 'expr' || L.sp_source === 'static')
        ? await createSignalSelector(L.sp_source, L.sp_channel || 0, v => L.sp_channel = v)
        : num(L, 'sp_channel', 1);
      
      // Out Min cell: show source selector + value/channel
      const outMinCell = el('td', {style: 'min-width:150px'});
      const outMinSrcSel = selectEnum(['fixed','math','expr'], L.out_min_source||'fixed', v => {L.out_min_source=v; buildForm();});
      const outMinContent = (L.out_min_source === 'math' || L.out_min_source === 'expr')
        ? await createSignalSelector(L.out_min_source, L.out_min_channel || 0, v => L.out_min_channel = v)
        : num(L, 'out_min', 0.0001);
      outMinCell.append(outMinSrcSel, el('br'), outMinContent);
      
      // Out Max cell: show source selector + value/channel
      const outMaxCell = el('td', {style: 'min-width:150px'});
      const outMaxSrcSel = selectEnum(['fixed','math','expr'], L.out_max_source||'fixed', v => {L.out_max_source=v; buildForm();});
      const outMaxContent = (L.out_max_source === 'math' || L.out_max_source === 'expr')
        ? await createSignalSelector(L.out_max_source, L.out_max_channel || 0, v => L.out_max_channel = v)
        : num(L, 'out_max', 0.0001);
      outMaxCell.append(outMaxSrcSel, el('br'), outMaxContent);
      
      const gateChSel = await createSignalSelector(L.enable_kind || 'do', L.enable_index || 0, v => L.enable_index = v);
      
      const tr = el('tr', {}, [
        el('td', {}, `${idx}`),
        el('td', {}, chk(L, 'enabled')),
        el('td', {}, txt(L, 'name')),
        el('td', {}, selectEnum(['analog','digital','var'], L.kind||'analog', v=>{L.kind=v; buildForm();})),  // Rebuild when kind changes
        el('td', {}, selectEnum(['ai','ao','tc','pid','math','expr','static'], L.src||'ai', v=>{L.src=v; buildForm();})),  // Rebuild on src change
        el('td', {}, aiChSel),
        el('td', {}, outChSel),  // Use selector instead of num
        el('td', {}, num(L, 'target', 0.0001)),  // Fixed SP value
        el('td', {}, selectEnum(['fixed','ao','pid','math','expr','static'], L.sp_source||'fixed', v=>{L.sp_source=v; buildForm();})),  // Rebuild on sp_source change
        el('td', {}, spChSel),
        el('td', {}, num(L, 'kp', 0.0001)),
        el('td', {}, num(L, 'ki', 0.0001)),
        el('td', {}, num(L, 'kd', 0.0001)),
        el('td', {}, num(L, 'd_filter_hz', 0.1)),
        outMinCell,  // Combined source + value/channel
        outMaxCell,  // Combined source + value/channel
        // Removed err_min/err_max - only I and output limits needed
        el('td', {}, num(L, 'i_min', 0.0001)),
        el('td', {}, num(L, 'i_max', 0.0001)),
        el('td', {}, num(L, 'execution_rate_hz', 1)),
        el('td', {}, chk(L, 'enable_gate')),
        el('td', {}, selectEnum(['do','le','math','expr'], L.enable_kind||'do', v=>{L.enable_kind=v; buildForm();})),  // Rebuild on gate kind change
        el('td', {}, gateChSel),
        el('td', {}, removeBtn)
      ]);
      tbody.append(tr);
    }
    
    table.append(thead, tbody);
    formContainer.append(table);
  };

  buildForm();

  const save=el('button',{className:'btn',onclick:async()=>{
    try{
      console.log('[PID Save] Saving loops:', JSON.stringify(loops, null, 2));
      await fetch('/api/pid',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({loops: loops})}); 
      alert('Saved'); 
    }
    catch(e){ alert('Save failed: '+e.message); }
  }},'Save');

  const saveAs = createSaveAsButton(() => ({loops}), 'PID.json');
  
  root.append(
    title,
    el('div', {style: 'display:flex;gap:8px;margin-bottom:12px'}, [loadBtn, addBtn]),
    el('div', {style: 'overflow:auto;max-height:60vh'}, formContainer),
    el('div',{style:'display:flex;gap:8px;margin-top:8px'}, [save, saveAs])
  );
  showModal(root, ()=>{ renderPage(); });
}

async function openMotorEditor(){
  const motor_data = await (await fetch('/api/motors')).json();
  const motors = motor_data.motors || [];
  
  // Fetch available COM ports
  let ports = [];
  try {
    const portsResp = await fetch('/api/motors/ports');
    const portsData = await portsResp.json();
    ports = portsData.ports || [];
  } catch(e) {
    console.warn('Failed to fetch COM ports:', e);
  }

  const root = el('div', {});
  const title = el('h2', {}, 'Motor Controllers');
  
  // Load from file button
  const loadBtn = createLoadButton((loaded, filename) => {
    Object.assign(motor_data, loaded);
    closeModal();
    openMotorEditor(); // Re-open with loaded data
  });

  // Add Motor button
  const addBtn = el('button', {
    className: 'btn',
    onclick: () => {
      motors.push({
        name: `Motor${motors.length}`,
        port: 'COM1',
        baudrate: 9600,
        address: 1,
        min_rpm: 0,
        max_rpm: 2500,
        input_source: 'ai',
        input_channel: 0,
        input_min: 0,
        input_max: 10,
        scale_factor: 250,
        offset: 0,
        cw_positive: true,
        enabled: false,
        include: false
      });
      buildForm();
    }
  }, '+ Add Motor');

  const formContainer = el('div', {});

  const buildForm = () => {
    formContainer.innerHTML = '';
    
    // Build form for each motor
    const table = el('table', {className:'form'});
    const thead = el('thead');
    thead.append(el('tr', {}, [
      el('th', {}, 'Motor #'),
      el('th', {}, 'Include'),
      el('th', {}, 'Enabled'),
      el('th', {}, 'Name'),
      el('th', {}, 'COM Port'),
      el('th', {}, 'Baudrate'),
      el('th', {}, 'Address'),
      el('th', {}, 'Min RPM'),
      el('th', {}, 'Max RPM'),
      el('th', {}, 'Input Src'),
      el('th', {}, 'Input Ch'),
      el('th', {}, 'Input Min'),
      el('th', {}, 'Input Max'),
      el('th', {}, 'Scale'),
      el('th', {}, 'Offset'),
      el('th', {}, 'CW+'),
      el('th', {}, 'Actions')
    ]));
    
    const tbody = el('tbody');

    motors.forEach((M, idx) => {
      const portSelect = el('select', {});
      if (ports.length > 0) {
        ports.forEach(p => {
          portSelect.append(el('option', {value: p.port}, `${p.port} - ${p.description}`));
        });
      } else {
        // Fallback COM ports if query failed
        for (let i = 1; i <= 20; i++) {
          portSelect.append(el('option', {value: `COM${i}`}, `COM${i}`));
        }
      }
      portSelect.value = M.port || 'COM1';
      portSelect.onchange = () => M.port = portSelect.value;

      const srcSelect = selectEnum(['ai', 'ao', 'tc', 'pid', 'math'], M.input_source || 'ai', v => M.input_source = v);

      const removeBtn = el('button', {
        className: 'btn danger',
        onclick: () => {
          if (confirm(`Remove Motor ${idx} (${M.name})?`)) {
            motors.splice(idx, 1);
            buildForm();
          }
        }
      }, '×');

      const tr = el('tr', {}, [
        el('td', {}, `${idx}`),
        el('td', {}, chk(M, 'include')),
        el('td', {}, chk(M, 'enabled')),
        el('td', {}, txt(M, 'name')),
        el('td', {}, portSelect),
        el('td', {}, num(M, 'baudrate', 1)),
        el('td', {}, num(M, 'address', 1)),
        el('td', {}, num(M, 'min_rpm', 1)),
        el('td', {}, num(M, 'max_rpm', 1)),
        el('td', {}, srcSelect),
        el('td', {}, num(M, 'input_channel', 1)),
        el('td', {}, num(M, 'input_min', 0.01)),
        el('td', {}, num(M, 'input_max', 0.01)),
        el('td', {}, num(M, 'scale_factor', 0.1)),
        el('td', {}, num(M, 'offset', 0.1)),
        el('td', {}, chk(M, 'cw_positive')),
        el('td', {}, removeBtn)
      ]);
      tbody.append(tr);
    });

    table.append(thead, tbody);
    formContainer.append(table);
  };

  buildForm();

  const save = el('button', {
    className: 'btn',
    onclick: async() => {
      try {
        await fetch('/api/motors', {
          method:'PUT',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({motors: motors})
        });
        alert('Saved');
      } catch(e) {
        alert('Save failed: ' + e.message);
      }
    }
  }, 'Save');

  const saveAs = createSaveAsButton(() => ({motors}), 'motor.json');
  
  // Live COM-port refresh: re-query the OS and rebuild the form so a
  // freshly-plugged adapter shows up without an F5.
  const refreshPortsBtn = el('button', { className: 'btn', onclick: async () => {
    refreshPortsBtn.textContent = 'Refreshing…';
    ports = await fetchSerialPorts();
    buildForm();
    refreshPortsBtn.textContent = '🔄 Refresh Ports';
  }}, '🔄 Refresh Ports');

  root.append(
    title,
    el('div', {style: 'display:flex;gap:8px;margin-bottom:12px'}, [loadBtn, addBtn, refreshPortsBtn]),
    el('div', {style: 'margin:12px 0'}, [
      el('p', {}, 'Configure Rattmotor YPMC-750W servo controllers:'),
      el('p', {style: 'font-size:12px;color:var(--muted)'}, 
        'RPM Command = Input * Scale + Offset. Negative RPM reverses motor.')
    ]),
    el('div', {style: 'overflow:auto;max-height:60vh'}, formContainer),
    el('div', {style:'display:flex;gap:8px;margin-top:8px'}, [save, saveAs])
  );
  showModal(root, ()=>{ renderPage(); });
}

/* -------------------------- VFD config editor ---------------------------
 * Three JSON libraries drive this:
 *   /api/vfd/drives    -- drive MODELS (protocol + serial defaults)
 *   /api/vfd/motors    -- motor nameplates (RPM<->Hz)
 *   /api/vfd/instances -- live units, each binding a drive + motor + COM port
 * The editor has three tabs. Instances use pulldowns populated from the
 * drive and motor libraries, so adding a motor or drive in its tab makes it
 * selectable for every instance. Saving instances rebuilds the controllers
 * on the server and reports which connected. */
async function openVfdEditor(){
  const [drivesData, motorsData, instData, stepCfgData, stepInstData, stepDrvData] = await Promise.all([
    fetch('/api/vfd/drives').then(r=>r.json()).catch(()=>({drives:[]})),
    fetch('/api/vfd/motors').then(r=>r.json()).catch(()=>({motors:[]})),
    fetch('/api/vfd/instances').then(r=>r.json()).catch(()=>({instances:[]})),
    fetch('/api/stepper/configs').then(r=>r.json()).catch(()=>({configs:[]})),
    fetch('/api/stepper/instances').then(r=>r.json()).catch(()=>({instances:[]})),
    fetch('/api/stepper/drives').then(r=>r.json()).catch(()=>({drives:[]})),
  ]);
  let ports = [];
  try { ports = (await (await fetch('/api/motors/ports')).json()).ports || []; }
  catch(e){ console.warn('MOD Drv: port list failed', e); }

  const drives    = drivesData.drives    || [];
  const motors    = motorsData.motors    || [];
  const instances = instData.instances   || [];
  const stepConfigs   = stepCfgData.configs    || [];
  const stepInstances = stepInstData.instances || [];
  const stepDrives    = stepDrvData.drives     || [];

  const root = el('div', {});
  root.append(el('h2', {}, 'MOD Drives — VFD + Stepper'));

  // ---- simple tab strip ----
  const tabBar = el('div', {style:'display:flex;gap:6px;margin-bottom:10px'});
  const panes  = el('div', {});
  const tabs = [
    ['VFD Units',     () => instancesPane()],
    ['VFD Drives',    () => drivesPane()],
    ['Motors',        () => motorsPane()],
    ['Stepper Units', () => stepperUnitsPane()],
    ['Steppers',      () => steppersPane()],
  ];
  let activeTab = 0;
  function renderTabs(){
    tabBar.innerHTML = '';
    tabs.forEach(([label], i) => {
      tabBar.append(el('button', {
        className: 'btn' + (i===activeTab ? ' active' : ''),
        onclick: () => { activeTab = i; draw(); }
      }, label));
    });
  }
  function draw(){
    renderTabs();
    panes.innerHTML = '';
    panes.append(tabs[activeTab][1]());
    updateSaveLabel();  // hoisted; reflects VFD vs Stepper domain on the Save button
  }

  const portOptions = (sel) => {
    const s = el('select', {});
    const list = ports.length ? ports.map(p=>p.port) :
      Array.from({length:20}, (_,i)=>`COM${i+1}`);
    list.forEach(p => s.append(el('option', {value:p}, p)));
    if (ports.length) {
      s.innerHTML = '';
      ports.forEach(p => s.append(el('option', {value:p.port}, `${p.port} - ${p.description}`)));
    }
    s.value = sel || (list[0] || 'COM1');
    return s;
  };

  // ---------- Instances tab ----------
  function instancesPane(){
    const wrap = el('div', {});
    wrap.append(el('p', {style:'font-size:12px;color:var(--muted)'},
      'Each instance binds a drive + a motor + a COM port. Include = build it at startup. Saving rebuilds and reconnects.'));
    if (!drives.length)
      wrap.append(el('p', {style:'color:#e6a23c'}, '⚠ No drives defined yet — add one in the Drives tab first.'));

    const table = el('table', {className:'form'});
    table.append(el('thead', {}, el('tr', {}, [
      'Name','Include','Drive','Motor','Port','Baud','Parity','Stop','Addr','Timeout','Poll ms','Watchdog s','Auto-setup',''
    ].map(h=>el('th',{},h)))));
    const tb = el('tbody');

    function rowFor(inst){
      const driveSel = selectEnum(drives.map(d=>d.key), inst.drive_key || (drives[0]&&drives[0].key) || '', v=>{
        inst.drive_key = v;
        const d = drives.find(x=>x.key===v);
        if (d) { // adopt the drive's serial defaults
          inst.baud=d.default_baud; inst.parity=d.default_parity;
          inst.stopbits=d.default_stopbits; inst.address=d.default_address;
          draw();
        }
      });
      // show labels in the dropdown
      Array.from(driveSel.options).forEach(o=>{
        const d = drives.find(x=>x.key===o.value); if (d) o.textContent = d.label || d.key;
      });
      const motorSel = selectEnum(motors.map(m=>m.key), inst.motor_key || (motors[0]&&motors[0].key) || '', v=>inst.motor_key=v);
      Array.from(motorSel.options).forEach(o=>{
        const m = motors.find(x=>x.key===o.value); if (m) o.textContent = m.label || m.key;
      });
      const psc = portSelectControl(inst.port, v=>inst.port=v);
      const parSel = selectEnum(['N','E','O'], inst.parity||'N', v=>inst.parity=v);
      const stopSel = selectEnum(['1','2'], String(inst.stopbits||1), v=>inst.stopbits=parseInt(v));
      const baudSel = selectEnum(['9600','19200','38400','57600','115200'],
                                 String(inst.baud||9600), v=>inst.baud=parseInt(v));
      const baudApply = el('button', {className:'btn',
        title:'Write this comm speed to the drive (it must be IDLE), then reopen the port to match. Save a new instance first.',
        onclick: async()=>{
          if(!confirm(`Change ${inst.name} comm speed to ${inst.baud} baud?\n\nThe drive must be IDLE/stopped. This writes the drive's baud parameter at its current speed, then reopens the port at ${inst.baud}.`)) return;
          try{
            const r = await (await fetch(`/api/vfd/${encodeURIComponent(inst.name)}/baud`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({baud:inst.baud})})).json();
            if(r.ok) alert(`Baud ${r.detail||('-> '+inst.baud)}${r.verified?' (verified)':''}.`);
            else alert('Baud change failed: '+(r.error||'unknown'));
          }catch(e){ alert('Baud change failed: '+e.message); }
        }}, '→drive');
      const baudCell = el('div',{style:'display:flex;gap:4px;align-items:center'},[baudSel, baudApply]);
      const del = el('button', {className:'btn', onclick:()=>{
        const i = instances.indexOf(inst); if(i>=0){ instances.splice(i,1); draw(); }
      }}, '✕');
      // Poll period in MS. Shown as the effective default (250) when unset so an
      // existing instance never *looks* like 0 (= continuous); only writes
      // inst.poll_rate_ms when actually edited. 0 = continuous (as fast as bus).
      const pollInp = el('input', {type:'number', min:0, step:10,
        value:(inst.poll_rate_ms != null ? inst.poll_rate_ms : 250),
        title:'VFD read poll period in milliseconds (default 250 = 4 reads/sec). '
            + 'Lower = faster RPM/status updates but more RS-485 load. 0 = continuous.',
        style:'width:62px'});
      pollInp.oninput = ()=>{
        const v = parseInt(pollInp.value, 10);
        inst.poll_rate_ms = Number.isFinite(v) ? Math.max(0, v) : 250;
      };
      return el('tr', {}, [
        el('td',{},txt(inst,'name')),
        el('td',{},chk(inst,'include')),
        el('td',{},driveSel),
        el('td',{},motorSel),
        el('td',{},psc.wrap),
        el('td',{},baudCell),
        el('td',{},parSel),
        el('td',{},stopSel),
        el('td',{},num(inst,'address',1)),
        el('td',{},num(inst,'timeout',0.1)),
        el('td',{},pollInp),
        el('td',{},num(inst,'watchdog_s',0.1)),
        el('td',{},chk(inst,'auto_setup')),
        el('td',{},del),
      ]);
    }
    instances.forEach(inst => tb.append(rowFor(inst)));
    table.append(tb);
    wrap.append(el('div',{style:'overflow:auto;max-height:50vh'}, table));

    const addBtn = el('button', {className:'btn', onclick:()=>{
      const d0 = drives[0] || {};
      instances.push({ name:`VFD ${instances.length+1}`, include:false,
        drive_key:d0.key||'', motor_key:(motors[0]&&motors[0].key)||'',
        port:(ports[0]&&ports[0].port)||'COM1',
        baud:d0.default_baud||9600, parity:d0.default_parity||'N',
        stopbits:d0.default_stopbits||2, address:d0.default_address||1,
        timeout:0.5, watchdog_s:0, auto_setup:false, poll_rate_ms:250 });
      draw();
    }}, '+ Add instance');
    wrap.append(el('div',{style:'margin-top:8px'}, addBtn));
    return wrap;
  }

  // ---------- Drives tab ----------
  function drivesPane(){
    const wrap = el('div', {});
    wrap.append(el('p', {style:'font-size:12px;color:var(--muted)'},
      "Drive MODELS. 'profile' selects the built-in protocol map (gk3000 | h100). Serial fields are the model's defaults."));
    const table = el('table', {className:'form'});
    table.append(el('thead', {}, el('tr', {}, ['Key','Label','Profile','Baud','Parity','Stop','Addr','Notes',''].map(h=>el('th',{},h)))));
    const tb = el('tbody');
    drives.forEach(d=>{
      const prof = selectEnum(['gk3000','h100'], d.profile||'gk3000', v=>d.profile=v);
      const par  = selectEnum(['N','E','O'], d.default_parity||'N', v=>d.default_parity=v);
      const stop = selectEnum(['1','2'], String(d.default_stopbits||2), v=>d.default_stopbits=parseInt(v));
      const del  = el('button',{className:'btn',onclick:()=>{const i=drives.indexOf(d);if(i>=0){drives.splice(i,1);draw();}}},'✕');
      tb.append(el('tr',{},[
        el('td',{},txt(d,'key')), el('td',{},txt(d,'label')), el('td',{},prof),
        el('td',{},num(d,'default_baud',1)), el('td',{},par), el('td',{},stop),
        el('td',{},num(d,'default_address',1)), el('td',{},txt(d,'notes')), el('td',{},del),
      ]));
    });
    table.append(tb);
    wrap.append(el('div',{style:'overflow:auto;max-height:50vh'}, table));
    wrap.append(el('div',{style:'margin-top:8px'}, el('button',{className:'btn',onclick:()=>{
      drives.push({key:`drive${drives.length+1}`,label:'New drive',profile:'gk3000',
        default_baud:9600,default_parity:'N',default_stopbits:2,default_address:1,notes:'',setup_params:[]});
      draw();
    }},'+ Add drive')));
    return wrap;
  }

  // ---------- Motors tab ----------
  function motorsPane(){
    const wrap = el('div', {});
    wrap.append(el('p', {style:'font-size:12px;color:var(--muted)'},
      'Motor nameplates. RPM↔Hz uses rated RPM/Hz when both set (includes slip), else pole count.'));
    const table = el('table', {className:'form'});
    table.append(el('thead', {}, el('tr', {}, ['Key','Label','Poles','Rated Hz','Rated RPM','Rated A','Max Hz','Min Hz','Accel s','Decel s',''].map(h=>el('th',{},h)))));
    const tb = el('tbody');
    motors.forEach(m=>{
      const del = el('button',{className:'btn',onclick:()=>{const i=motors.indexOf(m);if(i>=0){motors.splice(i,1);draw();}}},'✕');
      tb.append(el('tr',{},[
        el('td',{},txt(m,'key')), el('td',{},txt(m,'label')),
        el('td',{},num(m,'poles',1)), el('td',{},num(m,'rated_hz',0.1)),
        el('td',{},num(m,'rated_rpm',1)), el('td',{},num(m,'rated_current_a',0.1)),
        el('td',{},num(m,'max_hz',0.1)), el('td',{},num(m,'min_hz',0.1)),
        el('td',{},num(m,'accel_s',0.1)), el('td',{},num(m,'decel_s',0.1)), el('td',{},del),
      ]));
    });
    table.append(tb);
    wrap.append(el('div',{style:'overflow:auto;max-height:50vh'}, table));
    wrap.append(el('div',{style:'margin-top:8px'}, el('button',{className:'btn',onclick:()=>{
      motors.push({key:`motor${motors.length+1}`,label:'New motor',poles:4,rated_hz:50,
        rated_rpm:1440,rated_current_a:0,max_hz:50,min_hz:0,accel_s:10,decel_s:10});
      draw();
    }},'+ Add motor')));
    return wrap;
  }

  // ---------- Steppers tab (stepper library) ----------
  function steppersPane(){
    const wrap = el('div', {});
    wrap.append(el('p', {style:'font-size:12px;color:var(--muted)'},
      'Stepper library — motor + driver specifics. Pulses/rev is the driver microstep (Pr0.00). '
      + 'mL/rev calibrates dose volume → steps for Profile-Position moves.'));
    const table = el('table', {className:'form'});
    table.append(el('thead', {}, el('tr', {}, ['Key','Label','Pulses/rev','°/step','Peak A','Max RPM','Accel','Decel','Reverse','Hold %','Hold Pr',''].map(h=>el('th',{},h)))));
    const tb = el('tbody');
    stepConfigs.forEach(c=>{
      // Standstill (holding) current % when idle -- blank = leave drive default.
      const holdInp = el('input',{type:'number',min:0,max:100,step:5,
        value:(c.standstill_current_pct!=null?c.standstill_current_pct:''),placeholder:'def',style:'width:52px',
        title:'Standstill (holding) current as % of peak when idle. Blank = leave the drive default. Lower runs cooler/quieter but holds with less torque. Applied on Save (auto-setup).'});
      holdInp.oninput=()=>{const s=holdInp.value.trim(); c.standstill_current_pct = (s===''?null:Math.max(0,Math.min(100,parseFloat(s)||0)));};
      const holdRegInp = el('input',{type:'text',value:(c.standstill_current_reg||'Pr5.03'),style:'width:62px',
        title:'Drive parameter that Hold% writes to. DM556RS = Pr5.03 (0x0197, "Percentage of shaft locked current", 0-100). Can also be #0xADDR.'});
      holdRegInp.oninput=()=>{c.standstill_current_reg = holdRegInp.value.trim()||'Pr5.03';};
      const del = el('button',{className:'btn',onclick:()=>{const i=stepConfigs.indexOf(c);if(i>=0){stepConfigs.splice(i,1);draw();}}},'✕');
      tb.append(el('tr',{},[
        el('td',{},txt(c,'key')), el('td',{},txt(c,'name')),
        el('td',{},num(c,'steps_per_rev',1)), el('td',{},num(c,'full_step_deg',0.01)),
        el('td',{},num(c,'peak_current_a',0.1)), el('td',{},num(c,'max_rpm',1)),
        el('td',{},num(c,'accel',1)), el('td',{},num(c,'decel',1)),
        el('td',{},chk(c,'reverse')),
        el('td',{},holdInp), el('td',{},holdRegInp), el('td',{},del),
      ]));
    });
    table.append(tb);
    wrap.append(el('div',{style:'overflow:auto;max-height:50vh'}, table));
    wrap.append(el('div',{style:'margin-top:8px'}, el('button',{className:'btn',onclick:()=>{
      stepConfigs.push({key:`stepper${stepConfigs.length+1}`,name:'New stepper',steps_per_rev:10000,
        full_step_deg:1.8,peak_current_a:2.0,max_rpm:600,accel:200,decel:200,reverse:false,
        standstill_current_pct:null,standstill_current_reg:'Pr5.03'});
      draw();
    }},'+ Add stepper')));
    return wrap;
  }

  // ---------- Stepper Units tab (instances) ----------
  function stepperUnitsPane(){
    const wrap = el('div', {});
    wrap.append(el('p', {style:'font-size:12px;color:var(--muted)'},
      'Each unit binds a stepper drive model + a stepper-library entry + a COM port. '
      + 'Include = build at startup. Saving rebuilds and reconnects.'));
    if (!stepDrives.length)
      wrap.append(el('p', {style:'color:#e6a23c'}, '⚠ No stepper drive models available.'));
    const table = el('table', {className:'form'});
    table.append(el('thead', {}, el('tr', {}, ['Name','Include','Drive','Stepper','Port','Baud','Parity','Stop','Addr','Timeout','Poll ms','Auto-setup','Retries','Gap ms','Reply ms','Log IO',''].map(h=>el('th',{},h)))));
    const tb = el('tbody');
    stepInstances.forEach(inst=>{
      const driveSel = selectEnum(stepDrives.map(d=>d.key), inst.drive_key || (stepDrives[0]&&stepDrives[0].key) || '', v=>inst.drive_key=v);
      Array.from(driveSel.options).forEach(o=>{ const d=stepDrives.find(x=>x.key===o.value); if(d) o.textContent=d.label||d.key; });
      const cfgSel = selectEnum(stepConfigs.map(c=>c.key), inst.config_key || (stepConfigs[0]&&stepConfigs[0].key) || '', v=>inst.config_key=v);
      Array.from(cfgSel.options).forEach(o=>{ const c=stepConfigs.find(x=>x.key===o.value); if(c) o.textContent=c.name||c.key; });
      const psc = portSelectControl(inst.port, v=>inst.port=v);
      const parSel = selectEnum(['N','E','O'], inst.parity||'N', v=>inst.parity=v);
      const stopSel = selectEnum(['1','2'], String(inst.stopbits||1), v=>inst.stopbits=parseInt(v));
      const baudSel = selectEnum(['9600','19200','38400','57600','115200'], String(inst.baud||38400), v=>inst.baud=parseInt(v));
      const pollInp = el('input',{type:'number',min:0,step:10,value:(inst.poll_rate_ms!=null?inst.poll_rate_ms:100),style:'width:62px',
        title:'Stepper read poll period (ms). 0 = continuous.'});
      pollInp.oninput=()=>{const v=parseInt(pollInp.value,10); inst.poll_rate_ms=Number.isFinite(v)?Math.max(0,v):100;};
      // --- Modbus RTU reliability (per instance; blank uses driver defaults) ---
      const retriesInp = el('input',{type:'number',min:0,step:1,value:(inst.io_retries!=null?inst.io_retries:2),style:'width:50px',
        title:'Resends on a lost/garbled reply (timeout/CRC). 0 = off. Default 2. A Modbus error reply is never resent.'});
      retriesInp.oninput=()=>{const v=parseInt(retriesInp.value,10); inst.io_retries=Number.isFinite(v)?Math.max(0,v):2;};
      const gapInp = el('input',{type:'number',min:0,step:0.5,value:(inst.io_gap_ms!=null?inst.io_gap_ms:3),style:'width:54px',
        title:'Minimum silence between frames (ms) — RTU 3.5-char (~3 ms @ 9600). Stops bus overrun. 0 = none.'});
      gapInp.oninput=()=>{const v=parseFloat(gapInp.value); inst.io_gap_ms=Number.isFinite(v)?Math.max(0,v):3;};
      const replyInp = el('input',{type:'number',min:5,step:5,value:(inst.io_reply_ms!=null?inst.io_reply_ms:120),style:'width:58px',
        title:'How long to wait for a reply before resending (ms). A reply is ~ms, so a miss is caught fast. Default 120.'});
      replyInp.oninput=()=>{const v=parseFloat(replyInp.value); inst.io_reply_ms=Number.isFinite(v)?Math.max(5,v):120;};
      const del = el('button',{className:'btn',onclick:()=>{const i=stepInstances.indexOf(inst);if(i>=0){stepInstances.splice(i,1);draw();}}},'✕');
      tb.append(el('tr',{},[
        el('td',{},txt(inst,'name')), el('td',{},chk(inst,'include')),
        el('td',{},driveSel), el('td',{},cfgSel), el('td',{},psc.wrap),
        el('td',{},baudSel), el('td',{},parSel), el('td',{},stopSel),
        el('td',{},num(inst,'address',1)), el('td',{},num(inst,'timeout',0.1)),
        el('td',{},pollInp), el('td',{},chk(inst,'auto_setup')),
        el('td',{},retriesInp), el('td',{},gapInp), el('td',{},replyInp),
        el('td',{title:'Log every Modbus TX/RX frame for this drive to the console (debug)'},chk(inst,'io_log')),
        el('td',{},del),
      ]));
    });
    table.append(tb);
    wrap.append(el('div',{style:'overflow:auto;max-height:50vh'}, table));
    wrap.append(el('div',{style:'margin-top:8px'}, el('button',{className:'btn',onclick:()=>{
      const d0 = stepDrives[0] || {key:'dm556rs'};
      stepInstances.push({name:`Stepper${stepInstances.length+1}`,include:false,drive_key:d0.key,
        config_key:(stepConfigs[0]&&stepConfigs[0].key)||'',port:(ports[0]&&ports[0].port)||'COM1',
        baud:38400,parity:'N',stopbits:1,address:1,timeout:0.5,auto_setup:true,poll_rate_ms:100,
        io_retries:2,io_gap_ms:3,io_reply_ms:120,io_log:false});
      draw();
    }},'+ Add stepper unit')));
    return wrap;
  }

  // ---- save: SCOPED to the active domain. The VFD tabs (VFD Units / VFD
  // Drives / Motors) write only the VFD libraries + instances; the stepper
  // tabs (Stepper Units / Steppers) write only the stepper config + instances.
  // This keeps the two drive types independent: saving steppers no longer
  // rebuilds (and re-commands) the running VFD, and vice-versa. Each instance
  // PUT rebuilds ONLY its own controllers. ----
  const fmtResult = x => `${x.name}: ${x.ok?'connected':'FAILED'+(x.error?' ('+x.error+')':'')}`;
  const isStepperTab = () => activeTab >= 3;  // tabs: 0 VFD Units,1 VFD Drives,2 Motors,3 Stepper Units,4 Steppers

  async function doSaveVfd(){
    await fetch('/api/vfd/drives',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({drives})});
    await fetch('/api/vfd/motors',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({motors})});
    const r = await (await fetch('/api/vfd/instances',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({instances})})).json();
    if (!r.ok){ alert('VFD save failed: ' + (r.error||'unknown')); return; }
    const lines = (r.results||[]).map(fmtResult);
    alert('Saved VFD.' + (lines.length ? '\n\n'+lines.join('\n') : ''));
  }
  async function doSaveStepper(){
    await fetch('/api/stepper/configs',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({configs:stepConfigs})});
    const sr = await (await fetch('/api/stepper/instances',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({instances:stepInstances})})).json();
    if (!sr.ok){ alert('Stepper save failed: ' + (sr.error||'unknown')); return; }
    const lines = (sr.results||[]).map(fmtResult);
    alert('Saved steppers.' + (lines.length ? '\n\n'+lines.join('\n') : ''));
  }

  const save = el('button', {className:'btn', onclick: async()=>{
    try{ if (isStepperTab()) await doSaveStepper(); else await doSaveVfd(); }
    catch(e){ alert('Save failed: '+e.message); }
  }}, 'Save');
  // Label reflects which domain the current tab will save.
  function updateSaveLabel(){ if (save) save.textContent = isStepperTab() ? 'Save Steppers' : 'Save VFD'; }

  draw();
  root.append(tabBar, panes, el('div',{style:'margin-top:10px'}, save));
  showModal(root, ()=>{ renderPage(); });
}

// ==================== SERIAL SCALES EDITOR ====================
// FIX 2026-05-05: /api/scales/ports returns [{port, description, hwid}, ...]
// (same shape as /api/motors/ports), but the editor previously treated each
// entry as a string — causing "[object Object]" entries in the dropdown.
// Now: normalize to {port, description}; render "COM1 - <description>" but
// store only the port string. Also repair any stale [object Object] / non-string
// values left in scales.json by previous broken versions.

// Normalize one port entry from the API into { port, description } with strings.
function _scalesNormalizePort(p) {
  if (typeof p === 'string') return { port: p, description: '' };
  if (p && typeof p === 'object') {
    const port = (typeof p.port === 'string') ? p.port : '';
    const description = (typeof p.description === 'string') ? p.description : '';
    return { port, description };
  }
  return { port: '', description: '' };
}

// Normalize an array of port entries; drop anything without a real port string.
function _scalesNormalizePorts(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(_scalesNormalizePort).filter(p => p.port);
}

// Repair a scale's port field if it was corrupted by previous versions.
// Returns a clean string. Falls back to first available port, then 'COM1'.
function _scalesRepairPort(rawPort, availablePorts) {
  if (typeof rawPort === 'string' && rawPort && rawPort !== '[object Object]') {
    return rawPort;
  }
  // rawPort might be a dict (legacy save), null, or "[object Object]" string
  if (rawPort && typeof rawPort === 'object' && typeof rawPort.port === 'string') {
    return rawPort.port;
  }
  if (availablePorts.length > 0) return availablePorts[0].port;
  return 'COM1';
}

async function openScalesEditor(){
  let data = await (await fetch('/api/scales')).json();
  let scales = data.scales || [];
  window.scaleCache = data;

  // Fetch available COM ports — returns [{port, description, hwid}, ...]
  let availablePorts = [];
  try {
    const pr = await fetch('/api/scales/ports');
    const pd = await pr.json();
    availablePorts = _scalesNormalizePorts(pd.ports);
  } catch(e) {
    console.warn('[Scales] Failed to fetch ports:', e);
  }

  // Repair any pre-existing scales whose .port got saved as a dict or
  // "[object Object]" string by the previous broken editor version.
  // Also default any missing offset field to 0 (added in v2.1.2).
  scales.forEach(sc => {
    sc.port = _scalesRepairPort(sc.port, availablePorts);
    if (typeof sc.offset !== 'number' || !Number.isFinite(sc.offset)) sc.offset = 0;
  });

  const root = el('div', {});
  root.append(el('h2', {}, 'Serial Scales'));
  root.append(el('p', {style:'font-size:12px;color:var(--muted);margin-bottom:12px'},
    'Configure serial scales on COM ports (e.g. Moxa NPort in Real COM mode). Requires pyserial.'));

  const addBtn = el('button', { className:'btn', onclick: () => {
    const defaultPort = availablePorts.length > 0 ? availablePorts[0].port : 'COM1';
    scales.push({ name:`Scale${scales.length}`, port:defaultPort, baud:9600,
                  bytesize:8, parity:'N', stopbits:1, units:'g', offset:0, enabled:true });
    buildForm();
  }}, '+ Add Scale');

  const formContainer = el('div', {});

  const buildForm = () => {
    formContainer.innerHTML = '';
    if (scales.length === 0) {
      formContainer.append(el('p', {style:'color:var(--muted);margin:12px 0'}, 'No scales configured.'));
      return;
    }
    scales.forEach((sc, i) => {
      const card = el('div', {style:'border:1px solid #2a3046;border-radius:6px;padding:12px;margin:8px 0;background:#1a2030'});
      const hdr = el('div', {style:'display:flex;align-items:center;gap:8px;margin-bottom:8px'});
      hdr.append(
        el('strong', {}, `Scale ${i}`),
        el('button', {className:'btn', style:'margin-left:auto;padding:2px 8px;font-size:11px',
          onclick:()=>{ scales.splice(i,1); buildForm(); }}, '✕ Remove')
      );

      // COM port: populated dropdown + refresh button
      const portSel = el('select', {style:'min-width:180px'});
      const populatePorts = (ports) => {
        // ports is array of {port, description}
        portSel.innerHTML = '';

        // Build list of unique port strings, preserving sc.port if it's not in
        // the detected list (e.g. NPort offline at the moment of editing).
        const detectedStrings = ports.map(p => p.port);
        const merged = [];
        if (sc.port && !detectedStrings.includes(sc.port)) {
          merged.push({ port: sc.port, description: '(saved, not currently detected)' });
        }
        ports.forEach(p => merged.push(p));
        if (merged.length === 0) merged.push({ port:'COM1', description:'' });

        merged.forEach(p => {
          const label = p.description ? `${p.port} - ${p.description}` : p.port;
          portSel.append(el('option', {value: p.port}, label));
        });

        // Set selection — only assign sc.port from a real string value.
        if (sc.port && merged.some(p => p.port === sc.port)) {
          portSel.value = sc.port;
        } else {
          portSel.value = merged[0].port;
          sc.port = portSel.value;
        }
      };
      populatePorts(availablePorts);
      portSel.onchange = () => { sc.port = portSel.value; };

      const refreshBtn = el('button', {
        className:'btn', style:'padding:2px 7px;font-size:11px',
        title:'Refresh port list',
        onclick: async () => {
          try {
            const pr = await fetch('/api/scales/ports');
            const pd = await pr.json();
            availablePorts = _scalesNormalizePorts(pd.ports);
            populatePorts(availablePorts);
          } catch(e) {
            console.warn('[Scales] Refresh ports failed:', e);
          }
        }
      }, '🔄');

      const portRow = el('div', {style:'display:flex;align-items:center;gap:4px'}, [portSel, refreshBtn]);

      card.append(hdr, tableForm([
        ['Name',      inputText(sc, 'name')],
        ['COM Port',  portRow],
        ['Baud Rate', inputNum(sc, 'baud', 1)],
        ['Data Bits', inputNum(sc, 'bytesize', 1)],
        ['Parity',    selectEnum(['N','E','O','M','S'], sc.parity||'N', v=>{ sc.parity=v; })],
        ['Stop Bits', selectEnum(['1','1.5','2'], String(sc.stopbits||1), v=>{ sc.stopbits=parseFloat(v); })],
        ['Units',     inputText(sc, 'units')],
        ['Offset',    inputNum(sc, 'offset', 0.01)],
        ['Enabled',   inputChk(sc, 'enabled')]
      ]));
      formContainer.append(card);
    });
  };
  buildForm();

  const save = el('button', {className:'btn primary', onclick: async () => {
    // Final safety pass: ensure every scale has a string port before saving.
    scales.forEach(sc => { sc.port = _scalesRepairPort(sc.port, availablePorts); });
    data.scales = scales;
    const r = await fetch('/api/scales', {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)});
    const res = await r.json();
    if (res.ok) { window.scaleCache = data; closeModal(); renderPage(); }
    else alert('Save failed: ' + res.error);
  }}, '💾 Save');

  root.append(
    addBtn,
    el('div', {style:'overflow:auto;max-height:60vh;margin-top:8px'}, formContainer),
    el('div', {style:'display:flex;gap:8px;margin-top:8px'}, [save])
  );
  showModal(root, ()=>{ renderPage(); });
}

// ==================== LOGIC ELEMENTS EDITOR ====================
async function openLEEditor(){
  const le_data = await (await fetch('/api/logic_elements')).json();
  const elements = le_data.elements || [];
  
  const root = el('div', {});
  const title = el('h2', {}, 'Logic Elements Editor');
  
  const loadBtn = createLoadButton((loaded, filename) => {
    Object.assign(le_data, loaded);
    closeModal();
    openLEEditor(); // Re-open with loaded data
  });

  const addBtn = el('button', {
    className: 'btn',
    onclick: () => {
      elements.push({
        enabled: true,
        name: `LE${elements.length}`,
        input_a: {kind: 'do', index: 0},
        input_b: {kind: 'do', index: 1},
        operation: 'and'
      });
      renderLEEditor();
    }
  }, '+ Add Logic Element');

  const container = el('div', {style: 'overflow:auto;max-height:60vh'});

  function renderLEEditor() {
    container.innerHTML = '';
    
    elements.forEach((elem, idx) => {
      const card = el('fieldset', {style: 'margin-bottom:20px; padding:12px;'});
      const legend = el('legend', {}, `LE${idx}: ${elem.name}`);
      card.append(legend);

      const topRow = el('div', {className: 'row', style: 'margin-bottom:12px'});
      topRow.append(
        el('label', {}, [
          el('input', {type: 'checkbox', checked: elem.enabled, onchange: e => elem.enabled = e.target.checked}),
          ' Enabled'
        ]),
        el('label', {style: 'flex:2'}, [
          'Name: ',
          el('input', {type: 'text', value: elem.name, oninput: e => elem.name = e.target.value, style: 'width:100%'})
        ]),
        el('button', {
          className: 'btn danger',
          onclick: () => {
            if (confirm(`Delete LE${idx}?`)) {
              elements.splice(idx, 1);
              renderLEEditor();
            }
          }
        }, '🗑 Delete')
      );
      card.append(topRow);

      const inputASection = el('div', {style: 'border:1px solid #2a3046; padding:8px; margin-bottom:8px; border-radius:6px'});
      inputASection.append(el('h4', {style: 'margin:0 0 8px 0; color:#a8b3cf'}, 'Input A'));
      inputASection.append(createInputEditor(elem.input_a, 'a'));
      card.append(inputASection);

      const opRow = el('div', {style: 'margin:12px 0; text-align:center'});
      const opSelect = el('select', {
        onchange: e => elem.operation = e.target.value,
        style: 'font-size:16px; font-weight:bold; padding:6px 12px'
      });
      ['and', 'or', 'xor', 'nand', 'nor', 'nxor'].forEach(op => {
        opSelect.append(el('option', {value: op}, op.toUpperCase()));
      });
      opSelect.value = elem.operation || 'and';  // Set value AFTER options
      opRow.append(opSelect);
      card.append(opRow);

      const inputBSection = el('div', {style: 'border:1px solid #2a3046; padding:8px; border-radius:6px'});
      inputBSection.append(el('h4', {style: 'margin:0 0 8px 0; color:#a8b3cf'}, 'Input B'));
      inputBSection.append(createInputEditor(elem.input_b, 'b'));
      card.append(inputBSection);

      container.append(card);
    });
  }

  function createInputEditor(input, label) {
    const div = el('div', {});
    
    // Type and Index row - compact layout
    const kindRow = el('div', {className: 'row', style: 'margin-bottom:8px'});
    const kindSelect = el('select', {
      onchange: async e => {
        input.kind = e.target.value;
        // Rebuild signal selector
        const newSel = await createSignalSelector(e.target.value, input.index || 0, idx => input.index = idx);
        signalSelect.replaceWith(newSel);
        signalSelect = newSel;
        // Clear comparison fields when switching to non-analog types
        if (!['ai', 'ao', 'tc', 'pid_u', 'math', 'expr'].includes(e.target.value)) {
          delete input.comparison;
          delete input.compare_to_type;
          delete input.compare_value;
          delete input.compare_to_kind;
          delete input.compare_to_index;
        } else {
          // Set defaults for analog types
          if (!input.comparison) input.comparison = 'gt';
          if (!input.compare_to_type) input.compare_to_type = 'value';
          if (input.compare_value === undefined) input.compare_value = 0;
        }
        renderLEEditor();
      }
    });
    
    // Add options - compact version
    ['do', 'ai', 'ao', 'tc', 'pid_u', 'le', 'math', 'expr'].forEach(k => {
      const opt = el('option', {value: k}, k.toUpperCase());
      kindSelect.append(opt);
    });
    
    // Set the value AFTER adding options
    kindSelect.value = input.kind || 'do';
    
    // Create signal selector
    let signalSelect = el('select', {style: 'width:120px'});
    signalSelect.append(el('option', {}, 'Loading...'));
    (async () => {
      const newSel = await createSignalSelector(input.kind || 'do', input.index || 0, idx => input.index = idx);
      signalSelect.replaceWith(newSel);
      signalSelect = newSel;
    })();
    
    kindRow.append(
      el('label', {}, ['Type: ', kindSelect]),
      el('label', {}, ['Signal: ', signalSelect])
    );
    div.append(kindRow);

    // For analog types, show comparison options - compact layout
    if (['ai', 'ao', 'tc', 'pid_u', 'math', 'expr'].includes(input.kind)) {
      const compRow = el('div', {className: 'row', style: 'margin-bottom:8px'});
      
      const compSelect = el('select', {
        onchange: e => input.comparison = e.target.value
      });
      [{v:'lt', t:'<'}, {v:'eq', t:'='}, {v:'gt', t:'>'}].forEach(({v, t}) => {
        compSelect.append(el('option', {value: v}, t));
      });
      compSelect.value = input.comparison || 'gt';
      
      compRow.append(el('label', {}, ['Compare: ', compSelect]));
      div.append(compRow);

      const compareToRow = el('div', {className: 'row', style: 'margin-bottom:8px'});
      
      const typeSelect = el('select', {
        onchange: e => {
          input.compare_to_type = e.target.value;
          // Initialize defaults
          if (e.target.value === 'value') {
            if (input.compare_value === undefined) input.compare_value = 0;
          } else {
            if (!input.compare_to_kind) input.compare_to_kind = 'ai';
            if (input.compare_to_index === undefined) input.compare_to_index = 0;
          }
          renderLEEditor();
        }
      });
      typeSelect.append(el('option', {value: 'value'}, 'Fixed Value'));
      typeSelect.append(el('option', {value: 'signal'}, 'Another Signal'));
      // Set value AFTER adding options
      typeSelect.value = input.compare_to_type || 'value';
      
      compareToRow.append(el('label', {}, ['To: ', typeSelect]));
      div.append(compareToRow);

      // Show ONLY the relevant input based on compare_to_type
      if (!input.compare_to_type || input.compare_to_type === 'value') {
        const valueInput = el('input', {
          type: 'number',
          value: input.compare_value ?? 0,
          step: 0.1,
          oninput: e => input.compare_value = parseFloat(e.target.value) || 0,
          style: 'width:100%'
        });
        div.append(el('div', {style: 'margin-bottom:8px'}, [
          el('label', {}, ['Value: ', valueInput])
        ]));
      } else if (input.compare_to_type === 'signal') {
        const signalRow = el('div', {className: 'row', style: 'margin-bottom:8px'});
        
        const signalKindSelect = el('select', {
          onchange: async e => {
            input.compare_to_kind = e.target.value;
            // Rebuild selector
            const newSel = await createSignalSelector(e.target.value, input.compare_to_index || 0, idx => input.compare_to_index = idx);
            compareSignalSelect.replaceWith(newSel);
            compareSignalSelect = newSel;
          }
        });
        ['ai', 'ao', 'tc', 'pid_u', 'math', 'expr'].forEach(k => {
          signalKindSelect.append(el('option', {value: k}, k.toUpperCase()));
        });
        signalKindSelect.value = input.compare_to_kind || 'ai';
        
        // Create signal selector
        let compareSignalSelect = el('select', {style: 'width:120px'});
        compareSignalSelect.append(el('option', {}, 'Loading...'));
        (async () => {
          const newSel = await createSignalSelector(input.compare_to_kind || 'ai', input.compare_to_index || 0, idx => input.compare_to_index = idx);
          compareSignalSelect.replaceWith(newSel);
          compareSignalSelect = newSel;
        })();
        
        signalRow.append(
          el('label', {}, ['Type: ', signalKindSelect]),
          el('label', {}, ['Signal: ', compareSignalSelect])
        );
        div.append(signalRow);
      }
    }
    // Removed info text for DO/LE - you know what they are!

    return div;
  }

  const save = el('button', {
    className: 'btn',
    onclick: async() => {
      try {
        await fetch('/api/logic_elements', {
          method:'PUT',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({elements: elements})
        });
        alert('Logic Elements Saved');
      } catch(e) {
        alert('Save failed: ' + e.message);
      }
    }
  }, 'Save');

  root.append(
    title,
    el('div', {style: 'display:flex;gap:8px;margin-bottom:12px'}, [loadBtn, addBtn]),
    el('div', {style: 'margin:12px 0'}, [
      el('p', {}, 'Logic Elements combine two inputs with boolean logic operations.'),
      el('p', {style: 'font-size:12px;color:var(--muted)'}, 
        'Digital inputs (DO, LE) are boolean. Analog inputs (AI, AO, TC, PID) are compared to a value or another signal.')
    ]),
    container,
    el('div', {style:'display:flex;gap:8px;margin-top:12px'}, [save, createSaveAsButton(() => ({elements}), 'logic_elements.json')])
  );
  
  renderLEEditor();
  showModal(root, ()=>{ renderPage(); });
}

async function openMathEditor(){
  const math_data = await (await fetch('/api/math_operators')).json();
  const operators = math_data.operators || [];
  
  const root = el('div', {});
  const title = el('h2', {}, 'Math Operators Editor');
  
  const loadBtn = createLoadButton((loaded, filename) => {
    Object.assign(math_data, loaded);
    closeModal();
    openMathEditor(); // Re-open with loaded data
  });

  const addUnaryBtn = el('button', {
    className: 'btn',
    onclick: () => {
      operators.push({
        enabled: true,
        name: `Math${operators.length}`,
        operation: 'sqr',
        input_a: {kind: 'ai', index: 0}
      });
      renderMathEditor();
    }
  }, '+ Add Unary (sqr, sqrt, etc)');

  const addBinaryBtn = el('button', {
    className: 'btn',
    onclick: () => {
      operators.push({
        enabled: true,
        name: `Math${operators.length}`,
        operation: 'add',
        input_a: {kind: 'ai', index: 0},
        input_b: {kind: 'ai', index: 1}
      });
      renderMathEditor();
    }
  }, '+ Add Binary (+, -, ×, ÷)');

  const container = el('div', {style: 'overflow:auto;max-height:60vh'});

  function renderMathEditor() {
    container.innerHTML = '';
    
    operators.forEach((op, idx) => {
      const card = el('fieldset', {style: 'margin-bottom:20px; padding:12px;'});
      const legend = el('legend', {}, `Math${idx}: ${op.name}`);
      card.append(legend);

      const topRow = el('div', {className: 'row', style: 'margin-bottom:12px'});
      topRow.append(
        el('label', {}, [
          el('input', {type: 'checkbox', checked: op.enabled, onchange: e => op.enabled = e.target.checked}),
          ' Enabled'
        ]),
        el('label', {style: 'flex:2'}, [
          'Name: ',
          el('input', {type: 'text', value: op.name, oninput: e => op.name = e.target.value, style: 'width:100%'})
        ]),
        el('button', {
          className: 'btn danger',
          onclick: () => {
            if (confirm(`Delete Math${idx}?`)) {
              operators.splice(idx, 1);
              renderMathEditor();
            }
          }
        }, '🗑 Delete')
      );
      card.append(topRow);

      // Operation select
      const opRow = el('div', {style: 'margin:12px 0'});
      const opSelect = el('select', {
        onchange: e => {
          op.operation = e.target.value;
          const binary = ['add','sub','mul','div','mod','pow','min','max','atan2'];
          const conditional = ['if_gt','if_gte','if_lt','if_lte','if_eq','if_neq'];
          
          // Binary and conditional ops need input_b
          if (binary.includes(e.target.value) || conditional.includes(e.target.value)) {
            if (!op.input_b) op.input_b = {kind: 'ai', index: 1};
          } else {
            delete op.input_b;
          }
          
          // Conditional ops need output_true and output_false
          if (conditional.includes(e.target.value)) {
            if (!op.output_true) op.output_true = {kind: 'value', index: 0, value: 1.0};
            if (!op.output_false) op.output_false = {kind: 'value', index: 0, value: 0.0};
          } else {
            delete op.output_true;
            delete op.output_false;
          }
          
          renderMathEditor();
        },
        style: 'font-size:14px; padding:6px 12px'
      });
      
      const opGroups = {
        'Unary': ['sqr','sqrt','log10','ln','exp','sin','cos','tan','asin','acos','atan','abs','neg','filter'],
        'Binary': ['add','sub','mul','div','mod','pow','min','max','atan2'],
        'Conditional': ['if_gt','if_gte','if_lt','if_lte','if_eq','if_neq']
      };
      Object.entries(opGroups).forEach(([group, ops]) => {
        const optgroup = el('optgroup', {label: group});
        ops.forEach(o => optgroup.append(el('option', {value: o}, o)));
        opSelect.append(optgroup);
      });
      opSelect.value = op.operation || 'add';
      opRow.append(el('label', {}, ['Operation: ', opSelect]));
      card.append(opRow);

      // Filter cutoff frequency (only for filter operation)
      if (op.operation === 'filter') {
        const filterRow = el('div', {style: 'margin:12px 0'});
        const filterInput = el('input', {
          type: 'number',
          min: 0.01,
          step: 0.1,
          value: op.filter_hz || 1.0,
          oninput: e => op.filter_hz = parseFloat(e.target.value) || 1.0,
          style: 'width:100px'
        });
        filterRow.append(el('label', {}, ['Cutoff Frequency (Hz): ', filterInput]));
        card.append(filterRow);
      }

      // Input A
      const inputASection = el('div', {style: 'border:1px solid #2a3046; padding:8px; margin-bottom:8px; border-radius:6px'});
      inputASection.append(el('h4', {style: 'margin:0 0 8px 0; color:#a8b3cf'}, 'Input A'));
      inputASection.append(createMathInputEditor(op.input_a));
      card.append(inputASection);

      // Input B (only for binary and conditional ops)
      const binary = ['add','sub','mul','div','mod','pow','min','max','atan2'];
      const conditional = ['if_gt','if_gte','if_lt','if_lte','if_eq','if_neq'];
      
      if (binary.includes(op.operation) || conditional.includes(op.operation)) {
        const inputBSection = el('div', {style: 'border:1px solid #2a3046; padding:8px; border-radius:6px; margin-bottom:8px'});
        inputBSection.append(el('h4', {style: 'margin:0 0 8px 0; color:#a8b3cf'}, conditional.includes(op.operation) ? 'Compare To' : 'Input B'));
        inputBSection.append(createMathInputEditor(op.input_b));
        card.append(inputBSection);
      }
      
      // IF outputs (only for conditional ops)
      if (conditional.includes(op.operation)) {
        const ifOutputsSection = el('div', {style: 'border:1px solid #2a3046; padding:8px; border-radius:6px; margin-bottom:8px'});
        ifOutputsSection.append(el('h4', {style: 'margin:0 0 8px 0; color:#a8b3cf'}, 'Outputs'));
        
        const trueRow = el('div', {style: 'margin-bottom:8px'});
        trueRow.append(el('label', {style: 'display:block;margin-bottom:4px;color:#7aa2f7'}, 'If TRUE:'));
        if (!op.output_true) op.output_true = {kind: 'value', index: 0, value: 1.0};
        trueRow.append(createMathInputEditor(op.output_true));
        
        const falseRow = el('div', {});
        falseRow.append(el('label', {style: 'display:block;margin-bottom:4px;color:#f7768e'}, 'If FALSE:'));
        if (!op.output_false) op.output_false = {kind: 'value', index: 0, value: 0.0};
        falseRow.append(createMathInputEditor(op.output_false));
        
        ifOutputsSection.append(trueRow, falseRow);
        card.append(ifOutputsSection);
      }
      
      // Hardware Output Configuration
      const outputSection = el('div', {style: 'border:1px solid #2a3046; padding:8px; border-radius:6px; margin-bottom:8px'});
      outputSection.append(el('h4', {style: 'margin:0 0 8px 0; color:#a8b3cf'}, 'Hardware Output (Optional)'));
      
      const hasOutputChk = el('input', {
        type: 'checkbox',
        checked: op.has_output || false,
        onchange: e => {
          op.has_output = e.target.checked;
          outputConfigDiv.style.display = e.target.checked ? 'block' : 'none';
        }
      });
      
      const outputConfigDiv = el('div', {style: 'display:' + (op.has_output ? 'block' : 'none') + ';margin-top:8px'});
      
      const outputTypeSelect = el('select', {
        onchange: e => {
          op.output_type = e.target.value;
          clampDiv.style.display = e.target.value === 'ao' ? 'block' : 'none';
        },
        style: 'width:80px;margin-left:8px'
      });
      outputTypeSelect.append(el('option', {value: 'ao'}, 'AO'));
      outputTypeSelect.append(el('option', {value: 'do'}, 'DO'));
      outputTypeSelect.value = op.output_type || 'ao';
      
      const outputChInput = el('input', {
        type: 'number',
        min: 0,
        step: 1,
        value: op.output_channel ?? 0,
        oninput: e => op.output_channel = parseInt(e.target.value) || 0,
        style: 'width:60px;margin-left:8px'
      });
      
      const clampDiv = el('div', {style: 'display:' + (op.output_type === 'ao' ? 'block' : 'none') + ';margin-top:8px'});
      const minInput = el('input', {
        type: 'number',
        step: 'any',
        value: op.output_min ?? -10.0,
        oninput: e => op.output_min = parseFloat(e.target.value),
        style: 'width:80px;margin-left:8px'
      });
      const maxInput = el('input', {
        type: 'number',
        step: 'any',
        value: op.output_max ?? 10.0,
        oninput: e => op.output_max = parseFloat(e.target.value),
        style: 'width:80px;margin-left:8px'
      });
      
      clampDiv.append(
        el('label', {}, ['Min: ', minInput]),
        el('label', {style: 'margin-left:12px'}, ['Max: ', maxInput])
      );
      
      outputConfigDiv.append(
        el('div', {className: 'row', style: 'margin-bottom:8px'}, [
          el('label', {}, ['Type: ', outputTypeSelect]),
          el('label', {style: 'margin-left:12px'}, ['Channel: ', outputChInput])
        ]),
        clampDiv
      );
      
      outputSection.append(
        el('label', {}, [hasOutputChk, ' Write result to AO/DO']),
        outputConfigDiv
      );
      card.append(outputSection);

      container.append(card);
    });
  }

  function createMathInputEditor(input) {
    const div = el('div', {className: 'row'});
    
    const kindSelect = el('select', {
      onchange: async e => {
        input.kind = e.target.value;
        if (e.target.value === 'value') {
          signalSelect.style.display = 'none';
          signalLabel.style.display = 'none';
          valueInput.style.display = 'block';
          valueLabel.style.display = 'flex';
        } else {
          const defaultIndex = (e.target.value === 'static' || e.target.value === 'button') ? (input.index || '') : (input.index || 0);
          const newSel = await createSignalSelector(e.target.value, defaultIndex, idx => input.index = idx);
          signalSelect.replaceWith(newSel);
          signalSelect = newSel;
          signalSelect.style.display = 'block';
          signalLabel.style.display = 'flex';
          valueInput.style.display = 'none';
          valueLabel.style.display = 'none';
        }
      },
      style: 'flex:1'
    });
    ['ai', 'ao', 'tc', 'pid_u', 'math', 'le', 'expr', 'static', 'value'].forEach(k => {
      kindSelect.append(el('option', {value: k}, k.toUpperCase()));
    });
    kindSelect.value = input.kind || 'ai';

    // Create signal selector (async)
    let signalSelect = el('select', {style: 'flex:1'});
    signalSelect.append(el('option', {}, 'Loading...'));
    (async () => {
      const kind = input.kind || 'ai';
      const defaultIndex = (kind === 'static' || kind === 'button') ? (input.index || '') : (input.index || 0);
      const newSel = await createSignalSelector(kind, defaultIndex, idx => input.index = idx);
      signalSelect.replaceWith(newSel);
      signalSelect = newSel;
    })();
    
    const valueInput = el('input', {
      type: 'number',
      step: 'any',
      value: input.value || 0,
      oninput: e => input.value = parseFloat(e.target.value) || 0,
      style: 'flex:1; display:' + (input.kind === 'value' ? 'block' : 'none')
    });
    
    const signalLabel = el('label', {style: 'flex:1; display:' + (input.kind === 'value' ? 'none' : 'flex')}, ['Signal: ', signalSelect]);
    const valueLabel = el('label', {style: 'flex:1; display:' + (input.kind === 'value' ? 'flex' : 'none')}, ['Value: ', valueInput]);
    
    div.append(
      el('label', {style: 'flex:1'}, ['Kind: ', kindSelect]),
      signalLabel,
      valueLabel
    );
    
    return div;
  }

  renderMathEditor();

  const saveBtn = el('button', {
    className: 'btn',
    onclick: async () => {
      try {
        const resp = await fetch('/api/math_operators', {
          method: 'PUT',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(math_data)
        });
        const result = await resp.json();
        if (result.ok) {
          alert('Math operators saved!');
          closeModal();
          renderPage(); // Reload all widgets to show updated config
        } else {
          alert('Failed to save: ' + result.error);
        }
      } catch(e) {
        alert('Network error: ' + e.message);
      }
    }
  }, '💾 Save');

  const saveAs = createSaveAsButton(() => math_data, 'math_operators.json');

  root.append(
    title,
    el('div', {className: 'row', style: 'gap:8px;margin:12px 0'}, [loadBtn, addUnaryBtn, addBinaryBtn]),
    container,
    el('div', {className: 'row', style: 'gap:8px;margin-top:20px'}, [saveBtn, saveAs])
  );

  showModal(root);
}


async function openCalibrateAIDialog() {
  const cfg = await (await fetch('/api/config')).json();
  const analogs = getAllAnalogs(cfg);
  
  const root = el('div', {});
  const title = el('h2', {}, 'Calibrate AI Channel');
  const subtitle = el('p', {style: 'color:#a8b3cf;margin-bottom:16px'}, 
    'Two-point calibration: Measure at two known values to calculate slope and offset.');
  
  // Channel selection
  const channelSelect = el('select', {style: 'width:200px;margin-bottom:16px'});
  analogs.forEach((ai, idx) => {
    channelSelect.append(el('option', {value: idx}, `AI${idx}: ${ai.name || 'Unnamed'}`));
  });
  
  // Averaging period input
  const avgInput = el('input', {
    type: 'number',
    min: 0.5,
    max: 10,
    step: 0.5,
    value: 2.0,
    style: 'width:80px;margin-left:8px'
  });
  
  // Calibration points
  let points = [
    {reference: 0, measured: null, averaging: false},
    {reference: 0, measured: null, averaging: false}
  ];
  
  const pointsDiv = el('div', {style: 'margin:16px 0'});
  
  function updatePointsUI() {
    pointsDiv.innerHTML = '';
    
    points.forEach((pt, idx) => {
      const row = el('div', {
        style: 'display:flex;gap:12px;align-items:center;padding:12px;background:#1a1d2e;border-radius:6px;margin:8px 0'
      });
      
      const pointLabel = el('div', {
        style: 'min-width:80px;font-weight:600;color:#79c0ff'
      }, `Point ${idx + 1}:`);
      
      const refLabel = el('label', {style: 'display:flex;align-items:center;gap:6px'}, [
        el('span', {style: 'color:#9094a1'}, 'Reference:'),
        el('input', {
          type: 'number',
          step: 'any',
          value: pt.reference,
          style: 'width:100px',
          oninput: (e) => pt.reference = parseFloat(e.target.value) || 0
        })
      ]);
      
      const measuredLabel = el('label', {style: 'display:flex;align-items:center;gap:6px'}, [
        el('span', {style: 'color:#9094a1'}, 'Measured:'),
        el('span', {
          style: 'width:100px;font-family:monospace;color:#a8f0a8;font-weight:600'
        }, pt.measured !== null ? pt.measured.toFixed(4) : '---')
      ]);
      
      const measureBtn = el('button', {
        className: 'btn',
        disabled: pt.averaging,
onclick: async () => {
          const ch = parseInt(channelSelect.value);
          const avgPeriod = parseFloat(avgInput.value) || 2.0;
          
          measureBtn.disabled = true;
          measureBtn.textContent = 'Measuring...';
          pt.averaging = true;
          
          try {
            // CRITICAL: Temporarily set slope=1, offset=0 to get raw voltages
            console.log('[CALIBRATE] Fetching current config...');
            const cfg = await (await fetch('/api/config')).json();
            
            // Find the channel and save original values
            let originalSlope, originalOffset;
            let channel_idx = ch;
            let targetBoard = null;
            
            if (cfg.boards1608) {
              for (let board of cfg.boards1608) {
                if (!board.enabled) continue;
                if (channel_idx < board.analogs.length) {
                  originalSlope = board.analogs[channel_idx].slope;
                  originalOffset = board.analogs[channel_idx].offset;
                  board.analogs[channel_idx].slope = 1.0;
                  board.analogs[channel_idx].offset = 0.0;
                  targetBoard = board;
                  console.log('[CALIBRATE] Saved original: slope =', originalSlope, ', offset =', originalOffset);
                  break;
                } else {
                  channel_idx -= board.analogs.length;
                }
              }
            }
            
            if (!targetBoard) {
              throw new Error('Channel not found in config');
            }
            
            // Apply temporary config
            console.log('[CALIBRATE] Setting slope=1, offset=0 temporarily...');
            await fetch('/api/config', {
              method: 'PUT',
              headers: {'Content-Type': 'application/json'},
              body: JSON.stringify(cfg)
            });
            
            // Wait for config to propagate
            await new Promise(resolve => setTimeout(resolve, 200));
            
            // Collect samples with slope=1, offset=0
            console.log('[CALIBRATE] Measuring raw voltage...');
            const samples = [];
            const sampleRate = 20; // Hz
            const numSamples = Math.floor(avgPeriod * sampleRate);
            
            for (let i = 0; i < numSamples; i++) {
              if (state && state.ai && ch < state.ai.length) {
                samples.push(state.ai[ch]);
              }
              await new Promise(resolve => setTimeout(resolve, 1000 / sampleRate));
            }
            
            // Restore original slope/offset
            console.log('[CALIBRATE] Restoring original slope/offset...');
            channel_idx = ch;
            for (let board of cfg.boards1608) {
              if (!board.enabled) continue;
              if (channel_idx < board.analogs.length) {
                board.analogs[channel_idx].slope = originalSlope;
                board.analogs[channel_idx].offset = originalOffset;
                break;
              } else {
                channel_idx -= board.analogs.length;
              }
            }
            
            await fetch('/api/config', {
              method: 'PUT',
              headers: {'Content-Type': 'application/json'},
              body: JSON.stringify(cfg)
            });
            
            // Calculate average
            if (samples.length > 0) {
              pt.measured = samples.reduce((a, b) => a + b, 0) / samples.length;
              console.log('[CALIBRATE] Measured raw voltage:', pt.measured, 'V');
              updatePointsUI();
            } else {
              throw new Error('No samples collected');
            }
            
          } catch(e) {
            console.error('[CALIBRATE] Measurement error:', e);
            alert('Measurement failed: ' + e.message);
          } finally {
            pt.averaging = false;
            measureBtn.disabled = false;
            measureBtn.textContent = 'Measure';
            updatePointsUI();
          }
        }
      }, pt.averaging ? 'Measuring...' : 'Measure');
      
      row.append(pointLabel, refLabel, measuredLabel, measureBtn);
      pointsDiv.append(row);
    });
  }
  
  updatePointsUI();
  
  // Calculate button
  const calculateBtn = el('button', {
    className: 'btn primary',
    style: 'margin-top:16px',
    onclick: async () => {
      // Check that we have both measurements
      if (points[0].measured === null || points[1].measured === null) {
        alert('Please measure both calibration points first.');
        return;
      }
      
      const ref1 = points[0].reference;
      const meas1 = points[0].measured;
      const ref2 = points[1].reference;
      const meas2 = points[1].measured;
      
      // Check for divide by zero
      if (Math.abs(meas2 - meas1) < 1e-9) {
        alert('Measured values are too similar. Please use two different reference values.');
        return;
      }
      
      // Calculate slope and offset
      // We want: output = slope * measured + offset
      // Where: ref1 = slope * meas1 + offset
      //        ref2 = slope * meas2 + offset
      // Solving: slope = (ref2 - ref1) / (meas2 - meas1)
      //          offset = ref1 - slope * meas1
      
      console.log('[CALIBRATE] Point 1:');
      console.log('  Reference value:', ref1);
      console.log('  Measured voltage:', meas1);
      console.log('[CALIBRATE] Point 2:');
      console.log('  Reference value:', ref2);
      console.log('  Measured voltage:', meas2);
      
      const slope = (ref2 - ref1) / (meas2 - meas1);
      const offset = ref1 - slope * meas1;
      
      console.log('[CALIBRATE] Calculations:');
      console.log('  Delta reference:', ref2 - ref1);
      console.log('  Delta measured:', meas2 - meas1);
      console.log('  Slope:', slope);
      console.log('  Offset:', offset);
      console.log('[CALIBRATE] Verification:');
      console.log('  Point 1 check: slope * meas1 + offset =', slope * meas1 + offset, '(should be', ref1, ')');
      console.log('  Point 2 check: slope * meas2 + offset =', slope * meas2 + offset, '(should be', ref2, ')');
      
      const ch = parseInt(channelSelect.value);
      
      // Show confirmation
      const confirmMsg = `Calibration Results:

` +
        `Point 1: ${meas1.toFixed(4)} V → ${ref1} (reference)
` +
        `Point 2: ${meas2.toFixed(4)} V → ${ref2} (reference)

` +
        `Calculated:
` +
        `  Slope: ${slope.toFixed(6)}
` +
        `  Offset: ${offset.toFixed(6)}

` +
        `Apply this calibration to AI${ch}?`;
      
      if (!confirm(confirmMsg)) return;
      
      // Update config via API
      try {
        // Fetch current config
        const cfg = await (await fetch('/api/config')).json();
        
        // Find the right board and channel
        let updated = false;
        let channel_idx = ch;
        
        if (cfg.boards1608) {
          for (let board of cfg.boards1608) {
            if (!board.enabled) continue;
            if (channel_idx < board.analogs.length) {
              board.analogs[channel_idx].slope = slope;
              board.analogs[channel_idx].offset = offset;
              updated = true;
              break;
            } else {
              channel_idx -= board.analogs.length;
            }
          }
        }
        
        if (!updated) {
          alert('Failed to find channel in config');
          return;
        }
        
        // Save config
        const saveResp = await fetch('/api/config', {
          method: 'PUT',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(cfg)
        });
        
        if (saveResp.ok) {
          alert('Calibration applied successfully!');
          closeModal();
        } else {
          alert('Failed to save config');
        }
        
      } catch(e) {
        alert('Calibration failed: ' + e.message);
      }
    }
  }, 'Calculate & Apply Calibration');
  
  const cancelBtn = el('button', {
    className: 'btn',
    onclick: closeModal
  }, 'Cancel');
  
  root.append(
    title,
    subtitle,
    el('div', {style: 'margin:12px 0'}, [
      el('label', {}, ['Select Channel: ', channelSelect])
    ]),
    el('div', {style: 'margin:12px 0'}, [
      el('label', {}, ['Averaging Period (sec): ', avgInput])
    ]),
    el('div', {style: 'color:#7a7f8f;font-size:11px;margin:8px 0'}, 
      'Instructions: Set sensor to first known value, enter reference value, click Measure. ' +
      'Repeat for second known value. Then click Calculate to apply calibration.'),
    pointsDiv,
    el('div', {style: 'display:flex;gap:8px;margin-top:16px'}, [calculateBtn, cancelBtn])
  );
  
  showModal(root);
}


async function openZeroAIDialog() {
  const cfg = await (await fetch('/api/config')).json();
  const analogs = getAllAnalogs(cfg);
  const tcsAll = getAllThermocouples(cfg);   // positional list (indices must match server order)

  const root = el('div', {});
  const title = el('h2', {}, 'Zero / Balance Channels');
  const subtitle = el('p', {style: 'color:#a8b3cf;margin-bottom:16px'},
    'Select channels to zero. This will average the current readings and adjust offsets. ' +
    'AIs and TCs use the SAME target value below — run separate passes when they differ ' +
    '(e.g. TCs to room temp, then pressure AIs to the local barometric psi).');
  
  // Configuration inputs
  const configRow = el('div', {style: 'margin:16px 0;padding:12px;background:#1a1d2e;border-radius:6px;display:flex;gap:20px;flex-wrap:wrap'});
  
  const avgInput = el('input', {
    type: 'number',
    min: 0.1,
    step: 0.1,
    value: 1.0,
    style: 'width:80px;margin-left:8px'
  });
  
  const balanceInput = el('input', {
    type: 'number',
    step: 'any',
    value: 0.0,
    style: 'width:100px;margin-left:8px'
  });
  
  configRow.append(
    el('div', {style: 'flex:1;min-width:300px'}, [
      el('label', {}, ['Averaging Period (sec): ', avgInput]),
      el('div', {style: 'color:#7a7f8f;font-size:10px;margin-top:4px;margin-left:8px'}, 
        'Time to average readings')
    ]),
    el('div', {style: 'flex:1;min-width:300px'}, [
      el('label', {}, ['Balance To Value: ', balanceInput]),
      el('div', {style: 'color:#7a7f8f;font-size:10px;margin-top:4px;margin-left:8px'}, 
        'Target value after zeroing (e.g., 150.5 psi)')
    ])
  );
  
  // AI channel checkboxes
  const channelList = el('div', {style: 'max-height:400px;overflow:auto'});
  const selectedChannels = new Set();
  
  analogs.forEach((ai, idx) => {
    const row = el('div', {
      style: 'padding:8px;margin:4px 0;background:#1a1d2e;border-radius:4px;display:flex;align-items:center;gap:12px'
    });
    
    const checkbox = el('input', {
      type: 'checkbox',
      id: `zero_ai_${idx}`,
      onchange: e => {
        if (e.target.checked) selectedChannels.add(idx);
        else selectedChannels.delete(idx);
      }
    });
    
    const label = el('label', {
      htmlFor: `zero_ai_${idx}`,
      style: 'flex:1;cursor:pointer;display:flex;align-items:center;gap:8px'
    });
    
    const aiName = el('span', {style: 'font-weight:600;min-width:150px'}, ai.name || `AI${idx}`);
    const currentVal = el('span', {
      id: `zero_current_${idx}`,
      style: 'color:#7aa2f7;font-family:monospace'
    }, 'Loading...');

    label.append(checkbox, aiName, currentVal);
    row.append(label);
    channelList.append(row);
  });

  // TC channels (2.1.80): only include:true TCs are shown, but the checkbox
  // carries the POSITIONAL index (over ALL configured TCs) the server expects.
  const selectedTCs = new Set();
  const shownTCs = tcsAll.map((tc, idx) => ({tc, idx})).filter(x => x.tc && x.tc.include);
  if (shownTCs.length) {
    channelList.append(el('div', {style: 'margin:10px 0 4px;color:#a8b3cf;font-weight:600'},
      'Thermocouples (offset cal — soak at a known temp, balance to it)'));
    shownTCs.forEach(({tc, idx}) => {
      const row = el('div', {
        style: 'padding:8px;margin:4px 0;background:#1a1d2e;border-radius:4px;display:flex;align-items:center;gap:12px'
      });
      const checkbox = el('input', {
        type: 'checkbox',
        id: `zero_tc_${idx}`,
        onchange: e => {
          if (e.target.checked) selectedTCs.add(idx);
          else selectedTCs.delete(idx);
        }
      });
      const label = el('label', {
        htmlFor: `zero_tc_${idx}`,
        style: 'flex:1;cursor:pointer;display:flex;align-items:center;gap:8px'
      });
      const tcName = el('span', {style: 'font-weight:600;min-width:150px'}, (tc.name || `TC${idx}`) + ' (TC)');
      const currentVal = el('span', {
        id: `zero_tccur_${idx}`,
        style: 'color:#e0af68;font-family:monospace'
      }, 'Loading...');
      label.append(checkbox, tcName, currentVal);
      row.append(label);
      channelList.append(row);
    });
  }

  // Update current values periodically
  const updateInterval = setInterval(() => {
    if (state.ai) analogs.forEach((ai, idx) => {
      const span = document.getElementById(`zero_current_${idx}`);
      if (span && state.ai[idx] !== undefined) {
        const val = state.ai[idx];
        span.textContent = Number.isFinite(val) ? val.toFixed(4) : '---';
      }
    });
    if (state.tc) shownTCs.forEach(({idx}) => {
      const span = document.getElementById(`zero_tccur_${idx}`);
      if (span && state.tc[idx] !== undefined) {
        const val = state.tc[idx];
        span.textContent = Number.isFinite(val) ? val.toFixed(3) + ' °C' : '---';
      }
    });
  }, 100);
  
  // Zero button
  const zeroBtn = el('button', {
    className: 'btn primary',
    onclick: async () => {
      if (selectedChannels.size === 0 && selectedTCs.size === 0) {
        alert('Please select at least one channel to zero.');
        return;
      }

      const avgPeriod = parseFloat(avgInput.value) || 1.0;
      const balanceToValue = parseFloat(balanceInput.value) || 0.0;
      const channelsToZero = Array.from(selectedChannels);
      const tcsToZero = Array.from(selectedTCs);

      zeroBtn.disabled = true;
      zeroBtn.textContent = 'Averaging...';

      try {
        const msgs = [];
        let allOk = true;
        if (channelsToZero.length) {
          const resp = await fetch('/api/zero_ai', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
              channels: channelsToZero,
              averaging_period: avgPeriod,
              balance_to_value: balanceToValue
            })
          });
          const result = await resp.json();
          if (result.ok) {
            msgs.push(result.offsets.map(o =>
              `AI${o.channel}: ${o.old.toFixed(4)} → ${o.new.toFixed(4)} (avg: ${o.avg.toFixed(4)})`
            ).join('\n'));
          } else { allOk = false; msgs.push('AI zero failed: ' + (result.error || 'Unknown error')); }
        }
        if (tcsToZero.length) {
          const resp = await fetch('/api/zero_tc', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
              channels: tcsToZero,
              averaging_period: Math.max(avgPeriod, 2.0),   // TCs read slowly
              balance_to_value: balanceToValue
            })
          });
          const result = await resp.json();
          if (result.ok) {
            msgs.push(result.offsets.map(o =>
              `${o.name || ('TC' + o.channel)}: ${o.old.toFixed(3)} → ${o.new.toFixed(3)} (avg: ${o.avg.toFixed(3)} °C)`
            ).join('\n'));
          } else { allOk = false; msgs.push('TC zero failed: ' + (result.error || 'Unknown error')); }
        }
        if (allOk) {
          const balanceMsg = balanceToValue !== 0 ? `\nBalanced to: ${balanceToValue}` : '';
          alert(`Zero complete!${balanceMsg}\n\nOffsets updated:\n` + msgs.join('\n'));
          clearInterval(updateInterval);
          closeModal();
        } else {
          alert(msgs.join('\n\n'));
          zeroBtn.disabled = false;
          zeroBtn.textContent = '⚡ Zero Selected Channels';
        }
      } catch (e) {
        alert('Network error: ' + e.message);
        zeroBtn.disabled = false;
        zeroBtn.textContent = '⚡ Zero Selected Channels';
      }
    }
  }, '⚡ Zero Selected Channels');
  
  const cancelBtn = el('button', {
    className: 'btn',
    onclick: () => {
      clearInterval(updateInterval);
      if (typeof scaleUpdateInterval !== 'undefined') clearInterval(scaleUpdateInterval);
      closeModal();
    }
  }, 'Cancel');

  // ============================================================
  // SCALES TARE SECTION — only render if scales are configured
  // ============================================================
  let scalesData = null;
  try {
    scalesData = await (await fetch('/api/scales')).json();
  } catch(e) {
    console.warn('[Zero/Tare] Failed to fetch scales config:', e);
  }
  const scales = (scalesData && Array.isArray(scalesData.scales)) ? scalesData.scales : [];
  const hasScales = scales.length > 0;

  let scalesSection = null;
  let scaleUpdateInterval = null;
  const selectedScales = new Set();
  let tareBtn = null;

  if (hasScales) {
    // Title above the dialog already says "Zero AI" — change it to reflect both
    title.textContent = 'Zero / Tare Channels';
    subtitle.textContent = 'Select AI channels to zero, and/or scale channels to tare.';

    scalesSection = el('div', {style: 'margin-top:24px;padding-top:16px;border-top:1px solid #2a3046'});

    scalesSection.append(
      el('h3', {style: 'margin:0 0 8px 0'}, 'Tare Serial Scales'),
      el('p', {style: 'color:#a8b3cf;font-size:12px;margin:0 0 12px 0'},
        'Average each scale\u2019s raw reading and set its offset so that the displayed value matches the target value.')
    );

    // Tare config row (averaging period + target)
    const tareConfigRow = el('div', {
      style: 'margin:8px 0 12px 0;padding:12px;background:#1a1d2e;border-radius:6px;display:flex;gap:20px;flex-wrap:wrap'
    });

    const tareAvgInput = el('input', {
      type: 'number',
      min: 0.1, step: 0.1, value: 1.0,
      style: 'width:80px;margin-left:8px'
    });

    const tareTargetInput = el('input', {
      type: 'number', step: 'any', value: 0.0,
      style: 'width:120px;margin-left:8px'
    });

    tareConfigRow.append(
      el('div', {style: 'flex:1;min-width:280px'}, [
        el('label', {}, ['Averaging Period (sec): ', tareAvgInput]),
        el('div', {style: 'color:#7a7f8f;font-size:10px;margin-top:4px;margin-left:8px'},
          'Time to sample raw scale readings')
      ]),
      el('div', {style: 'flex:1;min-width:280px'}, [
        el('label', {}, ['Target Value: ', tareTargetInput]),
        el('div', {style: 'color:#7a7f8f;font-size:10px;margin-top:4px;margin-left:8px'},
          'Displayed value after tare (e.g., 0.0 for zero, 100.0 for a known weight)')
      ])
    );
    scalesSection.append(tareConfigRow);

    // Scale channel list
    const scaleList = el('div', {style: 'max-height:280px;overflow:auto'});
    scales.forEach((sc, idx) => {
      const row = el('div', {
        style: 'padding:8px;margin:4px 0;background:#1a1d2e;border-radius:4px;display:flex;align-items:center;gap:12px'
      });
      const cb = el('input', {
        type: 'checkbox',
        id: `tare_scale_${idx}`,
        onchange: e => {
          if (e.target.checked) selectedScales.add(idx);
          else selectedScales.delete(idx);
        }
      });
      const lbl = el('label', {
        htmlFor: `tare_scale_${idx}`,
        style: 'flex:1;cursor:pointer;display:flex;align-items:center;gap:8px'
      });
      const name = el('span', {style: 'font-weight:600;min-width:150px'},
                     sc.name || `Scale${idx}`);
      const units = sc.units ? ` ${sc.units}` : '';
      const rawVal = el('span', {
        id: `tare_raw_${idx}`,
        style: 'color:#7aa2f7;font-family:monospace;min-width:120px',
        title: 'Raw reading (un-tared)'
      }, 'Loading...');
      const dispVal = el('span', {
        id: `tare_disp_${idx}`,
        style: 'color:#a8f0a8;font-family:monospace;min-width:120px',
        title: 'Currently displayed (tared) value'
      }, '');
      const offsetSpan = el('span', {
        id: `tare_off_${idx}`,
        style: 'color:#9094a1;font-family:monospace;font-size:11px',
        title: 'Current offset'
      }, '');

      lbl.append(cb, name,
        el('span', {style: 'color:#7a7f8f;font-size:10px'}, 'raw:'),
        rawVal,
        el('span', {style: 'color:#7a7f8f;font-size:10px'}, 'disp:'),
        dispVal,
        offsetSpan,
        units ? el('span', {style: 'color:#9094a1'}, units) : ''
      );
      row.append(lbl);
      scaleList.append(row);
    });
    scalesSection.append(scaleList);

    // Live updates: poll both raw and tared values 5x/sec.
    // Raw via dedicated endpoint; tared comes from telemetry stream (state.scales).
    const refreshScaleDisplay = async () => {
      try {
        const rr = await fetch('/api/scales/values/raw');
        const rd = await rr.json();
        const rawVals = rd.values || [];
        scales.forEach((sc, idx) => {
          const rawSpan = document.getElementById(`tare_raw_${idx}`);
          const dispSpan = document.getElementById(`tare_disp_${idx}`);
          const offSpan = document.getElementById(`tare_off_${idx}`);
          if (!rawSpan) return;
          const raw = rawVals[idx];
          const off = (typeof sc.offset === 'number') ? sc.offset : 0;
          if (Number.isFinite(raw)) {
            rawSpan.textContent = raw.toFixed(4);
            if (dispSpan) dispSpan.textContent = (raw + off).toFixed(4);
          } else {
            rawSpan.textContent = '---';
            if (dispSpan) dispSpan.textContent = '---';
          }
          if (offSpan) offSpan.textContent = `(off: ${off.toFixed(3)})`;
        });
      } catch(e) {}
    };
    refreshScaleDisplay();
    scaleUpdateInterval = setInterval(refreshScaleDisplay, 200);

    // Tare button
    tareBtn = el('button', {
      className: 'btn primary',
      onclick: async () => {
        if (selectedScales.size === 0) {
          alert('Please select at least one scale to tare.');
          return;
        }
        const avgPeriod = parseFloat(tareAvgInput.value) || 1.0;
        const targetValue = parseFloat(tareTargetInput.value) || 0.0;
        const channelsToTare = Array.from(selectedScales);

        tareBtn.disabled = true;
        tareBtn.textContent = 'Averaging...';
        try {
          const resp = await fetch('/api/tare_scales', {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({
              channels: channelsToTare,
              averaging_period: avgPeriod,
              target_value: targetValue
            })
          });
          const result = await resp.json();
          if (result.ok) {
            const lines = result.offsets.map(o =>
              `${o.name}: raw_avg=${o.raw_avg.toFixed(4)}, ` +
              `offset ${o.old_offset.toFixed(4)} \u2192 ${o.new_offset.toFixed(4)} ` +
              `(displayed=${o.displayed.toFixed(4)})`
            ).join('\n');
            alert(`Successfully tared ${channelsToTare.length} scale(s)!\n` +
                  `Target value: ${targetValue}\n\n${lines}`);
            // Update the local scales array so the live display picks up new offsets
            result.offsets.forEach(o => {
              const idx = o.channel;
              if (idx < scales.length) scales[idx].offset = o.new_offset;
            });
            // Clear selection and re-enable
            selectedScales.clear();
            scales.forEach((_, idx) => {
              const cb = document.getElementById(`tare_scale_${idx}`);
              if (cb) cb.checked = false;
            });
            tareBtn.disabled = false;
            tareBtn.textContent = '\u2696\ufe0f Tare Selected Scales';
          } else {
            alert('Failed to tare: ' + (result.error || 'Unknown error'));
            tareBtn.disabled = false;
            tareBtn.textContent = '\u2696\ufe0f Tare Selected Scales';
          }
        } catch(e) {
          alert('Network error: ' + e.message);
          tareBtn.disabled = false;
          tareBtn.textContent = '\u2696\ufe0f Tare Selected Scales';
        }
      }
    }, '\u2696\ufe0f Tare Selected Scales');

    scalesSection.append(
      el('div', {className: 'row', style: 'gap:8px;margin-top:12px'}, [tareBtn])
    );
  }

  // Build the dialog: AI section first, optional scales section, then footer buttons.
  const children = [
    title,
    subtitle,
    configRow,
    el('h3', {style: 'margin:20px 0 12px 0'}, hasScales ? 'AI Channels:' : 'Select Channels:'),
    channelList
  ];
  if (scalesSection) children.push(scalesSection);
  children.push(el('div', {className: 'row', style: 'gap:8px;margin-top:20px'}, [zeroBtn, cancelBtn]));

  root.append(...children);

  showModal(root);
}

async function openMathEditor() {
    const math_data = await (await fetch('/api/math_operators')).json();
    const operators = math_data.operators || [];

    const root = el('div', {});
    const title = el('h2', {}, 'Math Operators Editor');

    const loadBtn = el('button', {
      className: 'btn',
      onclick: () => {
        const inp = el('input', {type: 'file', accept: '.json'});
        inp.onchange = async () => {
          const f = inp.files?.[0];
          if (!f) return;
          try {
            const text = await f.text();
            const loaded = JSON.parse(text);
            Object.assign(math_data, loaded);
            alert('Math config loaded! Close and reopen to see changes, or click Save to apply.');
          } catch (e) {
            alert('Failed to load Math config: ' + e.message);
          }
        };
        inp.click();
      }
    }, '📁 Load from File');

    const addUnaryBtn = el('button', {
      className: 'btn',
      onclick: () => {
        operators.push({
          enabled: true,
          name: `Math${operators.length}`,
          operation: 'sqr',
          input_a: {kind: 'ai', index: 0}
        });
        renderMathEditor();
      }
    }, '+ Add Unary (sqr, sqrt, etc)');

    const addBinaryBtn = el('button', {
      className: 'btn',
      onclick: () => {
        operators.push({
          enabled: true,
          name: `Math${operators.length}`,
          operation: 'add',
          input_a: {kind: 'ai', index: 0},
          input_b: {kind: 'ai', index: 1}
        });
        renderMathEditor();
      }
    }, '+ Add Binary (+, -, ×, ÷)');

    const container = el('div', {style: 'overflow:auto;max-height:60vh'});

    function renderMathEditor() {
      container.innerHTML = '';

      operators.forEach((op, idx) => {
        const card = el('fieldset', {style: 'margin-bottom:20px; padding:12px;'});
        const legend = el('legend', {}, `Math${idx}: ${op.name}`);
        card.append(legend);

        const topRow = el('div', {className: 'row', style: 'margin-bottom:12px'});
        topRow.append(
            el('label', {}, [
              el('input', {type: 'checkbox', checked: op.enabled, onchange: e => op.enabled = e.target.checked}),
              ' Enabled'
            ]),
            el('label', {style: 'flex:2'}, [
              'Name: ',
              el('input', {type: 'text', value: op.name, oninput: e => op.name = e.target.value, style: 'width:100%'})
            ]),
            el('button', {
              className: 'btn danger',
              onclick: () => {
                if (confirm(`Delete Math${idx}?`)) {
                  operators.splice(idx, 1);
                  renderMathEditor();
                }
              }
            }, '🗑 Delete')
        );
        card.append(topRow);

        // Operation select
        const opRow = el('div', {style: 'margin:12px 0'});
        const opSelect = el('select', {
          onchange: e => {
            op.operation = e.target.value;
            // Binary ops need input_b, unary don't
            const binary = ['add', 'sub', 'mul', 'div', 'mod', 'pow', 'min', 'max', 'atan2'];
            if (binary.includes(e.target.value)) {
              if (!op.input_b) op.input_b = {kind: 'ai', index: 1};
            } else {
              delete op.input_b;
            }
            renderMathEditor();
          },
          style: 'font-size:14px; padding:6px 12px'
        });

        const opGroups = {
          'Unary': ['sqr', 'sqrt', 'log10', 'ln', 'exp', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'abs', 'neg'],
          'Binary': ['add', 'sub', 'mul', 'div', 'mod', 'pow', 'min', 'max', 'atan2']
        };
        Object.entries(opGroups).forEach(([group, ops]) => {
          const optgroup = el('optgroup', {label: group});
          ops.forEach(o => optgroup.append(el('option', {value: o}, o)));
          opSelect.append(optgroup);
        });
        opSelect.value = op.operation || 'add';
        opRow.append(el('label', {}, ['Operation: ', opSelect]));
        card.append(opRow);

        // Input A
        const inputASection = el('div', {style: 'border:1px solid #2a3046; padding:8px; margin-bottom:8px; border-radius:6px'});
        inputASection.append(el('h4', {style: 'margin:0 0 8px 0; color:#a8b3cf'}, 'Input A'));
        inputASection.append(createMathInputEditor(op.input_a));
        card.append(inputASection);

        // Input B (only for binary ops)
        const binary = ['add', 'sub', 'mul', 'div', 'mod', 'pow', 'min', 'max', 'atan2'];
        if (binary.includes(op.operation)) {
          const inputBSection = el('div', {style: 'border:1px solid #2a3046; padding:8px; border-radius:6px'});
          inputBSection.append(el('h4', {style: 'margin:0 0 8px 0; color:#a8b3cf'}, 'Input B'));
          inputBSection.append(createMathInputEditor(op.input_b));
          card.append(inputBSection);
        }

        container.append(card);
      });
    }

    function createMathInputEditor(input) {
      const div = el('div', {className: 'row'});

      const kindSelect = el('select', {
        onchange: e => input.kind = e.target.value,
        style: 'flex:1'
      });
      ['ai', 'ao', 'tc', 'pid_u', 'math'].forEach(k => {
        kindSelect.append(el('option', {value: k}, k.toUpperCase()));
      });
      kindSelect.value = input.kind || 'ai';

      const indexInput = el('input', {
        type: 'number',
        min: 0,
        step: 1,
        value: input.index || 0,
        oninput: e => input.index = parseInt(e.target.value) || 0,
        style: 'flex:1'
      });

      div.append(
          el('label', {style: 'flex:1'}, ['Kind: ', kindSelect]),
          el('label', {style: 'flex:1'}, ['Index: ', indexInput])
      );

      return div;
    }

    renderMathEditor();

    const saveBtn = el('button', {
      className: 'btn',
      onclick: async () => {
        try {
          const resp = await fetch('/api/math_operators', {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(math_data)
          });
          const result = await resp.json();
          if (result.ok) {
            alert('Math operators saved!');
            closeModal();
          } else {
            alert('Failed to save: ' + result.error);
          }
        } catch (e) {
          alert('Network error: ' + e.message);
        }
      }
    }, '💾 Save');

    const downloadBtn = el('button', {
      className: 'btn',
      onclick: () => {
        const blob = new Blob([JSON.stringify(math_data, null, 2)], {type: 'application/json'});
        const a = el('a', {href: URL.createObjectURL(blob), download: 'math_operators.json'});
        a.click();
      }
    }, '⬇ Download JSON');

    root.append(
        title,
        el('div', {className: 'row', style: 'gap:8px;margin:12px 0'}, [loadBtn, addUnaryBtn, addBinaryBtn]),
        container,
        el('div', {className: 'row', style: 'gap:8px;margin-top:20px'}, [saveBtn, downloadBtn])
    );

    showModal(root);
  }

  async function openScriptEditor() {
    const script = await (await fetch('/api/script')).json();
    const events = script.events || [];

    const root = el('div', {});
    const title = el('h2', {}, 'Script Editor');

    // Add Load from File button
    const loadBtn = el('button', {
      className: 'btn',
      onclick: () => {
        const inp = el('input', {type: 'file', accept: '.json'});
        inp.onchange = async () => {
          const f = inp.files?.[0];
          if (!f) return;
          try {
            const text = await f.text();
            const loaded = JSON.parse(text);
            // Clear and reload events
            events.length = 0;
            const loadedEvents = loaded.events || (Array.isArray(loaded) ? loaded : []);
            events.push(...loadedEvents);
            renderEvents();
            alert(`Loaded ${events.length} events`);
          } catch (e) {
            alert('Failed to load script: ' + e.message);
          }
        };
        inp.click();
      }
    }, '📁 Load from File');
    
    // Save As button - download script as JSON file
    const saveAsBtn = el('button', {
      className: 'btn',
      onclick: () => {
        const scriptData = {events: events};
        const blob = new Blob([JSON.stringify(scriptData, null, 2)], {type: 'application/json'});
        const url = URL.createObjectURL(blob);
        const a = el('a', {
          href: url,
          download: `script_${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.json`
        });
        a.click();
        URL.revokeObjectURL(url);
      }
    }, '💾 Save As...');

    const table = el('table', {className: 'form script-table'});
    const thead = el('thead', {}, el('tr', {}, [
      el('th', {}, 'Time (s)'),
      el('th', {}, 'Duration (s)'),
      el('th', {}, 'Type'),
      el('th', {}, 'Channel/Name'),
      el('th', {}, 'Value/State'),
      el('th', {}, 'NO/NC'),
      el('th', {}, 'Actions')
    ]));
    const tbody = el('tbody', {});

    function renderEvents() {
      tbody.innerHTML = '';
      events.forEach((evt, idx) => {
        const timeInput = el('input', {
          type: 'number',
          value: evt.time || 0,
          step: 0.1,
          min: 0,
          style: 'width:80px'
        });
        timeInput.oninput = () => evt.time = parseFloat(timeInput.value) || 0;

        const durationInput = el('input', {
          type: 'number',
          value: evt.duration || 0,
          step: 0.1,
          min: 0,
          style: 'width:80px'
        });
        durationInput.oninput = () => evt.duration = parseFloat(durationInput.value) || 0;

        const typeSelect = el('select', {style: 'width:100px'}, [
          el('option', {value: 'DO'}, 'DO'),
          el('option', {value: 'AO'}, 'AO'),
          el('option', {value: 'buttonVar'}, 'ButtonVar'),
          el('option', {value: 'var'}, 'Var')
        ]);
        typeSelect.value = evt.type || 'DO';
        typeSelect.onchange = () => {
          evt.type = typeSelect.value;
          renderEvents();
        };

        // Create channel selector based on type
        let channelControl;
        
        if (evt.type === 'DO' || !evt.type) {
          // DO: dropdown with names
          const doSelect = el('select', {style: 'width:120px'});
          const allDOs = getAllDigitalOutputs(configCache);
          allDOs.forEach((doChannel, idx) => {
            doSelect.append(el('option', {value: idx}, `DO${idx}: ${doChannel.name || 'Unnamed'}`));
          });
          doSelect.value = evt.channel || 0;
          doSelect.onchange = () => evt.channel = parseInt(doSelect.value);
          channelControl = doSelect;
          
        } else if (evt.type === 'AO') {
          // AO: dropdown with names
          const aoSelect = el('select', {style: 'width:120px'});
          const allAOs = getAllAnalogOutputs(configCache);
          allAOs.forEach((aoChannel, idx) => {
            aoSelect.append(el('option', {value: idx}, `AO${idx}: ${aoChannel.name || 'Unnamed'}`));
          });
          aoSelect.value = evt.channel || 0;
          aoSelect.onchange = () => evt.channel = parseInt(aoSelect.value);
          channelControl = aoSelect;
          
        } else {
          // Fallback for unknown types
          const channelInput = el('input', {
            type: 'number',
            value: evt.channel || 0,
            min: 0,
            step: 1,
            style: 'width:60px'
          });
          channelInput.oninput = () => evt.channel = parseInt(channelInput.value) || 0;
          channelControl = channelInput;
        }

        let valueControl;
        let noNcControl = el('span', {}, '—');

        if (evt.type === 'buttonVar' || evt.type === 'var') {
          // For buttonVar/var: show varName input and numeric value
          const varNameInput = el('input', {
            type: 'text',
            value: evt.varName || (evt.type === 'buttonVar' ? 'button1' : 'var1'),
            placeholder: 'name',
            style: 'width:80px'
          });
          varNameInput.oninput = () => evt.varName = varNameInput.value;
          channelControl = varNameInput;
          
          const valueInput = el('input', {
            type: 'number',
            value: evt.value || 0,
            step: 'any',
            style: 'width:80px'
          });
          valueInput.oninput = () => evt.value = parseFloat(valueInput.value) || 0;
          valueControl = valueInput;
          noNcControl = el('span', {}, '—');
          
        } else if (evt.type === 'DO' || !evt.type) {
          const stateCheck = el('input', {
            type: 'checkbox',
            checked: !!evt.state
          });
          stateCheck.onchange = () => evt.state = stateCheck.checked;
          valueControl = el('label', {style: 'display:flex;align-items:center;gap:4px'}, [
            stateCheck,
            el('span', {}, 'ON')
          ]);

          const noRadio = el('input', {
            type: 'radio',
            name: `nonc_${idx}`,
            value: 'NO',
            checked: evt.normallyOpen !== false
          });
          const ncRadio = el('input', {
            type: 'radio',
            name: `nonc_${idx}`,
            value: 'NC',
            checked: evt.normallyOpen === false
          });
          noRadio.onchange = () => evt.normallyOpen = true;
          ncRadio.onchange = () => evt.normallyOpen = false;

          noNcControl = el('div', {style: 'display:flex;gap:8px;align-items:center'}, [
            el('label', {style: 'display:flex;gap:4px'}, [noRadio, 'NO']),
            el('label', {style: 'display:flex;gap:4px'}, [ncRadio, 'NC'])
          ]);
        } else {
          const voltInput = el('input', {
            type: 'number',
            value: evt.value || 0,
            step: 0.01,
            min: 0,
            max: 10,
            style: 'width:80px'
          });
          voltInput.oninput = () => evt.value = parseFloat(voltInput.value) || 0;
          valueControl = el('div', {style: 'display:flex;align-items:center;gap:4px'}, [
            voltInput,
            el('span', {}, 'V')
          ]);
        }

        const deleteBtn = el('button', {
          type: 'button',
          className: 'btn danger',
          onclick: () => {
            events.splice(idx, 1);
            renderEvents();
          }
        }, '×');

        const upBtn = el('button', {
          type: 'button',
          className: 'btn',
          onclick: () => {
            if (idx > 0) {
              [events[idx], events[idx - 1]] = [events[idx - 1], events[idx]];
              renderEvents();
            }
          },
          disabled: idx === 0
        }, '↑');

        const downBtn = el('button', {
          type: 'button',
          className: 'btn',
          onclick: () => {
            if (idx < events.length - 1) {
              [events[idx], events[idx + 1]] = [events[idx + 1], events[idx]];
              renderEvents();
            }
          },
          disabled: idx === events.length - 1
        }, '↓');

        const tr = el('tr', {}, [
          el('td', {}, timeInput),
          el('td', {}, durationInput),
          el('td', {}, typeSelect),
          el('td', {}, channelControl),
          el('td', {}, valueControl),
          el('td', {}, noNcControl),
          el('td', {style: 'display:flex;gap:4px'}, [upBtn, downBtn, deleteBtn])
        ]);

        tbody.append(tr);
      });
    }

    renderEvents();
    table.append(thead, tbody);

    const addBtn = el('button', {
      className: 'btn',
      onclick: () => {
        // Auto-populate time = last event's time + duration
        let newTime = 0;
        if (events.length > 0) {
          const lastEvt = events[events.length - 1];
          newTime = (lastEvt.time || 0) + (lastEvt.duration || 0);
        }
        
        events.push({
          time: newTime,
          duration: 0,
          type: 'DO',
          channel: 0,
          state: false,
          normallyOpen: true
        });
        renderEvents();
      }
    }, '+ Add Event');

    const sortBtn = el('button', {
      className: 'btn',
      onclick: () => {
        events.sort((a, b) => (a.time || 0) - (b.time || 0));
        renderEvents();
      },
      style: 'margin-left:8px'
    }, 'Sort by Time');

    const saveBtn = el('button', {
      className: 'btn',
      onclick: async () => {
        try {
          await fetch('/api/script', {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({events})
          });
          alert('Script saved successfully');
          loadScript(); // Reload for script player
        } catch (e) {
          alert('Save failed: ' + e.message);
        }
      },
      style: 'margin-left:8px'
    }, 'Save');

    root.append(
        title,
        el('div', {style: 'display:flex;gap:8px;margin:12px 0'}, [loadBtn, saveAsBtn]),
        el('div', {style: 'margin:12px 0'}, [
          el('p', {}, 'Define timed events for automated control. Time is in seconds from script start.'),
          el('p', {style: 'font-size:12px;color:var(--muted)'},
              'Duration: How long the output stays in this state (0 = instantaneous toggle)')
        ]),
        table,
        el('div', {style: 'margin-top:12px;display:flex;gap:8px'}, [addBtn, sortBtn, saveBtn])
    );

    showModal(root);
  }

/* ======================== EXPRESSION HELP ======================== */
function openExpressionHelp() {
  const root = el('div', {style: 'max-width:900px; max-height:80vh; overflow:auto;'});
  
  // Fetch help content from server
  fetch('/EXPRESSION_REFERENCE.md')
    .then(r => r.text())
    .then(markdown => {
      // Simple markdown rendering
      const lines = markdown.split('\n');
      let html = '';
      let inCodeBlock = false;
      let codeBlockContent = '';
      
      for (let line of lines) {
        // Code blocks
        if (line.startsWith('```')) {
          if (inCodeBlock) {
            html += `<pre style="background:#1a1d2e;padding:10px;border-radius:4px;overflow:auto;font-size:12px;"><code>${codeBlockContent}</code></pre>`;
            codeBlockContent = '';
          }
          inCodeBlock = !inCodeBlock;
          continue;
        }
        
        if (inCodeBlock) {
          codeBlockContent += line + '\n';
          continue;
        }
        
        // Headers
        if (line.startsWith('# ')) {
          html += `<h1 style="color:#7aa2f7;margin-top:20px;border-bottom:2px solid #2a3046;padding-bottom:10px;font-size:24px;">${line.slice(2)}</h1>`;
        } else if (line.startsWith('## ')) {
          html += `<h2 style="color:#7aa2f7;margin-top:15px;font-size:20px;">${line.slice(3)}</h2>`;
        } else if (line.startsWith('### ')) {
          html += `<h3 style="color:#9ece6a;margin-top:10px;font-size:16px;">${line.slice(4)}</h3>`;
        } else if (line.startsWith('---')) {
          html += '<hr style="border:none;border-top:1px solid #2a3046;margin:20px 0;">';
        } else if (line.startsWith('| ') && line.endsWith(' |')) {
          // Table row - simple rendering
          const cells = line.split('|').filter(c => c.trim()).map(c => c.trim());
          html += '<div style="display:flex;gap:10px;padding:4px;border-bottom:1px solid #2a3046;">';
          cells.forEach(cell => {
            html += `<div style="flex:1;font-family:monospace;font-size:12px;">${cell}</div>`;
          });
          html += '</div>';
        } else if (line.startsWith('- ')) {
          html += `<li style="margin-left:20px;margin-bottom:5px;">${line.slice(2)}</li>`;
        } else if (line.trim()) {
          // Inline code
          line = line.replace(/`([^`]+)`/g, '<code style="background:#1a1d2e;padding:2px 6px;border-radius:3px;font-family:monospace;font-size:12px;">$1</code>');
          // Bold
          line = line.replace(/\*\*([^*]+)\*\*/g, '<strong style="color:#e0af68;">$1</strong>');
          html += `<p style="margin:8px 0;line-height:1.6;">${line}</p>`;
        } else {
          html += '<br>';
        }
      }
      
      root.innerHTML = html;
    })
    .catch(err => {
      // Fallback help if file not found
      root.innerHTML = `
        <h2 style="color:#7aa2f7;font-size:20px;">Expression Language Quick Reference</h2>
        <h3 style="color:#9ece6a;margin-top:15px;">Signal References</h3>
        <pre style="background:#1a1d2e;padding:10px;border-radius:4px;font-size:12px;">
"AI:SignalName"    // Analog Input
"AO:SignalName"    // Analog Output  
"TC:SignalName"    // Thermocouple
"DO:SignalName"    // Digital Output
"PID:LoopName"     // PID Controller
"Math:OpName"      // Math Operator
"LE:ElementName"   // Logic Element
"Expr:ExprName"    // Other Expression
"Scale:ScaleName"  // Serial Scale (read-only)</pre>

        <h3 style="color:#9ece6a;margin-top:15px;">PID Properties</h3>
        <pre style="background:#1a1d2e;padding:10px;border-radius:4px;font-size:12px;">
"PID:Name".PV     // Process Variable
"PID:Name".SP     // Setpoint
"PID:Name".ERR    // Error
"PID:Name".OUT    // Output
"PID:Name".MIN    // Min clamp
"PID:Name".MAX    // Max clamp</pre>

        <h3 style="color:#9ece6a;margin-top:15px;">Operators & Control Flow</h3>
        <pre style="background:#1a1d2e;padding:10px;border-radius:4px;font-size:12px;">
Arithmetic: + - * / % ^
Comparison: == != < <= > >=
Boolean: AND OR NOT

IF condition THEN value
IF condition THEN value ELSE other

SWITCH subject       // branches on subject ==
  CASE v1            //   (no fall-through)
    stmt
  CASE v2
    stmt
  DEFAULT
    stmt
ENDSWITCH</pre>

        <h3 style="color:#9ece6a;margin-top:15px;">Variables</h3>
        <pre style="background:#1a1d2e;padding:10px;border-radius:4px;font-size:12px;">
x = value              // Local (reset each cycle)
static.x = value       // Persistent in expression
global.x = value       // Persistent across system</pre>

        <h3 style="color:#9ece6a;margin-top:15px;">Hardware Control</h3>
        <pre style="background:#1a1d2e;padding:10px;border-radius:4px;font-size:12px;">
"DO:Name" = 1          // Set digital output ON
"AO:Name" = 5.5        // Set analog output to 5.5V</pre>

        <h3 style="color:#9ece6a;margin-top:15px;">Common Functions</h3>
        <pre style="background:#1a1d2e;padding:10px;border-radius:4px;font-size:12px;">
ABS(x) SQRT(x) MIN(a,b) MAX(a,b) CLAMP(v,min,max)
SIN(x) COS(x) TAN(x) ASIN(x) ACOS(x) ATAN(x)
EXP(x) LOG(x) LOG10(x) POW(base,exp)</pre>

        <h3 style="color:#9ece6a;margin-top:15px;">Console Output</h3>
        <pre style="background:#1a1d2e;padding:10px;border-radius:4px;font-size:12px;">
print("Pressure %2.1f psi, valve=%d", static.pressure, buttonVars.valve)
// C-style printf to the SERVER console (not the browser).
// %f %.2f %d %x %% etc.  %s is not supported (values are numeric).
// Has no value — never affects the expression's output.</pre>

        <p style="margin-top:20px;color:#9094a1;"><em>For complete documentation with examples, ensure EXPRESSION_REFERENCE.md is in the web directory.</em></p>
      `;
    });
  
  showModal(root);
}

function openExpressionDebug(widget) {
  const idx = widget.opts.exprIndex ?? 0;
  
  // Fetch expression config from server
  fetch('/api/expressions')
    .then(r => r.json())
    .then(data => {
      const expr = data.expressions?.[idx];
      
      if (!expr) {
        alert(`Expression ${idx} not found`);
        return;
      }
      
      const source = expr.expression || expr.source || expr.text || '';
      
      // Create modal content
      const root = el('div', {
        style: 'display:flex;flex-direction:column;gap:15px;max-width:95vw;max-height:85vh;'
      });
      
      // Title
      root.append(el('h2', {
        style: 'color:#7aa2f7;margin:0;font-size:20px;'
      }, `🔍 Debug: ${expr.name || `Expression ${idx}`} (Live)`));
      
      // Expression source with live values
      const sourceDiv = el('div', {
        style: 'background:#1a1d2e;padding:15px;border-radius:6px;overflow:auto;font-family:Consolas,Monaco,monospace;font-size:13px;line-height:1.6;white-space:pre;min-height:200px;max-height:60vh;'
      });
      
      root.append(sourceDiv);
      
      // Output section
      const outputDiv = el('div', {
        style: 'background:#2a3046;padding:12px;border-radius:6px;display:flex;align-items:center;gap:10px;'
      });
      root.append(outputDiv);
      
      // Local variables table
      const localsDiv = el('div', {
        style: 'background:#1a1d2e;padding:12px;border-radius:6px;max-height:200px;overflow:auto;'
      });
      root.append(localsDiv);
      
      // Static variables table
      const staticsDiv = el('div', {
        style: 'background:#1a1d2e;padding:12px;border-radius:6px;max-height:200px;overflow:auto;'
      });
      root.append(staticsDiv);
      
      // Update function that runs continuously
      let updateInterval = null;
      
      function updateDebugView() {
        const exprData = state.expr?.[idx];
        if (!exprData) {
          sourceDiv.innerHTML = '<span style="color:#d84a4a;">No live data available</span>';
          return;
        }
        
        const locals = exprData.locals || {};
        const staticVars = exprData.static || {};
        const executedLines = new Set(exprData.executed_lines || []);
        
        // Update source code with annotations
        if (!source) {
          sourceDiv.innerHTML = '<span style="color:#d84a4a;">No live data available</span>';
        } else {
          const lines = source.split('\n');
          let annotated = '';
          
          // Track block stack for nested IFs: [{type: 'then'/'else', line: N}, ...]
          let blockStack = [];
          
          for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
            let line = lines[lineIdx];
            let displayLine = line;
            const trimmed = line.trim().toUpperCase();
            
            // Track block context with a stack
            if (trimmed.startsWith('IF ')) {
              // Check if THEN is on the same line
              const hasThen = trimmed.includes(' THEN');
              if (lineIdx < 25) console.log(`[BlockStack] Line ${lineIdx}: IF detected, hasThen=${hasThen}, trimmed="${trimmed.substring(0, 80)}"`);
              if (hasThen) {
                // Inline IF...THEN - push THEN directly
                blockStack.push({type: 'then', line: lineIdx});
              } else {
                // Separate IF line - push IF marker
                blockStack.push({type: 'if', line: lineIdx});
              }
            } else if (trimmed === 'THEN' || trimmed.startsWith('THEN ')) {
              // Standalone THEN - pop IF, push THEN
              if (blockStack.length > 0 && blockStack[blockStack.length - 1].type === 'if') {
                blockStack.pop();
              }
              blockStack.push({type: 'then', line: lineIdx});
            } else if (trimmed === 'ELSE' || trimmed.startsWith('ELSE IF ')) {
              // Check if THEN is on the same line as ELSE IF
              if (trimmed.startsWith('ELSE IF ') && trimmed.includes(' THEN')) {
                // ELSE IF...THEN inline - pop THEN/IF, push ELSE, push new THEN
                if (blockStack.length > 0) {
                  const top = blockStack[blockStack.length - 1];
                  if (top.type === 'then' || top.type === 'if') {
                    blockStack.pop();
                  }
                }
                blockStack.push({type: 'else', line: lineIdx});
                blockStack.push({type: 'then', line: lineIdx});
              } else {
                // Regular ELSE or ELSE IF without inline THEN
                if (blockStack.length > 0) {
                  const top = blockStack[blockStack.length - 1];
                  if (top.type === 'then' || top.type === 'if') {
                    blockStack.pop();
                  }
                }
                blockStack.push({type: 'else', line: lineIdx});
              }
            } else if (trimmed === 'ENDIF') {
              // Pop the innermost THEN/ELSE block
              if (blockStack.length > 0) {
                const top = blockStack[blockStack.length - 1];
                if (top.type === 'then' || top.type === 'else') {
                  blockStack.pop();
                }
              }
            }
            
            // Determine color based on innermost non-IF block
            let currentBlock = null;
            for (let i = blockStack.length - 1; i >= 0; i--) {
              if (blockStack[i].type === 'then' || blockStack[i].type === 'else') {
                currentBlock = blockStack[i].type;
                break;
              }
            }
            
            // Check if this line executed AND is in a branch
            const lineExecuted = executedLines.has(lineIdx);
            const isInBranch = currentBlock !== null && 
                              !trimmed.startsWith('IF ') && 
                              trimmed !== 'THEN' && !trimmed.startsWith('THEN ') &&
                              trimmed !== 'ELSE' && !trimmed.startsWith('ELSE IF ') && !trimmed.startsWith('ELSE ') &&
                              trimmed !== 'ENDIF';
            
            // Debug logging for assignment lines
            if (line.match(/^\s*\w+\s*=/) || line.match(/^\s*static\.\w+\s*=/)) {
              console.log(`[ExprDebug] Line ${lineIdx}: "${line.trim()}" - executed=${lineExecuted}, isInBranch=${isInBranch}, currentBlock=${currentBlock}, blockStack=[${blockStack.map(b => b.type).join(',')}]`);
            }
            
            // Color the line if it executed and is in a branch
            if (lineExecuted && isInBranch) {
              const lineColor = currentBlock === 'then' ? '#2faa60' : '#d84a4a';
              displayLine = `<span style="color:${lineColor};">${line}</span>`;
            }
            
            // Add value annotations
            const assignMatch = line.match(/^\s*(\w+)\s*=\s*(.+?)(?:\/\/.*)?$/);
            const staticMatch = line.match(/^\s*static\.(\w+)\s*=\s*(.+?)(?:\/\/.*)?$/);
            
            if (staticMatch) {
              const varName = staticMatch[1];
              const value = staticVars[varName];
              if (value !== undefined) {
                const valueStr = typeof value === 'number' ? value.toFixed(4) : String(value);
                const color = getValueColor(value);
                if (lineExecuted && isInBranch) {
                  displayLine = displayLine.replace('</span>', ` <span style="color:${color};background:#2a3046;padding:1px 6px;border-radius:3px;font-size:11px;">{${valueStr}}</span></span>`);
                } else {
                  displayLine = displayLine.replace(new RegExp(`^(\\s*static\\.${varName})\\s*=`), 
                    `$1 <span style="color:${color};background:#2a3046;padding:1px 6px;border-radius:3px;font-size:11px;">{${valueStr}}</span> =`);
                }
              }
            } else if (assignMatch) {
              const varName = assignMatch[1];
              const value = locals[varName];
              if (value !== undefined) {
                const valueStr = typeof value === 'number' ? value.toFixed(4) : String(value);
                const color = getValueColor(value);
                if (lineExecuted && isInBranch) {
                  displayLine = displayLine.replace('</span>', ` <span style="color:${color};background:#2a3046;padding:1px 6px;border-radius:3px;font-size:11px;">{${valueStr}}</span></span>`);
                } else {
                  displayLine = displayLine.replace(new RegExp(`^(\\s*${varName})\\s*=`), 
                    `$1 <span style="color:${color};background:#2a3046;padding:1px 6px;border-radius:3px;font-size:11px;">{${valueStr}}</span> =`);
                }
              }
            } else {
              // Add variable reference annotations for non-assignment lines
              for (const [varName, value] of Object.entries(locals)) {
                const regex = new RegExp(`\\b${varName}\\b(?![:{])`, 'g');
                if (regex.test(line)) {
                  const valueStr = typeof value === 'number' ? value.toFixed(4) : String(value);
                  const color = getValueColor(value);
                  displayLine = displayLine.replace(regex, `${varName}<span style="color:${color};background:#2a3046;padding:1px 6px;border-radius:3px;font-size:11px;margin-left:4px;">{${valueStr}}</span>`);
                }
              }
            }
            
            annotated += displayLine + '\n';
          }
          
          sourceDiv.innerHTML = annotated;
        }
        
        // Update output
        const output = exprData.output !== undefined ? exprData.output : 0;
        const outputColor = getValueColor(output);
        outputDiv.innerHTML = `
          <span style="font-size:14px;color:#9aa1b9;">► Output:</span>
          <span style="font-size:16px;font-weight:bold;color:${outputColor};">${typeof output === 'number' ? output.toFixed(4) : String(output)}</span>
        `;
        
        // Update locals table
        const localEntries = Object.entries(locals);
        if (localEntries.length > 0) {
          localsDiv.innerHTML = `
            <div style="font-size:12px;color:#7aa2f7;margin-bottom:8px;font-weight:bold;">Local Variables:</div>
            <table style="width:100%;font-size:11px;font-family:Consolas,Monaco,monospace;">
              ${localEntries.map(([name, val]) => {
                const valStr = typeof val === 'number' ? val.toFixed(4) : String(val);
                const color = getValueColor(val);
                return `<tr>
                  <td style="color:#9aa1b9;padding:2px 8px 2px 0;">${name}</td>
                  <td style="color:${color};padding:2px 0;text-align:right;">${valStr}</td>
                </tr>`;
              }).join('')}
            </table>
          `;
        } else {
          localsDiv.innerHTML = '<div style="font-size:12px;color:#666;">No local variables</div>';
        }
        
        // Update statics table
        const staticEntries = Object.entries(staticVars);
        if (staticEntries.length > 0) {
          staticsDiv.innerHTML = `
            <div style="font-size:12px;color:#7aa2f7;margin-bottom:8px;font-weight:bold;">Static Variables:</div>
            <table style="width:100%;font-size:11px;font-family:Consolas,Monaco,monospace;">
              ${staticEntries.map(([name, val]) => {
                const valStr = typeof val === 'number' ? val.toFixed(4) : String(val);
                const color = getValueColor(val);
                return `<tr>
                  <td style="color:#9aa1b9;padding:2px 8px 2px 0;">static.${name}</td>
                  <td style="color:${color};padding:2px 0;text-align:right;">${valStr}</td>
                </tr>`;
              }).join('')}
            </table>
          `;
        } else {
          staticsDiv.innerHTML = '<div style="font-size:12px;color:#666;">No static variables</div>';
        }
      }
      
      // Initial update
      updateDebugView();
      
      // Update every 100ms for live values
      updateInterval = setInterval(updateDebugView, 100);
      
      // Show modal with cleanup on close
      showModal(root, () => {
        if (updateInterval) {
          clearInterval(updateInterval);
          updateInterval = null;
        }
      });
    })
    .catch(err => {
      console.error('[ExprDebug] Error:', err);
      alert('Failed to load expression: ' + err.message);
    });
}

/* ----------------------------- Expression Editor -------------------------------- */
/* ----------------------------- Expression Editor -------------------------------- */
async function openExpressionEditor() {
  let expressions = [];
  
  // Load expressions from server
  try {
    const resp = await fetch('/api/expressions');
    const data = await resp.json();
    expressions = data.expressions || [];
  } catch (e) {
    console.error('Failed to load expressions:', e);
  }
  
  const root = el('div', {});
  const title = el('h2', {}, 'Expression Editor');
  
  // ADD: Load button at top
  const topButtons = el('div', {style: 'display:flex; gap:8px; margin-bottom:12px;'});
  const loadBtn = el('button', {
    className: 'btn',
    onclick: () => {
      const inp = el('input', {type: 'file', accept: '.json'});
      inp.onchange = async () => {
        const f = inp.files?.[0];
        if (!f) return;
        try {
          const text = await f.text();
          const loaded = JSON.parse(text);
          expressions = loaded.expressions || [];
          renderList();
          if (expressions.length > 0) {
            selectExpression(expressions[0]);
          }
          alert(`Loaded ${expressions.length} expressions from ${f.name}`);
        } catch(e) {
          alert('Failed to load: ' + e.message);
        }
      };
      inp.click();
    }
  }, '📁 Load from File');
  topButtons.append(loadBtn);
  
  const container = el('div', {style: 'display:flex; gap:20px; height:60vh;'});
  
  // Left panel: Expression list
  const listPanel = el('div', {style: 'flex:1; display:flex; flex-direction:column; gap:10px; overflow:auto;'});
  
  // Right panel: Editor
  const editorPanel = el('div', {style: 'flex:2; display:flex; flex-direction:column; gap:10px;'});
  
  let selectedExpr = null;
  
  function renderList() {
    listPanel.innerHTML = '';
    
    const addBtn = el('button', {
      className: 'btn',
      onclick: () => {
        const name = prompt('Expression name:');
        if (!name) return;
        expressions.push({
          name: name,
          enabled: true,
          expression: '// Write your expression here\n0',
          execution_rate_hz: null  // ADD: Initialize new field
        });
        renderList();
        selectExpression(expressions[expressions.length - 1]);
      }
    }, '+ Add Expression');
    
    listPanel.append(addBtn);
    
    expressions.forEach((expr, idx) => {
      const card = el('div', {
        style: `padding:10px; border:1px solid ${selectedExpr === expr ? '#4a9eff' : '#2a3046'}; border-radius:6px; cursor:pointer; background:${selectedExpr === expr ? '#1a2030' : 'transparent'}`,
        onclick: () => selectExpression(expr)
      });
      
      const title = el('div', {style: 'font-weight:bold; margin-bottom:5px;'}, expr.name);
      
      // ADD: Show execution rate if set
      const rateText = expr.execution_rate_hz ? ` @ ${expr.execution_rate_hz}Hz` : '';
      const status = el('div', {style: `font-size:12px; color:${expr.enabled ? '#4a9eff' : '#666'}`}, 
        (expr.enabled ? '✓ Enabled' : '✗ Disabled') + rateText);
      
      card.append(title, status);
      listPanel.append(card);
    });
  }
  
  function selectExpression(expr) {
    selectedExpr = expr;
    renderList();
    renderEditor();
  }
  
  function renderEditor() {
    editorPanel.innerHTML = '';
    
    if (!selectedExpr) {
      editorPanel.append(el('div', {style: 'color:#666; text-align:center; margin-top:50px;'}, 
        'Select an expression to edit'));
      return;
    }
    
    // Expression name and enabled
    const topRow = el('div', {className: 'row', style: 'margin-bottom:10px;'});
    topRow.append(
      el('label', {style: 'flex:1'}, [
        'Name: ',
        el('input', {
          type: 'text',
          value: selectedExpr.name,
          oninput: e => {
            selectedExpr.name = e.target.value;
            renderList();  // Update list when name changes
          },
          style: 'width:100%;'
        })
      ]),
      el('label', {}, [
        el('input', {
          type: 'checkbox',
          checked: selectedExpr.enabled,
          onchange: e => {
            selectedExpr.enabled = e.target.checked;
            renderList();  // Update list when enabled changes
          }
        }),
        ' Enabled'
      ])
    );
    editorPanel.append(topRow);
    
    // ADD: Execution rate row (small, unobtrusive)
    const rateRow = el('div', {style: 'margin-bottom:10px; display:flex; align-items:center; gap:8px;'});
    rateRow.append(
      el('label', {style: 'font-size:12px; color:#8b949e;'}, 'Execution Rate:'),
      el('input', {
        type: 'number',
        min: '0',
        step: '1',
        placeholder: 'Hz (empty = sample rate)',
        value: selectedExpr.execution_rate_hz || '',
        oninput: e => {
          const val = parseFloat(e.target.value);
          selectedExpr.execution_rate_hz = (val > 0) ? val : null;
          renderList();
        },
        style: 'width:100px; padding:4px; font-size:12px;'
      }),
      el('span', {style: 'font-size:11px; color:#666;'}, 'Hz')
    );
    editorPanel.append(rateRow);
    
    // Expression textarea - KEEP ORIGINAL STYLING
    const textareaLabel = el('div', {style: 'font-weight:bold; margin-bottom:5px;'}, 'Expression:');
    const textarea = el('textarea', {
      value: selectedExpr.expression || '',
      oninput: e => selectedExpr.expression = e.target.value,
      style: 'width:100%; height:450px; font-family:monospace; font-size:14px; background:#0d1117; color:#c9d1d9; border:1px solid #2a3046; border-radius:6px; padding:10px;'
    });
    
    editorPanel.append(textareaLabel, textarea);
    
    // Syntax check button and result - KEEP ORIGINAL GREEN/RED STYLING
    const syntaxRow = el('div', {style: 'display:flex; gap:10px; align-items:center;'});
    const syntaxResult = el('div', {style: 'flex:1; padding:10px; border-radius:6px; font-size:14px; font-family:monospace;'});
    
    const checkBtn = el('button', {
      className: 'btn',
      onclick: async () => {
        try {
          const resp = await fetch('/api/expressions/check', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({expression: selectedExpr.expression})
          });
          const result = await resp.json();
          
          if (result.ok) {
            // GREEN for success
            syntaxResult.style.background = '#1a3a1a';
            syntaxResult.style.color = '#4a9';
            let message = `✓ Syntax OK - Result: ${result.result.toFixed(4)}`;
            
            if (result.locals && Object.keys(result.locals).length > 0) {
              message += `\nLocal vars: ${JSON.stringify(result.locals, null, 2)}`;
            }
            
            // Display warnings if any
            if (result.warnings && result.warnings.length > 0) {
              message += '\n\n⚠️ WARNINGS:\n';
              result.warnings.forEach(w => {
                message += `  ${w.message}\n`;
              });
            }
            
            syntaxResult.textContent = message;
          } else {
            // RED for error with X
            syntaxResult.style.background = '#3a1a1a';
            syntaxResult.style.color = '#f88';
            syntaxResult.textContent = `✗ Error: ${result.error}`;
          }
        } catch (e) {
          syntaxResult.style.background = '#3a1a1a';
          syntaxResult.style.color = '#f88';
          syntaxResult.textContent = `✗ Failed to check: ${e.message}`;
        }
      }
    }, '🔍 Check Syntax');
    
    syntaxRow.append(checkBtn, syntaxResult);
    editorPanel.append(syntaxRow);
    
    // Delete button
    const deleteBtn = el('button', {
      className: 'btn danger',
      onclick: () => {
        if (confirm(`Delete expression "${selectedExpr.name}"?`)) {
          const idx = expressions.indexOf(selectedExpr);
          expressions.splice(idx, 1);
          selectedExpr = null;
          renderList();
          renderEditor();
        }
      }
    }, '🗑 Delete');
    
    editorPanel.append(deleteBtn);
    

  }
  
  container.append(listPanel, editorPanel);
  
  // Global variables viewer
  const globalsSection = el('div', {style: 'margin-top:20px; padding:15px; background:#1a2030; border-radius:6px;'});
  const globalsTitle = el('div', {style: 'font-weight:bold; margin-bottom:10px;'}, 'Global Variables (static.*)');
  const globalsTable = el('table', {className: 'form', style: 'width:100%;'});
  
  async function refreshGlobals() {
    try {
      const resp = await fetch('/api/expressions/globals');
      const data = await resp.json();
      
      globalsTable.innerHTML = '';
      const thead = el('thead');
      thead.append(el('tr', {}, [
        el('th', {}, 'Name'),
        el('th', {}, 'Value'),
        el('th', {}, 'Actions')
      ]));
      globalsTable.append(thead);
      
      const tbody = el('tbody');
      const globals = data.globals || {};
      
      if (Object.keys(globals).length === 0) {
        tbody.append(el('tr', {}, [
          el('td', {colspan: 3, style: 'text-align:center; color:#666;'}, 'No global variables yet')
        ]));
      } else {
        Object.entries(globals)
          .sort((a, b) => a[0].toLowerCase().localeCompare(b[0].toLowerCase()))
          .forEach(([name, value]) => {
          const tr = el('tr', {}, [
            el('td', {}, `static.${name}`),
            el('td', {}, value.toFixed(4)),
            el('td', {}, el('button', {
              className: 'btn danger',
              onclick: async () => {
                if (confirm(`Delete static.${name}?`)) {
                  await fetch('/api/expressions/globals', {
                    method: 'DELETE',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({name: name})
                  });
                  refreshGlobals();
                }
              }
            }, '×'))
          ]);
          tbody.append(tr);
        });
      }
      
      globalsTable.append(tbody);
    } catch (e) {
      console.error('Failed to load globals:', e);
    }
  }
  
  const clearGlobalsBtn = el('button', {
    className: 'btn danger',
    onclick: async () => {
      if (confirm('Clear ALL global variables?')) {
        await fetch('/api/expressions/globals/clear', {method: 'POST'});
        refreshGlobals();
      }
    },
    style: 'margin-top:10px;'
  }, 'Clear All Globals');
  
  globalsSection.append(globalsTitle, globalsTable, clearGlobalsBtn);
  
  // Initial render
  renderList();
  renderEditor();
  refreshGlobals();
  
  // Save and Save As buttons
  const saveButtons = el('div', {style: 'display:flex; gap:8px; margin-top:20px;'});
  
  const saveBtn = el('button', {
    className: 'btn',
    onclick: async () => {
      try {
        const resp = await fetch('/api/expressions', {
          method: 'PUT',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({expressions: expressions})
        });
        const result = await resp.json();
        if (result.ok) {
          alert('Expressions saved!');
          showVersions();   // compile bumped DLL_VERSION -> refresh the "Expr N" strip
        } else {
          alert('Failed to save: ' + result.error);
        }
      } catch (e) {
        alert('Failed to save: ' + e.message);
      }
    }
  }, '💾 Save');
  
  const saveAsBtn = el('button', {
    className: 'btn',
    onclick: () => {
      // Create JSON data
      const data = JSON.stringify({expressions: expressions}, null, 2);
      const blob = new Blob([data], {type: 'application/json'});
      const url = URL.createObjectURL(blob);
      
      // Trigger download - Firefox will show native "Save As" dialog
      const a = document.createElement('a');
      a.href = url;
      a.download = 'expressions.json';  // Default filename
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      URL.revokeObjectURL(url);
    }
  }, '💾 Save As...');
  
  saveButtons.append(saveBtn, saveAsBtn);
  
  root.append(title, topButtons, container, globalsSection, saveButtons);
  showModal(root);
}


/* ----------------------------- form bits -------------------------------- */
function fieldset(title, inner) {
  const fs = el('fieldset', {});
  fs.append(el('legend', {}, title), inner);
  return fs;
}
