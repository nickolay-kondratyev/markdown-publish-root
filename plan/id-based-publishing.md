# Plan: ID-Based Publishing (stable `docid` URLs)

**Status:** DONE (2026-07-10) — implemented through Phase 5; see ADR `docs/decisions/0004-id-based-publishing-staging-rewrite.md`. Definition of done (§10) verified: unit + integration + e2e green, rename-stability test passing, browser-verified canvas nav on `/n/<docid>` URLs.
**Feasibility basis:** `plan/assesments/stable-id-publishing-feasibility.md` (read it first; this plan assumes its findings).
**Owner:** Nickolay

## 1. Goal

Every published doc page (note `.md`, canvas `.canvas`) is served at a URL derived from a globally unique stable identifier in its frontmatter, not from its vault path. Renaming or moving a doc in the vault never changes its published URL. All wiki links in published output point at the target's stable-id URL.

## 2. Locked decisions (aligned with Nickolay, 2026-07-10)

| Decision | Value |
|---|---|
| Id format | `docid_<21 chars base36 a-z0-9>_e` — validation regex `^docid_[0-9a-z]{21}_e$`. **Deviation approved 2026-07-10** (was base62 `_E`): Quartz slugifies URL segments to lowercase and stays unpatched, so a lowercase-only grammar keeps frontmatter id == URL segment byte-for-byte. Base36 × 21 ≈ 108 bits — ample. |
| Id location | md: frontmatter `id:`; canvas: top-level `metadata.frontmatter.id` |
| URL shape | `/n/<docid>` for notes; `/n/<docid>.canvas` for canvases (extension-preserving slugs keep Quartz + canvas-plugin untouched; see §6.1) |
| Missing id on a publishable doc | **Hard fail the build, early** (staging time), listing every offending file |
| Duplicate / malformed id | Hard fail the build |
| Id-addition script scope | ALL `.md` + `.canvas` files in the vault, regardless of publish status |
| Legacy path-URL redirects | **None** (nothing published publicly yet) |
| Rewrite locus | **Staging-time only** — the source vault keeps human-readable `[[some-note]]` links; the engine rewrites the staged copy each build |
| Excalidraw | Out of scope — no excalidraw publishing exists at all; follow-up ticket (§8) |

## 3. Architecture (unchanged invariants)

- **Quartz stays id-unaware and unpatched.** All id work happens in the engine's staging pass (`engine/src/vaultStager.ts`), the single path-shaping surface. Staged files are *named by id*, so `slugifyFilePath` naturally yields id slugs and every downstream consumer (crawl-links hrefs, emitters, contentIndex, graph, backlinks, search, canvas resolver, viewer) follows automatically.
- **Never reimplement slugging.** The staging rewriter resolves wikilink targets by calling Quartz's own `transformLink(..., {strategy: "shortest", allSlugs})` against the *original* path-based slug set (same pattern as `canvas-plugin/src/resolver.js:61-81`), then maps resolved path-slug → docid.
- Sacred boundary intact: no AWS/tenancy in the engine; CLI/deploy untouched.
- Hosting contract (`docs/hosting.md`) untouched: `/n/<docid>` hits the extensionless rule, `/n/<docid>.canvas` hits the `.canvas` rule.

## 4. Staging transformation spec

Input: filtered publishable file set (existing `PublishFilter`). Steps, in order:

1. **Harvest ids** — parse frontmatter `id` (md) / `metadata.frontmatter.id` (canvas JSON) for every publishable doc. Build `IdMap: vaultPath ↔ docid`.
2. **Validate, fail early** — missing id, duplicate id, or format-regex mismatch → build error BEFORE any Quartz invocation, with the full offending-file list. (Assets are exempt: they carry no ids; their staged paths stay vault-shaped.)
3. **Stage docs under id paths** — `notes/some-note.md` → `n/<docid>.md`; `canvases/main.canvas` → `n/<docid>.canvas`.
   - **Root `index.md` exception:** the vault's root `index.md` stages unchanged at `index.md` so the site keeps a homepage at `/`. It still requires an id (validation applies); links resolving to it emit `/`. Revisit if a configurable home doc is ever needed.
