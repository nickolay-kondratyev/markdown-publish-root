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

## Quick start: vault → HTML

Turn any Obsidian vault into a directory of static HTML you can host
anywhere. One-time setup (steps 1–2), then step 3 is the whole publish loop.

**1. Get the repo + all dependencies** — one command, idempotent (installs
nvm, the pinned Node, npm deps, the vendored Quartz, and runs the tests;
`--no-verify` skips the test run):

```bash
git clone <this-repo-url> markdown-publish && cd markdown-publish
scripts/setup-dev-env.sh
```

**2. Prepare your vault** — drop a `.external_publish_config.json` at the
vault root (full format + examples: [docs/config-format.md](docs/config-format.md))
and stamp stable doc ids (page URLs are `/n/<docid>`, so they survive
renames; idempotent, safe to re-run after adding notes):

```bash
cat > /path/to/vault/.external_publish_config.json <<'EOF'
{
  "title": "My Site",
  "baseUrl": "notes.example.com",
  "publishFilter": { "publishAll": true },
  "output_dir": ".publish_out"
}
EOF
make vault-add-ids VAULT=/path/to/vault
```

`publishAll: true` publishes the whole vault; hidden paths, paths containing
`private`, and `publish: false` frontmatter are always excluded. To publish
only selected folders, use `includeFolders` instead (docs/config-format.md).

**3. Generate the HTML:**

```bash
node cli/bin/publish.mjs build /path/to/vault
```

No `--config`/`--out` needed — the in-vault config supplies both (flags still
override; a working example is `test-vault/.external_publish_config.json`).
The static site lands in the config's `output_dir` (here
`/path/to/vault/.publish_out`): plain HTML/CSS/JS, ready for any static host.

**4. View / ship it:**

```bash
# Local preview (production URL routing, e.g. extensionless /n/<docid> pages):
node cli/bin/publish.mjs preview /path/to/vault/.publish_out

# Deploy to S3 + CloudFront (needs AWS CLI v2 + credentials; --dry-run previews):
node cli/bin/publish.mjs deploy /path/to/vault/.publish_out --deploy-config deploy.json --dry-run
```

Real hosting must map extensionless page URLs to their `.html` files — the
contract (plus a paste-ready CloudFront Function) lives in
`docs-internal/hosting.md`.

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
| `docs/config-format.md` | The `.external_publish_config.json` publish-config format (schema + examples). |
| `docs/decisions/` | ADRs. `docs/spikes/` — Phase 0 spike reports. `docs/status/` — per-phase status notes. |

## Development

```bash
npm run typecheck    # tsc --noEmit
npm test             # unit + integration (integration needs `npm run setup` first)
npm run test:e2e     # build + serve + curl checks + headless-Chromium canvas smoke
```

TypeScript runs directly on Node's native type stripping — no build step.
Tests use `node:test`.

## License

This project is source-available under the Kondratyev Source Available
License 2.2 (KSAL-2.2). In short:

- **You can** use, modify, fork, and redistribute the code for free for
  personal, educational, research, and other noncommercial purposes.
- **Individual creators** — including freelancers, sole proprietors, and
  single-person LLCs — may commercialize anything they *create with* the
  software (sites, content, client deliverables), but not the software
  itself.
- **You cannot** otherwise use it for commercial purposes — including
  company/business use, selling products built on it, or offering it as
  a hosted service — without a paid license.
- A one-time 30-day commercial evaluation is permitted to decide whether
  to purchase.
- Paid functionality behind a license key is not covered by this grant
  and requires a subscription.
- Do not bypass or tamper with license key / subscription checks.
- Contributions you submit are licensed to the author for any use.

This summary is informational only and is not the license. The full text
in [LICENSE.md](LICENSE.md) is the sole and final authority on your
rights and obligations.