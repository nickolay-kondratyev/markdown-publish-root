# Assessment: Publishing under stable identifiers (frontmatter `id`)

**Question:** Can publishing be extended so every published doc page (note, canvas, excalidraw) is published under a globally unique stable `id` from its frontmatter (canvas: `metadata.frontmatter.id`), with all wiki links (`[[some-note]]`) rewritten to the target's stable-id URL?

**Verdict: FEASIBLE — Medium effort, no architectural blockers.** The codebase's own design invariants make this unusually clean: slugs are produced at a single choke point, and the engine already owns a staging pass where content can be rewritten before Quartz ever sees it. The one genuinely new piece is a staging-time wikilink rewriter. Excalidraw is a separate matter: it has **zero** publishing support today, so "id-based excalidraw pages" is gated on building excalidraw publishing at all.

---

## 1. Why this is feasible: the current architecture in one paragraph

Every page URL is a **slug derived purely from the vault path** via Quartz's `slugifyFilePath` (no frontmatter override is wired anywhere — the engine reads only the `publish` key, `engine/src/frontmatter.ts:20-42`). All downstream consumers — wikilink hrefs (`crawl-links` with `markdownLinkResolution: "shortest"`, `engine/src/quartzConfigGenerator.ts:181-186`), emitter output paths (`<slug>.html`), contentIndex/sitemap/RSS, graph, backlinks, search, and the canvas plugin's shared resolver (`canvas-plugin/src/resolver.js`) — key off that same slug string. **Therefore: change what the slug is, and everything downstream follows automatically.** There is no per-consumer surgery needed.

Additionally, the engine already stages a filtered copy of the vault into a temp dir before invoking Quartz (`engine/src/vaultStager.ts:94-97`, currently a byte-for-byte copy). Staging is the engine's single path-shaping surface — the natural place to perform the id transformation **without patching the vendored, pinned Quartz** (`vendor/quartz-pin.json`, Quartz 5.0.0 @ `9cf87ff`), which the repo's working agreements strongly prefer to keep unmodified.

## 2. Recommended design: staging-time id rewrite ("ids look like filenames to Quartz")

Do all id work in the engine's staging pass. Quartz remains completely id-unaware.

### 2.1 Mechanics

1. **Id harvest + map build.** During staging, read the stable id of every publishable doc:
   - Markdown: frontmatter `id` (extend `engine/src/frontmatter.ts`, which today reads only `publish`).
   - Canvas: `metadata.frontmatter.id` from the canvas JSON. Note `parseCanvas` currently **discards** the top-level `metadata` key entirely (`canvas-plugin/src/canvasSchema.js:22-43`) — a one-line fix to preserve it; the engine would parse the JSON itself at staging anyway.
   - Build a vault-wide map: `vaultPath → id` (and the inverse). This is the id-era version of the plan's sacred `vaultPath → published URL` resolver (`plan/main.md` §4.2).
2. **Stage under id-derived paths.** Copy `notes/some-note.md` to `n/<id>.md` (namespace choice discussed in §5). `slugifyFilePath` then naturally yields `n/<id>` — page URL, output file `n/<id>.html`, contentIndex key, graph node, backlink identity all become id-based with zero Quartz changes.
3. **Rewrite wikilinks in staged markdown.** `[[some-note]]` → `[[<id>|some-note]]`, `[[some-note#heading|alias]]` → `[[<id>#heading|alias]]`:
   - Resolve each wikilink target using **Quartz's own** `transformLink(..., { strategy: "shortest", allSlugs })` against the *original* path-based slug set, exactly as `canvas-plugin/src/resolver.js:61-81` already does — honoring the "never reimplement slugging" invariant (`docs/current/dev.md:31`).
   - Map the resolved path-slug → id via the harvest map; emit the id as the new link target.
   - **Must preserve display text**: a bare `[[some-note]]` renders its target name; the rewrite must add `|some-note` as alias or readers see raw ids.
   - Unresolvable targets (private/unpublished/missing) are left untouched → they fail to resolve downstream exactly as today (fails closed; privacy placeholder behavior in canvas is preserved, `canvas-plugin/src/canvasRewriter.js:102-105`).
