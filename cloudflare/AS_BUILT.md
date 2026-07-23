# keenmvr.com — AS BUILT (verified working 2026-07-22)

End state, tested from an outside browser:
**www.keenmvr.com** (public landing, Cloudflare Pages) → MVR 1 card →
**mvr1.keenmvr.com** (Cloudflare Tunnel → rig's local HTTPS server) →
**Cloudflare Access email one-time-PIN gate** → app with live charts
(WebSocket rides the Access cookie). Unlisted emails refused.

## The pieces

| Piece | Where | Notes |
|---|---|---|
| Tunnel | Zero Trust → Networks → Tunnels | Remotely managed (token service); public hostname `mvr1.keenmvr.com` → **HTTPS** localhost:8000 + **No TLS Verify** (local mkcert cert) |
| Landing | Pages project, custom domains `www.keenmvr.com` (+ apex) | Upload of `cloudflare/landing/`; edit MACHINES array + re-upload to change |
| Lock | Access application `MVR 1` on `mvr1.keenmvr.com` | Policy: Allow → Include → Emails list. **"Accept all available identity providers" = ON** |
| PIN | Identity provider: One-time PIN | No config; emails 6-digit codes |
| Team | `aged-bird-8b15` (auto-generated) | Only visible in the login URL; harmless |

## Menu decoder — russ's account (new "Cloudflare One" layout)

Two dashboards: **dash.cloudflare.com** (domains, DNS, Pages) and
**one.dash.cloudflare.com** (Zero Trust: tunnels, Access). The `one.`
prefix silently drops when they bounce you — retype it.

- Pages: dash → account level (NOT inside the domain) → sidebar
  **Compute (Workers)** → Create → Pages tab → Upload assets.
  Deep link: `dash.cloudflare.com/?to=/:account/workers-and-pages`
- Login methods: one.dash → **Integrations → Identity providers**
  (NOT Settings — the old Settings→Authentication card is gone).
- Applications: one.dash → **Access controls → Applications**.
- Lost? The **search box at the top** of either dashboard finds
  "identity providers", "applications", "tunnels" directly — faster
  than the sidebar every time.

## Gotchas hit during setup (don't re-learn these)

1. No `.cloudflared` folder ≠ broken — token-run tunnels keep ALL config
   in the dashboard.
2. Local server is HTTPS (mkcert) → tunnel hostname must be HTTPS +
   **No TLS Verify** or you get 502s.
3. A tunnel route on `www` shadows the Pages custom domain — delete the
   tunnel's www hostname before attaching www to Pages.
4. Access login page demanding a Cloudflare account/password = the app
   isn't offering One-time PIN → add the IdP (Integrations) AND enable
   "Accept all available identity providers" on the application.
5. **Brave browser kills the WebSocket** (7/23, cost an hour): page loads,
   versions show, but Connect fails with the server seeing NOTHING -- Brave's
   "Trackers & ads blocking" blocks the wss:// upgrade client-side
   (net::ERR_BLOCKED_BY_CLIENT; the blocked cloudflareinsights beacon in the
   console is the tell). Incognito working while normal fails = this. Fix on
   each Brave machine: disable Trackers & ads blocking (russ's build: GLOBAL
   Shields settings -- per-site Advanced controls absent). Diagnostic that
   separates client vs cloud in one shot: `cloudflared access login` + curl
   the WS upgrade with `cf-access-token` -- a 101 proves edge+Access+tunnel+
   server all fine and points at the client browser.
6. "Service tokens" tab ≠ login methods (that's machine-to-machine auth —
   possibly useful later for scripted remote log pulls).

## Adding machine #2 (the ritual)

1. New rig PC: install cloudflared → Zero Trust → Networks → Tunnels →
   create tunnel (token install) → public hostname `mvr2.keenmvr.com` →
   its local server (HTTPS + No TLS Verify if it has mkcert certs,
   plain HTTP otherwise).
2. **Access controls → Applications → Add** → self-hosted app for
   `mvr2.keenmvr.com`, same email policy, accept-all-IdPs ON.
   **New hostnames are born UNPROTECTED — this step is not optional.**
3. Un-comment the MVR 2 card in `cloudflare/landing/index.html` →
   re-upload the folder to the Pages project.
