# markdown-publish

An Obsidian-Publish replacement: turn an Obsidian vault (markdown **and
canvas** files) into a static website ready to host. The wedge feature is
canvas publishing — official Obsidian Publish does not support `.canvas`
files; we do. See `plan/main.md` for the full product plan.

**Status: Phase 3** — markdown AND canvas builds work end to end: canvas pages
render interactively (pan/zoom/minimap, prebaked markdown, note/canvas/media
cards, privacy placeholders) and participate in wikilinks, backlinks, graph
and search. Every build ends with a validation pass (private-content leak
check FAILS the build; broken-internal-link report, `--strict-links` to
escalate), and `publish deploy` ships the output to S3 + CloudFront with
cache-classed headers. Next: Phase 4 dogfood.

## Quick start

```bash
scripts/setup-dev-env.sh   # one-command bootstrap: nvm + Node (pinned in .nvmrc) + npm install + npm run setup + npm test
# or manually:
source ~/.nvm/nvm.sh && nvm use   # Node >= 22 required; version pinned in .nvmrc

npm install
npm run setup        # one-time: clones pinned Quartz + installs its deps/plugins (needs network)

node cli/bin/publish.mjs build test-vault --config site.json --out ./public
python3 -m http.server -d ./public 8080   # note: real hosting maps /page -> page.html

# Ship it (needs AWS CLI v2 + credentials; --dry-run previews the aws commands):
node cli/bin/publish.mjs deploy ./public --deploy-config deploy.json --dry-run
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
| `canvas-plugin/` | Our Quartz pageType+emitter plugin for `.canvas` pages + the isolated React Flow viewer (ADR 0001, ADR 0003). |
| `cli/` | Thin CLI (`publish build` / `publish deploy`), stand-in for the future Obsidian plugin. ALL AWS lives here (deploy.json schema: `cli/README.md`). |
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
