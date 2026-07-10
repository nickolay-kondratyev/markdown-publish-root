---
id: docid_s5t5tmwxky6gpgrpqe703_e
---
# Test Vault (Fixture)

An Obsidian-style vault used as the canonical fixture for the publish engine.
It deliberately exercises the full canvas parity checklist from
`plan/main.md` section 5 (definition of done).

## Contents

| Path | Purpose |
|---|---|
| `index.md` | Home page; wikilinks to notes, canvases, and an image embed. |
| `notes/getting-started.md` | Multi-heading note; target of a `#Installation` subpath canvas card. |
| `notes/architecture.md` | Note with a `^engine-def` block anchor; embedded whole in a canvas card. |
| `notes/private-secret.md` | `publish: false`. Contains leak sentinel `LEAK-SENTINEL-9f3a72` — the validation pass MUST fail the build if this string appears anywhere in emitted output. |
| `notes/guides/deep-dive.md` | NESTED published note — folder-shaped explorer/breadcrumbs fixture (folder-nav plan Phase 4). |
| `notes/vintrin-priv-only-x7q3/only-private.md` | `publish: false`. The folder NAME is a leak sentinel: a folder holding only unpublished docs must appear nowhere in output. |
| `attachments/diagram.png` | Image used by markdown embed and a canvas image card. |
| `canvases/main.canvas` | Primary test canvas: text cards (markdown, wikilinks to note AND to `second.canvas`), full note card, `#Installation` subpath note card, image card, private-note card, canvas→canvas card, web link card, group, labeled/colored edges, preset + hex colors, edge endpoint variants (`fromEnd:"arrow"` / `toEnd:"none"`). |
| `canvases/second.canvas` | Navigation target; links back to `main.canvas`. |

## Invariants (do not break when editing)

- `private-secret.md` stays `publish: false` and keeps the sentinel string.
- `notes/vintrin-priv-only-x7q3/` keeps ONLY `publish: false` docs — its name
  doubles as the folder-privacy leak sentinel (folderNav integration test).
- `main.canvas` must keep at least one instance of every node type and every
  checklist feature listed above — build verification depends on it.
