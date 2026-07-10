# Canvas edge-case correctness: media-extension classifier + preset-color lookup

Status: RESOLVED (2026-07-10 — failing-test-first fixes in `canvasSchema.js` / `canvasToFlow.js`; viewer bundle rebuilt)
Origin: React Flow migration code review (2026-07-10, commits `3e61cf2` / `d987f75` fixed the severe findings; these two small ones remain).

## 1. `classifyMediaKind` treats a dot-less filename as its own extension

`canvas-plugin/src/canvasSchema.js` — `filePath.split(".").at(-1)` returns the
WHOLE path when there is no dot, so a vault file literally named `png`, `mov`,
`txt`, etc. classifies as `FileTargetKind.MEDIA` and renders a broken
`<img>`/`<video>`/plaintext card. The pre-migration `MEDIA_REGEX` required a
literal dot (`/\.(png|...)$/`) and classified these `OTHER` -> navigable link
card.

**Fix:** only treat the tail as an extension when the basename actually
contains a dot (e.g. `const base = filePath.split("/").at(-1); if
(!base.includes(".")) return undefined`). Start with a failing unit test in
`canvas-plugin/test/unit/canvasRewriter.test.ts` (`classifyFileTarget`
describe block): a path named exactly `png` must be `OTHER`.

## 2. `resolveCanvasColor` prototype-chain lookup

`canvas-plugin/viewer/canvasToFlow.js` — `PRESET_COLORS[color]` on a plain
object: `Object.prototype` member names (`"constructor"`, `"toString"`,
`"hasOwnProperty"`, ...) pass the `!== undefined` check, so a hand-edited
`.canvas` with `"color": "constructor"` injects a stringified Function into
edge strokes / arrow markers / `--canvas-node-color` instead of falling back
to the default palette (the doc comment promises `undefined` for unknown
values).

**Fix:** `Object.hasOwn(PRESET_COLORS, color)` guard (or a `Map`). Failing
unit test first in `canvas-plugin/test/unit/canvasToFlow.test.ts`
(`resolveCanvasColor` describe block): `resolveCanvasColor("constructor")`
must be `undefined`.

## Notes

- Both are boundary validation of vault-author input (hand-edited /
  tool-generated `.canvas` files) — never user-of-the-site input.
- Rebuild the viewer bundle (`npm run bundle:viewer`) after touching
  `canvasToFlow.js` so e2e exercises the fix.
