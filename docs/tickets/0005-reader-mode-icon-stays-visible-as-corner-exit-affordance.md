# Reader mode: keep the reader icon visible top-right as the exit affordance (mirror zen mode)

Status: OPEN
Origin: mode-toggle corner-cluster work (2026-07-11, commit 310cecb) — the
toggles now live in a fixed top-right cluster; this ticket extends the zen
"visible exit affordance" pattern to reader mode.

## Problem

Stock reader-mode dims BOTH sidebars to `opacity: 0` (hover-revealed):
`vendor/quartz/.quartz/plugins/reader-mode/src/components/styles/readermode.scss`
(`:root[reader-mode="on"] .sidebar.left, .sidebar.right { opacity: 0; &:hover { opacity: 1 } }`).

Since the mode-toggle cluster (ref.ap.0zwhQQya81CGNQ9pmqKkM.E) is a child of
`.sidebar.left`, the reader icon itself fades out too. Users who toggle
reader mode see ALL chrome vanish with no visible cue of what state they are
in or how to leave it — you must know to hover the invisible corner.

Zen mode already solved this for itself: its lotus stays visible top-right
as the lone exit affordance (`zen-mode/src/zenMode.js`, tickets 0000/0002).

## Desired behavior

WHEN reader mode is ON (and zen is off):

- The reader-mode (book) icon does NOT fade — it stays fully visible.
- It sits in the RIGHTMOST top-corner slot (where the zen lotus normally
  is), and it is the ONLY icon shown there — darkmode and zen hide, search
  and sidebars keep the stock dim/hide behavior.
- Clicking it exits reader mode; icons return to their normal cluster order.

This mirrors zen exactly: one glance says "you are in reader mode", one
click leaves it.

## Interplay + implementation notes

- **Zen + reader both on**: zen keeps precedence — only the lotus shows
  (current behavior, pinned by `scripts/e2e-zen-mode.mjs` §6 and
  `zen-mode/test/unit/zenMode.test.ts`). The reader-stays rule must apply
  only when `:root[reader-mode="on"]:not([zen-mode="on"])`.
- **Rightmost slot**: cluster order is darkmode(30) → reader(35) → zen(40)
  (`engine/src/quartzConfigGenerator.ts`). Zen's "hide CONTENT, keep the
  0-width wrapper" trick keeps the lotus flush right because its empty
  wrappers sit to its LEFT; the reader icon has zen's wrapper to its RIGHT,
  so the same trick would leave it a gap-width short of the corner. Either
  hide the sibling WRAPPERS (`.flex-component > div:has(...)`) or flex
  `order` the reader icon last while reader mode is on.
- **Opacity override**: stock readermode.scss dims `.sidebar.left`; the
  override must force the cluster (or the sidebar, scoped like zen does)
  back to `opacity: 1`. Natural home: `engine/src/siteChromeStyles.ts` —
  the engine-owned custom.scss is UNLAYERED so it wins over the plugin's
  `@layer quartz-base` rules without specificity games. (zen-mode's CSS is
  the wrong home: this is reader-mode behavior, not zen behavior.)
- **Hover-reveal**: keep stock hover behavior for the rest of the chrome
  (hovering the left sidebar area still reveals search/explorer).

## Tests to add / adjust

- e2e (`scripts/e2e-zen-mode.mjs` or a new reader-mode script): reader ON →
  book icon visible + in the right half, darkmode/zen hidden; click exits.
- §6 reader-then-zen assertions must still hold (zen precedence).
- Unit: pin the new custom.scss rules in
  `engine/test/unit/siteChromeStyles.test.ts`.
