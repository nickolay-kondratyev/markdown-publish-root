# Decide whether zen-mode subsumes reader-mode

Status: RESOLVED (2026-07-13 — by the mode-switcher refactor,
docs-internal/tickets/mode-switcher.md: Plain/Reader/Zen became a STRICT
radio group in one popover switcher, so the two "focus" toggles no longer sit
side by side and can no longer stack. Reader stays available everywhere,
including canvas pages, as the graph-sidebar dim.)
Origin: zen-mode implementation (2026-07-10, plan/zen-mode.md §3.5 follow-up).

The toolbar now carries two "focus" toggles side by side:

- **reader-mode** (book icon, stock plugin): fades sidebars to `opacity: 0`
  (hover restores), width NOT reclaimed. On folder/tag pages it is excluded;
  on canvas pages it is deliberately kept as the graph-sidebar toggle
  (`engine/src/quartzConfigGenerator.ts` LAYOUT comment).
- **zen-mode** (lotus icon, local plugin): hides all sidebar chrome AND
  collapses the grid so content reclaims the ~640px; persists in localStorage.

Two adjacent icons with overlapping meaning may confuse readers. Options:

1. Keep both (current state) — reader-mode still has a distinct role on canvas
   pages (quick peek-a-boo of the graph sidebar without relayout).
2. Disable reader-mode everywhere zen-mode exists; keep it only on canvas
   pages.
3. Drop reader-mode entirely and let zen-mode be THE focus toggle.

Needs a product call from Nickolay; implementation for any option is a small
`PLUGIN_ENTRIES` / `LAYOUT.byPageType` tweak in
`engine/src/quartzConfigGenerator.ts` plus e2e adjustments.
