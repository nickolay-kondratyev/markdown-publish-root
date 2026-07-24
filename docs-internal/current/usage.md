# Usage

Publish an Obsidian vault (markdown + `.canvas`) as a static website.

## Prerequisites

- Node >= 22 (`source ~/.nvm/nvm.sh && nvm use 26`)
- One-time bootstrap: `npm install && npm run setup` (clones the pinned Quartz build engine)

## Stamp stable ids (once per vault, then idempotent)

Every published doc page is served at a stable-id URL (`/notes/<docid>`,
`/notes/<docid>.canvas`) read from md frontmatter `id:` / canvas
`metadata.frontmatter.id` — renames never change published URLs. A publishable
doc without an id **fails the build early** with the file named. Stamp ids:

```bash
make vault-add-ids VAULT=<vault-dir>    # or: node scripts/add-doc-ids.mjs <vault-dir> [--dry-run]
```

Idempotent; existing valid ids are never touched; malformed ids error out
instead of being overwritten.

## Build

```bash
node cli/bin/publish.mjs build <vault-dir> --config site.json --out ./public
```

Flags: `--strict-links` (broken internal links fail the build), `--keep-staging` (debug).

Minimal `site.json`:

```jsonc
{
  "title": "My Site",
  "baseUrl": "notes.example.com",            // no protocol, no trailing slash
  "publishFilter": { "includeFolders": ["notes", "canvases", "attachments"] }
}
```

Optional: `locale`, `theme` (typography + named Quartz colors). Full schema + filter semantics: `engine/README.md`.

## What gets published

- Markdown: frontmatter `publish: true`, or under `includeFolders`. `publish: false` always wins. Default deny.
- Canvases: under `includeFolders` only (no frontmatter exists). Default deny.
- Assets (images, PDFs, ...): published unless under `excludeFolders`.
- Canvas cards referencing private/missing notes render as contentless "Private note" placeholders; a leak check **fails the build** if private content ever appears in output.

## Preview locally

```bash
node cli/bin/publish.mjs preview ./public   # http://127.0.0.1:8080/ (--port <n> to change)
```

Serves the built site with production URL routing (Quartz links pages without `.html`, so a plain static server 404s). Local-only (binds 127.0.0.1). For external hosting the same routing contract must be implemented server-side — see `docs/hosting.md` (contract) and `docs/publish-to-s3.md` (S3 + CloudFront setup guide incl. the Function).

## Deploy (S3 + CloudFront)

```bash
node cli/bin/publish.mjs deploy ./public --deploy-config deploy.json [--dry-run]
```

Requires AWS CLI v2 + credentials. `deploy.json`: `bucket`, `region` (required); `prefix`, `distributionId`, `profile`, `deleteStale` (optional). Cache headers are set per file class automatically — table in `cli/README.md`.

## Canvas features on the published site

Pan/zoom/minimap; markdown text cards with working `[[wikilinks]]`; embedded note cards (incl. `#heading` / `#^block` subpaths) with an open-note button (first click selects the card, then links/button are active); image/audio/video cards; canvas→canvas navigation cards; web link cards; groups, labeled edges, colors; light/dark follows the site theme toggle. Canvases appear in search, graph view, and backlinks.

## Zen mode (published-site reading view)

Every published page has a lotus icon in the mode-toggle cluster pinned to the top-right corner of the page (together with the theme and reader-mode toggles; the search bar keeps the full sidebar width). It toggles **zen mode**: the file explorer, graph, backlinks, TOC, search, and the other mode toggles disappear AND the note content reclaims their width (stock reader-mode only fades the sidebars out; the ~640px of grid columns stay). Only the lotus remains in the corner, to exit. The state persists across page navigation and reloads (localStorage, like the theme toggle).
