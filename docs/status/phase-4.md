# Phase 4 Status: Dogfood + Definition of Done

**Result: DEFINITION OF DONE MET.** 38/38 behavioral checks pass in real
Chromium (desktop + mobile 390x844). Full evidence:
`docs/status/phase-4-qa-report.md` (screenshots in `/.out/qa-phase4/`, not
source-controlled).

## What was verified (plan §5 definition of done)

- One-command build of the fixture vault; served site works locally.
- Every parity-checklist item hands-on in a browser: markdown text cards,
  full note card + open-note affordance, `#Installation` subpath card, image
  card, group, labeled/colored edges, link card (sandboxed iframe),
  canvas→canvas navigation both directions, wikilink-in-card → note,
  `[[x.canvas]]` from markdown → canvas page.
- Privacy: "Private note" placeholder card; leak sentinel absent from the
  entire output; private URL 404s.
- Canvases in backlinks, graph view, and search. Theme toggle consistent and
  live on canvas pages. Zero own-origin console errors. Canvas mounts in
  0.9–2.2 s on localhost; viewer bundle 64.4 KB.

## Dogfood caveat

The fixture `test-vault/` stood in for a real vault (none available in this
environment). Before public use, run the engine against Nickolay's actual
vault — plan §6 Phase 4 intent — and revisit `deleteStale` default +
long-card/huge-canvas UX with real content.

## Deviations

None. QA made no product changes.

## Follow-ups recorded (see plan/main.md §7, items 11-13)

1. Canvas pages have empty search PREVIEW (text is indexed and searchable;
   body is client-mounted) — subsumed by §7.5 SSR/prerender.
2. File-card open-note needs two clicks with no "armed" visual cue after the
   first — add selected-state affordance styling.
3. Link cards render blank white when the embedded site refuses to load —
   add a fallback face (favicon + URL + "open" link).

## Serving note (documented in cli/README.md)

Quartz emits extensionless internal links; local static servers need an
extensionless→`.html` mapping (plain `python3 -m http.server` false-404s).
CloudFront needs the equivalent Function — already an open item in phase-3
status.
