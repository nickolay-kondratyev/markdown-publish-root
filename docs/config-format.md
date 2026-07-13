# `.external_publish_config.json` — publish config format

The one file you need to publish a vault. Drop it at the **vault root** and
`publish build <vault-dir>` picks it up with no flags:

```bash
node cli/bin/publish.mjs build /path/to/vault
```

## Discovery rules

1. `--config <file>` on the command line always wins.
2. Otherwise `<vault-dir>/.external_publish_config.json` is used.
3. Neither exists → the build fails with a message naming both options.

The leading `.` in the file name is deliberate: hidden paths are never
published (see filter rule 1 below), so the config can never leak into the
generated site.

## Schema

The file is the engine's site settings ([engine/README.md](../engine/README.md)
"site.json schema") **plus** the CLI-level `output_dir` key. Validation is
strict: unknown keys are rejected (typo protection) and all problems are
reported at once.

| Key | Required | Meaning |
|-----|----------|---------|
| `title` | yes | Site title shown in the header / browser tab. |
| `baseUrl` | yes | Host (+ optional path) **without** protocol or trailing slash, e.g. `notes.example.com` or `example.com/vault`. Used for sitemap/RSS/canonical URLs. |
| `locale` | no | BCP-47 tag, default `en-US`. |
| `theme` | no | Fonts + named color overrides; anything unset falls back to stock Quartz. See engine/README.md. |
| `publishFilter` | no | What gets published — see below. Default: **nothing** content-bearing (fail-closed). |
| `output_dir` | no | Where the static site is written. Relative paths resolve against the **config file's directory** (i.e. the vault root when the config lives in the vault); absolute paths are used as-is. `--out` on the command line overrides it. If neither is given, the build fails. **The directory is cleaned on every build** — don't point it at anything you want to keep. |

### `publishFilter`

| Key | Meaning |
|-----|---------|
| `publishAll` | `true` = publish the whole vault (markdown + canvases) without listing folders. Explicit opt-in — the exclusion rules below still always win. |
| `includeFolders` | Vault-relative folders whose markdown/canvases publish by default (e.g. `["notes", "blog/public"]`). The opt-in surface when you do NOT want the whole vault out. |
| `excludeFolders` | Nothing under these folders is EVER published — wins over everything, including `publish: true` frontmatter and `publishAll`. |

Exclusions that always win (full precedence table: engine/README.md
"Publish filter semantics"):

1. Hidden paths (any segment starting with `.`, e.g. `.obsidian/`).
2. Any path containing `private` (case-insensitive, file or folder name).
3. `excludeFolders`.
4. Markdown frontmatter `publish: false`.

## Examples

### Publish the whole vault

```json
{
  "title": "My Notes",
  "baseUrl": "notes.example.com",
  "publishFilter": { "publishAll": true },
  "output_dir": ".publish_out"
}
```

`output_dir` starts with `.` so the generated site inside the vault is itself
hidden from the NEXT build. If you prefer a non-hidden output, point it
outside the vault (e.g. `"../my-site-out"`) — a non-hidden output dir inside
the vault would be re-ingested as publishable assets on the next build.

### Publish selected folders only

```json
{
  "title": "My Site",
  "baseUrl": "notes.example.com",
  "publishFilter": { "includeFolders": ["notes", "canvases", "attachments"] },
  "output_dir": "../public"
}
```

### Whole vault except machinery folders, with theming

```json
{
  "title": "My Site",
  "baseUrl": "example.com/vault",
  "locale": "en-US",
  "theme": {
    "typography": { "header": "Schibsted Grotesk", "body": "Source Sans Pro" },
    "colors": {
      "lightMode": { "secondary": "#284b63" },
      "darkMode": { "secondary": "#7b97aa" }
    }
  },
  "publishFilter": {
    "publishAll": true,
    "excludeFolders": ["templates", "scratch"]
  },
  "output_dir": ".publish_out"
}
```

## Prerequisite: stable doc ids

Every publishable `.md`/`.canvas` must carry a stable docid (URLs are
`/n/<docid>` — they survive renames). Stamp them once (idempotent):

```bash
make vault-add-ids VAULT=/path/to/vault
```

A build against a vault with missing ids fails fast and lists every offending
file.

## Related

- Filter precedence + engine schema details: `engine/README.md`
- CLI flags (`--config`, `--out`, `--strict-links`): `cli/README.md`
- Why name-based `private` exclusion exists: `docs/publish-exclusion.md`
- Working example: `test-vault/.external_publish_config.json` (built with no
  flags by `cli/test/integration/buildDiscovery.test.ts`)
