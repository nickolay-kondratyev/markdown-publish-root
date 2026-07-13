# Hosting: the URL-routing contract

Quartz emits `foo.html` on disk but links pages WITHOUT the extension:
notes as `/notes/foo`, canvases as `/canvases/X.canvas` (emitted as
`X.canvas.html`). A plain static file server therefore 404s every internal
link. **Any host serving a `publish build` output must implement the
resolution below.** This document is the single home of that contract;
`publish preview` (cli/README.md) implements it exactly, and the e2e suite
asserts it against real build output.

## Resolution order (per request path)

0. Decode the percent-encoded path; **reject** anything containing `..`, `.`
   or dotfile segments (path traversal / hidden files — the resolved path
   must never leave the site directory).
1. **Exact file** exists → serve it.
2. Path is a **directory containing `index.html`** → serve that index
   (redirect `/dir` → `/dir/` first, so the page's relative URLs resolve
   against the directory).
3. Last segment has **no extension, or ends in `.canvas`** → serve
   `<path>.html` if it exists. (The `.canvas` rule is why `/canvases/X.canvas`
   works; any other extension must NOT fall back — a missing image is a 404,
   not a page.)
4. Otherwise **404**: serve the site's `404.html` with status 404 if present.

Reference implementation: `cli/src/preview/previewPathResolver.ts`.

## S3 + CloudFront (the supported production path)

Plain **S3 static-website hosting cannot implement this contract** — it only
offers index and error documents, no extensionless→`.html` rewrite. Use
CloudFront with a **CloudFront Function** on **viewer request**.

### CloudFront Function (paste-ready, runtime `cloudfront-js-2.0`)

Attach to the distribution's default cache behavior, event type
**Viewer request**:

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

Notes:
- The function cannot check whether files exist, so rule 3 rewrites
  unconditionally; misses become origin 404s handled below. Hand-typed
  `/dir` (no slash, no dot) rewrites to `/dir.html` and 404s — Quartz never
  emits such links (`publish preview` additionally redirects them as a local
  convenience).
- Rule 0 needs no edge code: S3 object keys can't contain `..` path
  escapes, and CloudFront normalizes dot-segments before the function runs.

### 404 page (rule 4)

Wire the site's `404.html` via **CloudFront custom error responses**: map
error code **403** (S3 + OAC returns 403, not 404, for missing keys) — and
404 for completeness — to response page `/404.html` with response code
**404**. If you deploy under a `prefix` (deploy.json), the response page path
must include it.

## Other hosts (one-liners, for completeness)

- **nginx**: `try_files $uri $uri/index.html $uri.html =404;` (+ `error_page 404 /404.html;`)
- **Netlify / Vercel**: `cleanUrls` covers `/notes/foo`; verify canvas URLs
  (`X.canvas` → `X.canvas.html`) before relying on it.
