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
     cluster's footprint (4 icons + gaps + gutter) so they never overlap. */
  #quartz-body .sidebar.left {
    padding-right: 7.5rem;
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
/* Book icon + fullscreen icon in the corner: hide the OTHER icon WRAPPERS
   (Flex.tsx inline-styled divs), not just their content — zen's
   hide-the-content trick would leave gap-width holes between the survivors.
   The fullscreen toggle stays visible so the reading experience can be
   upgraded to fullscreen from inside reader mode (ticket full-screen-mode.md);
   with the other siblings gone, the shrink-to-fit fixed cluster leaves book +
   fullscreen flush in the rightmost slots. */
:root[reader-mode="on"]:not([zen-mode="on"]) .sidebar.left > .flex-component > div:not(:has(.readermode)):not(:has(.fullscreenmode)) {
  display: none;
}
`
