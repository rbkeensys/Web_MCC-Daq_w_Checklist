# MVR Control & Simulator — Static Variable Reference

Every `static.*` variable used by the MVR expressions, with **default, min, max,
typical** values and what it represents. Defined / first written in
`server/config/expressions.json`. Temps °C, pressures **psia**, heater outputs
PWM duty 0..1, flows L/min, volumes ml unless noted.

Two backends evaluate these identically: Python (`expr_engine.py`) and the
compiled C++ DLL (`expr_to_cpp.py` → `compiled/expressions.dll`). Top-level
`static.x = const` lines in `Setpoints` initialize **once**.

Tick data flow: `MVR System` (phase) → `SensorMux` (real **or** sim → `y*`) →
`SteamTables` → `Interlocks` → heater PIs → `BlowerControl` / `FeedwaterControl`
→ `CondensatePump` → `ProductionControl` / `FeedFollow` → `MVRSim` (plant, sim only).

For **derived / state / sim-output** variables (sections 5, 6, 9) the "Default"
is the init value and Min/Max/Typical are the physical operating envelope, not
user settings.

---

## 1. Operating setpoints — the knobs you set

| Variable | Default | Min | Max | Typical | Meaning |
|---|---|---|---|---|---|
| `runSystem` | 0 | 0 | 1 | 0/1 | Master run (RUN button → `buttonVars.runSystem`). |
| `productionSet` | 0.12 | 0.02 | 0.24 | 0.08–0.18 | **Primary knob** — target distillate rate (L/min). Blower + feed chase it. Values outside `[0, prodSetMax]` are **ignored** (safety). |
| `prodSetMax` | 0.3 | 0.05 | 1.0 | 0.3 | Safety clamp on `productionSet`; an input above this (or below 0) is rejected and the last valid target is kept. |
| `prodSetSafe` | 0.12 | 0 | `prodSetMax` | =`productionSet` | The **validated** target the controllers actually use (last in-bounds `productionSet`). |
| `evapTempSet` | 100.0 | 95 | 105 | 100 | Evaporator boiling setpoint (makeup-PI target), °C. |
| `superheatSet` | 3.0 | 1 | 8 | 2–4 | Vapor superheat setpoint (superheat-PI target), °C. |
| `evapPressSet` | 14.7 | 10 | 20 | 14.7 | Evaporator pressure reference (psia, informational). |
| `blowerRpmSet` | 1500 | 800 | 4000 | 1300–2500 | Blower rpm. **Auto** when `autoBlow=1`, else manual. |
| `feedRpmSet` | 60 | 0 | 300 | 100–300 | Feed-pump motor rpm. **Auto** when `autoFeed=1`, else manual. |
| `evapLevelSet` | 1500 | 500 | 4000 | 1200–1800 | Evaporator working-level target (ml) the feed holds. |
| `autoBlow` | 1 | 0 | 1 | 1 | 1 = blower auto-trims to `productionSet`. |
| `autoFeed` | 1 | 0 | 1 | 1 | 1 = feed auto-holds evaporator level. |

## 2. Startup sequence & feed-pump calibration

| Variable | Default | Min | Max | Typical | Meaning |
|---|---|---|---|---|---|
| `mvrPhase` | 0 | 0 | 3 | 0–3 | Phase: 0 IDLE, 1 PRIME, 2 HEAT, 3 RUN. `mvrState` mirrors it. |
| `feedLPerStep` | 8.96861e-8 | 1e-9 | 1e-5 | ~9e-8 | **FEED PUMP CAL** — L per motor step (200 mL ÷ 223 rev ÷ 10000 steps). |
| `feedStepsPerRev` | 10000 | 200 | 60000 | 10000 | Motor steps/rev — match driver microstep Pr0.00. `L/min = rpm×stepsPerRev×LPerStep`. |
| `feedPrimeML` | 1500 | 200 | 4000 | 1000–2000 | Volume PRIME dead-reckons before heat (≈half a ~3 L HX side). |
| `feedPrimeRpm` | 120 | 30 | 300 | 100–200 | Feed rpm during the PRIME fill. |
| `feedCmdRpm` | 0 | 0 | 300 | 0–300 | **Actual** feed rpm commanded this tick (output). |
| `feedInvEst` | 0 | 0 | 20000 | ~`evapLevelSet` | **Feed-side inventory dead-reckon** (ml): Σ feed-in − Σ calibrated distillate-out. Watch for "getting low". |
| `blowerMinRpm` | 800 | 0 | 4000 | 800 | Production-control blower clamp (min). |
| `blowerMaxRpm` | 4000 | 800 | 4000 | 4000 | Production-control blower clamp (max) — overspeed allowed. |
| `kProd` | 40 | 5 | 300 | 30–80 | Blower production gain (rpm per L/min-error-second). Lower = gentler. |
| `kFeedLevel` | 0.003 | 0 | 0.02 | 0.002–0.005 | Feed level-control gain (L/min per ml error). 0 = feed-forward only. |
| `blowdownFrac` | 0.05 | 0 | 0.3 | 0.05 | Feed excess over distillate (blowdown / concentrate purge). |
| `prodMeas` | 0 | 0 | 0.25 | ≈`productionSet` | Smoothed measured distillate (blower-loop feedback). |

