# Phase 3 Status: Validation + deploy

**Result: complete.** Every build now ends with a validation pass inside the
engine (leak check FAILS the build; broken-internal-link report with a
`--strict-links` escalation), and `publish deploy` ships a built site to
S3 + CloudFront from the CLI — entirely OUTSIDE the engine (sacred boundary
intact: zero AWS references under `engine/`). Suite green: **181 unit + 34
integration** (`npm test`) plus a **28/28 e2e smoke** including a deploy
dry-run through the real CLI (`npm run test:e2e`). Typecheck clean.

## What was built

- `engine/src/validation/` (SRP: distinct module, engine calls it as pipeline
  step 4; explicit result types, no tuples):
  - **LeakChecker** — the plan §4.4 backstop. Fingerprints every excluded
    text file (whitespace-normalized content lines >= `MIN_FINGERPRINT_LENGTH`
    = 20 chars; canvas files fingerprint AUTHORED strings — node text, edge
    labels — not JSON syntax) and scans all emitted text output
    (html/htm/xml/json/js/mjs/css/txt). Any hit ->
    `PrivateContentLeakError` naming the private file, the emitted file and
    the matched line: build FAILS.
  - **LinkChecker** — scans emitted HTML `href`/`src`/`data-viewer-src`, and
    canvas payloads (attachments map, noteLinks hrefs, text-card link
    targets). Fragment files (`*.fragments/*.html`) are rebased to their
    canvas page (their HTML is injected into that page's DOM). External URLs /
    `mailto:` / same-page anchors skipped; anchors+queries stripped; a target
    exists as `p`, `p.html`, or `p/index.html`. Report grouped by source page
    (`formatBrokenLinkReport` renders it).
  - **SiteValidator** orchestrates; POLICY lives in `SiteBuilder`: leaks always
    throw; `strictLinks: true` (CLI `--strict-links`) turns a non-empty report
    into `BrokenInternalLinksError`. `BuildSiteResult.validation` carries the
    result either way; the CLI prints the report as a warning.
- `cli/src/deploy/` — `publish deploy <siteDir> --deploy-config deploy.json [--dry-run]`:
  - **DeployConfigParser** — separate strict schema (bucket, region, prefix?,
    distributionId?, profile?, deleteStale?); unknown keys rejected, all
    problems listed (same contract as SiteConfigParser).
  - **DeployPlanner** — PURE plan computation: three `aws s3 sync` passes
    (cache classes: mutable docs 5 min / site code 1 h / everything else
    1 y immutable — table + WHY in cli/README.md; filters constructed so every
    file matches exactly one pass) + optional CloudFront invalidation of `/*`.
  - **DeployExecutor** — preflights `aws --version` with an actionable error
    if the CLI is missing, then runs commands via arg-array spawn (no shell),
    stopping on first failure. `--dry-run` prints the plan and executes
    nothing (needs no aws CLI).

## Verification (Node v26 via nvm)

```bash
source ~/.nvm/nvm.sh && nvm use 26
npm run typecheck        # clean
npm run test:unit        # 181 pass / 0 fail (was 126; +29 validation, +26 deploy)
npm run test:integration # 34 pass / 0 fail (was 30; +4: clean vault, strict-links fails, seeded leak fails)
npm run test:e2e         # 28/28 (validation assertions + CLI deploy dry-run added)
```

No real deploy was run: this sandbox has no `aws` CLI and no credentials by
design. Proven instead by unit tests on the pure plan and the dry-run e2e; a
real S3/CloudFront deploy is the Phase 4 dogfood's first step.

## Key findings / decisions

1. **The fixture's only broken link is real and deliberate:** index.md
   wikilinks `[[private-secret]]` (publish: false). Markdown wikilinks to
   unpublished notes degrade to a dead href — only canvas CARDS get privacy
   placeholders (plan §4.4 is about content, not navigation). The integration
   test asserts this is the ONLY broken link in a full build; the report
   exists precisely to surface such links to site owners.
2. **`--strict-links` is a CLI/build option, not a site.json field.** Link
   strictness is invocation policy (CI vs interactive), while site.json is the
   forever-supported customization surface that grows reluctantly.
3. **Leak-check honesty:** it catches VERBATIM content (quoted lines, embedded
   canvas payload text, search-index entries) after whitespace normalization.
   Lines transformed by markdown rendering may not match — accepted for a
   backstop; the primary enforcement is staging exclusion (private files are
   unreadable by the build). Documented in engine/README.md.
4. **Three cache classes, not two.** The classic "hashed => immutable" rule
   does not apply: Quartz does not content-hash JS/CSS (stable URLs like
   `static/canvas-viewer.js`), so marking them `immutable` would strand
   browsers on year-old site code. Site code gets 1 h; media gets 1 y
   immutable; documents 5 min.
5. **`deleteStale` is opt-in (default false).** `aws s3 sync --delete` honors
   each pass's --exclude/--include filters, so per-class deletion is safe, but
   deletion is destructive and stays off unless asked for. The deploy command
   also refuses a siteDir without `index.html` (guards against syncing —
   or worse, delete-syncing — a non-site directory).

## Deviations from the task brief (and why)

- **Cache classes:** the brief suggested "long+immutable for content-hashed
  assets"; no content-hashed assets exist in Quartz output, so the mapping was
  adapted as above (finding 4) and documented as required.
- None otherwise: validation is engine-internal, deploy is CLI-only, tests
  cover the required matrix, `test-vault/` untouched.

## Open questions carried forward

- Extensionless URL -> `.html` mapping is a manual CloudFront Function for
  now (documented in cli/README.md); decide whether the deploy command should
  provision it when the control plane arrives.
- Invalidation granularity: `/*` is fine for MVP; the hosted service should
  diff manifests and invalidate narrower path sets (cost at scale).
- Leak-check fingerprints are line-based; if dogfooding surfaces
  transformed-content leaks (unlikely via staging exclusion), consider
  token-sequence fingerprints.
- `deleteStale` default: revisit at dogfood — a hosted product probably wants
  mirror semantics (delete on) once deploys are known-good.
