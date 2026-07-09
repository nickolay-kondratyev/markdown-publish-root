# Publish CLI

Thin command-line boundary around the engine (`engine/`). For MVP this stands
in for the future Obsidian companion plugin; it contains NO build logic.

## Usage

```bash
source ~/.nvm/nvm.sh && nvm use 26   # Node >= 22 required; >= 23.6 recommended, tested on v26

node cli/bin/publish.mjs build <vault-dir> --config site.json --out ./public
```

Options:

| Flag | Meaning |
|------|---------|
| `--config <file>` | Site settings JSON (schema: engine/README.md) |
| `--out <dir>` | Output directory for the static site |
| `--keep-staging` | Keep the temporary staging dir (debugging) |

Canvases are published when covered by `publishFilter.includeFolders` in the
site config (canvas JSON has no frontmatter — see engine/README.md filter
semantics). The success line reports pages, canvases and assets separately.

Exit codes: `0` success, `1` build/config failure, `2` usage error.

`bin/publish.mjs` is plain JS on purpose: it preflights the Node version and
prints an actionable message even on a Node too old to load the TypeScript
sources.

## Stable vs evolving

- **Stable:** `build <vault> --config <site.json> --out <dir>` shape.
- **Evolving:** a `deploy` command (S3 sync + CloudFront invalidation) arrives
  in Phase 3 — deliberately not built yet.
