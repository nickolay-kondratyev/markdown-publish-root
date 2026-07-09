# `publish preview` + hosting docs — Public Summary

(Previous phase-3 summary preserved below.)

- **`publish preview <site-dir> [--port <n>]`** (`cli/src/preview/`): local
  server implementing THE site URL-routing contract — extensionless page URLs
  (`/notes/foo`, `/canvases/X.canvas`) map to their `.html` files, directory
  URLs serve `index.html` (`/dir` 302→`/dir/`), misses serve the themed
  `404.html` with status 404, traversal/dotfile paths rejected (400) before
  any file lookup. Pure resolver (`previewPathResolver.ts`, unit-tested
  decision table) + thin `node:http` wiring (`previewServer.ts`), mirroring
  the DeployPlanner/Executor split. Binds 127.0.0.1 only; default port 8080;
  clean SIGINT shutdown. Node built-ins only — no new dependencies.
- **Key contract detail:** plain "no extension → `.html`" is NOT enough:
  Quartz links canvases as `X.canvas` but emits `X.canvas.html`. Rule 3 is
  "no extension OR `.canvas`". Any other extension never falls back (missing
  image = 404, not a page).
- **`docs/hosting.md`** is the single home of the contract: resolution order,
  paste-ready CloudFront Function (viewer-request, `cloudfront-js-2.0`),
  custom-error-response wiring for `404.html` (S3+OAC returns 403), note that
  plain S3 website hosting cannot do this rewrite, one-line nginx /
  Netlify/Vercel equivalents. cli/README.md's inline CloudFront prose now
  points there (DRY).
- **e2e now exercises the REAL preview server** (replaced the ad-hoc static
  server in scripts/e2e-smoke.mjs): `/canvases/main.canvas` 200 (the exact
  URL that 404'd on plain static servers), root/note/`.html` 200s, themed
  404, raw + encoded + nested traversal rejected — traversal checks use raw
  `http.request` because fetch()/WHATWG URL normalize `..`/`%2e%2e`
  client-side.
- `assertLooksLikeBuiltSite` extracted to `cli/src/builtSiteDir.ts` (shared
  deploy + preview).
- Tests green (Node v26 via nvm): **220 unit + 34 integration** (`npm test`),
  **36/36 e2e** (`npm run test:e2e`), typecheck clean.

---

# Phase 3 Implementation — Public Summary

See `docs/status/phase-3.md` for the full status (what was built, exact
verification commands, key findings, open questions). Highlights:

- **Validation pass** (engine-internal, final build stage,
  `engine/src/validation/`): `LeakChecker` fingerprints excluded md/canvas
  content and FAILS the build on any hit in emitted text output (plan §4.4
  backstop, `PrivateContentLeakError`); `LinkChecker` reports broken internal
  links (HTML attributes + canvas payloads, fragments rebased to their canvas
  page), escalatable via `--strict-links` / `BuildSiteOptions.strictLinks`.
- **`publish deploy`** (`cli/src/deploy/`, NOT in the engine — sacred boundary
  intact): separate strict `deploy.json` schema; PURE `DeployPlanner` (three
  cache-classed `aws s3 sync` passes + CloudFront `/*` invalidation;
  cache-header table in cli/README.md); `DeployExecutor` shells out to the
  AWS CLI with an actionable preflight; `--dry-run` prints the plan and needs
  no aws CLI. No real deploy attempted (sandbox has no credentials by design).
- **Known finding, asserted in tests:** the fixture's ONLY broken link is
  index.md's deliberate `[[private-secret]]` wikilink — markdown links to
  unpublished notes degrade to dead hrefs (canvas cards get placeholders).
- Tests green under Node v26 via nvm. Fixture `test-vault/` untouched (the
  negative leak test builds a temp copy).

(Phase 1/2 summaries: `docs/status/phase-1.md`, `docs/status/phase-2.md`.)