4. **Rewrite canvas JSON at staging.** Same pass: `file` node paths (`node.file`) → id-derived staged paths; wikilinks inside text nodes → id form (reuse the existing `WIKILINK_REGEX` from `canvas-plugin/src/markdownRenderer.js:28` — extract it to shared code, DRY). The canvas plugin, its resolver, and the viewer then need **no changes**: the viewer is already id-agnostic — it renders whatever hrefs/`data-slug`s the build baked in (`canvas-plugin/viewer/canvasView.js`).
5. **Inject presentation metadata.** Files renamed to `<id>.md` lose their basename-derived titles. At staging, inject `title: <original basename>` into frontmatter when absent, and pass the original name through for canvas page titles (today just the basename, `canvas-plugin/index.js:117`).
6. **Old-URL redirects for free.** The `alias-redirects` emitter is already enabled (`engine/src/quartzConfigGenerator.ts:192`) but only consumes author-written `aliases`. Synthesize `aliases: [<old path slug>]` into staged frontmatter → Quartz emits redirect stubs at every legacy path URL. Already-published links keep working across the migration **and** across future renames.
7. **Validation.** Extend the existing validation pass (`engine/src/siteBuilder.ts:101-111`):
   - **Duplicate id → fail the build** (ids are the URL space; collision is corruption).
   - Missing id → policy decision (§5).
   - The existing link checker keys off emitted slugs (`engine/src/validation/linkChecker.ts:136-143`) and continues to work unchanged.

### 2.2 Why this beats the alternative (frontmatter-`slug` override inside Quartz)

Stock Quartz 5's OFM transformer reportedly supports `permalink`/`slug` frontmatter, so one could set `slug: n/<id>` and skip renaming. Rejected as primary approach because:

- `[[some-note]]` resolution matches **basenames against `allSlugs`**; once slugs are ids, name-based wikilinks stop resolving — you'd still need a name→id pre-rewrite, so you save nothing on the hard part.
- It depends on unverified behavior deep in the vendored Quartz (`vendor/quartz/.quartz/plugins/obsidian-flavored-markdown/`, not in-tree) — timing of slug override vs. `ctx.allSlugs` construction (`build.ts:91`) is a classic footgun.
- Canvas has no Quartz frontmatter pathway at all; you'd need a second mechanism anyway. The staging approach handles md + canvas + (future) excalidraw uniformly.

## 3. Per-doc-type feasibility

| Doc type | Today | Id-publishing feasibility |
|---|---|---|
| **Note (.md)** | Path slug; frontmatter reader knows only `publish` | ✅ Straightforward — id harvest + rename + wikilink rewrite at staging |
| **Canvas (.canvas)** | Path slug (`canvas-plugin/index.js:108`); `metadata` dropped at parse (`canvasSchema.js:42`); no frontmatter, so folder-only publish opt-in (`engine/src/publishFilter.ts:47-50`) | ✅ Feasible — preserve `metadata`, rewrite `file` nodes + text-node wikilinks at staging. Bonus: `metadata.frontmatter` gives canvas a `publish` opt-in surface for the first time |
| **Excalidraw (.excalidraw)** | **No support whatsoever** — one grep hit repo-wide (the task statement itself); would be copied as an opaque asset (`publishFilter.ts:53-55`) | ⚠️ Gated — id-based publishing is trivial *once* excalidraw pages exist (same staging pattern), but excalidraw publishing itself is greenfield: extension claim, renderer/viewer, filter branch. Separate effort; recommend a follow-up ticket |
| **Attachments (png/pdf/…)** | Path slug, no frontmatter possible | ❌ Out of scope by construction — no id carrier. Asset URLs stay path-based (rename of an image still changes its URL). Acceptable: the goal targets doc pages |

## 4. What survives unchanged (the payoff of the single-slug-source design)

- **Hosting contract** (`docs/hosting.md`): `/n/<id>` is an extensionless path → rule 3 (`serve <path>.html`) already covers it. No CloudFront Function, preview server, or nginx changes.
- **Backlinks, graph, search, sitemap, RSS**: all follow the slug automatically via contentIndex.
- **Canvas viewer + SPA navigation**: id-agnostic, renders baked hrefs.
- **Deploy layer**: unchanged; in fact cache behavior improves — URLs now survive renames, so "re-published in place under stable URLs" (`cli/README.md:82`) becomes true by construction rather than by author discipline.
- **Future commenting** (`plan/main.md` §7.2): page-level stable ids compose with canvas node ids — a strategic win beyond link stability.

