# ADR 0004: Stable-id publishing via staging-time rewrite

**Status:** Accepted (2026-07-10). **Owner:** Nickolay.
**Context docs:** `plan/id-based-publishing.md` (locked decisions), `plan/assesments/stable-id-publishing-feasibility.md`.

## Decision

Every published doc page (note `.md`, canvas `.canvas`) is served at a URL
derived from a globally unique stable id in the doc itself, not from its vault
path — renames/moves never change published URLs.

1. **Id grammar:** `docid_<21 chars base36 a-z0-9>_e` (`engine/src/docId.ts`, the ONE definition).
   - *Deviation from the original plan (base62 `_E`), approved 2026-07-10:*
     Quartz slugifies every URL segment to lowercase and stays unpatched, so a
     lowercase-only grammar keeps frontmatter id == URL segment byte-for-byte.
     21 chars base36 ≈ 108 bits — ample for global uniqueness.
2. **Id location:** md frontmatter `id:`; canvas top-level
   `metadata.frontmatter.id` (Obsidian preserves top-level canvas `metadata`
   across re-saves — verified by Nickolay, Spike S1).
3. **URL shape:** `/n/<docid>` for notes, `/n/<docid>.canvas` for canvases.
   Extension-preserving slugs keep Quartz, the canvas plugin's slug logic, and
   the hosting contract (`docs/hosting.md`) untouched. Root `index.md` stays at
   `/`. Assets stay path-addressed (no id carrier).
4. **Rewrite locus: staging-time ONLY.** The vault keeps human-readable
   `[[wiki-links]]`; `VaultStager` stages docs *named by id* (`n/<docid>.*`),
   injects `title` from the original basename when absent, rewrites markdown
   wikilinks and canvas file-node paths / text-card wikilinks to docid targets.
   Quartz remains completely id-unaware: `slugifyFilePath` on the staged names
   yields id slugs, and every downstream consumer (hrefs, emitters,
   contentIndex, graph, backlinks, search, canvas resolver, viewer) follows
   automatically.
5. **Validation: hard fail, early.** Missing, malformed, or duplicate ids
   throw `DocIdValidationError` (full offending-file list) BEFORE Quartz runs
   and before any staging write. Fix with `make vault-add-ids VAULT=<vault>`
   (`scripts/add-doc-ids.mjs` — idempotent, never overwrites an existing id).
6. **Resolution stays on the shared resolver.** The staging rewriter resolves
   targets with Quartz's own `transformLink` (via the canvas plugin's
   `VaultLinkResolver`) against the ORIGINAL path slugs, then maps
   path-slug → docid (`engine/src/stagingLinkIndex.ts`). Slugging is never
   reimplemented. The plan §4.2 resolver contract is now
   `vaultPath → docid → URL`.

## Rejected alternative

Frontmatter `slug`/`permalink` override inside Quartz: basename-vs-slug
wikilink resolution still requires a pre-rewrite, it depends on unverified
vendored-Quartz behavior, and canvas has no Quartz frontmatter pathway at all.
Staging-rename handles md + canvas + future doc types uniformly.

## Accepted consequences (plan §6)

- Canvas URLs carry `.canvas`; uniform extensionless canvas URLs are a follow-up.
- Explorer/breadcrumbs flatten under the single `n/` segment (title-driven
  tree is a follow-up under custom-theme work). Quartz's FolderPage emits a
  listing at `/n/` — published titles only.
- Conservative link rewriting: only links resolving cleanly to an id-bearing
  staged doc are rewritten; everything else is left as-is and surfaces via the
  broken-link report / `--strict-links`.
- Legacy path-URL redirects deliberately skipped (nothing published yet); the
  already-enabled `alias-redirects` mechanism remains available if ever needed.
