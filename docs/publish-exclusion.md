# Publish exclusion rules

What never gets published, and why. Decision logic lives in
`engine/src/publishFilter.ts`; full precedence table in `engine/README.md`
("Publish filter semantics").

> **Truly private data: keep it in a separate vault.** The rules below are
> defense in depth, not a vault boundary. Never point publishing at a vault
> (or folder tree) containing data that must never leak — keep that data in a
> completely separate vault/folder the publish pipeline never reads. A filter
> bug, a rename (`private/` → `personal/`), or a misconfiguration cannot leak
> what the pipeline cannot see.

## Always excluded (wins over everything, including `publish: true`)

Checked against the vault-relative **file path only** — never against note
titles or note content.

1. **Hidden segments** — any folder or file starting with `.`
   (e.g. `.obsidian/`, `.trash/`).
2. **`private` segments** — any folder or file whose **name contains
   `private`** (case-insensitive), anywhere in the path.
   - Folder up the tree named/containing `private` → nothing under it publishes.
   - File name containing `private` → not published, even if no ancestor
     folder is private.
3. **`excludeFolders`** — folders listed in `site.json` `publishFilter.excludeFolders`.

### `private` rule examples

| Path | Published? |
|------|------------|
| `private/anything.md` | no (private folder) |
| `work/my-private-notes/a.md` | no (folder name contains `private`) |
| `notes/private-secret.md` | no (file name contains `private`) |
| `notes/Private/a.png` | no (case-insensitive; applies to assets too) |
| `notes/privacy-policy.md` | yes (`privacy` does not contain `private`) |

## Excluded by default (opt-in required)

Content-bearing files are **default deny**:

- **Markdown**: published only with frontmatter `publish: true`, or when under
  an `includeFolders` entry (frontmatter `publish: false` still wins).
  Malformed frontmatter fails closed (not published).
- **Canvas**: published only under an `includeFolders` entry (no frontmatter).

Non-markdown, non-canvas **assets** (images, PDFs, ...) are default **allow**,
subject to the always-excluded rules above.
