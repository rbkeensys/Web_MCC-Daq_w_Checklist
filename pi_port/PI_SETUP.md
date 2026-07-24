# Raspberry Pi 4B port — setup guide

The server now runs on Linux/ARM. All porting changes live in the MAIN tree,
guarded so Windows behavior is untouched:

| Piece | Where | How it switches |
|---|---|---|
| DAQ access | `server/mcc_bridge.py` 2.6.0 | mcculw on Windows; **uldaq** on Linux (E-1608 + E-TC, both Ethernet) |
| Expression engine build | `server/compile_cpp.py` | MSVC → `.dll` on Windows; **g++ → `.so`** elsewhere |
| Generated C++ | `server/expr_to_cpp.py` 3.8.2 | `#ifdef _WIN32` export macro |
| Versioned lib hot-swap | `server/server.py` (`DLL_EXT`) | `expressions_vN.dll` ↔ `expressions_vN.so` |

This folder holds the Pi-only deployment artifacts: this guide, `install.sh`,
the systemd unit, and `bench_daq_test.py` (hardware verify).

## 0. Hardware / OS

- Raspberry Pi 4B (4 GB+), Raspberry Pi OS 64-bit (Bookworm) — **boot from a
  USB SSD if possible**; session logs run ~1 GB/hour and will destroy SD cards.
  (Minimum: keep the OS on SD but point `server/logs` at an SSD mount.)
- Ethernet to the same switch/LAN as the E-1608 and E-TC (they're network DAQs
  — nothing plugs into the Pi but Ethernet, the two RS-485 USB dongles, power).

## 1. One-shot install

```bash
git clone https://github.com/rbkeensys/Web_MCC-Daq_w_Checklist.git
cd Web_MCC-Daq_w_Checklist/pi_port
sudo bash install.sh          # builds libuldaq, makes the venv, installs units
```

What install.sh does (it's short — read it): apt deps (g++, libusb, autotools),
build+install MCC **libuldaq** from source, create `../.venv` with
requirements + `uldaq` Python bindings, install `mcc-server.service`
(disabled — enable after bench-verify).

## 2. Config changes (server/config/)

1. **Serial ports**: in `vfd_instances.json` and `stepper_instances.json`,
   replace `COM3` / `COM11` with **stable by-id paths**, e.g.
   `/dev/serial/by-id/usb-FTDI_USB-RS485_Cable_XXXX-if00-port0`.
   List them: `ls /dev/serial/by-id/`. (Never use /dev/ttyUSB0 — two dongles
   swap names across boots.) Add your user to the dialout group:
   `sudo usermod -aG dialout $USER` (re-login).
2. **boardNum semantics on Linux**: no InstaCal here. `boardNum` = ordinal
   among devices of the same model found on the network, sorted by unique id
   (MAC). One E-1608 + one E-TC → both are boardNum 0, no change needed.
3. **No mkcert needed**: skip `server/config/ssl/` on the Pi (plain HTTP
   locally) and make the tunnel hostname service type **HTTP** — no
   "No TLS Verify" dance. Cloudflare edge still gives visitors real TLS.

## 3. Bench verify (BEFORE enabling the service / connecting the rig)

```bash
cd .. && source .venv/bin/activate
python pi_port/bench_daq_test.py            # discovery + AI + TC snapshot
python pi_port/bench_daq_test.py --do 0     # blink DO0 (watch the relay/LED)
python pi_port/bench_daq_test.py --ao 0 2.5 # set AO0 to 2.5 V (meter it)
python pi_port/bench_daq_test.py --ctr      # watch CTR0 count (spin the meter)
```

Work through the subsystems in order: discovery → AI (known voltage) →
TC (room temp) → DO (relay click) → AO (multimeter) → CTR (flow meter pulses)
→ then drives via the app UI (MOD Drv widget) — **with heaters unpowered**
until everything reads sane.

Then the expression engine:

```bash
cd server && python expr_to_cpp.py && python -c "import compile_cpp; compile_cpp.compile_expressions('compiled/expressions.so')"
```

Expect `[compile_cpp] OK -> compiled/expressions.so`.

## 4. Run it

```bash
sudo systemctl enable --now mcc-server     # server on boot
# cloudflared (per machine): create the tunnel in Zero Trust -> Networks ->
# Tunnels, pick Debian arm64, run the one-line token install it shows.
# Then add the public hostname (mvr2.keenmvr.com -> HTTP localhost:8000)
# and the Access application (see cloudflare/AS_BUILT.md -- new hostnames
# are born UNPROTECTED).
```

Watch `static.tickHz` on the dashboard for the achieved loop rate (expect
~40–80 Hz; control math is dt-exact at any rate). Server logs:
`journalctl -u mcc-server -f`.

## Known differences vs Windows

- Loop rate lower (see tickHz) — harmless, everything integrates on dtReal.
- TC type configuration comes from the app config via uldaq (no InstaCal).
- On a save/recompile the old .so handle is intentionally leaked instead of
  freed (Windows uses FreeLibrary) — a few KB per recompile, gone on restart.
- PyInstaller installer is Windows-only; the Pi deployment IS this checkout +
  venv + systemd (simpler and updateable with `git pull`).
