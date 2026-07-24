# Design

Visual system for the Board Pro signage dashboard. Register: product (calm utility).
Canvas: fixed 1920×1080 logical viewport on a 55" 4K touch panel, dark room.
Single theme: **Momentum** — Cisco Webex Frame / RoomOS neutrals (the original
"Room & Board" palette retired 2026-07-19; this doc updated 2026-07-24).

## Color

OLED-native dark: pure-black canvas, near-black surfaces, the text ramp and tile
layer as white at decreasing alpha (composites cleanly on black). One cool accent.
Data (MTA bullets, sparklines, weather accents, artwork) supplies the color; chrome
stays neutral.

| Token | Value | Role |
|---|---|---|
| `--bg` | `#000` | page canvas (OLED black) |
| `--bg-card` | `#121212` | card surface |
| `--bg-card-2` | `rgba(255,255,255,.11)` | tiles, wells, tracks, hairlines |
| `--ink` | `rgba(255,255,255,.95)` | primary text, key data |
| `--ink-mid` | `rgba(255,255,255,.84)` | strong secondary |
| `--ink-dim` | `rgba(255,255,255,.72)` | labels, secondary (≥4.5:1 on card) |
| `--ink-faint` | `rgba(255,255,255,.56)` | tertiary (large sizes only) |
| `--accent` | `#64b4fa` | selection, links, primary action |
| `--good` / `--bad` / `--warn` | `#3cc29a` / `#fc8b98` / `#f2990a` | semantic states |
| `--good-tint` / `--bad-tint` / `--warn-tint` | `#0e2b20` / `#4f0e10` / `#36220c` | solid wells under bright semantic text |

Semantic text sits on **solid dark wells** of its own hue (the Webex Frame badge
idiom: `#0a274a` well + `#64b4fa` text) — never alpha tints, which go muddy on
OLED black. The weather card derives a per-condition accent (`data-cond`, e.g.
clear `#e3b341`); MTA line-bullet palette is authentic and non-negotiable
(`.bullet--*` classes).

## Typography

`'CiscoSansTT'` (the board's on-device face) → `-apple-system, 'SF Pro Display',
'Segoe UI', Roboto, …` fallback. One family, weights 400/600/700.
Fixed px scale tuned for 3–6 ft viewing (1 px ≈ 0.64 mm):

- Floor: **20 px** — nothing smaller anywhere (a handful of 12–19 px micro-badges
  excepted, never prose).
- Card titles: 20 px 600 uppercase, +0.08em tracking, `--ink-dim`.
- Body/rows: 20–26 px. Greeting 40/600 −0.01em; topbar clock 48/700.
- Primary glance data: 34 px (train minutes) → 54–92 px (AQI, current temp);
  screensaver clocks 250–330 px.
- Numerals: `font-variant-numeric: tabular-nums` wherever values update in place.

## Spacing & Shape

- Grid: **12 columns × 8 rows**, 20 px gap (`--gap`); widgets span cells and carry
  `data-w`/`data-h` + tier classes (`t-s`/`t-m`/`t-l`) — no container queries on gen1.
- Card: **24 px radius** (`--radius`), 22/26 px padding. Controls 12 px, nav/chips
  10 px, tracks/tiles 8 px, pills 999 px. No nested cards.
- Base unit 4 px; common steps 4/8/10/12/14/20/26/44.
- Touch targets: buttons 64 px, FABs/rows ≥ 44–56 px.
- RoomOS overlays the bottom **40 px** (`--roomos-bar`) in idle modes; interactive
  content clears it via `--safe-bottom: 84px`. Tap-opened overlays are NOT overlaid
  — their strips sit flush at `bottom: 0`.

## Motion

Transform/opacity only (gen1 web-engine budget — no filters/shadows/WebGL on
anything that moves). Art crossfade 2.5 s ease-in-out; everything else updates in
place or transitions 150–250 ms, ease-out `cubic-bezier(0.22,1,0.36,1)`. No
entrance choreography, slide, or bounce. `prefers-reduced-motion`: crossfades
become cuts.

## Components

- **Card**: `article.card > h2.card__title + .card__body + .card__stamp`; stale =
  `.is-stale` (dim to 0.75 + amber "as of HH:MM" stamp). Degrade visibly, never blankly.
- **Bullet**: 36 px circle, route letter inside (color never the only signal).
- **Train row**: big tabular minutes + destination/line stack + track chip
  (`--bg-card-2` well, accent text).
- **Delta / status badge**: ▲/▼ + value, `--good`/`--bad` text on its solid well.
- **Buttons**: one standard — `.btn` 64 px min-height, **160 px min-width**, 23 px
  text, 12 px radius, hairline border on `--bg-card`. Tiers: `--primary` (accent
  fill, `#06131f` ink, max one per pane) / secondary (default) / `--ghost`.
- **FAB (gear/pencil)**: 56 px circle, `rgba(255,255,255,.08)`, bottom-right at
  `bottom: 44px` (clears the RoomOS bar).
- **Settings**: full-screen overlay, 270 px rail + pane; nav rows 22 px, active =
  `--bg-card-2` fill; accordion groups via `grid-template-rows 0fr↔1fr`; custom
  6 px white scroll thumb (RoomOS idiom); drill-down lists with obvious back.
- **Full-screen viewers** (art, chart, tapped-headline story view): `fixed inset:0`,
  `rgba(13,17,23,.96)` backdrop, centered panel, "Tap anywhere to close", 20 s idle
  auto-dismiss. Story view: source/age meta, 46/700 headline, 30 px summary, white
  QR card (QR must sit on white) to read the article on a phone.
- **Empty state**: `.empty` — quiet sentence + "via ⚙ → Section" affordance, never
  a blank card.
- **Edit mode**: calm-at-rest affordances — grey iOS-style minus badge, grip
  signifier; destructive color ignites only on `:active`.

## Platform constraints (gen1 Qt WebEngine)

Desktop Chrome is not the board. Baked-in rules: no SVG `clipPath` (split plain
`<path>` segments to color a line instead); `vector-effect: non-scaling-stroke`
under `preserveAspectRatio="none"`; no container queries; animate only
transform/opacity; the RoomOS bar geometry above.
