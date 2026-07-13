# UI icon conventions

- Icon set: **Phosphor** (MIT), 256×256 viewBox paths inlined as constants
  (regular + fill weights), all in `mode-switcher/src/modeSwitcher.js`.
- Top-right cluster = darkmode (vendored) + mode-switcher plugin's items:
  magnifier (`.mode-search`, always leftmost via `order: -1`) and TWO radio
  switchers (`.mode-switcher[data-group="reading"|"screen"]`).
  - Reading modes: Plain `article` / Reader `book-open` / Zen `flower-lotus`.
  - Screen modes: Normal `frame-corners` / Full screen `arrows-out-simple` /
    Canvas full screen `arrows-out` (4 arrows = one step beyond).
- Selected-state language: a switcher TRIGGER shows the CURRENT mode's glyph —
  **outline while the group's default (plain/normal) is active, FILL for any
  non-default mode** — plus a `caret-down`. The selected popover row shows the
  fill glyph + `var(--highlight)` background + `aria-checked`.
- Per-mode trigger/row CSS is GENERATED from the mode tables in
  modeSwitcher.js — add a mode by adding a table entry, not CSS.
- Cluster tooltips are pure CSS off `aria-label` (engine siteChromeStyles.ts);
  popover rows deliberately use text labels with NO aria-label so the tooltip
  never fires on them, and an expanded trigger's tooltip is suppressed.
