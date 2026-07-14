# 0007: Stale `docs/hosting.md` references (file lives at `docs-internal/hosting.md`)

**RESOLVED 2026-07-14** via option 2: `hosting.md` moved to `docs/hosting.md`
(its S3+CloudFront recipe extracted to the new `docs/publish-to-s3.md` guide);
all `docs-internal/hosting.md` referrers updated. Verified by repo-wide grep.

## Problem

Multiple files reference the hosting URL-routing contract at `docs/hosting.md`,
but the file is at `docs-internal/hosting.md`. Users following the pointer
(including the `publish preview` USAGE text printed by the CLI) hit a dead path.

Known referrers (grep `hosting.md`):

- `cli/README.md` (several mentions)
- `cli/src/main.ts` (preview USAGE text)
- `cli/src/preview/previewCommand.ts`, `previewPathResolver.ts`, `previewServer.ts`
- `cli/test/unit/previewPathResolver.test.ts`
- `scripts/e2e-smoke.mjs`
- `plan/id-based-publishing.md`, `plan/assesments/stable-id-publishing-feasibility.md`

## Fix options

1. Update all references to `docs-internal/hosting.md` (mechanical sed), OR
2. Move the file to `docs/hosting.md` — arguably the right home: the hosting
   contract is user-facing (anyone self-hosting the output needs it), while
   `docs-internal/` is for internal notes. Then only `docs-internal/current/usage.md`
   needs updating.

Decide direction, then change wholesale (no mixed pointers).

## Origin

Found 2026-07-13 while reworking the README vault→HTML quick start (the new
README text now points at `docs-internal/hosting.md`, the current real path).
