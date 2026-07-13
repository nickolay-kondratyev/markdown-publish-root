right now the canvas data is able to be picked up by search to show the canvases that contain the content. (recent addition)

However, the preview for canvas is EMPTY. We would like to be able to show something as preview in search.

IDEAL solution: show react flow cards with highlighted keywords that matched up the search.

SIMPLIFIED solution: extract the content from the cards into text and use the text in the preview, each card could have `[]` surrounding the text in card to symbolize the cards.

---

## Resolution (implemented: SIMPLIFIED solution)

**Root cause:** the search preview panel (and link popovers) fetch the page's
STATIC HTML and clone `.popover-hint` elements. Canvas pages rendered only a
client-side viewer mount ("Loading canvas...") with no `.popover-hint` — so the
preview was empty.

**Fix:** `CanvasPageBody` now server-renders a `.popover-hint canvas-text-preview`
block with one `[bracketed]` line per visible card (text cards, note title+body,
card titles, group labels, link URLs, edge labels — same privacy-safe
`searchParts` that feed the search index). Hidden on the canvas page itself via
CSS scoped to `.canvas-page`; visible when cloned into the preview panel /
popovers. Matched keywords are highlighted for free by the search UI's
`highlightHTML` pass over the cloned nodes.

**Not done (IDEAL solution):** rendering real React Flow cards in the preview —
the viewer boots via dynamic import on the canvas page; cloned preview DOM
executes no scripts, so that would need a separate preview-side mount path.
Revisit only if the text preview proves insufficient.

Covered by: `canvasRewriter.test.ts` (searchParts contract),
`buildSiteCanvas.test.ts` (preview block emitted, client payload stays lean),
`scripts/e2e-search.mjs` (preview text + keyword highlight in the real UI).