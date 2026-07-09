# markdown-publish

An Obsidian-Publish replacement: turn an Obsidian vault (markdown **and
canvas** files) into a static website ready to host. The wedge feature is
canvas publishing — official Obsidian Publish does not support `.canvas`
files; we do. See `plan/main.md` for the full product plan.

**Status: Phase 2** — markdown AND canvas builds work end to end: canvas pages
render interactively (pan/zoom/minimap, prebaked markdown, note/canvas/media
cards, privacy placeholders) and participate in wikilinks, backlinks, graph
and search. Validation + deploy land in Phase 3.

## Quick start

```bash
source ~/.nvm/nvm.sh && nvm use 26   # Node >= 22 required (tested on v26)

npm install
npm run setup        # one-time: clones pinned Quartz + installs its deps/plugins (needs network)

node cli/bin/publish.mjs build test-vault --config site.json --out ./public
python3 -m http.server -d ./public 8080   # note: real hosting maps /page -> page.html
```

Minimal `site.json` (full schema: `engine/README.md`; canvases publish via
`includeFolders` — canvas JSON has no frontmatter, so folder rules are its
opt-in surface):

```json
{
  "title": "My Site",
  "baseUrl": "notes.example.com",
  "publishFilter": { "includeFolders": ["canvases"] }
}
```

## Repo layout

| Path | What |
|------|------|
| `engine/` | Pure build engine: `(vault, site config) -> static site dir`. No AWS/auth/tenancy — the sacred boundary. |
| `canvas-plugin/` | Our Quartz pageType+emitter plugin for `.canvas` pages + the isolated hesprs viewer wrapper (ADR 0001). |
| `cli/` | Thin CLI (`publish build`), stand-in for the future Obsidian plugin. |
| `vendor/quartz-pin.json` | Pinned Quartz commit; `vendor/quartz/` is the gitignored managed checkout (ADR 0002). |
| `scripts/setup-quartz.mjs` | The `npm run setup` bootstrap. |
| `test-vault/` | Fixture vault exercising the parity checklist (incl. a private-note leak sentinel). |
| `plan/main.md` | Authoritative product/architecture plan. |
| `docs/decisions/` | ADRs. `docs/spikes/` — Phase 0 spike reports. `docs/status/` — per-phase status notes. |

## Development

```bash
npm run typecheck    # tsc --noEmit
npm test             # unit + integration (integration needs `npm run setup` first)
npm run test:e2e     # build + serve + curl checks + headless-Chromium canvas smoke
```

TypeScript runs directly on Node's native type stripping — no build step.
Tests use `node:test`.
