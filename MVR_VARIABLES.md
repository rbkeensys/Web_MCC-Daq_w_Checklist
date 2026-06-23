# MVR Control & Simulator — Static Variable Reference

Every `static.*` variable used by the MVR expressions, grouped by role, with its
units / typical range and what it represents. All are defined or first written in
`server/config/expressions.json`. Temperatures are °C, pressures **psia**, heater
outputs are PWM duty 0..1, flows L/min unless noted.

Two execution backends evaluate these identically: the Python engine
(`expr_engine.py`) and the compiled C++ DLL (`expr_to_cpp.py` → `compiled/expressions.dll`).
**Top-level `static.x = const` lines in `Setpoints` initialize once** (so read-before-write
statics don't start as NaN in the DLL).

The data flow each tick:
`MVR System` (phase) → `SensorMux` (real **or** sim sensors → `y*`) → `SteamTables`
→ `Interlocks` → heater PIs → `BlowerControl`/`FeedwaterControl` → `CondensatePump`
→ `ProductionControl`/`FeedFollow` → `MVRSim` (plant model, sim only).

---

## 1. Operating setpoints — the knobs you set

| Variable | Range | Meaning |
|---|---|---|
| `runSystem` | 0 / 1 | Master run (driven by the RUN button via `buttonVars.runSystem`). 0 → everything idle. |
| `productionSet` | 0.02–0.24 L/min | **Primary knob.** Target distillate (condensate) rate. The blower and feed pump chase this. |
| `evapTempSet` | ~100 °C | Evaporator boiling-temperature setpoint (makeup-heater PI target). |
| `superheatSet` | 1–5 °C | Vapor superheat setpoint (superheat-cartridge PI target). |
| `evapPressSet` | ~14.7 psia | Evaporator pressure reference (informational / future use). |
| `blowerRpmSet` | 800–4000 rpm | Blower (compressor) speed. **Auto-driven** by `ProductionControl` when `autoBlow=1`; manual when 0. |
| `feedRpmSet` | 0–~300 rpm | Feed pump motor speed. **Auto-driven** by `FeedFollow` when `autoFeed=1`; manual when 0. |
| `evapLevelSet` | ~1500 ml | Evaporator working-level target the feed pump holds (level control). |
| `autoBlow` | 0 / 1 | 1 = blower auto-trims to hold `productionSet`. |
| `autoFeed` | 0 / 1 | 1 = feed pump auto-holds evaporator level / mass balance. |

## 2. Startup sequence & feed-pump calibration

| Variable | Range | Meaning |
|---|---|---|
| `mvrPhase` | 0–3 | Startup state: 0 IDLE, 1 PRIME, 2 HEAT, 3 RUN. `mvrState` mirrors it. |
| `feedLPerStep` | ~2e-6 L/step | **FEED PUMP CAL** — liters delivered per motor **step**. `L/min = rpm × feedStepsPerRev × feedLPerStep`. |
| `feedStepsPerRev` | =driver | Motor steps per revolution; must match the driver microstep (Pr0.00, e.g. 10000). |
| `feedPrimeML` | ~1500 ml | Volume the PRIME phase dead-reckons into the evaporator before heat is allowed. |
| `feedPrimeRpm` | ~120 rpm | Feed-pump speed during the PRIME fill. |
| `feedPrimedML` | 0…feedPrimeML | Running count of primed volume (dead-reckon integrator); resets each start. |
| `feedCmdRpm` | 0–300 rpm | The **actual** feed rpm commanded this tick (prime rate or run rate). Sim reads this. |
| `blowerMinRpm` / `blowerMaxRpm` | 800 / 4000 | Production-control blower clamps. 4000 = allowed overspeed. |
| `kProd` | ~40 | Blower production-control gain (rpm per L/min-error-second). Lower = gentler/slower. |
| `kFeedLevel` | ~0.003 | Feed level-control gain (L/min per ml of level error). 0 = pure feed-forward. |
| `blowdownFrac` | ~0.05 | Feed excess over distillate (blowdown / concentrate purge). |
| `prodMeas` | 0–0.25 L/min | Smoothed measured distillate (from the calibrated flow meter); the blower loop's feedback. |

## 3. Control tuning, interlocks & limits

| Variable | Range | Meaning |
|---|---|---|
| `kpMakeup` / `kiMakeup` | 0.05 / 0.01 | Makeup-heater PI gains. |
| `kpSuper` / `kiSuper` | 0.05 / 0.01 | Superheat-heater PI gains. |
| `surgeThresh` | 1.0 °C | ΔT below which the anti-surge bypass valve opens. |
| `surgeGain` | 5.0 V/°C | Bypass-valve volts per °C of surge. |
| `minSuperheat` | 0.5 °C | Wet-compression trip threshold (latched-arm protection). |
| `superheatGraceTemp` | 90 °C | Superheat interlock only arms above this (no cold-start trip). |
| `condLevelThresh` | 2.5 | Real condensate-level analog threshold (high/low band) until 2 switches are wired. |
| `demisterThresh` | 2.5 | Demister liquid-present threshold (drain + flood). |
| `maxEvapPress` / `maxSteamPress` | 25 / 35 psia | Over-pressure trips. |
| `maxVaporOut` | 140 °C | Vapor-out over-temp trip. |
| `timeIncSec` | 0.00625 s | Control tick period (used by integrators). |

## 4. Sensor mux — abstracted sensors (`y*`)

`SensorMux` sets these from the **real** AI/TC when `simEnable=0`, or from the
**sim** model when `simEnable=1`. Everything downstream reads only `y*`, so the
controllers are identical in both modes.

| Variable | Units | Real source / meaning |
|---|---|---|
| `yEvapTemp` | °C | Evaporator temp (`TC:EvapTemp`). |
| `yEvapPress` / `ySteamPress` | psia | Evaporator / steam-side pressure (`AI:EvapPress` / `AI:SteamPress`). |
| `yVaporIn` / `yVaporOut` | °C | Vapor temp into / out of the blower (`TC:VaporIn` / `TC:VaporOut`). |
| `yEvapLevel` | ml | Evaporator level (`AI:EvapLevel`; sim = `simEvapInv`). Feed level control reads this. |
| `yCondLevel` | — | Condensate analog level (`AI:CondLevel`). |
| `yCondHigh` / `yCondLow` | 0/1 | Condensate tank HIGH / LOW switches (sim = two real levels; real = band off `AI:CondLevel`). |
| `yCondFlow` | L/min | Condensate flow meter (`AI:CondFlow`). |
| `yDemisterWater` / `yDemisterFlood` | — | Demister liquid-present / flood sensors. |

## 5. Derived signals & control outputs

| Variable | Units | Meaning |
|---|---|---|
| `evapTsat` / `steamTsat` | °C | Saturation temps from the pressures (Antoine). |
| `superheatIn` / `superheatOut` | °C | Vapor superheat in / out (`VaporIn−evapTsat`, `VaporOut−steamTsat`). |
| `deltaT` | °C | `steamTsat − evapTsat` — the compression lift (≈2–6 °C). |
| `PressRatio` | — | Steam/evap pressure ratio. |
| `heatOK` | 0/1 | Heaters enabled (run, no trip, phase ≥ HEAT). |
| `trip` | 0/1 | Any interlock tripped. |
| `evapPErr`/`steamPErr`/`vaporOutTErr`/`superHErr` | 0/1 | Individual trip flags (indicators). |
| `shArmed` | 0/1 | Superheat protection armed (latched once superheat first established). |
| `makeupDuty` / `superDuty` | 0..1 | Heater PWM duties → `DO:MakeupHtr` / `DO:SuperHtr`. |
| `makeupI` / `superI` | 0..1 | Heater-PI integrator states. |
| `bypassV` | 0–10 V | Anti-surge bypass-valve command (`AO:BypassValve`). |
| `vfdRpmRead`,`vfdOutVolt/Amps/Pwr`,`vfdTorque`,`vfdEnable`,`accel`,`accelraw`,`sink` | — | VFD telemetry read back from the blower drive (`monitorMotor`). |
| `condPumpOn` | 0/1 | Condensate pump state (`DO:CondPump`), 2-level hysteresis. |

## 6. Condensate flow-meter self-calibration (control side)

| Variable | Units | Meaning |
|---|---|---|
| `condCalFactor` | ~0.8–1.1 | Running flow-meter calibration factor; re-fit each fill against the known 120 ml. |
| `condFillRaw` | ml | RAW meter volume integrated over the current fill. |
| `condProduct` | ml | Calibrated lifetime distillate total. |
| `condVolEst` | ml | Control's tank-level estimate (snaps to the level switches). |
| `prevCondHigh` / `prevCondLow` | 0/1 | Previous-tick switch states (edge detection). |

## 7. Simulator — master switches & monitoring

| Variable | Range | Meaning |
|---|---|---|
| `simEnable` | 0 / 1 | 0 = real AI/TC, 1 = run the plant simulator. (Sim button.) |
| `simDriveHW` | 0 / 1 | In sim: 0 = dry-run (no real relays/VFD), 1 = hardware-in-the-loop. |
| `simSpeed` | 1–160 | Sim time-acceleration ×real. (Tick dt is clamped at 1.0 s, so ≳160 saturates.) |
| `simHeatLoss` | W | **Instantaneous standby heat loss** = `simUAloss × (evapT − ambient)`. ← the heat-loss monitor. |
| `simHeatIn` | W | Total heat into the evaporator (makeup + recovered). |

## 8. Simulator plant parameters

| Variable | Typical | Meaning |
|---|---|---|
| `simAmbient` | 25 °C | Ambient / floor temperature (all temps clamp ≥ this). |
| `simFeedSupply` | 18 °C | Cold feed-water supply temp. |
| `simMakeupPow` | 2000 W | Makeup/startup heater rating (Qmakeup = duty × this). |
| `simSuperPow` | 300 W | Superheat cartridge rating. |
| `simSHmeshEff` | 0.4 | Fraction of cartridge watts the copper mesh delivers to the steam. |
| `simSteamCp` | 2000 J/kg·°C | Steam specific heat (superheat calc). |
| `simUAsteam` | 1500 W/°C | HX → evaporator heat-recovery conductance. |
| `simChx` | 14000 J/°C | HX (steam-chest) thermal mass — 24 lb steel + ~2 L water; sets warm-up lag. |
| `simCevap` | 60000 J/°C | Evaporator thermal mass — sets the warm-up lag. |
| `simUAloss` | 3 W/°C | **Standby heat-loss coefficient** (insulated rig). Drives `simHeatLoss`. |
| `simPRmax` | 1.25 | Blower full-speed pressure ratio (sets ΔT span). |
| `simCompGain` | 60 °C/(PR−1) | Compression superheat added to VaporOut. |
| `simBlowerRated` | 3450 rpm | Blower rated speed (blowFrac = rpm/this). |
| `simVaporMax` | 0.25 L/min | Vapor production at full blower + full boil (production scale). |
| `simLatentPerLpm` | 38000 W | Latent heat per L/min of production (~ real water). |
| `simRecovEff` | 0.97 | Latent fraction recovered (HX condensing + compressor work). 1.0 = makeup→losses only. |
| `simFeedRegen` | 0.85 | Cold feed preheated by the outgoing condensate (feed/condensate regen). |
| `simHXapproach` | 6 °C | HX-bottom temp above the feed inlet at steady state. |
| `simTauHXgrad` | 15 s | HX top→bottom gradient development time. |
| `simTauBlower`/`simTauP`/`simTauSH` | 2/3/5 s | First-order time constants: blower spin-up, evap pressure, superheat. |
| `simSurgeAmp` | 0.06 | Production surge amplitude (fraction). |
| `simFeedNoise` | 2.0 °C | Feed-temp fluctuation (RMS). |

### Condensate-tank / flow-meter sim model
| Variable | Typical | Meaning |
|---|---|---|
| `simCondHoldMax` | 45 ml | Condensate that must build in the HX before it flows (formation delay). |
| `condHighML` / `condLowML` | 170 / 50 ml | Tank HIGH / LOW level-switch volumes (120 ml between = the cal reference). |
| `simPumpMlMin` | 1100 ml/min | Condensate pump removal rate when on. |
| `simFlowCalErr` | 1.12 | Deliberate flow-meter mis-calibration (reads ~12 % high) — the control corrects it. |
| `simFlowNoise` | 0.05 | Flow-meter rate noise (fraction RMS). |

## 9. Simulator state (model outputs — chart these)

| Variable | Units | Meaning |
|---|---|---|
| `simEvapTemp` | °C | Evaporator temperature. |
| `simEvapPress` / `simSteamPress` | psia | Evaporator / steam-side pressure. |
| `simVaporIn` / `simVaporOut` | °C | Vapor temp in / out of the blower. |
| `simSteamChest` | °C | **HX condensing (top) temp** ("steam chest" = the HX shell where vapor condenses). |
| `simHXbottom` | °C | HX cold (feed-inlet, bottom) temp — develops the top→bottom gradient. |
| `simCondTemp` | °C | Condensate temperature (ambient until liquid forms, then subcooled HX-bottom). |
| `simFeedTemp` | °C | Cold feed temp (supply + noise). |
| `simSuperheat` | °C | Vapor superheat produced by the cartridge. |
| `simBlowerRpm` | rpm | Actual blower rpm (lags the command via `simTauBlower`). |
| `simProd` | L/min | Vapor production (boil-off) rate. |
| `simEvapInv` | ml | Evaporator water inventory (prime fills it; feed holds `evapLevelSet`). |
| `simCondVol` | ml | Condensate-tank volume. |
| `simCondHold` | ml | Condensate held in the HX (formation delay). |
| `simCondHigh` / `simCondLow` | 0/1 | Sim tank level switches. |
| `simCondLevel` | 0..1 | Tank fill fraction (chart proxy). |
| `simCondFlow` | L/min | Sim condensate flow-meter reading (mis-cal + noise). |
| `simDemisterWater` / `simDemisterFlood` | — | Sim demister liquid / flood. |
| `simClock` | s | Accumulating sim-seconds (surge/noise phase). |

---

### Notes
- **Heat loss:** the value you asked about is `simHeatLoss` (W), computed every tick
  as `simUAloss × (simEvapTemp − simAmbient)` and clamped ≥0. `simUAloss` is the
  coefficient; lower it for a better-insulated rig. `simHeatIn` shows total heat in.
- **HX volume estimate:** `feedPrimeML`/`evapLevelSet` default to 1500 ml ≈ half of one
  ~3 L fluid side of a 100-plate 5×12″ brazed-plate HX (≈0.06 L per channel × ~50
  channels/side). Tune against the real unit once measured.
- **Pump cal:** set `feedLPerStep` (L/step) and make `feedStepsPerRev` match the
  driver's microstep (Pr0.00). Then `feed L/min = rpm × feedStepsPerRev × feedLPerStep`.