## 5. Open decisions (need human alignment)

1. **URL shape** — recommend a namespace: `/n/<id>` rather than bare `/<id>`. Avoids collisions with `static/`, `tags/`, `index`, and reserves the root for future needs. (A hybrid `/n/<id>/<pretty-title>` variant adds readability but re-introduces instability unless `/n/<id>` alone also resolves — deferrable.)
2. **Missing-id policy** — recommend **fallback to today's path slug + build warning** for incremental adoption (vault docs gain ids over time), with a `--strict-ids` flag to fail. Hard-fail-always is simpler but blocks publishing until the entire vault is annotated.
3. **Readable URLs are lost** — `/n/x7Kp2f9q` instead of `/notes/architecture`. This is inherent to the goal; confirm it's accepted. Titles/breadcrumbs/explorer are mitigated via injected `title` (§2.1.5), but **Explorer and breadcrumbs flatten** (they derive hierarchy from slug path segments) — likely need to switch them to a title/metadata-driven tree or accept flat navigation.
4. **Excalidraw sequencing** — build excalidraw publishing first (separate plan), then it inherits id publishing from the shared staging pass.
5. **Who assigns ids** — out of scope here (assumed pre-existing per the goal), but duplicate-id detection must be a build-failing validation either way.

## 6. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Staging-time wikilink rewriter mis-parses edge cases (code blocks, embeds `![[...]]`, block refs `#^id`) | Medium | Reuse Quartz's `transformLink` for resolution; rewrite only the target token, never display text; comprehensive fixture tests in `test-vault` (which already exercises embeds, block anchors, `#heading` subpaths, canvas cross-links) |
| Divergence between staging rewriter's wikilink grammar and Quartz OFM's grammar | Medium | Keep the rewrite *conservative*: only rewrite links that resolve cleanly; anything ambiguous is left as-is and surfaces in the existing broken-link report |
| Explorer/breadcrumb UX degradation from flat id slugs | Low-Med | Known consequence, not a blocker (§5.3); address in the custom-theme follow-up (`plan/main.md` §7.1) |
| Graph/search displaying ids instead of titles | Low | Verify contentIndex entries carry injected `title`; spike before implementation |
| Vendored Quartz upgrade changes `transformLink`/`slugifyFilePath` semantics | Low | Already pinned (`vendor/quartz-pin.json`); the shared-resolver invariant means one place to re-verify per upgrade |

## 7. Effort estimate (Pareto cut)

Medium overall — roughly one focused implementation phase:

| Work item | Size |
|---|---|
| Frontmatter reader: `id` (+ optional injected `title`/`aliases`) | S |
| Canvas `metadata` preservation + staging-time canvas JSON parse | S |
| Id map + duplicate/missing validation | S |
| **Staging wikilink rewriter (md + canvas text nodes)** — the core new component | **M** |
| Staged-path renaming in `VaultStager` + title injection | S |
| Legacy-path alias synthesis (redirect stubs) | S |
| Test-vault fixtures with ids + integration tests (build → link-check → old-URL redirect) | M |
| Excalidraw id publishing | Not in this effort — gated on excalidraw publishing existing at all |

**Pre-implementation spike (short):** confirm (a) `alias-redirects` accepts staged-injected `aliases` and emits stubs at legacy path slugs; (b) graph/search/contentIndex show injected titles for id-named files; (c) `transformLink` behaves identically when basenames are opaque ids.

---

*Sources: `engine/src/{siteBuilder,vaultStager,publishFilter,frontmatter,quartzConfigGenerator}.ts`, `engine/src/validation/linkChecker.ts`, `canvas-plugin/{index.js,src/canvasSchema.js,src/canvasRewriter.js,src/resolver.js,src/markdownRenderer.js,viewer/canvasView.js}`, `docs/hosting.md`, `docs/spikes/spike-A-quartz-plugin-api.md`, `plan/main.md`, `cli/README.md`. Repo-wide searches confirmed: no existing frontmatter `id`/`permalink`/`slug` consumption, no excalidraw handling.*
