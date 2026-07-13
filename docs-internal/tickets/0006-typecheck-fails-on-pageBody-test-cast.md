# `npm run typecheck` fails on pageBody.test.ts component cast

Status: OPEN (found 2026-07-13, pre-existing on main — unrelated to the
always-visible search-icon change during which it surfaced)

## Symptom

```
canvas-plugin/test/unit/pageBody.test.ts(5,19): error TS2352: Conversion of type
'{ ({ fileData }: { fileData: any; }): VNode<...>; css: string; afterDOMLoaded: string; }'
to type '((props: Record<string, unknown>) => unknown) & { css: string; }'
may be a mistake because neither type sufficiently overlaps with the other.
```

`npm run test:unit` passes — this is a compile-time-only failure (Node type
stripping, not tsc). Impact: `npm run typecheck` exits non-zero, masking any
NEW type errors elsewhere. Independently confirmed pre-existing via a
clean-tree `git stash` baseline during the canvas link-cards work.

## Analysis

`CanvasPageBody()`'s component takes `{ fileData }` (a required prop), which
does not overlap with the test's `(props: Record<string, unknown>) => unknown`
cast. Introduced with commit 734192f (canvas zen viewport fill). The parallel
cast in `zen-mode/test/unit/zenMode.test.ts` typechecks because that component
destructures only optional props.

## Fix direction

Cast through `unknown` first (as TS suggests), or type the test helper to the
component's actual props shape.
