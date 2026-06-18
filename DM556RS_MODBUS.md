# DM556RS (STEPPERONLINE) — Modbus RTU register map

Extracted from the OYOSTEPPER/StepperOnline "Modbus RS485 Stepper Drive User Manual"
(DM556RS, Leadshine-style RS / PR-mode protocol). This is the feedwater-pump driver.
All registers are 16-bit holding registers; 32-bit values use a high/low register pair.

## Protocol / function codes
- **FC 0x03** read one or many registers · **FC 0x06** write single · **FC 0x10** write multiple
- Modbus RTU. Slave address, baud, format set on the drive (confirm defaults; typical 9600/19200, 8N1).
- Peak-current example: `0x0191 = 0x0020 = 32 → 3.2 A` (unit 0.1 A).

## Enable / control word
- **Enable (force via comms):** `Pr0.07 @ 0x000F = 1` → drive enabled. (DI function 0x08 = SRV-ON is the IO route.)
- **Control word `0x1801`** (write-to-act, self-clearing):
  - `0x1111` reset current alarm · `0x1122` reset history alarm
  - `0x2211` save all params to EEPROM · `0x2222` param reset (excl. motor) · `0x2233` factory reset · `0x2244` save mappings to EEPROM
  - `0x4001` JOG CW · `0x4002` JOG CCW  (**keep-alive: must rewrite at least every 50 ms to keep jogging**)
- Save status word `0x1901` (R): `0x5555` ok, `0xAAAA` fail.

## PR (path) motion — the main control mechanism
- **Trigger register `0x6002` (Pr8.02):** write `0x10` = run PR0 (path N = `0x10+N`); `0x040` = E-stop/quick-stop; `0x20` = CTRG; `0x21` = homing trigger.
- **PR control `0x6000` (Pr8.00).**
- **PR0 path block — `Pr9.00..9.07 = 0x6200..0x6207`** (each path is 8 regs; PR1 = `0x6208..620F`, etc.):
  | Reg | Par | Field | Unit |
  |---|---|---|---|
  | `0x6200` | Pr9.00 | PR0 mode (position abs/rel, velocity, homing — see manual §PR mode bits) | — |
  | `0x6201` | Pr9.01 | Position **high** 16-bit | pulses |
  | `0x6202` | Pr9.02 | Position **low** 16-bit | pulses |
  | `0x6203` | Pr9.03 | Velocity | rpm |
  | `0x6204` | Pr9.04 | Acceleration | ms/1000rpm |
  | `0x6205` | Pr9.05 | Deceleration | ms/1000rpm |
  | `0x6206` | Pr9.06 | Pause time | — |
  | `0x6207` | Pr9.07 | Special (PR0 maps to Pr8.02) | — |

**Continuous feed (Profile Velocity):** set `0x6200` mode = velocity, `0x6203` = rpm, then write `0x10` to `0x6002` → runs until quick-stop (`0x040`→`0x6002`).
**Precise dose (Profile Position):** set `0x6200` mode = position (abs/rel), `0x6201/0x6202` = pulse count, `0x6203` velocity, `0x6204/05` acc/dec, trigger `0x10`→`0x6002` → moves exactly N pulses = exact volume.

## JOG (RS485)
- JOG1 velocity `Pr8.39 @ 0x6027`, JOG2 velocity `Pr8.38 @ 0x6026`, JOG Acc `Pr8.40 @ 0x6028`, JOG Dec `Pr8.41 @ 0x6029` (rpm, ms/1000rpm).
- Run: control word `0x1801 = 0x4001/0x4002` (CW/CCW, keep-alive ≤50 ms). Quick stop: `0x40 → 0x6002`.

## Status / monitoring (read, FC 0x03)
- `0x1003` **Motion state**: bit0 fault · bit1 enabled · bit2 running · bit4 command complete · bit5 path complete · bit6 homing complete.
- `0x1012/0x1013` Profile position (pulses) · `0x1014/0x1015` Feedback position · `0x1010/0x1011` Following error.
- `0x1044/0x1045` Profile velocity (rpm) · `0x1046/0x1047` Feedback velocity (rpm).
- `0x2203` **Current alarm**: `0x01` over-current · `0x02` over-voltage · `0x40` current-sampling · `0x80` lock-shaft fail · `0x100` auto-tuning · `0x200` EEPROM.

## Key setup params
- `Pr0.00 @ 0x0001` pulses/rev (microstep, default 10000) · `Pr0.03 @ 0x0007` direction (0=CW) · `Pr5.00 @ 0x0191` peak current (0.1 A).

## Use for the feedwater peristaltic pump
- **Steady feed** → Profile Velocity on PR0, rpm set by the level/mass-balance controller (write `0x6203`, trigger `0x10`→`0x6002`).
- **Priming / batch dose** → Profile Position on PR0: pulses = revs × (Pr0.00) = volume × pump mL/rev calibration.
- Fits the existing `vfd_driver.py` profile framework as a new **drive class "stepper"** (PR-mode command set) alongside VFD profiles.
