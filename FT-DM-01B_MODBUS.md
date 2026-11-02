# FT-DM-01B dual-channel brushed DC driver — RS485 / Modbus RTU notes

Version: 1.0 (2026-11-02)

Manufacturer: Henan Yakong Technology (河南亚控科技), https://www.hnykkj.com
Product page: https://www.hnykkj.com/page4?product_id=174
Downloads page: https://www.hnykkj.com/page20?article_id=40 (RAR containing only `FT-DM-01B-V1.3.1.exe`, the Windows demo tool)
Tech support: 17337313710 (WeChat) / Yklab@163.com
Also sold as a PCBA by Huzhou Ganchuang (ganchuangpcb.com) and on 1688 (brand 亚控, model FT-DM-01B, ~¥195).

> **Provenance / caveat.** Yakong publishes no PDF protocol. Everything below was reverse-engineered
> from the .NET demo tool (`YK_ModbusRtu_N4`, built on NModbus4) by reading its metadata, IL and
> UI strings. The exe was never executed. Verify on the bench before relying on it. Open questions
> are marked **(?)**.

## Hardware summary (from product page + silkscreen)

| Item | Value |
|---|---|
| Supply | 8–24 V DC (under-voltage protection) |
| Channels | 2, independently controlled (M1+/M1-, M2+/M2-) |
| Rated current | 3 A per channel |
| Stall-protection current | 5 A default, adjustable 0.5–20 A (page); tool caps at 6.0 A |
| Peak current | 8 A per channel |
| Speed control | PWM duty 0–100 % |
| Processor | ARM Cortex-M |
| Temperature | −30 °C to 80 °C |
| Terminals | `+` `−` (8-24V), `GND`, `485+`, `485-`, `恢复出厂` (factory reset), `M1+ M1- M2+ M2-` |
| LEDs | red = power, green = status |
| Notes | Never short motor outputs; vendor recommends an inline fuse per motor |

## Serial link

- RS485, **Modbus RTU**, factory default **9600 baud, 8 data, no parity, 1 stop**.
- Function codes used by the tool: 0x03 read holding, 0x06 write single, 0x10 write multiple.
- Slave address settable 1–255 (tool UI). After changing address or baud, **power-cycle** the
  device (tool says wait 10 s before re-powering).
- Tool uses 800 ms read/write timeouts, 1 retry.

## Holding registers (decimal addresses, 16-bit)

| Reg | Name | R/W | Meaning |
|---:|---|---|---|
| 0 | Baud code | W | Written via FC16 with the baud list index **(?)**: 0=4800, 1=9600, 2=14400, 3=19200, 4=57600, 5=115200 |
| 4 | M1 direction | R/W | 0 = forward, 1 = reverse |
| 5 | M1 speed | R/W | 0–100 % duty; 0 = stop |
| 6 | M1 brake | R/W | write 1 = brake |
| 7 | — | W | **(?)** tool writes 0 here in the two-motor sync command |
| 8 | — | W | **(?)** tool writes 10000 here in the two-motor sync / factory-test command |
| 9 | M2 direction | R/W | 0 = forward, 1 = reverse |
| 10 | M2 speed | R/W | 0–100 % |
| 11 | M2 brake | R/W | write 1 = brake |
| 12 | M1 alarm | R/W | non-zero = over-current alarm; write 0 to clear |
| 13 | M2 alarm | R/W | non-zero = alarm; write 0 to clear |
| 14 | M1 current limit | R/W | 0.1 A units; tool range 0–60 (default 6.0 A) |
| 15 | M2 current limit | R/W | 0.1 A units |
| 16 | M1 actual current | R | 0.1 A units |
| 17 | M2 actual current | R | 0.1 A units |
| 18 | M1 accel time | R/W | 0.1 s units, 1–100 |
| 19 | M1 decel time | R/W | 0.1 s units, 1–100 |
| 20 | M2 accel time | R/W | 0.1 s units, 1–100 |
| 21 | M2 decel time | R/W | 0.1 s units, 1–100 |
| 22 | Comms watchdog | R/W | 0.1 s units, 0–1000 (0 presumably disables) — motors stop if no traffic |
| 23 | Firmware version | R | shown as hex |
| 24 | Batch number | R | shown as hex |

How the tool uses them:

- **Live status poll:** FC03 start 4, count 14 (regs 4–17).
- **Run a motor:** FC16 at reg 4 (M1) or reg 9 (M2), 2 registers: `[direction, speed]`.
- **Stop:** FC06 reg 5 (M1) / reg 10 (M2) = 0.
- **Brake:** FC06 reg 6 (M1) / reg 11 (M2) = 1.
- **Both motors at once:** FC16 at reg 4, 8 registers: `[M1dir, M1spd, M1brk, 0, 10000, M2dir, M2spd, M2brk]`.
- **Clear alarms:** FC16 at reg 12, 2 registers `[0, 0]`.
- **Motor config block:** FC03/FC16 at reg 18, 5 registers (18–22).
- **Version/batch:** FC03 at reg 23, 2 registers.

## Example frames (slave address 1, CRC16 appended little-endian)

```text
M1 forward 50 %        01 10 00 04 00 02 04 00 00 00 32 73 89
M1 reverse 100 %       01 10 00 04 00 02 04 00 01 00 64 A2 77
M1 stop                01 06 00 05 00 00 99 CB
M1 brake               01 06 00 06 00 01 A8 0B
M2 forward 50 %        01 10 00 09 00 02 04 00 00 00 32 B2 10
Read status 4..17      01 03 00 04 00 0E 85 CF
Read config 18..22     01 03 00 12 00 05 25 CC
Read version/batch     01 03 00 17 00 02 74 0F
Clear both alarms      01 10 00 0C 00 02 04 00 00 00 00 F3 FA
```

## Raw (non-Modbus) address commands

The tool closes the Modbus master and sends these as raw bytes on the same port (9600 8N1 unless
changed). They work regardless of the configured slave address.

| Purpose | TX bytes | Reply |
|---|---|---|
| Get device address | `01 20 03 68` (fixed bytes as sent by the tool) | byte[1] = 0x20, byte[2] = current address |
| Set device address | `01 10 <addr>` + CRC16, e.g. `01 10 02 AC 01` sets address 2 | byte[1] = 0x10 on success; then power-cycle |

## Related Yakong dual-channel boards (same tool family, different register layout)

| Model | Supply | Current/ch | Notes |
|---|---|---|---|
| YK-DM2407M2K-A1 | 7–24 V | 7 A | 16 kHz PWM; demo `YK-DM-Demo-V1.3.exe`; speed 0–1000, limit-switch inputs, brake current/voltage, flow steps |
| YK-DM4815M2K-A1 | 9–48 V | 15 A | |
| YK-DM4805G2K-A1 | 9–48 V | 5 A | demo `YK-DM4805G2K-A1-1.1.exe` |

Their demo tool states factory default comms: 9600 baud, no parity, 8 data, 1 stop. Register maps
for these were **not** extracted; use the same technique (dnfile + IL scan of the demo exe) if needed.
