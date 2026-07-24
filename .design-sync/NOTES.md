# design-sync notes — Room & Board

- This repo is a zero-build vanilla-JS site: NO React components, NO Storybook, NO dist. The sync is the converter's **tokens-only mode** (`[ZERO_MATCH]` is expected and correct). `window.RoomBoard` is intentionally empty.
- **Never point `cssEntry` at `site/css/main.css`**: it pins `html, body { width: 1920px; height: 1080px; overflow: hidden }` (the signage viewport) and would leak into every design. The curated `\.design-sync/ds-styles.css` is the DS stylesheet: real `:root` tokens + reusable idioms (.card/.btn/.well/.delta/.empty), viewport rules stripped.
- The repo has no react in node_modules; converter deps + react/react-dom live in the scratch `.ds-sync/node_modules`, and the repo is self-linked there (`ln -sfn ../.. .ds-sync/node_modules/room-and-board`) because npm won't self-install. Pass `--node-modules ./.ds-sync/node_modules`. Recreate the symlink on a fresh clone.
- **Off-script step every build**: the 5 hand-authored preview cards live durably in `.design-sync/cards/*.html` (first-line `@dsCard` markers) and must be re-copied into `ds-bundle/_preview/` after every build/driver run (builds wipe the out dir). They deliberately do NOT live under `components/` — the validator enforces previews == componentCount there (0 for tokens-only).
- Cards were render-verified 5/5 by `package-validate.mjs` on 2026-07-24 while temporarily under `components/`; under `_preview/` the validator no longer screenshots them, so re-verify manually if edited.
- `runtimeFontPrefixes: ["CiscoSans", "Cisco Sans", "SF Pro"]` — CiscoSansTT is the board's on-device face and SF Pro is the deliberate system-font fallback; neither has a `@font-face` to ship. This is by design, not a gap.
- `guidelinesGlob: ["DESIGN.md", "PRODUCT.md"]` — repo-root docs, kept current (DESIGN.md rewritten to Momentum 2026-07-24).
- Known render warns: none.

## Re-sync risks

- **Token drift is manual**: `ds-styles.css`, the cards, and `conventions.md` are curated copies of `site/css/main.css` `:root` + DESIGN.md. If the live tokens change (theme evolution), all three must be updated by hand — diff against `site/css/main.css` `:root` at the start of any re-sync.
- The anchor has 0 components, so re-syncs verify nothing automatically; the hand cards are outside the machine gate entirely.
- The claude.ai "Design System" project (0400ca4d-…) holds a superseded hand-rolled upload from 2026-07-24 (pre-pipeline); safe to delete once the "Room & Board" project is confirmed rendering.
