#!/usr/bin/env python3
"""viewer_local_launch.py v1.0.0 -- mccviewer: protocol handler.

Opens the MCC log viewer ON THE COMPUTER WHERE THE BROWSER BUTTON WAS
CLICKED (russ 9/11: "have it open where clicked"). The web app's Viewer
button POSTs the scales bundle to the server (bundle_only), then navigates
to  mccviewer:<encoded server origin> ; Windows routes that URL to this
script (see tools/register_viewer_protocol.bat). We then, over plain HTTP:

  1. GET  <origin>/api/logs/sessions      -> pick the ACTIVE session if it
     has a CSV (the run you are looking at), else the newest closed one.
  2. GET  <origin>/api/logs/download/<session>/<file> for each .csv
     -> %LOCALAPPDATA%/mcc_viewer/<session>/  (re-downloaded each time;
     the active session grows between views).
  3. GET  <origin>/api/logs/viewer_scales -> the chart-names/scales bundle.
  4. Launch server/log_viewer.py (next to this file) with the newest CSV
     and --scales, using THIS python (needs matplotlib + tkinter).

Stdlib only -- the only dependency (matplotlib) belongs to log_viewer.
"""
import json
import os
import subprocess
import sys
import time
import urllib.parse
import urllib.request

__version__ = "1.0.0"


def fail(msg):
    print("\n[viewer-launch] ERROR: " + msg)
    try:
        input("Press Enter to close...")
    except Exception:
        pass
    sys.exit(1)


def get_json(url):
    with urllib.request.urlopen(url, timeout=15) as r:
        return json.loads(r.read().decode("utf-8"))


def download(url, dest, label):
    t0 = time.time()
    with urllib.request.urlopen(url, timeout=30) as r, open(dest, "wb") as f:
        n = 0
        while True:
            chunk = r.read(1 << 20)
            if not chunk:
                break
            f.write(chunk)
            n += len(chunk)
            print("\r[viewer-launch] %s: %.1f MB" % (label, n / 1e6), end="")
    print("  (%.1fs)" % (time.time() - t0))


def main():
    raw = sys.argv[1] if len(sys.argv) > 1 else ""
    origin = urllib.parse.unquote(raw)
    if origin.lower().startswith("mccviewer:"):
        origin = origin[len("mccviewer:"):]
    origin = urllib.parse.unquote(origin).strip("/") or "http://localhost:8000"
    if not origin.startswith("http"):
        origin = "http://" + origin
    print("[viewer-launch] v%s  server: %s" % (__version__, origin))

    try:
        j = get_json(origin + "/api/logs/sessions")
    except Exception as e:
        fail("cannot reach the server: %s" % e)
    sess = None
    act = j.get("active")
    if act and any(f.endswith(".csv") for f in act.get("files", [])):
        sess = act
        print("[viewer-launch] using the ACTIVE session:", sess["name"])
    elif j.get("sessions"):
        sess = j["sessions"][-1]           # oldest-first -> last = newest closed
        print("[viewer-launch] using the newest closed session:", sess["name"])
    if not sess:
        fail("the server has no log sessions to view")

    base = os.path.join(os.environ.get("LOCALAPPDATA", os.path.expanduser("~")),
                        "mcc_viewer", sess["name"])
    os.makedirs(base, exist_ok=True)
    csvs = []
    for f in sess.get("files", []):
        if not f.endswith(".csv"):
            continue
        dest = os.path.join(base, f)
        url = "%s/api/logs/download/%s/%s" % (
            origin, urllib.parse.quote(sess["name"]), urllib.parse.quote(f))
        try:
            download(url, dest, f)
        except Exception as e:
            fail("download of %s failed: %s" % (f, e))
        csvs.append(dest)
    if not csvs:
        fail("session %s holds no CSV files" % sess["name"])
    main_csv = max(csvs, key=os.path.getsize)

    scales = None
    try:
        dest = os.path.join(base, "_viewer_scales.json")
        download(origin + "/api/logs/viewer_scales", dest, "scales bundle")
        scales = dest
    except Exception as e:
        print("[viewer-launch] no scales bundle (%s) -- opening plain" % e)

    viewer = os.path.join(os.path.dirname(os.path.abspath(__file__)), "log_viewer.py")
    args = [sys.executable, viewer, main_csv]
    if scales:
        args += ["--scales", scales]
    print("[viewer-launch] opening:", " ".join(args))
    subprocess.Popen(args, close_fds=True)


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as e:
        fail(str(e))