4. **Inject presentation frontmatter** — when `title` is absent, inject `title: <original basename>` (md) / pass original name into the canvas page title (today basename-derived at `canvas-plugin/index.js:117`). Without this, pages/graph/search would display raw docids.
5. **Rewrite markdown wikilinks** — `[[some-note]]` → `[[<docid>|some-note]]`, `[[some-note#h|alias]]` → `[[<docid>#h|alias]]`.
   - Preserve display text ALWAYS (bare links get the original target as alias).
   - Preserve `#heading` and `#^block` anchors verbatim.
   - Embeds/links whose resolved target is an **asset** (`![[diagram.png]]`) are left untouched — assets keep vault-path slugs.
   - Conservative rule: rewrite only links that resolve cleanly to an id-bearing staged doc; anything else is left as-is and surfaces via the existing broken-link report / `--strict-links`.
   - Skip fenced/inline code spans.
6. **Rewrite canvas JSON** — `file` node paths → id-staged paths (`n/<docid>.md` / `n/<docid>.canvas`); wikilinks inside text nodes rewritten per rule 5. Unresolvable `file` targets left untouched → existing privacy-placeholder behavior fails closed (`canvas-plugin/src/canvasRewriter.js:102-105`).
   - Prereq: `parseCanvas` must stop dropping top-level `metadata` (`canvas-plugin/src/canvasSchema.js:22-43`) — or the engine parses canvas JSON itself at staging (preferred: staging owns the transform; the plugin stays a pure renderer).
   - DRY: extract the wikilink grammar (`WIKILINK_REGEX`, `canvas-plugin/src/markdownRenderer.js:28`) into one shared module used by both the staging rewriter and the canvas markdown renderer.

## 5. Id-addition tooling

