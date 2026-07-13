# vintrin-explorer: panel stuck OPEN (intercepting all taps) after desktop→mobile resize

Status: OPEN
Origin: mode-toggle corner-cluster work (2026-07-10) — surfaced by a new
e2e step that clicks the toolbar at mobile width after a viewport resize.

## Symptom

Load a page at desktop width, then shrink the viewport below 800px (rotate /
resize / responsive dev-tools): the explorer's mobile panel is OPEN — a
full-viewport `.explorer-content` overlay (`z-index: 100`, `width: 100vw`,
`height: 100dvh`, `visibility: visible`, `translateX(0)`) that intercepts
every tap on the page, including the search bar and the mode-toggle cluster.

On a FRESH mobile load the explorer initializes with `.collapsed` and the
overlay stays off-screen/hidden — behavior is correct.

## Root cause (probed, not yet fixed)

Desktop's "tree expanded" state (no `.collapsed` class on `.explorer`) maps
to mobile's "hamburger panel open" state
(`vintrin-explorer/src/explorerStyles.js`, the `@media (max-width: 800px)`
block keyed on `.explorer:not(.collapsed)`). Nothing re-collapses the
explorer when the viewport crosses the mobile breakpoint, so the desktop
state leaks into mobile as an open overlay.

Probe evidence (headless Chromium, `document.elementFromPoint` on a toolbar
button):

- fresh mobile load: `explorer nav-files-container collapsed`, content
  `visibility: hidden`, `translateX(-100vw)` → button receives the hit.
- desktop load then resize to 500px: `explorer nav-files-container` (no
  `collapsed`), content `visibility: visible`, `translateX(0)` → the
  overlay receives the hit.

## Second repro: explorer initialized while hidden (zen mode)

Fresh MOBILE load with zen mode on (explorer `display: none`), then exit
zen: the explorer emerges with `data-collapsed="collapsed"` /
`aria-expanded="false"` but WITHOUT the `.collapsed` class → the mobile
panel is open and intercepts taps. The init script's
`mobileToggle.checkVisibility()` branch (`vintrin-explorer/src/explorerScript.js`)
skips state setup when the explorer is hidden, so the class and the data
attribute diverge.

## Suggested direction

Track the mobile/desktop state separately (e.g. collapse on a
`matchMedia("(max-width: 800px)")` change event), or key the mobile overlay
on an explicit "mobile panel open" class the hamburger alone controls —
desktop expansion state should never open the mobile panel.

## Workaround in tests

`scripts/e2e-zen-mode.mjs` §5b reloads after switching to the mobile
viewport to get the real fresh-mobile initial state (remove the reload once
this is fixed).
