# Mode switcher: grouped radio UI for reading + screen modes

Status: IMPLEMENTED (2026-07-13) — `mode-switcher/` local plugin,
`scripts/e2e-mode-switcher.mjs`, `scripts/e2e-screen-mode.mjs`.

## What

The four standalone toolbar toggles (reader book, zen lotus, fullscreen
arrows, plus the in-canvas React Flow fullscreen button) were regrouped into
TWO radio-style switchers in the top-right cluster. Each switcher is one
trigger button (current mode's glyph + caret) opening a vertical popover of
labeled `menuitemradio` rows:

- **Reading mode**: Plain (`article`) / Reader (`book-open`) / Zen
  (`flower-lotus`). STRICT radio — the old zen+reader stacking is
  unrepresentable by construction.
- **Screen mode**: Normal (`frame-corners`) / Full screen
  (`arrows-out-simple`) / Canvas full screen (`arrows-out`). All three
  options are ALWAYS offered (markdown and canvas pages alike) so the menu
  never changes shape on the user.

Retired: `zen-mode/` and `full-screen-mode/` plugins (absorbed), the vendored
`reader-mode` plugin (unregistered; its ~10-line sidebar-dim CSS is owned by
the switcher — this also deleted the CSS-mask book-glyph workaround in
`engine/src/siteChromeStyles.ts`), the `.canvas-flow-fullscreen` ControlButton
and `fullscreenRetention.js` in canvas-plugin.

## State contract (the cross-plugin API)

Attributes on `<html>` — never swapped by the SPA router, so both survive
every navigation:

| Attribute | Values | Persistence | Event |
|---|---|---|---|
| `reading-mode` | `plain\|reader\|zen` | localStorage `reading-mode`, restored pre-paint | `readingmodechange` |
| `screen-mode` | `normal\|fullscreen\|fullscreen-canvas` | NONE (see below) | `screenmodechange` |

`screen-mode` is deliberately not stored: browsers refuse `requestFullscreen`
without a user gesture, so a stored "fullscreen" could never be restored on
load — it would be a lie. The browser's fullscreen state is ground truth,
synced to the attribute on `fullscreenchange` (keyed on
`documentElement.matches(":fullscreen")`), so Esc/F11 exits always reset the
intent to `normal`.

The old `zen-mode` localStorage key is ignored (no migration).

## Canvas full screen = html fullscreen + CSS expansion

There is exactly ONE Fullscreen API level: `<html>`. "Canvas full screen"
additionally expands `.canvas-page-mount` over the viewport with pure CSS
(`canvas-plugin/src/pageBody.js`, keyed on
`:root[screen-mode="fullscreen-canvas"]`, `z-index: 1`).

WHY-NOT native mount fullscreen (spike-verified in headless Chromium):

1. Two `requestFullscreen()` calls in ONE gesture fail — the first consumes
   the transient user activation ("Permissions check failed"), so
   html+nested-mount cannot be entered from a single popover click.
2. Only the fullscreen element's SUBTREE renders — a fullscreen mount hides
   the corner cluster, leaving no visible exit affordance (the old design
   dodged this only because its exit button lived inside React Flow).

Stacking gotcha: base.scss makes `.sidebar.left` sticky — a stacking context
of its own — so the cluster's `z-index: 2` is trapped inside it and would
paint UNDER the z-1 expanded mount. The switcher's CSS lifts the sidebar's
context above the mount on canvas pages and hides its non-cluster chrome
(`mode-switcher/src/modeSwitcher.js` CANVAS_FULL_SCREEN_CSS).

Cross-nav retention needs no machinery: fullscreen and the intent attribute
both live on `<html>`; navigating canvas→canvas (or markdown→canvas) simply
re-applies the CSS to the next page's mount. On non-canvas pages the mode
degrades to plain fullscreen while the intent (and the checked radio row)
persists.

## Headless-testing notes

- Esc cannot be exercised in headless Chromium (UA-level handler);
  `document.exitFullscreen()` is the stand-in for browser-initiated exits.
- Per WHATWG, a real Esc fully exits the whole fullscreen stack; since only
  one level exists here, both paths converge on `screen-mode="normal"`.
