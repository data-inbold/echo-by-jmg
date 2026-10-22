# 20261022 · Round 1 design themes

The four mood directions from the Round 1 design canvas ("EchoByJMG – mood directions"), built on the revamp theme (`echo-by-jmg/main`, the repo root, as of 19 Oct 2026).

| Folder | Direction | Shopify branch | Draft theme |
|---|---|---|---|
| `heritage-ink/` | A · Heritage Ink (80% elegant / 20% playful) | `20261022/heritage-ink` | EchoByJMG R1 · A Heritage Ink |
| `swatch-studio/` | B · Swatch Studio (60 / 40) | `20261022/swatch-studio` | EchoByJMG R1 · B Swatch Studio |
| `quiet-gallery/` | C · Quiet Gallery (90 / 10) | `20261022/quiet-gallery` | EchoByJMG R1 · C Quiet Gallery |
| `workbook/` | D · The Workbook (70% elegant / 30% personal), added 22 Oct | `20261022/workbook` | EchoByJMG R1 · D The Workbook |

## How the sync works

Shopify can only connect a theme to a branch whose root is the theme, not to a sub folder. So each folder has a twin branch with the same files at its root, and two GitHub Actions keep them equal:

- **main → branch** (`.github/workflows/sync-20261022-themes.yml`): a push to main that changes `20261022/**` copies each folder onto its branch. Shopify then updates the draft theme.
- **branch → main** (`.github/workflows/backsync.yml` inside each folder, at the branch root): when someone saves in the theme editor or code editor, Shopify commits to the branch, and the workflow copies the theme back into the folder on main.

Edit either side; don't edit both at once. The repo root stays the current revamp theme (`echo-by-jmg/main`) and is not touched.

## What changed from the revamp theme

All four folders hold the same code. The only difference is the starting value of **Theme settings › EchoByJMG › Design direction**, so any draft can also be switched to another direction for comparison.

- `assets/echo-skin.css.liquid`: the four looks (colours, type, shapes, knitting textures per section), scoped by the body class `skin-<direction>`.
- `assets/echo-brand.css.liquid` + `assets/echo-ic-*.svg`, `echo-tx-*.svg`, `echo-emblem.png`: the one-ink icon family and knit textures from the canvas (`.ic .i-<name>`, `.tx-*`, `.thread`, `.vrow`).
- Fonts: Cormorant Garamond + Manrope (`layout/echo.liquid`).
- Logo drawn from the store's own header logo file, in the direction's ink (setting "Draw the logo in the direction's ink").
- Client decision 21 Oct: one card per product everywhere (collection grid, Current editions, search), colour name on the card instead of dots, header counts products. Grouping is still available as a section setting.
- Card image: first product image over the card ground with a multiply blend, second image on hover.
- Icons: header utilities, hero trust line, numbers, How it works, story eyebrow, gifts and Cozy Club, product ticks, edition box, Yarn Passport, care symbols (example set).
- New section `echo-brand-promise` (four brand icons) above the footer, in the footer group.
- Product page: colour siblings shown as photo swatches with names.

## D · The Workbook (added 22 Oct)

Same markup and content as A–C; the look is CSS only (`skin-workbook` in `assets/echo-skin.css.liquid`), plus:

- Caveat (Google Fonts) for margin notes, loaded only when the direction is D (`layout/echo.liquid`).
- `assets/echo-tx-chart-paper.svg`: the knitting chart in #E8DECC, used as the paper ground.
- Theme settings › EchoByJMG › "D · The Workbook: margin notes": the handwritten notes (hero "← start here", "Gauge", the sticky note, "(the pattern, in three rows)", the shop-by note, the footer sign-off, the passport stamp). Empty = hidden.
- Existing text that turns into handwriting: eyebrows, hero category tabs, step numbers ("Row 1, 2, 3"), tile names, edition lines on cards, reviewer names, story signature, brand-promise titles, breadcrumbs, colour swatch names.
- House rules: one thing off the grid per section; photos and tags tilt 1–5°, text you need to read does not; prices, buttons and forms stay straight; on phones the tilts stay and the overlaps go (tags and cards in two columns).
