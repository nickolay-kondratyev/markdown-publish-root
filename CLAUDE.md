# markdown-publish — developer docs

An Obsidian-Publish replacement: `(vault, site config) -> static site dir`.
The wedge feature is canvas publishing. Authoritative product/architecture
plan: `plan/main.md`.

**Status: Phase 3** — markdown AND canvas builds work end to end: canvas
pages render interactively (pan/zoom/minimap, prebaked markdown,
note/canvas/media cards, privacy placeholders) and participate in wikilinks,
backlinks, graph and search. Build-ending validation pass (private-content
leak check FAILS the build; broken-internal-link report, `--strict-links`),
and `publish deploy` ships to S3 + CloudFront with cache-classed headers.
Next: Phase 4 dogfood.

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
| `docs/` | User-facing docs: `config-format.md` (publish-config schema), `hosting.md` (URL-routing contract every host must implement), `publish-to-s3.md` (S3 + CloudFront setup guide incl. the URL-rewrite Function). |
| `docs-internal/decisions/` | ADRs. `docs-internal/spikes/` — Phase 0 spike reports. `docs-internal/status/` — per-phase status notes. `docs-internal/tickets/` — follow-up tickets. |

## Development

```bash
npm run typecheck    # tsc --noEmit
npm test             # unit + integration (integration needs `npm run setup` first)
npm run test:e2e     # build + serve + curl checks + headless-Chromium canvas smoke
```

TypeScript runs directly on Node's native type stripping — no build step.
Tests use `node:test`.
