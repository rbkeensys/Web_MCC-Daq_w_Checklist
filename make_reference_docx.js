const G = "C:\\Users\\russ\\AppData\\Roaming\\npm\\node_modules\\docx";
const fs = require("fs");
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
        AlignmentType, LevelFormat, HeadingLevel, BorderStyle, WidthType, ShadingType,
        TableOfContents, PageNumber, Header, Footer, PageBreak } = require(G);

const CW = 9360; // content width, US Letter, 1" margins
const mono = (t) => new TextRun({ text: t, font: "Consolas", size: 19 });
const P = (t, o={}) => new Paragraph({ spacing:{after:120}, children: Array.isArray(t)?t:[new TextRun({text:t})], ...o });
const H1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, children:[new TextRun(t)] });
const H2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, children:[new TextRun(t)] });
const H3 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_3, children:[new TextRun(t)] });
const EQ = (t) => new Paragraph({ spacing:{after:60}, indent:{left:360}, children:[mono(t)] });
const BUL = (t) => new Paragraph({ numbering:{reference:"b",level:0}, spacing:{after:40},
   children: Array.isArray(t)?t:[new TextRun({text:t})] });
const b = (t)=> new TextRun({text:t, bold:true});
const code = (t)=> new TextRun({text:t, font:"Consolas", size:19});

const border = { style: BorderStyle.SINGLE, size: 1, color: "BBBBBB" };
const borders = { top:border, bottom:border, left:border, right:border };
function cell(text, w, head=false, mono=false){
  return new TableCell({ borders, width:{size:w,type:WidthType.DXA},
    shading: head?{fill:"D5E8F0",type:ShadingType.CLEAR}:undefined,
    margins:{top:50,bottom:50,left:110,right:110},
    children:[ new Paragraph({ children: (Array.isArray(text)?text:[ new TextRun({text:String(text),
        bold:head, font: mono?"Consolas":"Arial", size: mono?18:20 }) ]) }) ] });
}
// table from rows (array of arrays). widths sum to CW.
function tbl(widths, header, rows, monoCol0=true){
  const trs = [ new TableRow({ tableHeader:true, children: header.map((h,i)=>cell(h,widths[i],true)) }) ];
  for(const r of rows){ trs.push(new TableRow({ children: r.map((c,i)=>cell(c,widths[i],false, monoCol0 && i===0)) })); }
  return new Table({ width:{size:CW,type:WidthType.DXA}, columnWidths:widths, rows:trs });
}

// ---- variable tables data ----
const W5 = [1900,900,2660,900,3000]; // name, default, range, units, meaning  (sum 9360)
function vrow(n,def,rng,mean){ return [n,def,rng,mean]; }
const W4 = [2000,1000,2500,3860];

