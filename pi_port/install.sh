#!/usr/bin/env bash
# Raspberry Pi 4B installer for the MCC DAQ / MVR server.
# Run from pi_port/:  sudo bash install.sh
set -e
REPO="$(cd "$(dirname "$0")/.." && pwd)"
REAL_USER="${SUDO_USER:-$USER}"
echo "== repo: $REPO  (user: $REAL_USER)"

echo "== apt dependencies =="
apt-get update
apt-get install -y g++ gcc make libusb-1.0-0-dev libtool autoconf automake \
                   python3 python3-venv python3-dev git curl

echo "== MCC libuldaq (C library) =="
if ! ldconfig -p | grep -q libuldaq; then
  TMP=$(mktemp -d)
  cd "$TMP"
  # libuldaq release tarball (autotools build; supports Ethernet E-1608/E-TC)
  curl -L -o uldaq.tar.bz2 https://github.com/mccdaq/uldaq/releases/download/v1.2.1/libuldaq-1.2.1.tar.bz2
  tar xf uldaq.tar.bz2
  cd libuldaq-*
  ./configure && make -j4 && make install && ldconfig
  cd / && rm -rf "$TMP"
else
  echo "libuldaq already installed"
fi

echo "== python venv =="
cd "$REPO"
if [ ! -d .venv ]; then
  sudo -u "$REAL_USER" python3 -m venv .venv
fi
sudo -u "$REAL_USER" .venv/bin/pip install --upgrade pip
# Core runtime deps (piwheels serves ARM builds of numpy etc.)
sudo -u "$REAL_USER" .venv/bin/pip install fastapi "uvicorn[standard]" \
     pyserial numpy uldaq
# If the repo has a requirements.txt, prefer it:
if [ -f requirements.txt ]; then
  sudo -u "$REAL_USER" .venv/bin/pip install -r requirements.txt || true
fi

echo "== serial permissions =="
usermod -aG dialout "$REAL_USER" || true

echo "== systemd unit (installed DISABLED -- bench-verify first) =="
sed -e "s|__REPO__|$REPO|g" -e "s|__USER__|$REAL_USER|g" \
    "$REPO/pi_port/mcc-server.service" > /etc/systemd/system/mcc-server.service
systemctl daemon-reload
echo
echo "DONE. Next (see PI_SETUP.md):"
echo "  1) edit server/config serial ports to /dev/serial/by-id/..."
echo "  2) bench-verify: .venv/bin/python pi_port/bench_daq_test.py"
echo "  3) sudo systemctl enable --now mcc-server"

# --- added 7/26: lessons from the borrowed-Pi bring-up ---
# USB serial on some Pi images lands in plugdev (not dialout) -- join both.
usermod -aG dialout,plugdev "$RUN_USER" || true
# Pi HARDWARE watchdog: reboot the whole Pi on a kernel hang. Combined with the
# server's boot-time DO safe-init, even a kernel wedge ends heaters-OFF.
mkdir -p /etc/systemd/system.conf.d
printf '[Manager]
RuntimeWatchdogSec=15
RebootWatchdogSec=2min
' > /etc/systemd/system.conf.d/10-watchdog.conf
systemctl daemon-reexec
# Persistent journal (capped): volatile journald erased the evidence of a hung
# reboot on the borrowed Pi (7/27) -- crashes/hangs must leave a trail.
mkdir -p /var/log/journal /etc/systemd/journald.conf.d
printf '[Journal]
Storage=persistent
SystemMaxUse=200M
' > /etc/systemd/journald.conf.d/10-persist.conf
systemctl restart systemd-journald || true
# RebootWatchdogSec: a wedged reboot self-rescues via the SoC watchdog in 2min
# (borrowed Pi hung blank on 'sudo reboot' once -- never strand the rig).
