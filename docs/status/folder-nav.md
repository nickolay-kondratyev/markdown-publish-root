# Status: plan/folder-nav-over-id-urls.md

## Phase 0 — Spike C (DONE, 2026-07-10)

Local `component`-category plugin proven end-to-end against the vendored
Quartz pin — mount, naming rule, options flow, `not-index` condition,
css+script shipping. Full findings: `docs/spikes/spike-C-local-component-plugin.md`.
No fork needed; plan proceeds as written. No deviations.

## Phase 1 — Staging injection + validation (DONE, 2026-07-10)

- `vintrinPath` (reserved key, `engine/src/frontmatter.ts`) is now injected
  into every staged doc: md frontmatter via `MarkdownStagingTransformer`
  (required option), canvas `metadata.frontmatter` via
  `CanvasStagingTransformer`. Root `index.md` gets `vintrinPath: index.md`.
- Reserved-key collision: a PUBLISHABLE doc declaring `vintrinPath` fails the
  build in VaultStager pass 2 with `ReservedFrontmatterKeyError`, listing
  every offender (md + canvas), before anything is written. Unpublished docs
  are exempt (consistent with id validation scope).
- Tests first (red→green): exact-output md injection asserts updated to the
  new spec, canvas + stager + collision + root-index coverage added.
  297 unit / 43 integration / typecheck green.
- Deviations: none.

## Environment note (this workstation)

No nvm on this box (`~/.nvm` absent) and the profile's `node()`/`npm()` shell
functions recurse infinitely when nvm is missing — bypass with `unset -f node
npm npx` and a standalone Node 25 at `~/.local/node25/node-v25.1.0-linux-x64/bin`
prepended to PATH. Follow-up: fix the guard in vintrin-env profile scripts.