const setpoints = [
 ["runSystem","0","0 / 1","Master run (RUN button). 0 = everything idle."],
 ["productionSet","0.12","0.02 - 0.24 L/min","PRIMARY KNOB: target distillate rate. Blower + feed chase it. Out-of-range ignored."],
 ["evapTempSet","100","95 - 105 C","Evaporator boiling setpoint (makeup-PI target)."],
 ["superheatSet","3","1 - 8 C","Vapor superheat setpoint (superheat-PI target)."],
 ["blowerRpmSet","1500","800 - 4000","Blower rpm. Auto when autoBlow=1, else manual."],
 ["feedRpmSet","60","0 - 300","Feed pump rpm. Auto when autoFeed=1, else manual."],
 ["evapLevelSet","2475","500 - 3500 ml","Operating level the feed holds (= evapMidMark, the 2350|2600 plateau edge, ~2.5 L). Lowered from 3025: thermal expansion (~4% cold->boiling) + wobble took the 3/4 fill over the top on the rig."],
 ["autoBlow / autoFeed","1 / 1","0 / 1","Enable the blower / feed closed loops."],
 ["emptySystem / shutdown","buttons","0 / 1","Button widgets (Variable mode): reverse-pump the system dry WITHOUT a run -- to sender bottom + purgeExtraML (emptyMaxML backstop). Heaters are already forced off with Run off, so shutdown = verified-heaters-off + pump-out. IGNORED while running (turn Run off first); toggle off to re-arm."],
];
const safety = [
 ["prodSetMax","0.3","L/min","productionSet rejected above this (or below 0); last valid kept (prodSetSafe)."],
 ["superheatSetMax","10","C","superheatSet upper bound (-> superheatSetSafe)."],
 ["evapTempSetMin/Max","90 / 110","C","evapTempSet window (over-pressure guard) (-> evapTempSetSafe)."],
 ["blowerMaxRpm","4000","rpm","Blower clamp (overspeed allowed) (-> blowerRpmSafe)."],
 ["feedRpmMax","300","rpm","Feed-pump clamp (-> feedRpmSafe)."],
 ["makeupHtrMax","140","C","Makeup-cartridge TC over-temp HARD trip (backstop). SOFT fold-back first: above makeupHtrSoft (115) the duty scales down over makeupHtrFoldBand (15), never below makeupHtrMinDuty (0.12). Latched."],
 ["superHtrMax","250","C","Superheat-cartridge TC over-temp TRIP -- hard backstop above the 200C element regulation (the cartridge runs HOT by design in thin vapor). Latched."],
 ["superHtrRegC / kpShElem","200 / 0.05","C / duty/C","SH ELEMENT-TEMP REGULATION: duty capped so the cartridge holds ~200C until real vapor flow carries the heat away (poor coupling into thin vapor); then the superheat PI takes over. Full duty 20C below target."],
 ["maxEvapPress / maxSteamPress","25 / 35","psia","Over-pressure trips."],
 ["maxVaporOut","140","C","Vapor-out over-temp trip."],
 ["minSuperheat / superHFaultS","0.5 / 20","C / s","Wet-compression (low-superheat) trip. Fires/arms only at REAL speed (target*0.9 AND >= blowerMinRpm) AND with the evaporator at temp (>= set-5); DISARMS whenever the blower leaves at-speed (restart ramps legitimately collapse superheat); superheat must sit below the floor for superHFaultS CONTINUOUSLY (swings dip briefly, wet compression persists). Latched."],
 ["evapHighMark","2750","ml","HIGH-LEVEL WARNING (2600|2900 plateau edge, trips on the 2900 plateau; E-TC DIN float ORed in): latched UI popup + FeedFollow cuts the feed. NOT during PURGE -- an overfull warm start reads HIGH while the purge is draining it. Not a hard trip."],
 ["senderFaultS / senderErr","2 / latch","s","Level-sender open/short (V outside -0.3..3.3) while running, debounced -> LATCHED trip + popup (a dead sender mid-run would read 'all dry' and slow-flood). Clears on stop."],
 ["purgeStallS / purgeErr","240 / latch","s","PURGE watchdog: level must keep dropping while purging with a good sender (disarmed once bottom is reached). Stall = pump/direction fault -> LATCHED trip + popup."],
 ["Flood trip","AND gate","-","DemisterFlood counts only when DemisterWater is ALSO wet: flood physically sits above the demist sensor, so a real flood always has both; fog/condensation films the flood sensor alone (false-tripped on the rig)."],
];
const ctrl = [
 ["kpMakeup / kiMakeup","0.05 / 0.01","-","Makeup-heater PI gains."],
 ["kpSuper / kiSuper","0.05 / 0.01","-","Superheat-heater PI gains."],
 ["kProd","20","rpm/(L/min.s)","Blower production-control gain. Anti-windup: the target is not raised while the soft-start/ramped command still lags it."],
 ["kFeedLevel / kFeedLevelI","0.015 / 0.0015","(L/min)/ml, (L/min)/s","Feed level P gain (active OUTSIDE the deadband: fill + upset recovery) / slow edge-ride integral (INSIDE the deadband; the tight hold)."],
 ["levelDeadML","100","ml","P deadband around the setpoint: P silent inside (the EvapMid edge integral rules), active outside."],
 ["senderSpanML / kLevelBias","200 / 0.0003","ml / (L/min)/ml","Fusion window half-width (estimate clamped to plateau center +/- this; no teaching) / rate-bias learning gain (only plateau-CHANGE midpoint snaps teach)."],
 ["blowdownFrac","0 (disabled)","-","Concentrate blowdown DISABLED -- no blowdown valve fitted, so feed exactly matches distillate. Dissolved solids concentrate over a run; drain/flush the evaporator periodically (manual blowdown). Set >0 only with a real bleed/drain."],
 ["prodPerRpm","0.00007","(L/min)/rpm","Blower->production estimate (feedInvEst while venting). Calibrate."],
 ["surgeThresh / surgeGain","1.0 / 5.0","C / (V/C)","Anti-surge bypass: opens below this dT, this many V/C."],
 ["condLevelThresh","2.5","V/units","AI:CondLevel above this = tube ~3/4 full -> start the condensate pump (the point sensor trip)."],
 ["condUseTotalizer","1","0/1","Distillate measurement: 1 = exact cumulative pulse totalizer (CTR:CondTotal, count/K); 0 = integrate the windowed rate."],
 ["condEmptyFlow","0.25","L/min","Pump-outlet flow below this = tube DRY. Set between the ~0 dry reading and the condensate-pump rate (0.5)."],
 ["condEmptyDebounce","2.5","s","Dry must persist this long before the pump stops. Keep >= 2x counter_window_s (the meter's rate window)."],
 ["condBatchMaxML","450","ml","Stop the pump if a single metered batch exceeds this (backstop for a meter that keeps counting on air)."],
 ["condPumpMinRun / condPumpMaxRun","1 / 120","s","Min run before dry-detect is armed / hard time cap (sets condPumpFault) if it never goes dry."],
 ["condLiquidTemp","98","C","Condensate outlet below this = LIQUID (count meter, sim collects condensate). Not the vent anymore."],
 ["ventOpenTemp / ventCloseTemp","92 / 95","C","Startup air-purge vent: OPEN below / CLOSE above this blower-out vapor temp (yVaporOut). Lowered from 98/101 -- the rig never reached 101 at the vent TC, so it sat open bleeding steam. Once closed it LATCHES closed for the rest of the run (ventDone): the air purge is once-per-run; a mid-run upset cooling yVaporOut must not re-open it. ProductionControl does not integrate while the vent is open (production is being vented -- the meter can't see it)."],
 ["DemisterWater / DemisterFlood / CondLevel","wet-dry","0-5V","ALL WET/DRY point sensors (0=dry, 5V=wet), like the Evap sensors. Muxed to 0/1 (real: AI > 2.5V). Mist = water at the demister; Flood = overflow above it; CondLevel = condensate at the tube sensor (~3/4 up)."],
 ["demisterDrainRunS / demisterPumpMlMin","12 / 500","s / ml/min","Demister drain peristaltic pump: ON when DemisterWater wet, runs at least demisterDrainRunS to clear below the sensor (single wet/dry threshold + min-run = no chatter), then off when dry. (sim trip/flood levels demisterTripML 80 / demisterFloodML 150 cc set where the sim sensors go wet.)"],
 ["sysMs","(server)","ms","System monotonic clock, stamped by the server each tick BEFORE evaluate. Read it for any interval math (now - startMs)."],
 ["dtReal","~timeIncSec","s","REAL elapsed time since the last tick = (sysMs - lastTickMs)/1000, guarded. ALL expression timing (PI integrals, condensate timers, sim dt) uses this, not timeIncSec."],
 ["timeIncSec","0.00625","s","Nominal tick period -- now only the FALLBACK for dtReal on the first ticks / a scheduling hiccup."],
];
const startup = [
 ["mvrPhase","0","0=IDLE 1=PURGE 2=PRIME 3=HEAT 4=RUN","Startup state machine."],
 ["feedLPerStep","8.96861e-8","L/step","FEED PUMP CAL: L per motor step (200mL/223rev/10000steps)."],
 ["feedStepsPerRev","10000","steps/rev","Match driver microstep Pr0.00. L/min = rpm x steps x LPerStep."],
 ["feedPrimeML","750","ml","PRIME fills to this (= EvapLow mark, heater covered) + confirms wet, THEN heats. Feed ramps to the operating level during warm-up."],
 ["feedPrimeRpm","250","rpm","Feed rpm during the PRIME fill (~224 mL/min)."],
 ["purgeRevRpm","400","rpm","PURGE / EMPTY / SHUTDOWN: feed-pump REVERSE rpm (~359 mL/min)."],
 ["purgeWarmEn","1","0 / 1","WARM-START purge: sender shows water at run start -> pump down until the level has dropped AT LEAST ONE plateau (the drop-edge crossing snaps/calibrates the estimate) AND reads at/below the operating mark (an overfull-shutdown restart keeps pumping down to the mark -- coming from above, the last crossing IS the 2475 edge). Then PRIME/HEAT continue from that calibrated level -- no purge-to-dry + refill. 0 = always full purge."],
 ["purgeExtraML","200","ml","FULL purge only: after the sender reads BOTTOM (plateau 0), keep reverse-pumping this much more (dead-reckoned) -- water below the float pickup is still in there."],
 ["purgeMaxML","2000","ml","FULL-purge backstop: blind reverse-pump cap, used only if the level sender is faulted (normally the purge stops at bottom + purgeExtraML, or at the mark on a warm start)."],
 ["emptyMaxML","4000","ml","EMPTY/SHUTDOWN drain backstop: must exceed a FULL operating charge (~2.5 L) + purgeExtraML. (purgeMaxML is sized for the startup residual and would cut a full-charge drain short.)"],
 ["yFeedEmpty / purgeEmptyML","sensor / 50","- / ml","Input level detector = empty (real sensor; sim: evaporator inventory below purgeEmptyML). Monitoring only."],
 ["evapLowMark","750","ml","LOW mark (587|850 plateau edge, physical ~720): heater-covered floor + PRIME wet-confirm. Heater covered ~550ml (simHtrCoverML)."],
 ["evapMidMark","2475","ml","OPERATING mark (2350|2600 plateau edge, ~2.5 L) = evapLevelSet. The feed holds the level here (deadband P + edge integral, 2.2a)."],
 ["Tank-gauge sender (AI6 EvapLevel)","cal table","V -> ml","33-240ohm arm-float sender + 550ohm (4x2.2k parallel) pullup to REGULATED 12V. AI6 slope -1.0 / offset 3.68 (KEEP: the cal is in these scaled volts; dry=0V, full ~3.0V, uh-oh-full 3600ml). Level-vs-ohms is strongly NONLINEAR (arm swing + tank geometry), so the decode is the MEASURED 14-plateau table (MVR Level Cal.csv) mapping scaled V -> plateau-center ml. Valid range -0.3..3.3V; outside (open wire = negative, short = 3.68) -> all switches DRY, no heat (+ senderErr trip mid-run). Level switches derive from the decoded plateau: low 750, mid/operating 2475, high-warn 2750. feedInvEst FUSED: dead-reckon + plateau-change midpoint snaps (teach the rate-bias) + span window (+/-senderSpanML, no teaching). HARDWARE: the gauge vent line ties to the EVAP VAPOR SPACE (connected-vessel manometer), so the sender reads TRUE level at any evaporator pressure -- keep that vent line sloped so condensate drains (a water slug in it re-creates an offset)."],
 ["condCalFactor","1.0 (MANUAL)","x","Flow-meter cal -- set ONCE against the feed pump at steady level: distillate = feed/(1+blowdownFrac). Auto-cal removed (it looped through the blower production control)."],
 ["evapLevelCheckML","1000","ml","PRIME verify: if this much fill is dead-reckoned and EvapLow is still DRY -> evapLevelErr fault + popup (feed-pump or sensor failure)."],
 ["feedInvEst","0 (->~2475)","ml","Feed-side inventory estimate: dead-reckon fused with the sender (snaps + window). Seeded from the sender at run start and purge exit -- never fiat-zeroed."],
 ["blowerStartTemp / blowerStopTemp / blowerRampRpm0 / blowerRampRpmS","90 / 80 / 200 / 10","C / C / rpm / rpm/s","Blower SOFT-START with HYSTERESIS: starts at blowerStartTemp (cold evaporator has no vapor -- it only pulls vacuum), ramps from blowerRampRpm0 at blowerRampRpmS to the target. Once RUNNING it stops only below blowerStopTemp -- the pipe TC hovers near 90 with flow, and a single 90C gate limit-cycled the blower on the rig. blowerCmdRpm is the ONLY rpm sent to the VFD."],
 ["condTubeTripML","300","ml","Condensate reservoir level at the wet/dry sensor (~3/4 up) = pump-START. The nominal distillate batch."],
 ["condTubeFullML","400","ml","Full condensate reservoir volume."],
];
const simParams = [
 ["simEnable / simDriveHW","0 / 0","Sim master / hardware-in-the-loop."],
 ["simSpeed","120","Sim time-acceleration x real (dt clamps at 1.0s)."],
 ["simAmbient / simFeedSupply","25 / 18 C","Ambient / cold feed-water supply temp."],
 ["simMakeupPow / simSuperPow","2000 / 300 W","Makeup heater / superheat cartridge ratings."],
 ["simSHmeshEff / simSteamCp","0.4 / 2000","SH mesh-to-steam fraction / steam cp (J/kg.C)."],
 ["simUAsteam","1500 W/C","HX condensing -> evaporator LATENT recovery conductance."],
 ["simChx","14000 J/C","Main HX thermal mass (24 lb steel + ~2L water) -- warm-up lag."],
 ["simCevap","60000 J/C","Evaporator thermal mass -- warm-up lag."],
 ["simUAloss","3 W/C","Standby heat-loss coefficient (insulated rig). Drives simHeatLoss."],
 ["simPRmax / simCompGain","1.25 / 60","Blower pressure ratio / compression superheat (C per PR-1)."],
 ["simAtmPress","14.7","Atmospheric / vent reference (psia). Evaporator pressure is floored here (non-condensable air + vent) until Psat(eT) exceeds it at boiling, so it stays flat through warm-up then lifts at Tsat. Set to local barometric."],
 ["simBlowerRated","3450 rpm","Blower rated speed (blowFrac = rpm/this)."],
 ["simVaporMax","0.25 L/min","Vapor production at full blower + full boil (production scale)."],
 ["simLatentPerLpm","38000 W","Latent heat per L/min of production (~ real water)."],
 ["simRecovEff","0.97","Latent fraction recovered (HX condensing + compressor work)."],
 ["simUAsub","50 W/C","SUBCOOL-HX conductance (U.A) -- sets how cold the condensate gets."],
 ["simChxSub","8000 J/C","Subcool-zone slab thermal mass -- sets the steam-phase length."],
 ["simTauBlower / simTauP / simTauSH","2 / 3 / 5 s","Blower spin-up / evap pressure / superheat time constants."],
 ["simHtrCoverML","550 ml","Evaporator inventory above which the makeup cartridge stays covered (inlet tube + fittings - heater displacement, element top ~9.5 in up)."],
 ["simMakeupRise / simSuperRise","150 / 300 C","Cartridge surface rise per duty (uncovered makeup / superheat)."],
 ["simLevelBobML","30 ml","Float bob from the boil (RMS) on the simulated sender reading."],
 ["simSpillML","3800 ml","Sender-referenced level where overfill SPILLS into the demister (past totally-full 3.6 L + fittings)."],
 ["condCoolDuty","0.4","(legacy) makeup-duty cool threshold -- superseded by the subcool-HX model."],
 ["simPumpMlMin","500","Condensate-pump flow rate (ml/min, = real 0.5 L/min) -- must exceed production so the pump empties the tube; also the sim meter reading while pumping liquid."],
 ["simFlowCalErr / simFlowNoise","1.12 / 0.05","Flow-meter mis-cal (reads ~12% high) / rate noise."],
 ["simSurgeAmp / simFeedNoise","0.06 / 2.0","Production surge amplitude / feed-temp fluctuation (C RMS)."],
];
const simState = [
 ["simEvapTemp","Evaporator temperature."],
 ["simSteamChest","HX condensing (TOP) temp -- the 'steam chest'."],
 ["simHXbottom","HX cold feed-inlet (BOTTOM) = condensate outlet temp."],
 ["simCondTemp","Condensate outlet temp (= simHXbottom; the TC:CondTemp reading)."],
 ["simVaporIn / simVaporOut","Vapor temp in / out of the blower."],
 ["simEvapPress / simSteamPress","Evaporator / steam-side pressure (psia)."],
 ["simProd","Vapor production (boil-off) rate (L/min)."],
 ["simEvapInv","True evaporator inventory (ml); prime fills, feed holds evapLevelSet."],
 ["simCondVol","Condensate volume in the HX bottom tube (ml) -- sim state."],
 ["simCondFlow","Sim pump-outlet flow meter (L/min): pump rate while liquid, drops to the trickle when dry."],
 ["simBlowerRpm","Actual blower rpm (lags the command)."],
 ["condLiquid / ventOpen","Condensate-outlet liquid-vs-steam gate (sim metering) / startup air-purge vent state (DO:VentValve)."],
 ["simHeatLoss / simHeatIn","Standby heat loss / total heat in (W) -- monitoring."],
 ["condPumpOn / condProduct","Condensate pump command / lifetime calibrated distillate total (ml)."],
 ["condBatchMl / condRateLpm","Last pumped batch (ml) / measured production rate = batch / fill time (L/min)."],
 ["condCalFactor / condPumpFault","Flow-meter calibration (bench, x raw) / 1 = pump hit timeout without going dry."],
];