- **Script:** `scripts/add-doc-ids.mjs` (Node, matching the repo's JS/TS stack — not a temp script).
  - Stamps every `.md` and `.canvas` in the given vault that lacks a valid id; **idempotent** (valid existing id → skip; malformed existing id → error, never overwrite).
  - Id generation: crypto-random (`crypto.randomBytes` → base62), 21 chars, wrapped `docid_..._E`.
  - md: insert `id:` into existing frontmatter, or create a minimal frontmatter block; **byte-preserve everything else**.
  - canvas: set `metadata.frontmatter.id`, preserving Obsidian's JSON serialization style as closely as practical (verify in Spike S1).
  - `--dry-run` mode printing the would-change file list; summary counts on real runs.
- **Makefile targets:**
  - `vault-add-ids` — runs the script against `VAULT` (variable, default `test-vault`).
  - `test-vault-add-ids` — convenience alias pinned to `test-vault`.

## 6. Notable consequences (accepted)

1. **Canvas URLs carry `.canvas`** (`/n/<docid>.canvas`). Keeping extension-preserving slugs means zero changes to Quartz, the canvas plugin's slug computation, or the file-node existence checks. Uniform `/n/<docid>` for canvases is a possible follow-up (requires plugin slug + resolver changes) — not worth it now.
2. **Explorer/breadcrumbs flatten** — all pages live under one `n/` segment; hierarchy UIs degrade to a flat, title-labeled list. Accepted; a title/metadata-driven tree is a follow-up under the custom-theme work (`plan/main.md` §7.1).
3. **Asset URLs remain path-based** — renaming an image still changes its URL. Docs-only scheme by design.
4. **Every publishable doc needs an id before it can be published** (hard fail). The script + Makefile target make this a one-command fix.
5. **Ordering vs. a canvas-framework migration (renderer swap or engine swap): IDs do NOT wait for it.** All id logic lives at staging, operating on JSON Canvas spec data and file names — renderer- and framework-agnostic; the viewer only renders baked hrefs. IDs-first actively de-risks any later migration: the URL contract shrinks from "reproduce Quartz's path-slugification byte-exactly" to "serve `n/<docid>`", trivially portable to any generator. Only exception: if a canvas-renderer swap is imminent and decided, fold the two small plugin touchpoints (metadata preservation, shared wikilink-regex extraction) into that rewrite instead of doing them twice.

## 7. Phased execution

**Phase 0 — Spikes (timebox: short).**
- **S1 (critical): Obsidian canvas `metadata` persistence.** Add `metadata.frontmatter.id` to a canvas, edit it in Obsidian, confirm the key survives re-save and that Obsidian tolerates the script's serialization. If Obsidian strips it, escalate to Nickolay — id location for canvas must change (e.g. sidecar map), which alters §4.1 and §5.
- **S2: opaque-basename resolution.** Confirm `transformLink`/graph/search/contentIndex behave with id-named files + injected titles (expected fine; cheap to prove before building on it).

**Phase 1 — Id tooling.** `scripts/add-doc-ids.mjs` + Makefile targets (§5). Unit tests: idempotency, frontmatter creation/insertion, canvas JSON preservation, malformed-id error. Stamp `test-vault` with the script itself (dogfooding) and commit the fixture diff.

**Phase 2 — Engine harvest + validation.** Extend `engine/src/frontmatter.ts` to read `id`; canvas JSON id read at staging; `IdMap`; hard-fail validations (missing/duplicate/malformed) wired into `VaultStager` before Quartz runs. Failing tests first per working agreement.

**Phase 3 — Staging transformation.** Id-path staging + root-index exception + title injection (§4.3-4). Markdown wikilink rewriter (§4.5). Canvas JSON rewriter + shared wikilink module extraction (§4.6).

**Phase 4 — Integration verification.** On the stamped `test-vault`:
- Build succeeds; all doc pages emitted under `n/`; link checker clean.
- **Rename-stability test:** rename a fixture note (and update nothing else), rebuild → identical output paths and identical resolved hrefs.
- Canvas nav: text-card wikilink → note; note card open-affordance; canvas→canvas card — all land on `/n/...` URLs.
- Privacy: private note reference still renders placeholder; leak sentinel absent from output.
- Missing-id hard-fail test: fixture without id fails the build with the file named.
- Graph/backlinks/search show titles (not docids); `publish preview` serves `/n/<docid>` and `/n/<docid>.canvas` correctly.

**Phase 5 — Docs.** Update `engine/README.md`, `canvas-plugin/README.md`, `docs/current/dev.md` (resolver invariant now includes the id map), short ADR in `docs/decisions/` (id scheme + staging-rewrite choice), deviation note in `plan/main.md` (§4.2 resolver contract becomes `vaultPath → docid → URL`). Verify `docs/hosting.md` needs no change (expected: none).

Each phase ends with a short written status per the working agreements.

## 8. Out of scope / follow-up tickets

1. **Excalidraw publishing** (greenfield: extension claim, renderer, filter, viewer) — id publishing then falls out of the shared staging pass for free.
2. Uniform extensionless canvas URLs (`/n/<docid>` without `.canvas`).
3. Title/metadata-driven Explorer & breadcrumbs (flattening mitigation) — DONE via `plan/folder-nav-over-id-urls.md` (ADR 0005; status: `docs/status/folder-nav.md`).
4. Legacy path-URL redirects via alias synthesis — deliberately skipped now; the mechanism (`alias-redirects`, already enabled) remains available if a published site ever migrates.
5. Stable ids for attachments/assets.

## 9. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Obsidian strips/breaks canvas `metadata` on edit | **High** (invalidates canvas id location) | Spike S1 first; escalate before Phase 1 if it fails |
| Wikilink rewriter grammar diverges from Quartz OFM (embeds, block refs, code fences) | Medium | Conservative rewrite rule (§4.5); shared regex module; fixture tests covering every link form in `test-vault` |
| Canvas JSON re-serialization by the script upsets Obsidian | Medium | Spike S1 covers round-trip; preserve serialization style |
| Root-index special case leaks complexity | Low | Single, documented exception in `VaultStager` with a dedicated test |
| Quartz pin upgrade changes `transformLink` semantics | Low | Already pinned; resolver invariant means one re-verification point per upgrade |

## 10. Definition of done

`make test-vault-add-ids && make test-vault-build` succeeds end-to-end; every doc page URL matches `^/n/docid_[0-9a-z]{21}_e(\.canvas)?$` (except `/`); the rename-stability test passes; all Phase 4 checks green; removing one id makes the build fail early with the file named.