## 3. Control tuning, interlocks & limits

| Variable | Default | Min | Max | Typical | Meaning |
|---|---|---|---|---|---|
| `kpMakeup` | 0.05 | 0 | 0.5 | 0.05 | Makeup-heater P gain. |
| `kiMakeup` | 0.01 | 0 | 0.2 | 0.01 | Makeup-heater I gain. |
| `kpSuper` | 0.05 | 0 | 0.5 | 0.05 | Superheat-heater P gain. |
| `kiSuper` | 0.01 | 0 | 0.2 | 0.01 | Superheat-heater I gain. |
| `surgeThresh` | 1.0 | 0 | 5 | 1.0 | ΔT below which the anti-surge bypass opens (°C). |
| `surgeGain` | 5.0 | 0 | 10 | 5 | Bypass-valve volts per °C of surge. |
| `minSuperheat` | 0.5 | 0 | 5 | 0.5 | Wet-compression trip threshold (°C, latched-arm). |
| `superheatGraceTemp` | 90 | 50 | 100 | 90 | Superheat interlock arms only above this (°C). |
| `condLevelThresh` | 2.5 | 0 | 10 | 2.5 | Real condensate analog level threshold. |
| `demisterThresh` | 2.5 | 0 | 10 | 2.5 | Demister liquid-present threshold. |
| `ventOpenDuty` | 0.6 | 0 | 1 | 0.6 | Steam vent opens while makeup duty is above this (startup steam). |
| `ventCloseDuty` | 0.35 | 0 | 1 | 0.35 | Steam vent closes once makeup duty drops below this (recovery established). |
| `maxEvapPress` | 25.0 | 15 | 40 | 25 | Evaporator over-pressure trip (psia). |
| `maxSteamPress` | 35.0 | 20 | 50 | 35 | Steam-side over-pressure trip (psia). |
| `maxVaporOut` | 140.0 | 110 | 160 | 140 | Vapor-out over-temp trip (°C). |
| `makeupHtrMax` | 110 | 100 | 130 | 110 | Makeup-cartridge TC trip (°C) — heater uncovered / feed overheat → immediate shutdown. |
| `superHtrMax` | 150 | 120 | 200 | 150 | Superheat-cartridge TC trip (°C) → immediate shutdown. |
| `makeupHtrTrip` / `superHtrTrip` | 0 | 0 | 1 | 0 | Latched overheat-trip flags (clear by cycling `runSystem`). Indicators. |
| `timeIncSec` | 0.00625 | — | — | 0.00625 | Control tick period (s) — set to the real loop rate. |

### Setpoint safety bounds (validate-and-ignore)

Each live setpoint is range-checked in `MVR System` every tick. If the entered
value is **out of bounds it is IGNORED** and the controllers keep the last valid
value (held in a `*Safe` companion). Set the entered value back in-range to
resume. Controllers read the `*Safe` var, never the raw input.

| Setpoint | Bound vars | Range | `*Safe` (used by) |
|---|---|---|---|
| `productionSet` | `prodSetMax` (0.3) | 0 … prodSetMax L/min | `prodSetSafe` → blower loop |
| `superheatSet` | `superheatSetMax` (10) | 0 … 10 °C | `superheatSetSafe` → SuperheatControl |
| `evapTempSet` | `evapTempSetMin` (90), `evapTempSetMax` (110) | 90 … 110 °C | `evapTempSetSafe` → MakeupControl |
| `blowerRpmSet` | `blowerMaxRpm` (4000) | 0 … 4000 rpm | `blowerRpmSafe` → VFD command |
| `feedRpmSet` | `feedRpmMax` (300) | 0 … 300 rpm | `feedRpmSafe` → stepper command |

