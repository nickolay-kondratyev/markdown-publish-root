# ADR 0006: Foreign ids publish via marker-prefixed URL segments (`lc_` / `ue_`)

**Status:** Accepted (2026-07-13). **Owner:** Nickolay.
**Context:** ADR 0004 (stable-id publishing), `engine/src/urlSegment.ts` (the ONE derivation).

## Problem

ADR 0004 hard-failed the build on any id outside our grammar
(`docid_[0-9a-z]{21}_e`). Vaults stamped by other tooling carry *foreign* ids —
mixed-case, or not URL-friendly at all. Silently lowercasing such an id into
the URL would be misleading: a `docid_…` URL segment would no longer equal the
frontmatter id byte-for-byte.

## Decision

Accept **any non-empty string** id. `UrlSegment.deriveFrom` derives the
published segment (`/n/<segment>`); a marker prefix keeps the URL honest about
any transformation:

| Raw id | Rule | Segment |
|---|---|---|
| already URL-safe (`^[a-z0-9_-]+$`) | verbatim | `<id>` (all ids WE generate land here) |
| safe except casing | lowercase | `lc_<lowercased id>` |
| anything else | encode | `ue_<base36 of UTF-8 bytes>` |

- **Fixed-point alphabet, not percent-encoding:** Quartz slugifies segments
  (`%`→`-percent`, drops `?` `#`, lowercases) and stays unpatched (ADR 0004),
  so segments must already be `[a-z0-9_-]+` to survive byte-for-byte.
  Base36 (vs hex) keeps encoded URLs ~25% shorter (chosen by Nickolay).
- **Markers are always ours:** ids that themselves start with `lc_`/`ue_`
  (any case), or equal `index`/`_index` (Quartz folder-index routing), are
  always `ue_`-encoded — a marker prefix in a URL can never be spoofed by a
  raw id.
- **Collisions fail the build:** distinct ids can derive the same segment
  (`Foo` vs `fOO`); `IdMap.build` rejects derived-segment collisions listing
  every offender, same fail-early posture as ADR 0004.
- **Stamping unchanged:** `scripts/add-doc-ids.mjs` still only stamps MISSING
  ids; existing foreign (non-empty string) ids are skipped, never overwritten.

## Consequences

- Missing / non-string / empty ids still hard-fail (`DocIdValidationError`).
- `IdMap.docIdOf` renamed to `urlSegmentOf` — the value is a derived segment,
  not necessarily the raw id.
- End-to-end fixed-point invariant covered by
  `engine/test/integration/foreignIds.test.ts` (real Quartz build).
