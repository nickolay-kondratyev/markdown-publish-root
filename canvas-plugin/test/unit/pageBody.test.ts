import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { CanvasPageBody } from "../../src/pageBody.js"

// Double cast: the constructor's own props type requires fileData, which this
// css-only suite never passes.
const component = CanvasPageBody() as unknown as ((props: Record<string, unknown>) => unknown) & {
  css: string
}

describe("CanvasPageBody — zen-mode viewport fill", () => {
  test("GIVEN zen mode removes all chrome below the canvas WHEN on a canvas page THEN the content column stretches to the full viewport height", () => {
    const centerRule =
      component.css.match(/:root\[reading-mode="zen"\] #quartz-body \.center:has\(\.canvas-page\)\s*\{([^}]*)\}/)?.[1] ?? ""
    assert.equal(centerRule.includes("min-height: 100dvh"), true)
  })

  test("GIVEN the stretched content column WHEN zen is on THEN the canvas mount flexes to fill it (no fixed 75vh height)", () => {
    const mountRule =
      component.css.match(/:root\[reading-mode="zen"\] [^{]*\.canvas-page-mount\s*\{([^}]*)\}/)?.[1] ?? ""
    assert.equal(mountRule.includes("flex: 1"), true)
  })
})

describe("CanvasPageBody — canvas-full-screen expansion", () => {
  const expansionRule = () =>
    component.css.match(
      /:root\[screen-mode="fullscreen-canvas"\] [^{]*\.canvas-page-mount\s*\{([^}]*)\}/,
    )?.[1] ?? ""

  test("GIVEN screen-mode=fullscreen-canvas WHEN on a canvas page THEN the mount covers the viewport (fixed, inset 0)", () => {
    const rule = expansionRule()
    assert.equal(rule.includes("position: fixed") && rule.includes("inset: 0"), true)
  })

  test("GIVEN the expanded mount WHEN layered THEN it sits UNDER the corner mode cluster (z-index below the cluster's 2)", () => {
    assert.equal(expansionRule().includes("z-index: 1"), true)
  })
})
