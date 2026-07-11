import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { CanvasPageBody } from "../../src/pageBody.js"

const component = CanvasPageBody() as ((props: Record<string, unknown>) => unknown) & {
  css: string
}

describe("CanvasPageBody — zen-mode viewport fill", () => {
  test("GIVEN zen mode removes all chrome below the canvas WHEN on a canvas page THEN the content column stretches to the full viewport height", () => {
    const centerRule =
      component.css.match(/:root\[zen-mode="on"\] #quartz-body \.center:has\(\.canvas-page\)\s*\{([^}]*)\}/)?.[1] ?? ""
    assert.equal(centerRule.includes("min-height: 100dvh"), true)
  })

  test("GIVEN the stretched content column WHEN zen is on THEN the canvas mount flexes to fill it (no fixed 75vh height)", () => {
    const mountRule =
      component.css.match(/:root\[zen-mode="on"\] [^{]*\.canvas-page-mount\s*\{([^}]*)\}/)?.[1] ?? ""
    assert.equal(mountRule.includes("flex: 1"), true)
  })
})
