import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { CanvasPageBody } from "../../src/pageBody.js"

// Double cast: the constructor's own props type requires fileData, which this
// css-only suite never passes.
const component = CanvasPageBody() as unknown as ((props: Record<string, unknown>) => unknown) & {
  css: string
}

describe("CanvasPageBody — viewport fill in every reading mode", () => {
  test("GIVEN the canvas is the page content WHEN in ANY reading mode THEN the content column stretches to the full viewport height", () => {
    const centerRule =
      component.css.match(/^#quartz-body \.center:has\(\.canvas-page\)\s*\{([^}]*)\}/m)?.[1] ?? ""
    assert.equal(centerRule.includes("min-height: 100dvh"), true)
  })

  test("GIVEN the stretched content column WHEN the mount lays out THEN it flexes to fill it (no fixed 75vh height)", () => {
    const mountRule = component.css.match(/^\.canvas-page-mount\s*\{([^}]*)\}/m)?.[1] ?? ""
    assert.equal(mountRule.includes("flex: 1") && !mountRule.includes("75vh"), true)
  })
})

describe("CanvasPageBody — heading chrome reclaimed for the canvas", () => {
  test("GIVEN breadcrumbs already name the canvas WHEN the page has them THEN the duplicate H1 is hidden", () => {
    const titleRule =
      component.css.match(
        /^\.center:has\(\.canvas-page\):has\(\.breadcrumb-container\) \.article-title\s*\{([^}]*)\}/m,
      )?.[1] ?? ""
    assert.equal(titleRule.includes("display: none"), true)
  })

  test("GIVEN zen hides the breadcrumbs WHEN in zen THEN the H1 comes back as the only on-screen name", () => {
    const zenTitleRule =
      component.css.match(
        /:root\[reading-mode="zen"\] \.center:has\(\.canvas-page\) \.article-title\s*\{([^}]*)\}/,
      )?.[1] ?? ""
    assert.equal(zenTitleRule.includes("display: block"), true)
  })

  test("GIVEN base's 6rem header offset is dead space over a canvas WHEN on a canvas page THEN the breadcrumbs header lifts to zen's 2rem", () => {
    const headerRule =
      component.css.match(
        /#quartz-body \.center:has\(\.canvas-page\) \.page-header\s*\{([^}]*)\}/,
      )?.[1] ?? ""
    assert.equal(headerRule.includes("margin-top: 2rem"), true)
  })

  test("GIVEN the article/footer divider adds no value on a canvas WHEN on a canvas page THEN it is hidden", () => {
    const hrRule =
      component.css.match(/^\.center:has\(\.canvas-page\) > hr\s*\{([^}]*)\}/m)?.[1] ?? ""
    assert.equal(hrRule.includes("display: none"), true)
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
