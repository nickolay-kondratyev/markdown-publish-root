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
CloudFront with a **CloudFront Function** on **viewer request**: step-by-step
setup, including the paste-ready function (rules 2–3) and the 404 wiring
(rule 4), lives in [publish-to-s3.md](publish-to-s3.md).

## Other hosts (one-liners, for completeness)

- **nginx**: `try_files $uri $uri/index.html $uri.html =404;` (+ `error_page 404 /404.html;`)
- **Netlify / Vercel**: `cleanUrls` covers `/notes/foo`; verify canvas URLs
  (`X.canvas` → `X.canvas.html`) before relying on it.
