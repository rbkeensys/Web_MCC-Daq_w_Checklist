# MCC-CTR4 — Pico 4-channel pulse counter

Version 2.2.1 — 2026-11-20 (after 4 s with no CH0 edge the LED falls back to one short flash per sample period, as a heartbeat, until the next edge). 2.2.0 same day: the LED is a CH0 activity light, one 2 ms flash per falling edge on GP1, from a GPIO interrupt that runs beside the hardware counter (2.1.1/2.1.2 flashed once per sample period instead). 2.1.0 on 2026-11-19: optional I2C LCD1602 readout, see below. 2.0.1 same day: help list on `?`/`H`; control bytes ignored. 2.0.0 on 2026-11-18: hardware counting in the PWM slices, one streamed line per timer window, first run on a real Pico (timing within 10 µs, self-test exact on all four slices). 1.0.0 on 2026-11-16 counted with GPIO interrupts.

A Raspberry Pi Pico counts pulses on four inputs in hardware and, four times a second, hands the main Pi the number of pulses that landed in the last window. The Pi turns that into Hz and L/min. The CPU on the Pico never handles an edge, so nothing on it (USB, the main loop, garbage collection) can delay or drop a pulse.

## Files

| File | What |
|---|---|
| `main.py` | Pico firmware (MicroPython). Copy to the Pico as `main.py`; it runs at power-up. |
| `../../tools/pico_ctr4_test.py` | Host checker: finds the Pico, listens to the stream, prints pulses per window, Hz, totals and SMWF-0420A L/min. |

## How it counts

Each RP2040 PWM slice has a 16-bit counter that can be clocked from its B pin instead of the system clock. The firmware puts slices 0 to 3 in falling-edge count mode (`CSR.DIVMODE = 3`, divider 1.0, `TOP = 0xFFFF`), so every low-going edge on the pin advances the counter by one, in silicon.

A `machine.Timer` fires every 250 ms. Its callback reads the four counters and the microsecond clock. The main loop takes the difference from the previous reading, modulo 65536, which is the pulse count for that window, and sends it with the window's true length. The counter is never written back to zero after a read: the slice has no atomic read-and-clear, so a pulse arriving between the read and the write would be lost. The free-running difference gives the same number with nothing lost, as long as a window holds fewer than 65535 pulses (262 kHz at 250 ms).

Only the B pin of a slice can be a counter input, and B pins are the odd GPIOs, which is why the channels moved from GP2–GP5 (v1) to GP1/3/5/7.

## Flashing

