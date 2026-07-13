# ADR 0002: Vendor Quartz as a pinned clone managed by a setup script

**Status:** Accepted (Phase 1, 2026-07-08)
**Context:** Phase 0 found Quartz 5 is NOT published to npm and requires a
one-time `plugin install` bootstrap after checkout (docs-internal/status/phase-0.md).
The engine therefore needs a managed Quartz checkout, and Phase 0 left the
mechanism (clone vs submodule/subtree) as an open question.

## Decision

`npm run setup` (scripts/setup-quartz.mjs) produces the checkout:

1. Shallow-fetches exactly the commit pinned in `vendor/quartz-pin.json`
   into `vendor/quartz/` (gitignored).
2. `npm ci` inside the checkout (lockfile-exact dependencies).
3. `node quartz/bootstrap-cli.mjs plugin install` — installs the ~46 community
   plugins pinned by Quartz's own `quartz.lock.json` and generates
   `.quartz/plugins/index.ts`, without which a fresh checkout cannot build.

Pinned commit: `9cf87ff1c248a8ca551093214b0fec3b31415009` (Quartz 5.0.0) —
the exact commit the Phase 0 spikes validated hands-on.

Reproducibility chain: pin file (exact Quartz commit) + `package-lock.json`
(exact npm deps) + `quartz.lock.json` (exact community-plugin commits).
The script is idempotent; re-running after a pin bump re-syncs the checkout.

## Why not a git submodule

- A submodule only solves step 1 of 3; `npm ci` + `plugin install` need a
  script anyway, so the script may as well own the whole bootstrap (one
  command, one place to read).
- Submodule UX (init/update, detached heads, accidental pin bumps in
  unrelated commits) adds friction for every clone; a JSON pin file makes
  version bumps an explicit, reviewable one-line diff.
- We do not patch Quartz (spike A verdict: plugin-shaped integration, no
  fork), so we never need to commit changes inside the checkout — the main
  argument for subtree/submodule vanishes.

## Consequences

- Fresh clones need network + git once (`npm run setup`); builds afterwards
  are offline.
- The engine writes the generated `quartz.config.yaml` into `vendor/quartz/`
  each build (Quartz resolves config from its cwd — spike A, gotcha G11).
  The checkout is a build tool, not source; this mutation is by design.
- Bumping Quartz = edit `vendor/quartz-pin.json`, run `npm run setup`, re-run
  the test suite; spike assumptions (plugin API surface) must be re-checked
  on major bumps.
