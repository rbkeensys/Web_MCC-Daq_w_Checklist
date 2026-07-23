# keenmvr.com — Cloudflare setup walkthrough

Goal: `www.keenmvr.com` = public landing page (Cloudflare Pages) →
named machines like `mvr1.keenmvr.com` (Cloudflare Tunnel) → each rig's
local server, with **Zero Trust Access (email one-time PIN)** guarding every
machine hostname.

The app has **no auth of its own** — anyone reaching a machine URL can drive
relays and heaters. The Access policy on the machine subdomains is the lock.
Do step 3 before sharing any machine link.

---

## 1. Name the machine (tunnel ingress + DNS)

On the rig PC (where `cloudflared` already runs):

1. Find your tunnel: `cloudflared tunnel list` → note the NAME and ID.
2. Edit `C:\Users\russ\.cloudflared\config.yml` to match
   [config.yml.example](config.yml.example) — hostname `mvr1.keenmvr.com`
   → `http://localhost:8000`, plus the 404 catch-all.
3. Create the DNS route (one command, no dashboard needed):

       cloudflared tunnel route dns <TUNNEL-NAME> mvr1.keenmvr.com

   This adds a proxied CNAME in the keenmvr.com zone pointing at the tunnel.
4. Restart the Cloudflared Windows service (services.msc → "Cloudflared" →
   Restart) so it rereads config.yml.
5. Test: `https://mvr1.keenmvr.com` should show the app (still unprotected —
   next step fixes that). Charts/live data confirm WebSockets pass through.

If you originally created the tunnel with a quick one-liner pointing straight
at localhost:8000, the dashboard equivalent lives at **Zero Trust →
Networks → Tunnels → your tunnel → Public Hostname** — add
`mvr1.keenmvr.com` → `http://localhost:8000` there instead; same result.

## 2. Landing page (Cloudflare Pages)

1. Dashboard → **Workers & Pages → Create → Pages → Upload assets**
   ("Direct Upload").
2. Project name: `keenmvr-landing` (anything). Drag the folder
   [cloudflare/landing/](landing/) (it contains just `index.html`) into the
   upload box. Deploy.
3. Project → **Custom domains → Set up a custom domain** → `www.keenmvr.com`.
   Cloudflare adds the DNS record for you (the zone is already on Cloudflare).
4. Optional: add `keenmvr.com` (apex) as a second custom domain, or create a
   **Bulk Redirect** apex → www. Easiest is just adding both as custom domains.

To add/rename machines later: edit the `MACHINES` array at the bottom of
`landing/index.html` and re-upload the folder (Pages → project → Create new
deployment). Takes a minute.

## 3. Lock the machines (Zero Trust Access, email OTP)

1. Dashboard → **Zero Trust** (one-time: pick the free plan + a team name —
   e.g. `keensys`; the team name is just your login page URL).
2. **Access → Applications → Add an application → Self-hosted.**
   - Application name: `MVR machines`
   - Application domain — use a wildcard so future machines are covered
     automatically: subdomain `*`, domain `keenmvr.com`… **BUT** that would
     also gate the landing page. Cleaner: subdomain `mvr*` isn't supported —
     so either add one application per machine (`mvr1.keenmvr.com` now,
     `mvr2` later — 30 seconds each), or wildcard `*.keenmvr.com` and add a
     separate bypass application for `www`. Per-machine apps are simplest.
   - Session duration: pick what you can live with (24h is comfortable;
     re-PIN once a day).
3. **Policy** (created inline with the app):
   - Name: `allowed operators`, Action: **Allow**
   - Include → **Emails** → `russ@keensystems.com` (add JL etc. as needed).
4. Login method: **One-time PIN** is enabled by default in Zero Trust
   (Settings → Authentication → Login methods shows it). Nothing to configure.
5. Test in a private/incognito window: `https://mvr1.keenmvr.com` should now
   show the Cloudflare Access page → enter an allowed email → 6-digit code
   arrives by mail → in. Non-listed emails get refused.

Notes:
- WebSockets carry the Access cookie automatically — the live charts work
  behind Access.
- The landing page stays public (it exposes nothing but names/links);
  every machine link behind it demands the PIN.
- Access logs (Zero Trust → Logs) show every sign-in — handy audit trail.

## 4. Sanity checklist

- [ ] `mvr1.keenmvr.com` loads the app THROUGH the PIN gate (incognito test)
- [ ] Hitting the raw hostname from a non-allowed email is refused
- [ ] `www.keenmvr.com` shows the landing page publicly, card links work
- [ ] Charts stream live (WebSocket) through the tunnel
- [ ] Rig PC reboot: Cloudflared service auto-starts (it installs as
      Automatic — confirm in services.msc) and the app server auto-starts
      (task scheduler / startup shortcut for the server, or it's manual)

## Later: machine #2

1. Install cloudflared on the new rig PC, `cloudflared tunnel login`,
   `cloudflared tunnel create mvr2`, config.yml with
   `mvr2.keenmvr.com → http://localhost:8000`,
   `cloudflared tunnel route dns mvr2 mvr2.keenmvr.com`, install service.
2. Zero Trust → Access → add application for `mvr2.keenmvr.com`
   (same email policy).
3. Un-comment the second card in `landing/index.html`, re-upload to Pages.
