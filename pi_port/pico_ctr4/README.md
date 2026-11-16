# MCC-CTR4 — Pico 4-channel pulse counter

Version 1.0.0 — 2026-11-16 (first build: four flow-meter counters for the MVR rig; the E-1608 has only one hardware counter).

A Raspberry Pi Pico counts pulses on four inputs with hard GPIO interrupts and hands the totals to the main Pi over its USB serial port. The host turns count deltas into flow rate, so nothing is lost between polls and the poll timing does not matter.

## Files

| File | What |
|---|---|
| `main.py` | Pico firmware (MicroPython). Copy to the Pico as `main.py`; it runs at power-up. |
| `../../tools/pico_ctr4_test.py` | Host checker: finds the Pico, polls once a second, prints totals, Hz and SMWF-0420A L/min. |

## Flashing

1. Hold BOOTSEL, plug the Pico into USB, release. It mounts as `RPI-RP2`.
2. Copy the MicroPython UF2 for Pico (or Pico W / Pico 2, match the board) onto it. It reboots as a USB serial device.
3. Open Thonny, pick the Pico interpreter, open `main.py`, File → Save as → Raspberry Pi Pico → name it `main.py`. Or use `mpremote cp main.py :main.py`.
4. Unplug and replug. The LED blinks at 1 Hz and the port prints `ID,MCC-CTR4,1.0.0,<boot>,<ms>` once on connect.

Before leaving it on the rig set `USE_WDT = True` in `main.py` so a hung Pico reboots in 8 s. Leave it `False` while working in Thonny.

## Wiring

| Signal | Pico pin | Notes |
|---|---|---|
| CH0 | GP2, board pin 4 | |
| CH1 | GP3, board pin 5 | |
| CH2 | GP4, board pin 6 | |
| CH3 | GP5, board pin 7 | |
| Sensor GND | pin 3, 8 or 38 | common with sensor supply ground |
| Pull-ups | 3V3 OUT, pin 36 | 10 kΩ from each input to 3V3. The internal pull-up is on too but is weak. |
| Sensor V+ | VBUS, pin 40 (5 V from USB) | for sensors needing 4.5 V or more, e.g. SMWF-0420A red wire |

Inputs count the falling edge, which is what an open-collector or Hall output produces when it pulls low. Never pull an input up to 5 V: RP2040 GPIOs are not 5 V tolerant. An open-collector sensor fed from 5 V is fine as long as its output is pulled to 3V3, which is the case here.

SMWF-0420A: red = V+ (VBUS), black = GND, white = output to the channel pin, 10 kΩ to 3V3, optional 4.7 nF output to GND per its datasheet. Its output is 50 × Q − 3 Hz with Q in L/min (3000 pulses per litre), 97 Hz at full scale.

## Protocol

ASCII lines over USB CDC, newline terminated. Baud setting is ignored.

| Host sends | Pico replies | Meaning |
|---|---|---|
| `?` | `ID,MCC-CTR4,<ver>,<boot_id>,<uptime_ms>` | identify. `boot_id` changes on every reset. |
| `R` | `C,<uptime_ms>,<c0>,<p0>,<c1>,<p1>,<c2>,<p2>,<c3>,<p3>` | `c` = total edges since boot or zero (monotonic), `p` = last edge-to-edge period in µs, 0 when none or stale |
| `Z` or `Z,<ch>` | `OK` | zero all, or one channel |
| `G` | `G,<g0>,<g1>,<g2>,<g3>` | show min-gap (debounce) per channel in µs |
| `G,<ch>,<us>` | `OK` | set min-gap. 0 for Hall sensors. About 2000 for reed-switch meters. |
| `S,<ms>` | `OK` | stream `C` lines every `ms` without being asked. `S,0` stops. |
| other | `ERR,<reason>` | |

Rate on the host: `Hz = (c_now − c_prev) / (t_now − t_prev)`. If a count goes backwards or `boot_id` changes, the Pico rebooted. Drop that one delta. At low flow a 1 s delta quantizes to whole Hz. `1e6 / p` gives the instantaneous rate from the last period when that matters. `p` returns to 0 after four missing periods (at least 2 s), which is the zero-flow signal.

## Why interrupts, and the limits

`Pin.irq(hard=True)` runs the handler inside the interrupt, not through MicroPython's scheduler, so USB traffic, the main loop and garbage collection cannot delay or drop it. The handler does integer work on pre-allocated arrays only, which is the rule for hard handlers. Measured handler cost is a few microseconds, so four channels at several kHz each are fine. The SMWF meters top out at 97 Hz, more than 30× below that. Counters are folded into Python big ints in the main loop so the IRQ never allocates, and the totals never wrap.

If a future sensor needs tens of kHz, move counting into a PIO state machine or a PWM slice in edge-count mode. The protocol stays the same.

## Checking it

```bash
python3 tools/pico_ctr4_test.py --zero
```

Touch each input to GND a few times and the matching channel total should step by exactly that many. With a meter flowing, the Hz column should match the sensor's table.

## Putting it on the rig

On the Pi the Pico appears as `/dev/ttyACM0` or similar. Use its `/dev/serial/by-id/usb-MicroPython_Board_in_FS_mode_<serial>-if00` name in config, like the VFD and stepper ports, so USB enumeration order cannot swap it. The `mvr` service user needs `plugdev` and `dialout` for ttyACM. Integration into the MCC server (a poller thread that publishes the four rates as named inputs, like the serial scales) is a separate step.