## 4. Sensor mux — abstracted sensors (`y*`, outputs)

`SensorMux` sets these from real AI/TC (`simEnable=0`) or the sim (`=1`).
Everything downstream reads only `y*`.

| Variable | Init | Operating range | Real source |
|---|---|---|---|
| `yEvapTemp` | — | 18–105 °C | `TC:EvapTemp` |
| `yEvapPress` / `ySteamPress` | — | 0.5–35 psia | `AI:EvapPress` / `AI:SteamPress` |
| `yVaporIn` / `yVaporOut` | — | 18–150 °C | `TC:VaporIn` / `TC:VaporOut` |
| `yMakeupHtrTemp` | — | 25–160 °C | Makeup-cartridge TC (`TC:MakeupHtr`, E-TC ch6) — overheat/uncover trip |
| `ySuperHtrTemp` | — | 25–200 °C | Superheat-cartridge TC (`TC:SuperHtr`, E-TC ch7) — overheat trip |
| `yEvapLevel` | — | 0–4000 ml | `AI:EvapLevel` (sim = `simEvapInv`) — feed level feedback |
| `yCondLevel` | — | 0–10 | `AI:CondLevel` |
| `yCondHigh` / `yCondLow` | — | 0/1 | Condensate HIGH / LOW switches |
| `yCondFlow` | — | 0–0.3 L/min | `AI:CondFlow` |
| `yDemisterWater` / `yDemisterFlood` | — | 0–5 | Demister liquid / flood |

## 5. Derived signals & control outputs

| Variable | Init | Operating range | Meaning |
|---|---|---|---|
| `evapTsat` / `steamTsat` | — | 30–110 °C | Saturation temps from the pressures. |
| `superheatIn` / `superheatOut` | — | 0–10 °C | Vapor superheat in / out. |
| `deltaT` | — | 2–6 °C | `steamTsat−evapTsat` — the compression lift. |
| `PressRatio` | — | 1.0–1.25 | Steam/evap pressure ratio. |
| `heatOK` | — | 0/1 | Heaters enabled (run, no trip, phase ≥ HEAT). |
| `trip` | — | 0/1 | Any interlock tripped. |
| `evapPErr`/`steamPErr`/`vaporOutTErr`/`superHErr` | — | 0/1 | Individual trip flags. |
| `shArmed` | 0 | 0/1 | Superheat protection armed (latched). |
| `makeupDuty` / `superDuty` | — | 0..1 | Heater PWM duties (→ `DO:MakeupHtr` / `DO:SuperHtr`). Typical makeup 0.1–0.3, super 0.05–0.15. |
| `makeupI` / `superI` | 0 | 0..1 | Heater-PI integrator states. |
| `bypassV` | — | 0–10 V | Anti-surge bypass command (`AO:BypassValve`). |
| `vfdRpmRead`,`vfdOutVolt/Amps/Pwr`,`vfdTorque`,`vfdEnable`,`accel`,`accelraw`,`sink` | — | — | Blower VFD telemetry (`monitorMotor`). |
| `condPumpOn` | 0 | 0/1 | Condensate pump (`DO:CondPump`), 2-level hysteresis. |
| `ventOpen` | 0 | 0/1 | Steam vent (`DO:VentValve`) — open during the steamy startup, closed once makeup backs off. |

## 6. Condensate flow-meter self-calibration (control state)

| Variable | Default | Min | Max | Typical | Meaning |
|---|---|---|---|---|---|
| `condCalFactor` | 1.0 | 0.5 | 1.5 | 0.8–1.0 | Running flow-meter cal; re-fit each fill vs the known 120 ml. |
| `condFillRaw` | 0 | 0 | ~150 | 0–120 | RAW meter volume over the current fill (ml). |
| `condProduct` | 0 | 0 | ∞ | grows | Calibrated lifetime distillate total (ml). |
| `condVolEst` | 0 | 50 | 170 | 50–170 | Control's tank-level estimate (ml), snaps at switches. |
| `prevCondHigh` / `prevCondLow` | 0 | 0 | 1 | 0/1 | Previous-tick switch states (edge detect). |

## 7. Simulator — master switches & monitoring

