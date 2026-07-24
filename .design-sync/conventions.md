# Room & Board (Momentum) — how to build with this system

This is a **tokens-and-CSS design system, not a component library**: `window.RoomBoard` is intentionally empty. Build with plain HTML/JSX styled by the CSS vocabulary below (it ships via `styles.css`). Dark-only, OLED-native: pure-black canvas, calm utility, glanceable. There is no light theme; never invent one.

## Setup

No provider or wrapper is needed. Give the page root `background: var(--bg); color: var(--ink)` and the font stack is inherited from `body` in the shipped CSS (CiscoSansTT with system fallbacks; the brand face is device-provided, ship nothing).

## Styling vocabulary (all defined in the shipped stylesheet)

Tokens: `--bg` (#000 canvas), `--bg-card` (#121212 surface), `--bg-card-2` (white 11%, tiles/wells/hairlines), ink ramp `--ink` / `--ink-mid` / `--ink-dim` / `--ink-faint` (white at 95/84/72/56%), `--accent` (#64b4fa, one accent per surface), semantic `--good` / `--bad` / `--warn`, solid wells `--good-tint` / `--bad-tint` / `--warn-tint`, `--radius` (24px cards), `--gap` (20px grid gap).

Classes: `.card` + `.card__title` + `.card__stamp` + `.is-stale` (surface, uppercase 20px label, amber freshness stamp, stale dim); `.btn` with `.btn--primary` / `.btn--ghost` (64px min-height, 160px min-width, max ONE primary per pane); `.well` with `.well--good` / `.well--bad` / `.well--warn` / `.well--accent` (bright semantic text on a SOLID dark tint, never an alpha overlay); `.delta--up` / `.delta--down`; `.empty` (quiet placeholder, never a blank region).

## Rules that make it look right

- Type floor **20px**; card titles 20px/600 uppercase +0.08em in `var(--ink-dim)`; the primary datum of any card is the largest, boldest element (34-92px/700). Use `font-variant-numeric: tabular-nums` on any value that updates.
- Semantic state always pairs color with a glyph or text (▲/▼, a label): color is never the only signal.
- Muted text: use `var(--ink-dim)`, not `var(--ink-faint)`, below 24px.
- Motion: transitions on transform/opacity only, 150-250ms, `cubic-bezier(0.22, 1, 0.36, 1)`; crossfade or nothing. No slides, bounces, or entrance choreography.
- Radii: cards 24px (`var(--radius)`), controls 12px, chips 10px, tiles 8px, pills 999px. No nested cards.

## Brand marks

Real marks ship in `brand/` — use them instead of setting the product name as type:
`room-and-board-wordmark-dark.svg` (216×50 at default scale; the default mark, for page headers and hero areas), `room-and-board-lockup-dark.svg` (216×56; icon + wordmark when the full mark stands alone), `room-and-board-icon-180.png` (square: favicons, avatars, app tiles) and `room-and-board-favicon-32.png`. Both SVGs are dark-background variants, the only variant this dark-only system needs. Preserve their aspect ratios, never recolor or add effects, and give them clear space.

## Where the truth lives

Read `styles.css` (and its `_ds_bundle.css` import: the full token + class definitions) before styling. `guidelines/DESIGN.md` is the visual system; `guidelines/PRODUCT.md` is the product register (calm utility) and its anti-references.

## Idiomatic example

```html
<div class="card" style="width: 420px">
  <h2 class="card__title">Markets</h2>
  <span class="card__stamp">as of 10:12</span>
  <div style="display: flex; align-items: baseline; gap: 14px">
    <span style="font-size: 34px; font-weight: 700; font-variant-numeric: tabular-nums">52,376.73</span>
    <span class="well well--good">▲ 148.71</span>
  </div>
  <button class="btn btn--primary" style="margin-top: 20px">Save</button>
</div>
```
