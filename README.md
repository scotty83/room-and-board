# Board Pro Digital Signage

A lightweight, personal signage dashboard for Cisco Board Pro devices (gen1 + gen2)
in private offices: weather, NYC Subway / LIRR / NJ Transit departures, market
indices, public-domain art, and daily extras. Hosted entirely on the public
internet, personalized per device **without authentication**, with preferences
that survive reboots, RoomOS upgrades, and even web-storage wipes.

Design spec: `docs/superpowers/specs/2026-07-02-board-pro-signage-design.md`.

## How it works

```
┌─ Static site (Cloudflare Pages) ─────────────────────────────┐
│ /        dashboard (widgets, ambient art, touch settings)    │
│ /setup   companion page → 6-char setup code                  │
└──────────────────────────────────────────────────────────────┘
┌─ Cloudflare Worker (worker/) ────────────────────────────────┐
│ /code            setup-code exchange (KV, 1h TTL, single-use)│
│ /njt/*           NJ Transit proxy (their ToS requires one)   │
│ /markets         Dow/Nasdaq/S&P via Yahoo, cached 5 min      │
└──────────────────────────────────────────────────────────────┘
┌─ Each Board Pro ─────────────────────────────────────────────┐
│ SignageManager macro + Signage_Storage vault (inactive macro)│
│ localStorage (signage profile) = primary store               │
│ URL fragment: #cfg=<config>&auth=<bridge creds>              │
└──────────────────────────────────────────────────────────────┘
```

- Weather/AQI (Open-Meteo), NWS alerts, subway + LIRR GTFS-RT (decoded by a
  ~120-line protobuf reader, oracle-tested against `gtfs-realtime-bindings`),
  art (Met/AIC), and history (Wikimedia) are fetched **directly from the
  browser** — all verified CORS-open and keyless.
- Config is deflate+base64url JSON (~200 chars). localStorage is primary;
  every save is mirrored to the macro vault over the device's own WebSocket
  xAPI, and the macro re-seeds the page through the URL fragment after a wipe.

## Local development

```bash
npm install
npm test                # site+logic suites, then worker suite
python3 -m http.server 8087 --directory site   # or any static server
open 'http://localhost:8087/?demo=1'           # full dashboard, canned data
open 'http://localhost:8087/?demo=1&mode=ambient'
npx wrangler dev --config worker/wrangler.toml # worker on :8787
```

`?demo=1` renders every widget from fixtures with zero network.

## Deployment

### 1. Static site → Cloudflare Pages

Point a Pages project at this repo:

- **Build command:** `node tools/stamp-version.js` (stamps `version.json` with
  the commit SHA — boards poll it hourly and self-reload after each deploy)
- **Build output directory:** `site`
- **Custom domain:** add your subdomain (e.g. `signage.yourdomain.com`) under
  the project's Custom domains — DNS + TLS are automatic when the zone is in
  the same Cloudflare account.

Set the deployed Worker URL in `site/js/env.js` (`WORKER_URL`) before the
first deploy.

### 2. Worker

```bash
cd worker
npx wrangler kv namespace create CODES     # put the id into wrangler.toml
npx wrangler secret put NJT_USER           # from developer.njtransit.com
npx wrangler secret put NJT_PASS
npx wrangler deploy
```

Without NJT credentials everything else still works; the NJT widget shows
"unavailable" (worker returns `njt_not_configured`).

> **Verify on first live run:** the RailData response mapping in
> `worker/src/njt.js` follows community clients; confirm the field names
> against a real response once credentials exist (all shape knowledge is
> isolated in that file).

### 3. Boards

```bash
cp deploy/devices.example.csv deploy/devices.csv   # one host per line
DEVICE_USER=admin DEVICE_PASS=... SITE_URL=https://your-site.pages.dev \
  node deploy/provision.js --dry-run                # inspect
DEVICE_USER=admin DEVICE_PASS=... SITE_URL=https://your-site.pages.dev \
  node deploy/provision.js
```

Per board this enables the web engine, interactive signage, the device-cert
WebSocket path, and installs + activates the SignageManager macro. Pilot on
one board first. Recommended extras per Cisco guidance: configure
`Time OfficeHours` so signage runs ≤ 12 h/day.

### Arranging the dashboard (v1.1)

Tap the ✎ pencil button: the 6×4 grid appears — drag widgets to move them,
drag the corner handle to resize (snaps to cells, per-widget minimums),
✕ removes, and the bottom tray re-adds anything removed. Invalid drops flash
red and snap back. Done saves (localStorage + macro vault); Cancel discards.
Layouts live in config v2; v1 configs migrate automatically on first load.

v1.1 widget notes: **LIRR** is a Penn Station departure board (Grand Central
trains never shown) filtered by branch chips; **Subway** has line chips
(none selected = every line at your stops); **Weather** defaults to ZIP 10001;
**World Clock** shows New York, Hyderabad, London, Los Angeles and Hong Kong.

### User flow

1. Board shows a welcome screen → user visits `/setup` on their phone,
   picks widgets/stations, taps **Get my setup code**.
2. On the board: gear → **Setup code** → type the 6 characters → Save.
3. Later edits: directly on the touch screen, or gear → Setup code →
   **Show QR** to pull the current config back to a phone.

### Disaster drill (verifies the vault)

```
xCommand WebEngine DeleteStorage Type: Signage
```

then put the board in standby and wake it: the macro re-seeds the config via
the URL fragment and the dashboard returns configured.

## Data sources & care

| Source | Access | Notes |
|---|---|---|
| Open-Meteo (weather, AQI) | direct, keyless | free tier is "non-commercial" — buy their inexpensive key if strictness matters |
| api.weather.gov (alerts) | direct, keyless | enhancement-only |
| MTA subway + LIRR GTFS-RT | direct, keyless | GET only (HEAD returns 403); 60 s jittered polling |
| TrainTime (LIRR tracks) | direct, unofficial | feature-detected; drops silently if the host vanishes |
| NJ Transit RailData | Worker + credentials | their ToS **requires** serving from a non-NJT server |
| Yahoo Finance (markets) | Worker, unofficial | browser UA + 5 min cache; widget hides if it breaks |
| Met + AIC (art) | build-time manifest | CC0 works; `node tools/build-art-manifest.js` to refresh |
| Wikimedia (history) | direct, keyless | |

**Resize-fit audit (standing policy):** widgets must fit their text at every
supported size. After renderer/CSS changes, open `?demo=1` in Chrome and, for
each `.card`, place it at its demo size, its `MIN_SIZE`, and a 3-tall variant
(set `gridColumn`/`gridRow` spans + `data-w`/`data-h`), then assert
`card__body.scrollHeight <= clientHeight + 2`. Fix overflows with measured
`data-w`/`data-h` compact CSS variants (no container queries on gen1 Chromium).
Ship only at zero overflow.

Rebuild station data after MTA changes: `node tools/build-stations.js`.
Refresh test fixtures: `node tools/record-fixtures.js`.

## Repo map

```
site/       static app (no framework, no bundler; ES modules)
worker/     Cloudflare Worker (code exchange, NJT proxy, markets)
macro/      SignageManager RoomOS macro (vault + bridge + signage URL)
deploy/     provision.js fleet setup over jsxapi
tools/      data builders (stations, art manifest, fixtures)
test/       vitest suites (+ worker pool project in worker/vitest.config.js)
docs/       design spec and implementation plan
```
