#!/bin/bash
# MCC kiosk: wait for the control server, then open the dashboard FULLSCREEN.
# Zoom/gesture LOCKDOWN: pinch zoom disabled, scale forced 100%, swipe-back
# navigation off -- resistive/cheap touch panels wander otherwise.
# Panel/keyboard live behind fullscreen: Close UI in the app, then the MCC_UI
# icon, gives a windowed (keyboard-capable) session.
for i in $(seq 1 90); do
  curl -s -o /dev/null --max-time 2 http://localhost:8000/ && break
  sleep 2
done
exec chromium --ozone-platform=wayland --password-store=basic --enable-wayland-ime   --wayland-text-input-version=3 --noerrdialogs --disable-session-crashed-bubble   --force-device-scale-factor=1.0 --disable-pinch --overscroll-history-navigation=0   --start-fullscreen --app=http://localhost:8000
