# Reader mode then zen mode: zen exit icon invisible

Status: RESOLVED (2026-07-10)

Activating reader mode and then activating zen mode made the zen-mode icon
not show up in zen mode, so users had no way to undo zen mode.

## Root cause

Reader mode and zen mode are independent root attributes and can be on
simultaneously. Stock reader-mode sets
`:root[reader-mode="on"] .sidebar.left { opacity: 0 }` (hover-revealed);
zen mode pins that same `.sidebar.left` top-right as the lone exit
affordance but did not reset opacity — leaving the lotus icon invisible.

## Fix

`zen-mode/src/zenMode.js`: the `:root[zen-mode="on"] #quartz-body
.sidebar.left` rule now forces `opacity: 1` (the `#quartz-body` ID wins the
cascade over reader-mode's rule, no `!important`).

Covered by:

- Unit: `zen-mode/test/unit/zenMode.test.ts` ("ticket 0000" test).
- E2e: `scripts/e2e-zen-mode.mjs` section 6 (reader ON → zen ON → computed
  opacity of `.sidebar.left` must be 1).

Related: ticket 0002 (whether zen-mode should subsume reader-mode entirely).
