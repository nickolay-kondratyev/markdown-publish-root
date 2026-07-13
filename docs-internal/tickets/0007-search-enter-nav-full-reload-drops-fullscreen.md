# Search Enter-nav does a full reload, dropping fullscreen / screen-mode

Status: RESOLVED locally (2026-07-13 — capture-phase Enter shim in
`mode-switcher/src/modeSwitcher.js` TOGGLE_SCRIPT; regression coverage in
`scripts/e2e-screen-mode.mjs` steps 11-12). UPSTREAM bug still open — see
"Upstream" below.

## Symptom

While in Canvas full screen (`screen-mode="fullscreen-canvas"`), opening
search and confirming a result with **Enter** knocked the site out of browser
fullscreen and reset the screen mode to `normal`. Mouse-clicking the same
result card kept both — only the keyboard path broke.

## Root cause (vendored `@quartz-community/search`)

`search.inline.ts` `onSearchBarKeydown` Enter handler:

```ts
e.preventDefault();
storeSearchTerm();
hideSearch();      // removeAllChildren(results) — DETACHES the result anchor
focused.click();   // click on a DETACHED anchor
```

A detached anchor's click event cannot bubble to `window`, so the SPA
router's window click listener (`spa.inline.ts createRouter`) never hijacks
it. The browser follows the href with a **full page load**, which

1. exits html-level browser fullscreen (document is destroyed), and
2. re-runs the mode-switcher prescript, which resets `screen-mode="normal"`
   (deliberate: a stored fullscreen intent could never be restored without a
   user gesture — see the state contract in `modeSwitcher.js`).

The mouse path works because the real click's propagation path is computed at
dispatch time — `hideSearch()` inside the results click handler detaches the
card mid-bubble, but the event still reaches `window`.

## Local fix

The vendored plugin is gitignored and reinstalled from the pin
(`vendor/quartz/quartz.lock.json`), so it cannot be patched in place. The
mode-switcher — owner of the "state survives every navigation" contract —
ships a capture-phase document `keydown` shim that re-routes Enter to a click
on the still-ATTACHED focused result card, making the keyboard path take the
exact same (working) route as the mouse path. Zero search logic is
duplicated: term storage, overlay hide, and SPA navigation all still run in
their single-source owners.

## Upstream

The one-line upstream fix is reordering to `focused.click()` **before**
`hideSearch()` in `quartz-community/search`'s `search.inline.ts` Enter
handler. If a future plugin bump includes that fix, the local shim becomes
redundant (but harmless — it just front-runs the same behavior) and can be
removed together with e2e steps 11-12 kept as regression coverage.