| Variable | Default | Min | Max | Typical | Meaning |
|---|---|---|---|---|---|
| `simEnable` | 0 | 0 | 1 | 0/1 | 0 = real AI/TC, 1 = run the plant simulator. |
| `simDriveHW` | 0 | 0 | 1 | 0 | In sim: 0 = dry-run, 1 = hardware-in-the-loop. |
| `simReset` | 0 | 0 | 1 | 0 | One-shot: set to 1 (Sim-panel **Reset** button) to snap the plant + control state to cold/ambient startup. Self-clears; only acts while simulating. |
| `simSpeed` | 120 | 1 | 160 | 60–160 | Sim time accel ×real (dt clamps at 1.0 s, so ≳160 saturates). |
| `simHeatLoss` | 0 | 0 | ~250 | 200–240 | **Instantaneous standby heat loss** (W) = `simUAloss×(evapT−ambient)`. |
| `simHeatIn` | 0 | 0 | ~4500 | 2000–4500 | Total heat into the evaporator (makeup + recovery) (W). |

## 8. Simulator plant parameters

| Variable | Default | Min | Max | Typical | Meaning |
|---|---|---|---|---|---|
| `simAmbient` | 25 | 5 | 40 | 20–25 | Ambient / floor temp (°C; temps clamp ≥ this). |
| `simFeedSupply` | 18 | 5 | 30 | 15–20 | Cold feed-water supply temp (°C). |
| `simMakeupPow` | 2000 | 500 | 6000 | 2000 | Makeup/startup heater rating (W). |
| `simSuperPow` | 300 | 100 | 1000 | 300 | Superheat cartridge rating (W). |
| `simSHmeshEff` | 0.4 | 0.1 | 1.0 | 0.3–0.5 | Fraction of cartridge W the copper mesh delivers to the steam. |
| `simSteamCp` | 2000 | 1800 | 2200 | 2000 | Steam specific heat (J/kg·°C). |
| `simUAsteam` | 1500 | 500 | 4000 | 1500 | HX → evaporator heat-recovery conductance (W/°C). |
| `simChx` | 14000 | 5000 | 40000 | 14000 | HX thermal mass (J/°C) — 24 lb steel + ~2 L water; warm-up lag. |
| `simCevap` | 60000 | 20000 | 200000 | 60000 | Evaporator thermal mass (J/°C) — warm-up lag. |
| `simUAloss` | 3 | 0 | 30 | 3–5 | **Standby heat-loss coefficient** (W/°C). Drives `simHeatLoss`. |
| `simPRmax` | 1.25 | 1.05 | 1.6 | 1.2–1.3 | Blower full-speed pressure ratio (sets ΔT span). |
| `simCompGain` | 60 | 0 | 150 | 60 | Compression superheat on VaporOut (°C per PR−1). |
| `simBlowerRated` | 3450 | 1000 | 5000 | 3450 | Blower rated rpm (blowFrac = rpm/this). |
| `simVaporMax` | 0.25 | 0.05 | 1.0 | 0.25 | Vapor production at full blower + full boil (L/min). |
| `simLatentPerLpm` | 38000 | 30000 | 42000 | 38000 | Latent heat per L/min of production (W). |
| `simRecovEff` | 0.97 | 0.8 | 1.0 | 0.95–0.99 | Latent fraction recovered. 1.0 = makeup → losses only. |
| `simFeedRegen` | 0.85 | 0 | 0.98 | 0.8–0.9 | Cold feed preheated by the condensate (feed/cond regen). |
| `simHXapproach` | 6 | 2 | 20 | 5–10 | HX-bottom temp above the feed inlet at steady state (°C). |
| `simTauHXgrad` | 15 | 2 | 60 | 10–20 | HX top→bottom gradient development time (s). |
| `simTauBlower` | 2.0 | 0.5 | 10 | 2 | Blower spin-up / vapor-out time const (s). |
| `simTauP` | 3.0 | 0.5 | 10 | 3 | Evaporator pressure response (s). |
| `simTauSH` | 5.0 | 1 | 15 | 5 | Superheat response (s). |
| `simSurgeAmp` | 0.06 | 0 | 0.3 | 0.05–0.1 | Production surge amplitude (fraction). |
| `simFeedNoise` | 2.0 | 0 | 5 | 1–3 | Feed-temp fluctuation (°C RMS). |
| `simHtrCoverML` | 300 | 100 | 1000 | 300 | Evaporator inventory above which the makeup cartridge stays covered (ml). |
| `simMakeupCovRise` | 3 | 0 | 20 | 3 | Makeup cartridge surface rise/duty when covered (°C). |
| `simMakeupRise` | 150 | 50 | 400 | 150 | Extra makeup surface rise/duty when **uncovered** (°C) — drives the trip. |
| `simSuperRise` | 300 | 100 | 600 | 300 | Superheat cartridge surface rise/duty (°C). |
| `simTauHtr` | 3.0 | 0.5 | 10 | 3 | Cartridge surface thermal response (s). |
| `simMakeupHtrTemp` / `simSuperHtrTemp` | 25 | 25 | 200 | — | Sim cartridge surface temps (feed `yMakeupHtrTemp` / `ySuperHtrTemp`). |
| `simCondHoldMax` | 45 | 0 | 200 | 30–60 | Condensate built in HX before it flows (ml). |
| `condHighML` | 170 | 60 | 500 | 170 | Tank HIGH level-switch volume (ml). |
| `condLowML` | 50 | 10 | 150 | 50 | Tank LOW level-switch volume (ml). The 120 ml gap is the cal reference. |
| `simPumpMlMin` | 1100 | 200 | 3000 | 1100 | Condensate pump removal rate when on (ml/min). |
| `simFlowCalErr` | 1.12 | 0.8 | 1.3 | 1.0–1.15 | Deliberate flow-meter mis-cal (reads high); control corrects it. |
| `simFlowNoise` | 0.05 | 0 | 0.2 | 0.05 | Flow-meter rate noise (fraction RMS). |

