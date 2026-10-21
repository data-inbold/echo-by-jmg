# EchoByJMG theme repo

| Where | What | Shopify theme |
|---|---|---|
| repo root (`assets/`, `sections/` …) | 20 Oct revamp preview theme, the one shared with the client | `echo-by-jmg/main` (keeps its preview link) |
| `20261020/revamp/` + branch `20261020/revamp` | Mirror of the root, kept in step automatically | not connected yet (connect at the switch) |
| `20261022/<name>/` + branch `20261022/<name>` | Round 1 design directions: heritage-ink, swatch-studio, quiet-gallery | `echo-by-jmg/20261022/<name>` |

Shopify only connects a branch whose root is a theme, so every folder has a twin branch. See `20261022/README.md` for the two-way sync.

## Later clean-up (when the `echo-by-jmg/main` preview link is retired)
1. Connect branch `20261020/revamp` in Shopify (new theme, new preview link).
2. Disconnect or delete the `echo-by-jmg/main` theme.
3. Remove the theme folders from the root and the mirror workflow; main then holds only dated folders.
