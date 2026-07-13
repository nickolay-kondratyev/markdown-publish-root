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

// ap.0zwhQQya81CGNQ9pmqKkM.E: the mode-toggle cluster (darkmode + the
// mode-switcher plugin's magnifier and two mode groups). It is the ONLY layout
// group in the left sidebar (search is a standalone entry — see the
// generator's toolbar comments), and Quartz's Flex.tsx adds no group-name
// class, so `.sidebar.left > .flex-component` is the one stable selector for
// it. mode-switcher's CSS relies on the same fact.
const SITE_CHROME_SCSS = `@use "./variables.scss" as *;

/* Markdown reading measure (~65-70ch): ch is measured against the body font,
   so the cap tracks typography changes instead of hardcoding pixels. */
$readingMeasure: 70ch;

/* Viewport-anchored layout: the rails, not the page, define the frame.
   Quartz centers .page under a ~1500px cap — right for markdown, wasted width
   for canvas. Dropping the cap anchors the fixed $sidePanelWidth sidebar
   columns to the viewport edges on EVERY page, so they never move between
   markdown and canvas; the center track absorbs the rest (the grid's auto
   track stretches to fill free space, so no grid-template override needed).
   The reading-width constraint moves onto the center column below. */
.page {
  max-width: none;
}

/* Center track: markdown keeps the reading measure, centered in the track
   (side gutters expected); canvas pages use the full track. Scoped to the
   default frame — full-width/minimal frames size their own center, and these
   UNLAYERED rules would otherwise beat them. Canvas detection via
   :has(.canvas-page) mirrors the canvas plugin's own zen rules; only a real
   canvas page body renders that class (popover/search clones carry
   .canvas-text-preview instead — see canvas-plugin pageBody.js). */
.page[data-frame="default"] > #quartz-body > .center {
  max-width: $readingMeasure;
  min-width: 0; /* release base.scss's min-width: 100% so the measure binds */
  margin-left: auto;
  margin-right: auto;
}
.page[data-frame="default"] > #quartz-body > .center:has(.canvas-page) {
  max-width: 100%;
  min-width: 100%;
}

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
     cluster's footprint (magnifier + darkmode + two switcher triggers with
     carets + gaps + gutter; the mode-switcher's magnifier is always visible)
     so they never overlap. */
  #quartz-body .sidebar.left {
    padding-right: 8.75rem;
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
/* Truce with the mode-switcher popovers: while a switcher trigger is expanded
   its popover occupies the exact tooltip spot — suppress the tooltip so the
   two never overlap (the popover's own labels carry the meaning). */
.sidebar.left > .flex-component button[aria-expanded="true"]:hover::after {
  display: none;
}
`