// ---- calibration tests ----
function calTest(title, goal, proc, calc){
  const out=[H3(title)];
  out.push(P([b("Determines: "), new TextRun(goal)]));
  out.push(P([b("Procedure:")]));
  proc.forEach(s=>out.push(BUL(s)));
  out.push(P([b("Compute:")]));
  calc.forEach(s=>out.push(EQ(s)));
  return out;
}

const doc = new Document({
  styles: {
    default: { document: { run: { font: "Arial", size: 21 } } },
    paragraphStyles: [
      { id:"Heading1", name:"Heading 1", basedOn:"Normal", next:"Normal", quickFormat:true,
        run:{ size:30, bold:true, color:"1F4E79", font:"Arial" },
        paragraph:{ spacing:{before:260,after:140}, outlineLevel:0 } },
      { id:"Heading2", name:"Heading 2", basedOn:"Normal", next:"Normal", quickFormat:true,
        run:{ size:25, bold:true, color:"2E75B6", font:"Arial" },
        paragraph:{ spacing:{before:200,after:100}, outlineLevel:1 } },
      { id:"Heading3", name:"Heading 3", basedOn:"Normal", next:"Normal", quickFormat:true,
        run:{ size:22, bold:true, color:"333333", font:"Arial" },
        paragraph:{ spacing:{before:140,after:60}, outlineLevel:2 } },
    ]
  },
  numbering:{ config:[ { reference:"b", levels:[{ level:0, format:LevelFormat.BULLET, text:"•",
     alignment:AlignmentType.LEFT, style:{paragraph:{indent:{left:540,hanging:260}}} }] } ] },
  sections: [{
    properties:{ page:{ size:{width:12240,height:15840}, margin:{top:1440,right:1440,bottom:1440,left:1440} } },
    footers:{ default: new Footer({ children:[ new Paragraph({ alignment:AlignmentType.CENTER,
       children:[ new TextRun({text:"MVR Model & Control Reference  -  ",size:16,color:"888888"}),
                  new TextRun({text:"Page ",size:16,color:"888888"}),
                  new TextRun({children:[PageNumber.CURRENT],size:16,color:"888888"}) ] }) ] }) },
    children: [
      new Paragraph({ alignment:AlignmentType.CENTER, spacing:{before:1600,after:120},
        children:[ new TextRun({text:"MVR Distillation", bold:true, size:52, color:"1F4E79", font:"Arial"}) ]}),
      new Paragraph({ alignment:AlignmentType.CENTER, spacing:{after:80},
        children:[ new TextRun({text:"Model & Control Reference", size:32, color:"2E75B6"}) ]}),
      new Paragraph({ alignment:AlignmentType.CENTER, spacing:{after:80},
        children:[ new TextRun({text:"MCC DAQ expression-engine control + plant simulator", size:22, italics:true, color:"555555"}) ]}),
      new Paragraph({ alignment:AlignmentType.CENTER, spacing:{before:600},
        children:[ new TextRun({text:"Generated from server/config/expressions_MVR.json", size:18, color:"888888"}) ]}),
      new Paragraph({ children:[new PageBreak()] }),

      new Paragraph({ heading: HeadingLevel.HEADING_1, children:[new TextRun("Contents")] }),
      new TableOfContents("Contents", { hyperlink:true, headingStyleRange:"1-2" }),
      new Paragraph({ children:[new PageBreak()] }),

      // ---------- OVERVIEW ----------
      H1("1.  Overview"),
      P([new TextRun("This is the MVR (mechanical vapor recompression) water-distillation control. The control laws run inside the MCC DAQ app's expression engine every tick (~100-160 Hz). A built-in plant "),
         b("simulator"), new TextRun(" (MVRSim) lets you develop and tune the controls without the hardware: set "),
         code("simEnable=1"), new TextRun(" to feed the controllers from the model instead of the real AI/TC.")]),
      P([b("Two backends evaluate the expressions identically: "), new TextRun("the Python engine and the compiled C++ DLL. Top-level "),
         code("static.x = const"), new TextRun(" lines initialize once.")]),
      P([b("Tick data flow: "), code("MVR System"), new TextRun(" (phase) -> "), code("SensorMux"),
         new TextRun(" (real OR sim -> y*) -> "), code("SteamTables"), new TextRun(" -> "), code("Interlocks"),
         new TextRun(" -> heater PIs -> "), code("BlowerControl / FeedwaterControl"), new TextRun(" -> "),
         code("CondensatePump"), new TextRun(" -> "), code("ProductionControl / FeedFollow"), new TextRun(" -> "),
         code("MVRSim"), new TextRun(" (plant, sim only).")]),
      P([b("Sensor abstraction: "), new TextRun("every sensor is a "), code("static.yXxx"),
         new TextRun(". SensorMux sets them from the real AI/TC when simEnable=0, or from the sim model when =1, so the control laws are identical in both modes.")]),

      // ---------- CONTROL LAWS ----------
      H1("2.  Control Laws"),
      P("These run regardless of sim vs real. Heater outputs are PWM duty 0..1; temps degC; pressures psia."),
      P([new TextRun("TIMING: the server stamps the system monotonic clock (ms) into "), code("static.sysMs"), new TextRun(" every tick before the expressions evaluate. Setpoints differences it into "), code("static.dtReal"), new TextRun(" = (sysMs - lastTickMs)/1000 -- the REAL elapsed time, which every timer/integral/window uses instead of the nominal tick period. In sim it is accelerated as "), code("dtReal * simSpeed"), new TextRun("; in measure mode it is the true elapsed seconds. timeIncSec is only the fallback (first ticks / hiccups).")]),

      H2("2.1  Startup state machine (MVR System)"),
      P("IDLE -> PURGE -> PRIME -> HEAT -> RUN. heatOK and the blower are gated on phase>=HEAT so the makeup element never dry-fires."),
      BUL([b("PURGE (full / dry start): "), new TextRun("reverse the feed pump ("), code("vel = -purgeRevRpm"), new TextRun(", 400 rpm) until the CALIBRATED sender reads BOTTOM (plateau 0), then keep pumping "), code("purgeExtraML"), new TextRun(" (200 ml) more -- water below the float pickup is still in there. If the sender is faulted, fall back to the blind "), code("purgeMaxML"), new TextRun(" dead-reckon cap. A WATCHDOG ("), code("purgeStallS"), new TextRun(") trips "), code("purgeErr"), new TextRun(" if the level stops dropping (pump/direction fault); it disarms once bottom is reached (the overrun is legitimately flat).")]),
      BUL([b("PURGE (WARM START, purgeWarmEn=1): "), new TextRun("if the sender already shows water at Run, do NOT purge to dry: pump down until the level has dropped at least ONE plateau AND reads at/below the operating mark. Every plateau-drop crossing snaps "), code("feedInvEst"), new TextRun(" to the edge midpoint (the fusion), so startup continues from a CALIBRATED level -- a restart from an overfull shutdown pumps down to the mark, and coming from above the LAST crossing is the 2600|2350 edge = exactly the 2475 operating level. Minutes instead of a full drain + refill.")]),
      BUL([b("PRIME: "), code("feedCmd = feedPrimeRpm"), new TextRun(" (250 rpm); fill to the EvapLow mark (~0.75 L, heater covered) and advance to HEAT when "), code("feedInvEst >= feedPrimeML AND yEvapLow"), new TextRun(" -- the low switch CONFIRMS wet, so the heater never fires dry. A warm start that lands above the low mark falls straight through. If primed but EvapLow stays dry by "), code("evapLevelCheckML"), new TextRun(", Interlocks latches "), code("evapLevelErr"), new TextRun(" (feed-pump or sensor failure) -> trip + UI popup; clears on Stop.")]),
      BUL([b("HEAT: "), new TextRun("makeup heater on; the feed RAMPS the level up to the operating mark (2475). The blower stays OFF until "), code("yEvapTemp >= blowerStartTemp"), new TextRun(" (90 C), then soft-starts (2.10). Advance to RUN when "), code("yEvapTemp > evapTempSet - 3 AND yEvapMid"), new TextRun(" -- near boiling AND at the operating level (seed prodMeas = prodSetSafe so the blower doesn't spike).")]),
      BUL([b("RUN: "), new TextRun("closed-loop production; the feed HOLDS the level at the 2475 edge (see 2.2a).")]),
      BUL([b("EMPTY / SHUTDOWN (buttons, Run OFF): "), new TextRun("Button widgets in Variable mode named "), code("emptySystem"), new TextRun(" or "), code("shutdown"), new TextRun(" reverse-pump the system dry without a run: sender bottom + purgeExtraML, "), code("emptyMaxML"), new TextRun(" (4000) backstop. With Run off the heaters are already forced off (heatOK=0 -> HeaterEnable + both PWMs = 0) and the blower is disabled, so shutdown = verified-heaters-off + pump-out. Ignored while running; toggle off to re-arm; hitting Run aborts it.")]),

      H2("2.2a  Evaporator level control (FeedFollow + the sender fusion)"),
      P([new TextRun("The tank-gauge sender IS the level sensing -- a 14-step STAIRCASE (plateau centers from the measured cal table), so the raw reading cannot resolve the level within a plateau (~200-350 ml wide). The control fuses it with the calibrated positive-displacement feed pump: "), code("feedInvEst"), new TextRun(" dead-reckons feed-in minus vapor-out between plateaus; every plateau CHANGE is a known physical edge crossing that SNAPS the estimate to the old/new plateau midpoint (and teaches a slow rate-bias "), code("levelBiasLpm"), new TextRun(", clamp +/-0.05 L/min); between crossings the estimate is clamped inside plateau-center +/- "), code("senderSpanML"), new TextRun(" (no teaching -- centers are only approximate).")]),
      P([new TextRun("Feed = measured-production feed-forward "), code("prodMeas x (1+blowdownFrac)"), new TextRun(" + P on the fused estimate OUTSIDE a +/-"), code("levelDeadML"), new TextRun(" deadband (fast fill / upset recovery) + a slow EvapMid-switch integral INSIDE the deadband (the tight hold: the 2475 edge is a perfect 1-bit sensor placed exactly at the setpoint). Integrating only where P is silent stops the two from fighting. A HEAT-phase guard keeps filling while the mid switch is dry regardless of the estimate, and "), code("yEvapHigh"), new TextRun(" cuts the feed entirely. The marks sit ON plateau edges (750 / 2475 / 2750) so each switch flip is a real crossing. Calibrate "), code("condCalFactor"), new TextRun(" once against the feed pump so production reads true.")]),

      H2("2.2  Setpoint safety bounds"),
      P([new TextRun("Each live setpoint is range-checked every tick; an out-of-range value is "), b("ignored"),
         new TextRun(" and the last valid value is kept in a *Safe companion. The controllers read the *Safe value, never the raw input.")]),
      EQ("if (lo <= setpoint <= hi)  ->  setpointSafe = setpoint   ; else keep last"),
      P([new TextRun("Guarded: productionSet [0,prodSetMax], superheatSet [0,superheatSetMax], evapTempSet [min,max], blowerRpmSet [0,blowerMaxRpm], feedRpmSet [0,feedRpmMax].")]),

      H2("2.3  Interlocks & trips (Interlocks)"),
      P("trip = any of: evap/steam over-pressure, vapor-out over-temp, demister flood (QUALIFIED: DemisterFlood AND DemisterWater both wet -- fog films the flood sensor alone), low-superheat (wet compression; arms only at target blower rpm), makeup-cartridge over-temp (HARD backstop makeupHtrMax=140C), superheat-cartridge over-temp, evaporator-level prime-verify (evapLevelErr), level-sender fault (senderErr: open/short mid-run, debounced), purge stall (purgeErr: watchdog). All the latched trips clear when runSystem cycles; evapLevelErr, senderErr, purgeErr, and the high-level warning also fire UI popups. The HIGH-LEVEL warning (evapHighWarn, 2750) is latched + feed-cut but NOT a trip, and does not latch during PURGE (an overfull warm start is legitimately high while draining)."),
      P([new TextRun("Makeup-heater element protection is SOFT first: in MakeupControl, above "), code("makeupHtrSoft"), new TextRun(" (115C) the PWM duty is folded back proportionally (violent boil / local dry-out -> ease off so water re-wets the element), never below the keep-warm floor "), code("makeupHtrMinDuty"), new TextRun(". Only if the element keeps climbing to "), code("makeupHtrMax"), new TextRun(" (140C) despite fold-back does the hard trip fire. Tune makeupHtrMinDuty to the PWM that just holds the vapor at ~100C.")]),
      EQ("heatOK = runSystem AND (trip == 0) AND (mvrPhase >= HEAT)"),
      EQ("makeupHtrTrip latches if  yMakeupHtrTemp > makeupHtrMax   (uncovered / feed overheat)"),
      EQ("superHtrTrip  latches if  ySuperHtrTemp  > superHtrMax"),

      H2("2.4  Makeup heater PI (MakeupControl)"),
      P("Holds the evaporator at the boiling setpoint. Conditional anti-windup; gated by heatOK."),
      EQ("err  = evapTempSetSafe - yEvapTemp"),
      EQ("I    = clamp( I + kiMakeup * err * dt , 0 , 1 )"),
      EQ("duty = clamp( kpMakeup * err + I , 0 , 1 )      ->  DO:MakeupHtr  (makeupDuty)"),

      H2("2.5  Superheat heater -- element-temp regulation + PI (SuperheatControl)"),
      P([new TextRun("Rig finding: the cartridge couples heat into thin vapor POORLY -- dry/low-flow, the surface just soars (the old 180C trip fired before any superheat showed). The duty is now the "), b("MIN of two demands"), new TextRun(": (1) the superheat PI -- the real control, meaningful once vapor flows -- and (2) an element-temp P regulator holding the cartridge TC at "), code("superHtrRegC"), new TextRun(" (200C). From the moment the blower is turning ("), code("blowerCmdRpm >= blowerRampRpm0"), new TextRun(") the element preheats REGULATED at ~200C; as vapor flow builds it carries the heat away, the element cools, the regulator releases, and the superheat PI takes over seamlessly. The regulation IS the dry-fire protection; "), code("superHtrMax"), new TextRun(" (250C) is the hard backstop. The PI integral holds while the regulator limits (anti-windup); both heater integrators reset whenever their heater is off. The wet-compression (low-superheat) trip arms only once the blower reaches its target.")]),
      EQ("pi   = clamp( kpSuper*(superheatSetSafe - superheatIn) + I , 0 , 1 )"),
      EQ("elem = clamp( kpShElem * (superHtrRegC - ySuperHtrTemp) , 0 , 1 )"),
      EQ("duty = min( pi , elem )       ->  DO:SuperHtr  (superDuty)"),

      H2("2.6  Blower production control (ProductionControl)"),
      P("Trims the blower (the compressor / vapor pump) to hold the target distillate rate. Measured production now comes from the condensate BATCHES (see 2.9): each pump-to-dry cycle meters a known distillate volume, and volume / fill-time is the average production rate -- the only rate a single point-level sensor can give. Updated once per empty cycle (condRateLpm) and held between; before the first batch the blower holds nominal rpm. cdt accelerates the integral in sim so it converges at the same wall-clock feel."),
      EQ("measProd = condRateLpm                         (batch volume / fill time)"),
      EQ("prodMeas += (measProd - prodMeas) * smoothing"),
      EQ("blowerRpmSet = clamp( blowerRpmSet + kProd*(prodSetSafe - prodMeas)*cdt , min , max )"),
      P([new TextRun("Blower estimate (used while venting and for feedInvEst): "), code("blowerProdEst = prodPerRpm * blowerRpmSafe * clamp((eT-95)/5,0,1)"), new TextRun(".")]),

      H2("2.7  Feed level control (FeedFollow + FeedwaterControl)"),
      P([new TextRun("The stepped tank-gauge sender fused with the calibrated feed pump (see 2.2a). Far below the operating mark P fills fast; inside the deadband the EvapMid edge integral holds the level. blowdownFrac = 0 (no blowdown valve), so the feed-forward is just the production rate:")]),
      EQ("feedLpm = prodMeas*(1+blowdownFrac) + P(fused est, outside deadband) + feedLevelTrim"),
      EQ("feedLevelTrim += kFeedLevelI * (EvapMid dry ? +1 : -1) * dt      (INSIDE the deadband only)"),
      EQ("feedRpmSet = clamp( feedLpm / (stepsPerRev*LPerStep) , 0 , feedRpmMax )   -> STEP:Feed.VELOCITY"),
      P([new TextRun("Velocity is driven as a LEVEL (0 = stop) so every run/stop transition re-triggers the stepper move. The edge integral -- not the dead-reckon -- closes the tight loop, so a mis-calibrated flow meter can never run the level away ('wet' always pulls feed below boil-off).")]),
      P([b("COLD-CRASH GUARD (RUN only): "), new TextRun("a max-feed level recovery dumps cold water faster than the heaters can carry (0.27 L/min of 18C feed ~ 2.6 kW > the 2 kW makeup) -- on the rig this crashed the evap temp under the blower gate and the run limit-cycled. The level-correction terms fold back to production-match as "), code("yEvapTemp"), new TextRun(" sags: full correction at set-3, production-match only by set-8. Level can wait; heat can't.")]),

      H2("2.8  Feed-side inventory dead-reckon (feedInvEst)"),
      P("Positive-displacement feed pumped IN minus calibrated distillate OUT -- a level estimate that needs no sensor. While venting (meter ~0) it subtracts the blower estimate instead, so it tracks through the steamy startup."),
      EQ("feedInvEst += feedInMl - vaporOutMl     ; vaporOutMl = metered (liquid) | blower est (steam)"),

      H2("2.9  Condensate -- single point sensor, pump-to-dry (CondensatePump)"),
      P("No separate catch tank: condensate collects in the bottom TUBE of the HX. One point-level sensor ~3/4 up the tube (AI:CondLevel > condLevelThresh -> yCondHigh) starts the pump. The flow meter sits on the PUMP OUTLET, so it directly meters distillate leaving. The pump runs until the tube is DRY: when it sucks air the metered flow drops to the incoming trickle (below condEmptyFlow) -- that sustained drop, debounced, is the empty signal. Pumped volume per cycle is the distillate batch; batch / fill-time is the production rate."),
      EQ("start pump when  AI:CondLevel > condLevelThresh   (tube ~3/4 full)"),
      P("Stop on WHICHEVER fires first (the pump is positive-displacement, so the empty point is bracketed three ways):"),
      EQ("(1) yCondFlow < condEmptyFlow for condEmptyDebounce   (meter drops to ~0 on air -> dry; primary)"),
      EQ("(2) metered batch > condBatchMaxML                    (guards a meter that keeps counting on air)"),
      EQ("(3) pump run > condPumpMaxRun                         (hard time cap -> sets condPumpFault)"),
      EQ("condRateLpm = condBatchMl / fill-cycle-time     ->  ProductionControl (2.6)"),
      H3("One counter, measured in software (condUseTotalizer)"),
      P([new TextRun("The CTR0 count is read once and exposed as a first-class CTR input -- the cumulative total: CTR:CondTotal = count/K (rollover-safe 32-bit, summed into a big-int). The flow RATE is derived from the total in the expression, windowed over "), code("condRateWin"), new TextRun(" (so per-tick pulse coarseness averages out), held between updates:")]),
      EQ("yCondFlow = (yCondTotal - prevWindowTotal) / windowElapsed * 60     // L/min, every condRateWin"),
      P("Two ways to report the distillate, both off that one total:"),
      EQ("condUseTotalizer = 1 (default):  condProduct = yCondTotal * condCalFactor * 1000   // EXACT, no integration error"),
      EQ("condUseTotalizer = 0:  condProduct += integral(yCondFlow) * condCalFactor          // windowed-rate integration"),
      P("The pump batch cycle and the empty detection (on yCondFlow) are identical either way; the switch only changes how condProduct is formed. condCalFactor (bench: known volume / metered pulses) corrects both. condEmptyDebounce should be >= ~2x condRateWin."),
      P([new TextRun("The vent (DO:VentValve) is a startup NON-CONDENSABLE (air) purge: it holds OPEN while the system warms (blower on, phase >= HEAT) so trapped air is pushed out, then CLOSES once the blower-out vapor ("), code("yVaporOut"), new TextRun(") reaches steam temperature -- hysteresis "), code("ventOpenTemp"), new TextRun(" (98C, open below) / "), code("ventCloseTemp"), new TextRun(" (101C, close above). It is independent of condLiquid (the condensate-outlet liquid gate the sim uses for metering); closed when idle.")]),

      H2("2.10  Blower soft-start + anti-surge bypass (BlowerControl)"),
      P([new TextRun("The blower stays OFF below "), code("blowerStartTemp"), new TextRun(" (90 C): a cold evaporator has no vapor to pump -- the blower would only pull vacuum. Once the gate opens it starts at "), code("blowerRampRpm0"), new TextRun(" (200 rpm) and ramps at "), code("blowerRampRpmS"), new TextRun(" (10 rpm/s) to the target; "), code("blowerCmdRpm"), new TextRun(" (the rate-limited state) is the ONLY rpm sent to the VFD, and everything downstream (SH-heater gate, wet-comp arming, production anti-windup) keys off it. This replaced a suction-lie failure on the rig: a hard blower start pulled the level gauge down, the control over-filled chasing the false low reading, and the demister flooded. The HARDWARE fix -- venting the gauge to the evap vapor space (connected-vessel manometer) -- removed the need for pressure compensation entirely; the soft ramp is kept as good practice.")]),
      EQ("run = runSystem AND !trip AND phase>=HEAT AND yEvapTemp >= blowerStartTemp"),
      EQ("cmd = min( max(cmd, blowerRampRpm0) + blowerRampRpmS*dt , blowerRpmSafe )   -> VFD"),
      EQ("bypassV = clamp( (surgeThresh - deltaT) * surgeGain , 0 , 10 )   ->  AO:BypassValve"),

      // ---------- PLANT MODEL ----------
      H1("3.  Plant Model Equations (MVRSim)"),
      P("The lumped first-order simulator. Active only when simEnable=1. cp ~ 4186 J/kg.C; 1 L ~ 1 kg of water."),

      H2("3.1  Blower & production"),
      EQ("simBlowerRpm += (cmd - simBlowerRpm) * dt/simTauBlower"),
      EQ("blowFrac = simBlowerRpm/simBlowerRated ;  compEff = blowFrac*(1-bypass)"),
      EQ("boilReady = clamp((eT-95)/5,0,1)"),
      EQ("simProd  -> compEff * simVaporMax * boilReady * surge      (L/min, blower-driven)"),

      H2("3.2  Pressures -- compressor suction / discharge (Antoine)"),
      P("The blower is the COMPRESSOR: it draws vapor OFF the evaporator (suction, low side) and discharges into the steam chest (high side). The condensate / discharge side is vented (catch-tank vent), so it rests near atmospheric and rises with the condensing temperature. The EVAPORATOR is the suction side -- it never goes positive, and the instant the blower spins up it is pulled BELOW atmospheric (deepest while boil-off still lags blower throughput), recovering toward atmospheric as the chest warms. Blower off (warm-up): PR=1, both sides rest at atmospheric (air + vent). NOTE: evaporator suction no longer disturbs the level reading -- the gauge vent line ties to the evap vapor space (connected-vessel manometer), so both legs see the same pressure and the sender reads true."),
      EQ("PR        = 1 + (simPRmax-1)*compEff"),
      EQ("discharge = max( Psat(simSteamChest) , simAtmPress )    // steam / condensing side"),
      EQ("simSteamPress -> discharge        (lifts above atmospheric as the chest heats)"),
      EQ("simEvapPress  -> min( discharge / PR , simAtmPress )    // suction: NEVER positive"),
      EQ("Tsat(P) via Antoine ;  deltaT = Tsat(steam) - Tsat(evap)   (evap Tsat drops under vacuum)"),

      H2("3.3  Superheat"),
      EQ("shPower  = shDuty * simSuperPow * simSHmeshEff"),
      EQ("shTarget = shPower / (vapor mass flow * simSteamCp)   ;  simVaporIn = eT + simSuperheat"),

      H2("3.4  HX condensing & latent recovery"),
      P("The produced vapor condenses in the HX, releasing latent heat; simRecovEff of it boils the next slug (the recovery). Bidirectional conductance so the slab tracks the evaporator during warm-up."),
      EQ("QinHX  = simProd * simLatentPerLpm * simRecovEff"),
      EQ("QoutHX = simUAsteam * (simSteamChest - eT)"),
      EQ("simSteamChest += (QinHX - QoutHX)/simChx * dt"),

      H2("3.5  Evaporator energy balance"),
      EQ("Qmakeup = mkDuty*simMakeupPow ;  Qsteam = QoutHX ;  Qboil = simProd*simLatentPerLpm"),
      EQ("Qfeed   = feedFlow*(cp/60)*(eT - feedEntry) ;  Qloss = simUAloss*(eT - simAmbient)"),
      EQ("simEvapTemp += (Qmakeup + Qsteam - Qboil - Qfeed - Qloss)/simCevap * dt"),

      H2("3.6  Subcooling HX  (effectiveness-NTU)"),
      P("After condensing, the liquid is subcooled by the cold feed in a counterflow section. The outlet temp falls out of the HX area (simUAsub) and the flows -- not a fudge. A slab thermal mass (simChxSub) makes the output STEAM at startup (hot slab) until the feed cools it."),
      EQ("feedC = feedFlow/60 * cp                  (feed capacity rate, W/C)"),
      EQ("NTU   = simUAsub / feedC ;  eff = NTU/(1+NTU)"),
      EQ("condOutSS = simSteamChest - eff*(simSteamChest - feed)"),
      EQ("RUN:  simHXbottom += (condOutSS - simHXbottom) * (feedC/simChxSub)*dt"),
      EQ("simCondTemp = simHXbottom"),

      H2("3.7  Feed preheat recovery  (energy-consistent)"),
      P("The sensible heat the condensate loses in the subcool HX is exactly the heat the cold feed gains (other side of the same HX). The preheated feed enters the evaporator, reducing the makeup load -- one consistent energy flow with 3.6."),
      EQ("feedPre  = (simProd/feedFlow) * (simSteamChest - simHXbottom)"),
      EQ("feedEntry = clamp( feed + feedPre , feed , eT )"),

      H2("3.8  Condensate tank, flow meter, steam vent"),
      P("The catch tank fills with LIQUID only (condLiquid); steam vents (and spins the meter, which the control ignores). HX holdup adds a formation delay; the pump cycles between the two level switches."),

      H2("3.9  Cartridge surface temps (heater TCs)"),
      EQ("makeup surface = eT + mkDuty*( covRise + uncovRise*(1 - coverFrac) )   (spikes when uncovered)"),
      EQ("super surface  = simVaporIn + shDuty*simSuperRise"),

      // ---------- CALIBRATION ----------
      H1("4.  Calibration Tests"),
      P([new TextRun("How to pin each model constant from the real assembly. Run these once the rig is built; they let the sim match measured behaviour. Use the app's logging (the CSV captures every "),
         code("gvar_*"), new TextRun(" static) and read the steady values.")]),

      ...calTest("4.1  Heater coast-down  ->  simUAloss  (and a thermal-mass check)",
        "Standby heat-loss coefficient.",
        ["Bring the evaporator to a steady temperature (e.g. ~95 C).",
         "Turn OFF all heaters, blower and feed. Log the evaporator temp as it cools toward ambient.",
         "Record the cooling curve T(t) and the ambient temp."],
        ["tau = time constant of the exponential cool-down (T-ambient) vs t",
         "C   = simCevap + simChx  (total mass);   simUAloss = C / tau",
         "or from the initial slope:  simUAloss = C * (dT/dt) / (T - ambient)"]),

      ...calTest("4.2  Warm-up rate  ->  simCevap (+ simChx)",
        "Evaporator + HX thermal mass.",
        ["From cold, full makeup power (known simMakeupPow), no blower / no production.",
         "Log the evaporator temp vs time over the linear part of the warm-up."],
        ["dT/dt (degC/s) measured over the rise",
         "C = (simMakeupPow - Qloss) / (dT/dt)        (Qloss small early)",
         "Split: simChx ~ steel mass*0.5 + water mass*4.2 (kJ/C); simCevap = the rest"]),

      ...calTest("4.3  Production vs blower RPM  ->  simVaporMax, prodPerRpm, simPRmax, simCompGain",
        "Blower-to-production and the pressure-ratio / deltaT relationship.",
        ["At steady boil, set several blower RPMs (e.g. 1000, 1500, 2200, 3000).",
         "At each, log steady distillate rate (calibrated condProduct slope), deltaT (steamTsat-evapTsat), and vapor-out temp."],
        ["simVaporMax  = production at full blower / full boil (extrapolate)",
         "prodPerRpm   = slope of production vs rpm (control-side estimate)",
         "simPRmax     from deltaT at full blower ;  simCompGain from (VaporOut - condensing temp) vs (PR-1)"]),

      ...calTest("4.4  Steady subcool  ->  simUAsub",
        "Subcool-HX conductance (area).",
        ["At steady production, log the condensing temp (steam chest TC), the feed inlet temp, the condensate outlet temp (TC:CondTemp), and the feed flow."],
        ["eff = (condensing - condOut) / (condensing - feed)",
         "NTU = eff/(1-eff)          (balanced counterflow)",
         "simUAsub = NTU * (feed mass flow * cp)        feedC = (L/min)/60 * 4186"]),

      ...calTest("4.5  Steam-phase length  ->  simChxSub",
        "Subcool-zone slab thermal mass.",
        ["From a cold start at fixed production, time how long the condensate OUTLET stays above boiling (steam) before it drops below ~boiling and liquid starts collecting."],
        ["t_steam ~ (simChxSub/feedC) * ln( (Tstart-condOutSS)/(98-condOutSS) )",
         "  ->  simChxSub = feedC * t_steam / ln(...)   (or just tune simChxSub to match the observed time)"]),

      ...calTest("4.6  Recovery  ->  simUAsteam",
        "HX latent-recovery conductance.",
        ["At steady RUN, log the steady makeup power, production, feed temp, evaporator temp, and steam-chest temp."],
        ["Energy balance:  Qmakeup + Qsteam = Qboil + Qfeed + Qloss",
         "Qsteam = simUAsteam*(steamChest - eT)  ->  solve for simUAsteam from the measured makeup"]),

      ...calTest("4.7  Condensate flow meter + tube  ->  condCalFactor, condEmptyFlow, condTubeTripML",
        "Pump-outlet flow-meter calibration, the dry threshold, and the tube/sensor volume.",
        ["Bench: pump a known liquid volume through the meter; record pulses (or the app's integrated raw) to get pulses/L -> condCalFactor.",
         "Run the condensate pump empty (dry) and note its steady flow reading, then pumping liquid and note that reading -- the dry threshold sits between them.",
         "Fill the HX bottom tube to the sensor trip and measure the volume pumped out (the app shows condBatchMl)."],
        ["condCalFactor = known_volume / metered_raw     (bench, fixed)",
         "condEmptyFlow ~ halfway between the dry trickle (~production) and the full pump rate",
         "condTubeTripML = measured batch per cycle (geometric ~130 ml at 3/4 of the 1.16in x 10in tube)"]),

      ...calTest("4.8  Pump cal  ->  feedLPerStep   (already done)",
        "Peristaltic feed-pump volume per motor step.",
        ["Run the pump a known number of revolutions into a graduated container; measure the volume."],
        ["feedLPerStep = volume(L) / (revs * feedStepsPerRev)     e.g. 0.200 / (223*10000) = 8.969e-8"]),

      ...calTest("4.9  Cartridge trip points  ->  makeupHtrMax, superHtrMax",
        "Safe over-temp trip thresholds for the heater TCs.",
        ["Run normally and log the makeup- and superheat-cartridge TCs (ch6/ch7) across the operating range.",
         "Note the highest NORMAL surface temp each reaches."],
        ["set makeupHtrMax / superHtrMax a comfortable margin (e.g. +20-30 C) above the highest normal reading;",
         "makeup must trip before the element can run dry (uncovered) -- verify by lowering the level."]),

      new Paragraph({ children:[new PageBreak()] }),
      // ---------- VARIABLE REFERENCE ----------
      H1("5.  Variable Reference"),
      P("Every static, grouped by role. Temps degC, pressures psia, flows L/min, volumes ml unless noted."),

      H2("5.1  Operating setpoints (the knobs you set)"),
      tbl(W5.slice(0,1).concat([1100,2300,4060]),["Variable","Default","Range","Meaning"], setpoints.map(r=>[r[0],r[1],r[2],r[3]])),

      H2("5.2  Safety bounds, interlocks & trips"),
      tbl([2400,1100,800,5060],["Variable","Default","Units","Meaning"], safety),

      H2("5.3  Control tuning"),
      tbl([2200,1300,1500,4360],["Variable","Default","Units","Meaning"], ctrl),

      H2("5.4  Startup, pump cal & feed-side estimate"),
      tbl([2000,1400,2000,3960],["Variable","Default","Range/Units","Meaning"], startup),

      H2("5.5  Simulator plant parameters"),
      tbl([2600,1500,5260],["Variable","Default","Meaning"], simParams),

      H2("5.6  Simulator state (model outputs -- chart these)"),
      tbl([2700,6660],["Variable","Meaning"], simState),
    ]
  }]
});

Packer.toBuffer(doc).then(buf=>{ fs.writeFileSync("MVR_Model_Reference.docx", buf); console.log("WROTE MVR_Model_Reference.docx", buf.length, "bytes"); });
