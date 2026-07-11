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
     cluster's footprint (3 icons + gaps + gutter) so they never overlap. */
  #quartz-body .sidebar.left {
    padding-right: 6rem;
  }
}
`
