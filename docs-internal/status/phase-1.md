# Phase 1 Status: Engine skeleton

**Result: complete.** Markdown-only vault builds end to end through a pure
engine + thin CLI; publish filtering enforced by staging exclusion; all tests
green (55 unit + 10 integration).

## What was built

- `engine/` — pure `(vault, site.json) -> static site dir` (README documents
  schema, filter semantics, privacy rule). Pipeline: `VaultStager` (copies
  only publishable files into an `os.tmpdir()` staging dir) ->
  `QuartzConfigGenerator` (site.json -> `quartz.config.yaml`, config
  inversion) -> `QuartzRunner` (spawns the vendored Quartz CLI).
- `cli/` — `node cli/bin/publish.mjs build <vault> --config site.json --out <dir>`.
  `deploy` deliberately not built (Phase 3).
- `scripts/setup-quartz.mjs` (`npm run setup`) — clones Quartz at the pin in
  `vendor/quartz-pin.json` (`9cf87ff1c248a8ca551093214b0fec3b31415009`, the
  exact commit the spikes validated), `npm ci`, `quartz plugin install`.
  ADR 0002 records why script+pin-file beat a git submodule.
- site.json schema (title, baseUrl, locale, minimal theme, publishFilter) with
  strict boundary validation (unknown keys rejected, all problems listed).
- Publish filter with explicit precedence (engine/README.md table);
  `publish: false` always wins; malformed frontmatter fails closed.
- Phase 1 canvas handling: `.canvas` excluded from staging AND official
  `canvas-page` plugin disabled in generated config (no claimant).
- Privacy degradation rule documented (engine/README.md): private-referenced
  canvas cards become contentless "Private note" placeholders (ADR 0001);
  staging exclusion is the enforcement mechanism; Phase 3 validation pass is
  the backstop.
- Docs: engine/README.md, cli/README.md, root README.md rewritten, ADR 0002.

## Verification (exact commands, all run under Node v26.4.0 via nvm)

```bash
source ~/.nvm/nvm.sh && nvm use 26
npm install && npm run setup

npm run typecheck        # clean
npm run test:unit        # 55 pass / 0 fail
npm run test:integration # 10 pass / 0 fail (builds test-vault via the engine)

# End-to-end via the CLI:
echo '{ "title": "Test Vault", "baseUrl": "test-vault.example.com" }' > .build/site.json
node cli/bin/publish.mjs build test-vault --config .build/site.json --out .build/e2e-site
# -> "publish: built 3 page(s) and 1 asset(s) (4 file(s) filtered out)"

cd .build/e2e-site && python3 -m http.server 8932 &
curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8932/                            # 200
curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8932/notes/getting-started.html # 200
curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8932/notes/private-secret.html  # 404
curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8932/static/contentIndex.json   # 200
curl -s http://127.0.0.1:8932/notes/getting-started.html | grep -o 'href="../notes/architecture"'  # wikilink resolved
grep -r "LEAK-SENTINEL-9f3a72" .   # no matches anywhere in output
```

Note: `python3 -m http.server` serves `/notes/getting-started` as 404 because
it does not map extensionless URLs to `.html` — that mapping is a hosting
concern (S3/CloudFront rules, Phase 3), not a build defect.

## Deviations from the task brief / plan (and why)

1. **Single npm package, `engine/` and `cli/` as module directories** (not
   separate packages/workspaces). Node's native TypeScript type stripping
   refuses `.ts` under `node_modules`, so workspace-symlinked TS packages
   cannot import each other without a build step. One package keeps
   zero-build-step simplicity (KISS); Phase 2's `canvas-plugin/` becomes its
   own package anyway because Quartz plugins require their own `package.json`.
2. **`excludeFolders` added to the publish-filter schema.** The brief's rule
   ("publish: true OR include-folder; publish: false wins") is implemented
   verbatim; excludeFolders is the explicitly-requested asset-exclusion
   mechanism, generalized to all files and documented as winning over
   everything (machinery folders like `templates/`).
3. **Generated config diverges from stock Quartz deliberately:** canvas-page
   OFF (Phase 1), favicon/og-image OFF (sharp postinstall blocked in this
   sandbox, Phase 0 gotcha G9 — revisit for production), analytics null,
   cname OFF (hosting is outside the engine boundary), remove-draft OFF (one
   filter surface only), bases-page/encrypted-pages omitted (out of MVP scope).

## Empirical findings (confirmed this phase)

- **G2 re-confirmed with the real engine:** staging under the repo's
  gitignored `.build/` makes Quartz report `Found 0 input files`. Default
  staging is a fresh dir under `os.tmpdir()`; additionally `SiteBuilder`
  fails loudly (with the gitignore hint) if Quartz sees 0 files while
  markdown was staged.
- `analytics: null` is valid Quartz 5 config (type `Analytics = null | ...`
  in `quartz/cfg.ts`).
- Node v26 runs `.ts` sources and `node --test` natively (no flags, no deps).

## Open questions carried to Phase 2

- Wikilinks to canvases (`[[main.canvas]]`) currently emit unresolved hrefs
  (target excluded from staging) — expected; Phase 2's pageType plugin makes
  them resolve.
- favicon/og-image plugins stay disabled until we run on hosts where sharp
  can install; decide whether the product wants them at all.
- Build performance: test-vault builds in ~1.5 s warm (measured; the first
  build after setup is slower while Quartz's esbuild cache warms). Fine for
  MVP; revisit on large vaults for the hosted service (plan §7.8).
