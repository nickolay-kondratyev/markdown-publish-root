# EXPLORATION: Publishing notes under `/notes/`

## Task
Publish note ids under `/notes/`. A note with id `nmfpvvpg1eq081o06s1g18x` on `https://www.glassthought.com`
should be published at `https://www.glassthought.com/notes/nmfpvvpg1eq081o06s1g18x`.
Currently notes are published under `/n/<id>`.

## Note ID origin
- Note id lives in **frontmatter** `id:` key (e.g. `test-vault/notes/architecture.md:2` `id: docid_4we0he3ljgl9ste90pl2m_e`).
- Two grammars:
  - **Generated** — `DocId` grammar (`engine/src/docId.ts:20-45`): `^docid_[0-9a-z]{21}_e$`. Lowercase base36 so `frontmatter id == URL segment` byte-for-byte.
  - **Foreign ids** — any non-empty string from other tooling. The human's example `nmfpvvpg1eq081o06s1g18x` is a **foreign id** matching `UrlSegment.SAFE_SEGMENT_REGEX = /^[a-z0-9_-]+$/` (`engine/src/urlSegment.ts:23`), returned verbatim (`urlSegment.ts:36`). Currently published at `/n/nmfpvvpg1eq081o06s1g18x`.
- Ids validated by `IdMap.build` (`engine/src/idMap.ts:56-86`); missing/invalid hard-fail the build. Stamped by `scripts/add-doc-ids.mjs` (`make vault-add-ids`).

## Slug/path pipeline (THE finalization point)
Published path = `/{ID_NAMESPACE_DIR}/{urlSegment}`, `ID_NAMESPACE_DIR` currently `"n"`.
1. `VaultStager.stage` builds id map: `IdMap.build(harvested)` (`engine/src/vaultStager.ts:100`).
2. `IdMap.build` calls `UrlSegment.deriveFrom(doc.idValue)` per doc (`engine/src/idMap.ts:69`).
3. **`IdMap.stagedPathOf`** (`engine/src/idMap.ts:97-105`) returns `` `${ID_NAMESPACE_DIR}/${urlSegment}${extension}` `` — the single source of truth. `export const ID_NAMESPACE_DIR = "n"` at `engine/src/idMap.ts:27`.
4. `vaultStager.ts:110,129` writes staged file to `<staging>/n/<segment>.md`.
5. Quartz `slugifyFilePath` turns `n/<segment>.md` into URL `/n/<segment>`. Engine NEVER re-implements slugging — relies on staging tree location.

**=> The entire published-path namespace prefix is the single constant `ID_NAMESPACE_DIR`.**

## Exact change point
- **Primary:** `engine/src/idMap.ts:27` — change `"n"` to `"notes"`.
- Downstream auto-consistent (all derive from `stagedPathOf`):
  - `engine/src/vaultStager.ts:110,129` (writes file to new dir)
  - `engine/src/canvasStagingTransform.ts:41-42` (`node.file = idMap.stagedPathOf(node.file)`)
  - `engine/src/stagingLinkIndex.ts:29-37` (link index from `idMap.stagedPathOf`/`entries()`)

## Link / graph / search consistency
Everything reads from the same `IdMap`/`stagedPathOf` source:
- Wikilinks/backlinks — `WikilinkRewriter` rewrites to the **bare** urlSegment basename (`stagingLinkIndex.ts:35-37`); Quartz resolves basename against relocated file. No link-text change needed.
- Canvas embeds — `canvasStagingTransform.ts:41-42` via `stagedPathOf`; resolver slugs same staged path.
- Search — Quartz `ContentIndex` indexes emitted slugs; no hardcoded `n/`.
- Graph/backlinks — Quartz-native from emitted slugs; follow automatically.
- No component hardcodes `n/` separately from `ID_NAMESPACE_DIR` (only doc comments + tests/e2e scripts).

## Guard unchanged
`UrlSegment.spoofsMarkerOrIndex` (`urlSegment.ts:44-51`) blocks ids equal to `index`/`_index` (would hijack Quartz folder-index routing). Same reasoning applies to `notes/index.md`; existing guard still protects it — no change needed.

## Tests hardcoding `n/` (need updating -> `notes/`, ideally import `ID_NAMESPACE_DIR`)
- Unit: `engine/test/unit/idMap.test.ts:20,24,28,32,37,69`; `engine/test/unit/vaultStager.test.ts:69,73,77,86,91,102,112,116`; `engine/test/unit/stagingTransforms.test.ts:96`; `engine/test/unit/urlSegment.test.ts:59` (comment); `canvas-plugin/test/unit/canvasVirtualPage.test.ts:8` (`CANVAS_FILE = "n/docid_…"`).
- Integration: `engine/test/integration/buildSite.test.ts:23-27`; `buildSiteCanvas.test.ts:21-25`; `folderNav.test.ts:23-24,93` (+ `/n/` comment :12); `foreignIds.test.ts:18-19,24,63` (`:63` slices `"n/".length`); `renameStability.test.ts:78`.
- E2E scripts: `scripts/e2e-canvas-flow.mjs:26-30`; `scripts/e2e-foldernav.mjs:6,39-41,82` (`a[data-slug="n/…"]`); `scripts/e2e-mode-switcher.mjs:141,294`; `scripts/e2e-screen-mode.mjs:76`.

Note: no single shared `n/` test constant — prefix duplicated across files. Prefer importing/reusing `ID_NAMESPACE_DIR` to avoid re-duplicating `notes/`.

## Stale doc comments (non-functional) referencing `/n/`
`docId.ts:7`, `idMap.ts:26`, `urlSegment.ts:2,34`, `quartzConfigGenerator.ts` comments, `folderNav.test.ts:12`.

## Config
No existing knob for the namespace prefix — it's the hardcoded constant. `SiteConfig` has `baseUrl` (deployment origin, not path prefix). Homepage `index.md`/`index.canvas` stay at root (`ROOT_INDEX_PATHS`, `idMap.ts:29-37`) — unaffected.

## Open questions / risks
1. Test churn broad but mechanical (~10 test files + 4 e2e scripts).
2. Stale `/n/` doc comments should be updated for accuracy.
3. **Config knob vs constant?** Human asked only for `/notes/`. Pareto call: **constant flip** (no knob) unless human wants both `/n/` and `/notes/` selectable. Flag as callout.
4. Foreign 23-char ids pass through verbatim; just move `/n/<id>` -> `/notes/<id>`.
