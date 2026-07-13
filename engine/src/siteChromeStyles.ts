/**
 * Engine-owned site-wide chrome CSS, written into the vendored Quartz checkout
 * as `quartz/styles/custom.scss` (Quartz's designed global-CSS extension
 * point) — a per-build artifact like quartz.config.yaml, because the checkout
 * is gitignored. Emitted by SiteBuilder via QuartzRunner.writeCustomStyles.
 *
 * WHY here and not a plugin: the engine's LAYOUT config (QuartzConfigGenerator)
 * decides component placement; the CSS realizing that placement belongs beside
 * it, not inside one of the three plugins it happens to position.
 *
 * Cascade note: Quartz wraps theme+base+component CSS in `@layer quartz-base`
 * and appends custom.scss UNLAYERED (componentResources.ts) — these rules win
 * over any layered rule regardless of specificity.
 */
export class SiteChromeStyles {
  /** SCSS text ready to be written as `quartz/styles/custom.scss`. */
  static scss(): string {
    return SITE_CHROME_SCSS
  }
}

// ap.0zwhQQya81CGNQ9pmqKkM.E: the mode-toggle cluster (darkmode / reader-mode /
// zen-mode). It is the ONLY layout group in the left sidebar (search is a
// standalone entry — see the generator's toolbar comments), and Quartz's
// Flex.tsx adds no group-name class, so `.sidebar.left > .flex-component` is
// the one stable selector for it. zen-mode's CSS relies on the same fact.
const SITE_CHROME_SCSS = `@use "./variables.scss" as *;

/* Mode-toggle cluster (ap.0zwhQQya81CGNQ9pmqKkM.E, see siteChromeStyles.ts):
   pinned to the top-right viewport corner, out of the left sidebar's flow, so
   the search bar keeps the full sidebar width. Desktop's right sidebar starts
   at $topSpacing (6rem), so the corner is always free there. */
.sidebar.left > .flex-component {
  position: fixed;
  top: 2rem;
  right: 2rem;
  z-index: 2;
}

@media all and ($mobile) {
  /* Align with the mobile header row (base.scss: padding-top 2rem, 2rem-tall
     search button) and with #quartz-body's 1rem gutter. */
  .sidebar.left > .flex-component {
    right: 1rem;
  }
  /* The header row's spacer pushes search to the right edge — reserve the
     cluster's footprint (5 icons + gaps + gutter; the zen plugin's search
     magnifier is always visible) so they never overlap. */
  #quartz-body .sidebar.left {
    padding-right: 9.25rem;
  }
}

/* Hover tooltips for the cluster icons (ticket full-screen-mode.md): every
   button already carries an aria-label, so the tooltip is pure CSS off that
   one source of truth — the vendored darkmode/reader-mode plugins cannot be
   edited (gitignored pinned checkout), and this covers future icons too.
   Right-anchored: the cluster hugs the right viewport edge, so the tooltip
   grows leftward and never overflows. */
.sidebar.left > .flex-component button[aria-label] {
  position: relative;
}
.sidebar.left > .flex-component button[aria-label]:hover::after {
  content: attr(aria-label);
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 0.4rem;
  padding: 0.2rem 0.5rem;
  border: 1px solid var(--lightgray);
  border-radius: 5px;
  background-color: var(--light);
  color: var(--darkgray);
  font-size: 0.75rem;
  line-height: 1.4;
  white-space: nowrap;
  pointer-events: none;
  z-index: 3;
}

/* Reader-mode exit affordance (ticket 0005, mirrors zen): stock readermode.scss
   dims .sidebar.left to opacity 0 (hover-revealed), which would fade the reader
   icon itself — no visible cue of the mode or how to leave it. Keep the sidebar
   opaque and move the stock dim onto its NON-cluster children instead, so the
   book icon stays visible while search/explorer keep the hover-reveal.
   Zen precedence: every rule carries :not([zen-mode="on"]) — with both modes on
   only the lotus shows (zen-mode/src/zenMode.js owns that state).
   Cascade: these rules are UNLAYERED (see header) so they beat the plugin's
   @layer quartz-base dim without specificity games. */
:root[reader-mode="on"]:not([zen-mode="on"]) .sidebar.left {
  opacity: 1;
}
:root[reader-mode="on"]:not([zen-mode="on"]) .sidebar.left > *:not(.flex-component) {
  opacity: 0;
  transition: opacity 0.2s ease;
}
:root[reader-mode="on"]:not([zen-mode="on"]) .sidebar.left:hover > *:not(.flex-component) {
  opacity: 1;
}
/* Corner icons in reader mode: the book (exit), the fullscreen toggle
   (stacking upgrade, ticket full-screen-mode.md) AND the zen slot's search
   magnifier (always-visible search affordance) stay; the OTHER icon WRAPPERS
   (Flex.tsx inline-styled divs) hide entirely, not just their content —
   emptied wrappers would leave gap-width holes between the survivors. */
:root[reader-mode="on"]:not([zen-mode="on"]) .sidebar.left > .flex-component > div:not(:has(.readermode)):not(:has(.fullscreenmode)):not(:has(.zen-search)) {
  display: none;
}
/* The exempted zen wrapper is display:contents (zenMode.js), so its buttons
   are their own flex items: hide just the lotus — the book icon stays the
   lone mode-exit affordance (ticket 0005) — while the magnifier survives.
   No gap hole: a display:none flex item gives up its gap slot. */
:root[reader-mode="on"]:not([zen-mode="on"]) .sidebar.left > .flex-component button.zenmode {
  display: none;
}
/* The magnifier opens the real search overlay (.search-container.active), a
   DESCENDANT of the reader-dimmed .search root. Force the root opaque while
   the overlay is open — hover-reveal alone cannot be relied on (touch devices
   have no hover), and an opacity-0 ancestor hides the whole overlay. */
:root[reader-mode="on"]:not([zen-mode="on"]) .sidebar.left > .search:has(.search-container.active) {
  opacity: 1;
}

/* Reader-mode SELECTED-state cue: outline book while off, FILLED book while
   on — same fill-when-active language as the zen lotus and fullscreen arrows
   (their plugins are ours and swap real glyph pairs; see zenMode.js).
   The vendored reader-mode plugin cannot be edited (gitignored pinned
   checkout), so the swap happens HERE: hide its inline SVG and paint a
   CSS-masked glyph pair instead. Phosphor "book-open"/"book-open-fill"
   (MIT — https://github.com/phosphor-icons/core/blob/main/LICENSE), matching
   the rest of the cluster's Phosphor set.
   WHY-NOT ::after: the cluster's hover tooltip (above) already owns it. */
.readermode svg {
  display: none;
}
.readermode::before {
  content: "";
  position: absolute;
  width: 20px;
  height: 20px;
  top: calc(50% - 10px);
  left: 0;
  background-color: var(--darkgray);
  mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 256 256'%3E%3Cpath d='M232,48H160a40,40,0,0,0-32,16A40,40,0,0,0,96,48H24a8,8,0,0,0-8,8V200a8,8,0,0,0,8,8H96a24,24,0,0,1,24,24,8,8,0,0,0,16,0,24,24,0,0,1,24-24h72a8,8,0,0,0,8-8V56A8,8,0,0,0,232,48ZM96,192H32V64H96a24,24,0,0,1,24,24V200A39.81,39.81,0,0,0,96,192Zm128,0H160a39.81,39.81,0,0,0-24,8V88a24,24,0,0,1,24-24h64Z'/%3E%3C/svg%3E") no-repeat center / contain;
}
:root[reader-mode="on"]:not([zen-mode="on"]) .readermode::before {
  mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 256 256'%3E%3Cpath d='M240,56V200a8,8,0,0,1-8,8H160a24,24,0,0,0-24,23.94,7.9,7.9,0,0,1-5.12,7.55A8,8,0,0,1,120,232a24,24,0,0,0-24-24H24a8,8,0,0,1-8-8V56a8,8,0,0,1,8-8H88a32,32,0,0,1,32,32v87.73a8.17,8.17,0,0,0,7.47,8.25,8,8,0,0,0,8.53-8V80a32,32,0,0,1,32-32h64A8,8,0,0,1,240,56Z'/%3E%3C/svg%3E");
}
`
