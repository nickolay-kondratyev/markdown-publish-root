# Publishing to S3 + CloudFront

End-to-end guide: `publish build` output → live site on S3 behind CloudFront.

**Why CloudFront is mandatory:** the build emits `foo.html` on disk but links
pages WITHOUT the extension (`/notes/foo`, `/n/X.canvas`). Plain S3
static-website hosting cannot map extensionless URLs to `.html` objects, so
every internal link 404s. A CloudFront Function (step 3) does that mapping.
The full URL-routing contract lives in [hosting.md](hosting.md).

## Prerequisites

- AWS CLI v2 on PATH, credentials configured (`aws sts get-caller-identity`).
- A built site: `node cli/bin/publish.mjs build <vault-dir>` (see `cli/README.md`).

## 1. S3 bucket

Create a **private** bucket (keep Block Public Access ON — CloudFront reads
via OAC, browsers never talk to S3 directly):

```bash
aws s3api create-bucket --bucket <BUCKET> --region <REGION> \
  --create-bucket-configuration LocationConstraint=<REGION>   # omit config for us-east-1
```

Do NOT enable S3 static-website hosting — it is not used and cannot serve
this site correctly.

## 2. CloudFront Function (the URL remapper)

Runtime `cloudfront-js-2.0`, attached as **viewer request** in step 3.
This implements rules 2–3 of the [hosting contract](hosting.md):

```js
function handler(event) {
  var request = event.request;
  var uri = request.uri;
  var lastSegment = uri.split('/').pop();
  if (uri.endsWith('/')) {
    // Directory index (rule 2). Origin-side rewrite; no redirect needed —
    // Quartz's emitted links already resolve to trailing-slash folder URLs.
    request.uri = uri + 'index.html';
  } else if (!lastSegment.includes('.') || lastSegment.endsWith('.canvas')) {
    // Extensionless page or canvas page (rule 3).
    request.uri = uri + '.html';
  }
  return request;
}
```

Create and publish it (or use the console: CloudFront → Functions):

```bash
# Save the code above as fn.js first.
aws cloudfront create-function --name md-publish-router \
  --function-config "Comment=hosting.md URL contract,Runtime=cloudfront-js-2.0" \
  --function-code fileb://fn.js
# Publish, using the ETag returned by create-function:
aws cloudfront publish-function --name md-publish-router --if-match <ETAG>
```

Notes:

- The function cannot check whether objects exist, so rule 3 rewrites
  unconditionally; misses become origin 404s handled in step 3. Hand-typed
  `/dir` (no slash, no dot) rewrites to `/dir.html` and 404s — the build
  never emits such links (`publish preview` additionally redirects them as a
  local convenience).
- Rule 0 of the contract needs no edge code: S3 object keys can't contain
  `..` path escapes, and CloudFront normalizes dot-segments before the
  function runs.

## 3. CloudFront distribution

Console: CloudFront → Create distribution. Checklist:

| Setting | Value |
|---|---|
| Origin domain | the bucket (`<BUCKET>.s3.<REGION>.amazonaws.com`) — pick the bucket itself, NOT the website endpoint |
| Origin access | **Origin access control (OAC)** — create one; after creating the distribution, apply the bucket policy the console offers ("Copy policy" → bucket Permissions), which grants `cloudfront.amazonaws.com` read scoped to this distribution |
| Viewer protocol policy | Redirect HTTP to HTTPS |
| Cache policy | **CachingOptimized** (managed) — honors the per-file-class `Cache-Control` headers `publish deploy` sets (table in `cli/README.md`) |
| Function associations | **Viewer request** → `md-publish-router` (step 2) |

**404 page** (rule 4 of the contract): under Error pages, add custom error
responses mapping **403** (S3 + OAC returns 403, not 404, for missing keys)
— and 404 for completeness — to response page `/404.html` with response code
**404**. If you deploy under a `prefix` (deploy.json), include it in the
path (e.g. prefix `n` → `/n/404.html`).

Wait for the distribution status to become `Deployed` (~5 min).

## 4. Deploy

`deploy.json` (full schema: `cli/README.md`):

```jsonc
{
  "bucket": "<BUCKET>",
  "region": "<REGION>",
  "prefix": "n",                    // optional; must match the URLs you publish under
  "distributionId": "<DIST_ID>"     // enables automatic CloudFront invalidation
}
```

```bash
node cli/bin/publish.mjs deploy <site-dir> --deploy-config deploy.json   # --dry-run to preview
```

## 5. Verify

Open `https://<dist-domain>.cloudfront.net/<prefix>/` and click through a
note link, a canvas (`…X.canvas` URL), and a bogus URL (must render the
themed 404 page with HTTP status 404).

## Troubleshooting

| Symptom | Cause |
|---|---|
| Internal links 404 but `…/page.html` works | Function not attached as **viewer request**, or not published to LIVE |
| Every URL 403s | OAC bucket policy missing/wrong (must reference this distribution's ARN) |
| Direct `https://<BUCKET>.s3…amazonaws.com/…` URLs 404/403 | Expected — the bucket is private; only CloudFront reads it. Test via the distribution domain |
| Edits not visible after deploy | No `distributionId` in deploy.json → no invalidation (deploy prints a warning) |