## 9. Simulator state (model outputs — chart these)

| Variable | Init | Operating range | Meaning |
|---|---|---|---|
| `simEvapTemp` | 25 | 25–105 °C | Evaporator temperature. |
| `simEvapPress` / `simSteamPress` | 0.5 | 0.5–18 psia | Evaporator / steam-side pressure. |
| `simVaporIn` / `simVaporOut` | 25 | 25–150 °C | Vapor temp in / out of the blower. |
| `simSteamChest` | 25 | 25–106 °C | **HX condensing (top) temp** — the "steam chest". |
| `simHXbottom` | 25 | 25–106 °C | HX cold feed-inlet (bottom) temp — develops the gradient. |
| `simCondTemp` | 25 | 25–100 °C | Condensate temp (ambient until liquid forms, then subcooled). |
| `simFeedTemp` | 18 | 13–23 °C | Cold feed temp (supply + noise). |
| `simSuperheat` | 0 | 0–6 °C | Vapor superheat from the cartridge. |
| `simBlowerRpm` | 0 | 0–4000 | Actual blower rpm (lags command). |
| `simProd` | 0 | 0–0.25 L/min | Vapor production (boil-off) rate. |
| `simEvapInv` | 0 | 0–4000 ml | True evaporator inventory (prime fills; feed holds `evapLevelSet`). |
| `simCondVol` | 0 | 0–170 ml | Condensate-tank volume. |
| `simCondHold` | 0 | 0–45 ml | Condensate held in the HX (formation delay). |
| `simCondHigh` / `simCondLow` | 0 | 0/1 | Sim tank level switches. |
| `simCondLevel` | 1.0 | 0–1 | Tank fill fraction (chart proxy). |
| `simCondFlow` | 0 | 0–0.3 L/min | Sim flow-meter reading (mis-cal + noise). |
| `simDemisterWater` / `simDemisterFlood` | 0 | 0–5 | Sim demister liquid / flood. |
| `simClock` | 0 | grows | Accumulating sim-seconds (surge/noise phase). |

---

### Notes
- **Heat loss:** `simHeatLoss` (W) = `simUAloss × (simEvapTemp − simAmbient)`,
  clamped ≥0. `simUAloss` is the coefficient (lower = better insulated).
  `simHeatIn` = total heat in.
- **Feed-side water:** `feedInvEst` is the dead-reckoned feedwater on the HX feed
  side — feed pumped in (positive-displacement, exactly known) minus calibrated
  distillate out (anchored by the condensate 120 ml high/low cal). Watch it to
  see how close to dry you are. It also gates PRIME completion and can drive the
  feed level control directly (set `kFeedLevel` and swap `yEvapLevel→feedInvEst`
  in FeedFollow) if you have **no** evaporator level sensor.
- **HX volume:** `feedPrimeML` / `evapLevelSet` ≈ 1500 ml ≈ half of one ~3 L
  fluid side of a 100-plate 5×12″ brazed-plate HX (≈0.06 L/channel × ~50
  channels). Tune to the real unit.
- **Pump cal:** `feedLPerStep` (L/step) × `feedStepsPerRev` (match driver Pr0.00),
  then `feed L/min = rpm × feedStepsPerRev × feedLPerStep`. Current value:
  200 mL / 223 rev / 10000 steps = 8.96861e-8 L/step.
