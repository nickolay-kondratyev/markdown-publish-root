# Publish CLI

Thin command-line boundary around the engine (`engine/`). For MVP this stands
in for the future Obsidian companion plugin; it contains NO build logic.
Hosting (AWS) lives ONLY here — never in `engine/` (sacred boundary,
plan/main.md §3).

## build

```bash
source ~/.nvm/nvm.sh && nvm use 26   # Node >= 22 required; >= 23.6 recommended, tested on v26

node cli/bin/publish.mjs build <vault-dir> --config site.json --out ./public
```

| Flag | Meaning |
|------|---------|
| `--config <file>` | Site settings JSON (schema: engine/README.md) |
| `--out <dir>` | Output directory for the static site |
| `--keep-staging` | Keep the temporary staging dir (debugging) |
| `--strict-links` | Fail the build on broken internal links (default: print a report) |

Canvases are published when covered by `publishFilter.includeFolders` in the
site config (canvas JSON has no frontmatter — see engine/README.md filter
semantics). The success line reports pages, canvases and assets separately.

The build ends with the engine's validation pass: a private-content **leak
check always fails the build** on findings; the **broken-internal-link report**
is printed as a warning (grouped by source page) unless `--strict-links`
escalates it to a failure.

## deploy

```bash
node cli/bin/publish.mjs deploy ./public --deploy-config deploy.json [--dry-run]
```

Uploads a built site to S3 (`aws s3 sync`, one pass per cache class below) and
invalidates CloudFront (`/*`). Requires AWS CLI v2 on PATH with configured
credentials; `--dry-run` prints the exact `aws` commands without executing
anything (and needs no aws CLI at all).

### deploy.json schema

Deliberately a SEPARATE schema from site.json — the engine never sees it.
Validation is strict: unknown keys rejected, all problems listed at once.

```jsonc
{
  "bucket": "my-site-bucket",     // required; bare S3 bucket name
  "region": "us-east-1",          // required; the bucket's AWS region
  "prefix": "sites/nickolay",     // optional (default ""); key prefix, no leading/trailing slash
  "distributionId": "E123ABC",    // optional; CloudFront to invalidate (omitted => warning, no invalidation)
  "profile": "personal",          // optional; AWS CLI named profile
  "deleteStale": false            // optional (default false); pass --delete to s3 sync (destructive => opt-in)
}
```

### Cache-header mapping (one `aws s3 sync` pass per class)

| Class | Matches | Cache-Control | Why |
|---|---|---|---|
| Mutable documents | `*.html *.htm *.json *.xml *.txt` | `public, max-age=300, must-revalidate` | Re-published in place under stable URLs; edits visible within 5 min |
| Site code | `*.js *.mjs *.css` | `public, max-age=3600` | Quartz does NOT content-hash these (stable names like `index.css`, `static/canvas-viewer.js`); `immutable` would strand browsers on year-old code |
| Long-lived assets | everything else (images, fonts, media, PDFs) | `public, max-age=31536000, immutable` | Vault attachments rarely change; on replace-in-place, the CloudFront invalidation refreshes the edge (stale BROWSER caches accepted for MVP) |

Filters are constructed so every file matches EXACTLY one pass. The plan is
computed by a pure module (`src/deploy/deployPlanner.ts`, unit-tested);
execution (`src/deploy/deployExecutor.ts`) shells out to `aws` and stops on
the first failure.

### CloudFront prerequisites (manual for MVP, plan §5)

- Distribution + OAC pointing at the bucket/prefix: set up manually.
- Quartz links pages WITHOUT `.html` (`/notes/foo`), but emits `foo.html`
  objects. Map extensionless URLs to `.html` with a CloudFront Function on
  viewer-request (or equivalent). This is a hosting concern by design — the
  build output and validation pass both treat `foo` and `foo.html` as the
  same target.

Exit codes (both commands): `0` success, `1` build/config/deploy failure,
`2` usage error.

`bin/publish.mjs` is plain JS on purpose: it preflights the Node version and
prints an actionable message even on a Node too old to load the TypeScript
sources.

## Stable vs evolving

- **Stable:** `build <vault> --config <site.json> --out <dir>` and
  `deploy <site-dir> --deploy-config <deploy.json>` shapes; deploy.json grows
  compatibly.
- **Evolving:** cache-class tuning; deletion semantics (`deleteStale`);
  invalidation granularity (manifest-diff paths are a hosted-service concern).
