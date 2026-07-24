# markdown-publish

Turn an Obsidian vault — markdown **and canvas** files — into a static
website you can host anywhere. Official Obsidian Publish does not support
`.canvas` files; this does: canvas pages render interactively (pan/zoom,
minimap, note/canvas/media cards) and participate in wikilinks, backlinks,
graph and search.

Every build ends with a validation pass: a private-content leak check that
FAILS the build, plus a broken-internal-link report (`--strict-links` to
escalate). `publish deploy` ships the output to S3 + CloudFront.

## Quick start: vault → HTML

One-time setup (steps 1–2), then step 3 is the whole publish loop.

**1. Get the repo + all dependencies** — one command, idempotent (installs
nvm, the pinned Node, npm deps, the vendored Quartz, and runs the tests;
`--no-verify` skips the test run):

```bash
git clone <this-repo-url> markdown-publish && cd markdown-publish
scripts/setup-dev-env.sh
```

**2. Prepare your vault** — drop a `.external_publish_config.json` at the
vault root (full format + examples: [docs/config-format.md](docs/config-format.md))
and stamp stable doc ids (page URLs are `/notes/<docid>`, so they survive
renames; idempotent, safe to re-run after adding notes):

```bash
cat > /path/to/vault/.external_publish_config.json <<'EOF'
{
  "title": "My Site",
  "baseUrl": "notes.example.com",
  "publishFilter": { "publishAll": true },
  "output_dir": ".publish_out"
}
EOF
make vault-add-ids VAULT=/path/to/vault
```

`publishAll: true` publishes the whole vault; hidden paths, paths containing
`private`, and `publish: false` frontmatter are always excluded. To publish
only selected folders, use `includeFolders` instead (docs/config-format.md).

**3. Generate the HTML:**

```bash
node cli/bin/publish.mjs build /path/to/vault
```

No `--config`/`--out` needed — the in-vault config supplies both (flags still
override). The static site lands in the config's `output_dir` (here
`/path/to/vault/.publish_out`): plain HTML/CSS/JS, ready for any static host.

**4. View / ship it:**

```bash
# Local preview (production URL routing, e.g. extensionless /notes/<docid> pages):
node cli/bin/publish.mjs preview /path/to/vault/.publish_out

# Deploy to S3 + CloudFront (needs AWS CLI v2 + credentials; --dry-run previews):
node cli/bin/publish.mjs deploy /path/to/vault/.publish_out --deploy-config deploy.json --dry-run
```

Real hosting must map extensionless page URLs to their `.html` files — the
contract lives in `docs/hosting.md`; a step-by-step S3 + CloudFront guide
(with the paste-ready CloudFront Function) in `docs/publish-to-s3.md`.

## License

This project is source-available under the Kondratyev Source Available
License 2.2 (KSAL-2.2). In short:

- **You can** use, modify, fork, and redistribute the code for free for
  personal, educational, research, and other noncommercial purposes.
- **Individual creators** — including freelancers, sole proprietors, and
  single-person LLCs — may commercialize anything they *create with* the
  software (sites, content, client deliverables), but not the software
  itself.
- **You cannot** otherwise use it for commercial purposes — including
  company/business use, selling products built on it, or offering it as
  a hosted service — without a paid license.
- A one-time 30-day commercial evaluation is permitted to decide whether
  to purchase.
- Paid functionality behind a license key is not covered by this grant
  and requires a subscription.
- Do not bypass or tamper with license key / subscription checks.
- Contributions you submit are licensed to the author for any use.

This summary is informational only and is not the license. The full text
in [LICENSE.md](LICENSE.md) is the sole and final authority on your
rights and obligations.
