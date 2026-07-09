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
- Tests green under Node v26 via nvm: 181 unit + 34 integration (`npm test`),
  28/28 e2e smoke incl. CLI deploy dry-run (`npm run test:e2e`). Fixture
  `test-vault/` untouched (the negative leak test builds a temp copy).

(Phase 1/2 summaries: `docs/status/phase-1.md`, `docs/status/phase-2.md`.)
