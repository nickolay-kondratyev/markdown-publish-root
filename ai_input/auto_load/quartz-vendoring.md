# Vendored Quartz + community plugins

- `vendor/quartz/` is a pinned clone (`vendor/quartz-pin.json`); community plugins
  under `vendor/quartz/.quartz/plugins/` are gitignored and reinstalled from
  `quartz.lock.json` — **never patch them in place** (changes evaporate).
- Fixing vendored-plugin behavior: shim it from one of OUR local plugins
  (`mode-switcher/`, `canvas-plugin/`, `vintrin-explorer/`, `vintrin-breadcrumbs/`)
  or fork the plugin locally (vintrin-* pattern). Precedent: the search Enter-nav
  full-reload bug — `docs-internal/tickets/0007-search-enter-nav-full-reload-drops-fullscreen.md`.
- SPA state contract: `<html>` attributes (`reading-mode`, `screen-mode`) survive
  SPA navigation (micromorph only swaps `<body>`); a FULL page load re-runs the
  prescript, resetting `screen-mode` and dropping browser fullscreen. Anything
  that degrades an in-site link to a full load is therefore a state-loss bug.
