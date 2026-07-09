# ADR 0001: Own Quartz pageType plugin + hesprs viewer (not the official canvas-page plugin)

**Status:** Accepted (Nickolay, 2026-07-08)
**Context:** Phase 0 spikes (see `docs/spikes/`).

## New fact discovered

`plan/main.md` assumed Quartz has no canvas support. Reality: Quartz 5 ships an
official `@quartz-community/canvas-page` pageType plugin (v0.1.0, custom Preact
renderer), enabled by default. It proves the pageType mechanism but is far
below our parity checklist:

- File cards are links + popover — no embedded note content.
- Text cards use plain micromark GFM — no `[[wikilink]]` resolution.
- No subpath (`#heading`/`#^block`), no minimap, no audio/video/PDF.
- Does not register canvas outbound links (absent from graph/backlinks).

## Decision

Build our OWN pageType plugin (structure modeled on canvas-page) that:

1. Mounts the hesprs `json-canvas-viewer` core (self-hosted bundle, ~40 KB gz)
   for the interactive client — validated by Spike B (21/21 assertions).
2. Renders card markdown at BUILD time through Quartz's markdown chain and
   registers canvas outbound links via `data.links` (validated by Spike A).
3. DISABLES the official canvas-page plugin in generated config to avoid two
   claimants for `.canvas`.

## Why not the alternatives

- **Fork official canvas-page:** closing its parity gap is a renderer rewrite;
  slowest path to MVP.
- **Official plugin as-is:** undermines the wedge feature (canvas parity).

## Consequences

- Renderer isolation rule (plan §4.3) stands: one module owns the hesprs dep.
- Known hesprs gaps handled by build-time canvas-JSON rewriting (Spike B):
  subpath slicing into fragments; PDF and canvas→canvas cards rewritten to
  navigable link-style nodes; edge `toEnd:none`/group images are cosmetic gaps.
- Re-evaluate upstream canvas-page maturity post-MVP (possible convergence /
  open-source positioning, plan §7.7).