1. Hold BOOTSEL, plug the Pico into USB, release. It mounts as `RPI-RP2`.
2. Copy the MicroPython UF2 for Pico (or Pico W / Pico 2, match the board) onto it. It reboots as a USB serial device.
3. Open Thonny, pick the Pico interpreter, open `main.py`, File → Save as → Raspberry Pi Pico → name it `main.py`. Or use `mpremote cp main.py :main.py`.
4. Unplug and replug. The port prints `ID,MCC-CTR4,2.2.0,<boot>,<ms>` once, then a `W,...` line every 250 ms. The LED flashes for 2 ms on every falling edge on CH0 (GP1), so its brightness follows the pulse rate (about 20 % duty at the SMWF meter's 97 Hz full scale). After 4 s without an edge it falls back to a heartbeat, one short flash per sample period (a tenth of the window, 25 ms at 250 ms), so a board with a dead or unwired input still shows it is alive and sampling; the first edge switches it back at once. The edge flash comes from a GPIO interrupt on the same pad; the pulse itself is still counted by the PWM slice, so a late interrupt can only cost a flash, never a count.

Before leaving it on the rig set `USE_WDT = True` in `main.py` so a hung Pico reboots in 8 s. Leave it `False` while working in Thonny.

## Wiring

| Signal | Pico pin | Notes |
|---|---|---|
| CH0 | GP1, board pin 2 | PWM slice 0, B input |
| CH1 | GP3, board pin 5 | PWM slice 1, B input |
| CH2 | GP5, board pin 7 | PWM slice 2, B input |
| CH3 | GP7, board pin 10 | PWM slice 3, B input |
| Sensor GND | pin 3, 8 or 38 | common with sensor supply ground |
| Pull-ups | 3V3 OUT, pin 36 | 10 kΩ from each input to 3V3. The internal pull-up is on too but is weak. |
| Sensor V+ | VBUS, pin 40 (5 V from USB) | for sensors needing 4.5 V or more, e.g. SMWF-0420A red wire |

Inputs count the falling edge, which is what an open-collector or Hall output produces when it pulls low. Never pull an input up to 5 V: RP2040 GPIOs are not 5 V tolerant. An open-collector sensor fed from 5 V is fine as long as its output is pulled to 3V3, which is the case here. The firmware forces each pad's output driver off, so the pin can never fight the sensor even though its function is PWM.

SMWF-0420A: red = V+ (VBUS), black = GND, white = output to the channel pin, 10 kΩ to 3V3, optional 4.7 nF output to GND per its datasheet. Its output is 50 × Q − 3 Hz with Q in L/min (3000 pulses per litre), 97 Hz at full scale.

## Optional LCD (starter-kit LCD1602 with the I2C backpack)

A 16×2 character LCD on a PCF8574 I2C backpack is detected at boot (addresses 0x27, 0x3F, 0x20, 0x38 tried in that order) and shows:

```
CTR4 2.1.2 250ms     <- ID, firmware version, window period
0024 0005            <- pulses in the last window, CH0 then CH1, 4 digits each
```

The second line refreshes every window (4×/s). Without a display nothing changes; if the display drops off the bus mid-run the firmware stops writing to it and keeps counting. `L` reports `L,0x27` or `L,none`. The `X` command writes `REPL` on the second line.

| LCD pin | Pico pin | Notes |
|---|---|---|
| VCC | 3V3 OUT, board pin 36 | try this first. If the text is faint or blank with the contrast pot adjusted, use VBUS, board pin 40 (5 V) |
| GND | board pin 38 | any GND pin |
| SDA | GP8, board pin 11 | I2C0 SDA |
| SCL | GP9, board pin 12 | I2C0 SCL |

5 V note: the backpack pulls SDA/SCL up to its VCC, and RP2040 pins are not 5 V tolerant. Running these displays at 5 V on a Pico is common practice and works, but it is outside the datasheet; a level shifter, or moving the backpack pull-ups to 3.3 V, is the proper fix.

## Protocol

ASCII lines over USB CDC, newline terminated. Baud setting is ignored. Streaming is on at boot.

| Direction | Line | Meaning |
|---|---|---|
| Pico → host, every window | `W,<uptime_ms>,<dt_us>,<n0>,<n1>,<n2>,<n3>,<t0>,<t1>,<t2>,<t3>` | `dt_us` = true window length, `n` = pulses in it, `t` = running total since boot or zero |
| host `?` | `ID,MCC-CTR4,<ver>,<boot_id>,<uptime_ms>` then the help list | identify. `boot_id` changes on every reset. The help lines start with `#`; hosts ignore them. |
| host `H` | the help list | one `# ...` line per command |
| host `R` | the latest `W` line again | |
| host `Z` or `Z,<ch>` | `OK` | zero all totals, or one channel's |
| host `W` | `W,<ms>` | show the window period (2 fields, so it cannot be mistaken for a count line) |
| host `W,<ms>` | `OK` | set the window period, 50 to 5000 ms |
| host `S,0` / `S,1` | `OK` | streaming off / on |
| host `T,<ch>,<n>` | `OK` | self-test: steps that channel's hardware counter by `n` through the slice's PH_ADV bit, so the total must move by exactly `n` with nothing wired (`tools/pico_ctr4_test.py --inject 37`) |
| host `L` | `L,0x27` or `L,none` | LCD detected at boot, and its I2C address |
| host `X` | `OK` | exit to the REPL. Ctrl-C is disabled in the firmware, so Thonny and `mpremote` cannot interrupt it; send `X` first (any serial terminal), then connect. |
| other | `ERR,<reason>` | |

Rate on the host: `Hz = n / (dt_us / 1e6)`. One 250 ms window at 97 Hz holds about 24 pulses, so a single window quantizes to 4 Hz; the Pi averages over `rateWindowS` (default 1 s) for 1 Hz resolution. The totals `t` are monotonic, so a dropped or garbled line never loses a pulse from the totaliser. If `t` goes backwards or an `ID,` banner appears mid-stream, the Pico rebooted: its window and streaming are back at defaults and the host re-sends `W,<ms>` and `S,1`.

## What changed from 1.x

- Counting moved from GPIO interrupts to the PWM slice hardware counters. Inputs moved to GP1/3/5/7.
- The Pico pushes a line per window instead of being polled with `R`.
- No per-pulse period and no on-Pico debounce (`G` command gone): the slice only counts. The Hall-output SMWF meters never needed debounce; a reed-switch meter would need an RC filter at the pin instead.
- Limits: 8 slices on an RP2040 (12 on a Pico 2), so up to 8 counters if more channels are ever wanted.

## Checking it

```bash
python3 tools/pico_ctr4_test.py --zero
```

Touch each input to GND a few times and the matching channel total should step by exactly that many. With a meter flowing, the Hz column should match the sensor's table.

## Putting it on the rig

On the Pi the Pico appears as `/dev/ttyACM0` or similar. Use its `/dev/serial/by-id/usb-MicroPython_Board_in_FS_mode_<serial>-if00` name in the Counters editor, like the VFD and stepper ports, so USB enumeration order cannot swap it. The `mvr` service user needs `plugdev` and `dialout` for ttyACM. The server side is `server/pico_counter.py` (2.x), which refuses a 1.x firmware with a clear error.
