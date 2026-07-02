# Design

Visual system for the Board Pro signage dashboard. Register: product (calm utility).
Canvas: fixed 1920×1080 logical viewport on a 55" 4K touch panel, dark room-friendly.

## Color

Dark, restrained, one accent. Data (MTA bullets, sparklines, artwork) supplies the color; chrome stays neutral.

| Token | Value | Role |
|---|---|---|
| `--bg` | `#0d1117` | page background |
| `--bg-card` | `#161c26` | card surface |
| `--bg-card-2` | `#1b2230` | nested surface (tracks, wells) |
| `--ink` | `#e8edf4` | primary text |
| `--ink-dim` | `#93a0b4` | secondary text (≥4.5:1 on card) |
| `--ink-faint` | `#74849a` | tertiary text (large sizes only) |
| `--accent` | `#58a6ff` | selection, primary action, links |
| `--good` / `--bad` / `--warn` | `#3fb950` / `#f85149` / `#d29922` | semantic states |

MTA line-bullet palette is authentic and non-negotiable (`.bullet--*` classes).

## Typography

System sans stack (`-apple-system, 'SF Pro Display', 'Segoe UI', Roboto, …`), one family, weights 400/600/700.
Fixed px scale tuned for 3–6 ft viewing (1 px ≈ 0.64 mm):

- Floor: **20 px** — nothing smaller anywhere.
- Secondary/labels: 20–22 px. Body/rows: 22–26 px.
- Card titles: 20 px uppercase, +0.08em tracking, `--ink-dim`.
- Primary glance data: 34 px (train minutes) → 54 px (AQI, clock) → 88 px (current temp).
- Numerals: `font-variant-numeric: tabular-nums` wherever values update in place.

## Spacing & Shape

- Grid: 4 columns, 20 px gap; cards span by content weight (weather 2×2, subway 1×2, history 2×1).
- Card: 18 px radius, 22/26 px padding. Nested wells 8–10 px radius. No nested cards.
- Touch targets on settings surfaces: ≥ 56 px.

## Motion

Transform/opacity only (gen1 web-engine budget). Art crossfade 2.5 s ease-in-out; everything else updates in place or transitions ≤ 250 ms. No entrance choreography. `prefers-reduced-motion`: crossfades become cuts.

## Components

- **Card**: `article.card > h2.card__title + .card__body + .card__stamp`; stale = `.is-stale` (dim to 0.75 + amber "as of HH:MM" stamp).
- **Bullet**: 36 px circle, route letter inside (color never the only signal).
- **Train row**: big tabular minutes + destination/line stack + track chip (`--bg-card-2` well, accent text).
- **Delta**: ▲/▼ + value + percent, `--good`/`--bad`.
- **Empty state**: `.empty` — quiet sentence, never a blank card.
- **Buttons**: `.btn` 24 px text, 16/34 px padding, 14 px radius; `.btn--primary` accent fill, dark text.
- **Settings surfaces**: full-screen overlay panels (not modals-on-modals), left rail of sections, 56 px+ rows, drill-down lists with obvious back affordance.
