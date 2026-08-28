---
closed_iso: 2026-08-28T22:14:48Z
session_ids: [{"a": "claude", "type": "execution", "id": "ac2ccab6-ca77-45a4-924b-803aa7e379bf"}, {"a": "claude", "type": "review", "id": "8a12c4d8-abd9-42c2-98ca-bb2f1695192b"}]
working_dir: nickolay-kondratyev_markdown-publish-root
id: nid_lgerk1snh3a2i8p8p8sangu84_e
title: "BUG - issue with publishing note that is within a folder"
status: closed
deps: []
links: []
created_iso: 2026-08-28T22:02:58Z
status_updated_iso: 2026-08-28T22:14:48Z
type: task
priority: 3
assignee: nickolaykondratyev
tags: []
---

Issue publishing notes that have the folder with exact same name.

For example when there is a note that is referencing:
```
by [[Alan-Watts]] on praise & blame. To highlight:
```

Clicking on `[[Alan-Watts]]` did not lead to the note `/p/Alan-Watts/Alan-Watts.md` with id `e33wd60mupdafm8n2p9v4as` instead it led to this URL https://glassthought.com/alan-watts and resulted in 404.

I am suspecting this is due to `/p/Alan-Watts/Alan-Watts` the folder and the note having the same name. 

Reproduce in test data, ROOT CAUSE And fix.

---

## Resolution (2026-08-28)

**Status: FIXED.** The suspicion was correct — it is the folder-note (file basename == parent folder name) case.

### Root cause

Quartz's `slugifyFilePath` (`@quartz-community/utils/path`) collapses a "folder
note" — a file whose basename equals its containing folder, e.g.
`p/Alan-Watts/Alan-Watts.md` — into the folder's index slug: `p/alan-watts/index`.
So the file's slug's **last path segment becomes `index`**, not `alan-watts`.

Our shared resolver (`StagingLinkIndex` → `VaultLinkResolver`) resolves wikilinks
via Quartz's own `transformLink` with the `shortest` strategy, which matches a
bare `[[Alan-Watts]]` **by last path segment**. Since the folder note's last
segment is `index`, nothing matched: resolution fell back to the site-absolute
slug `alan-watts`, which doesn't exist → the link was left unrewritten and 404'd.
(Obsidian, by contrast, resolves `[[Alan-Watts]]` by basename, so it worked in
the vault but not on the published site.)

### Fix

`engine/src/stagingLinkIndex.ts`: when a staged doc is a folder note, also
register its **folder-form slug** (`p/alan-watts`, derived by trimming the
collapsed `/index[.canvas]` segment off the Quartz slug) as an alias in both the
resolver's slug set and the original-slug→id-target map. `[[Alan-Watts]]` then
resolves by last segment to `p/alan-watts` and maps to the note's stable id.
The alias is skipped if a real note already owns that slug (no shadowing).
No slugging is reimplemented — the helper only trims the Quartz-produced slug.

### Tests

- `engine/test/unit/stagingLinkIndex.test.ts` — new unit test using the exact
  ticket path/id (`p/Alan-Watts/Alan-Watts.md`, id `e33wd60mupdafm8n2p9v4as`);
  covers bare link, anchored link, plain-note regression, and non-resolution.
- `engine/test/integration/folderNoteWikilink.test.ts` — end-to-end build of a
  throwaway vault; asserts `[[Alan-Watts]]` in a note resolves to
  `/notes/e33wd60mupdafm8n2p9v4as` and preserves display text. Verified to FAIL
  without the fix and PASS with it.

Full suite green: `npm run test:unit` (596) + engine integration (83) + typecheck.