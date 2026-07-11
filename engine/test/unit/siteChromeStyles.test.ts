import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { SiteChromeStyles } from "../../src/siteChromeStyles.ts"

// The mode-toggle cluster contract (ref.ap.0zwhQQya81CGNQ9pmqKkM.E): the left
// sidebar's single .flex-component group is pinned to the top-right corner.
describe("SiteChromeStyles — mode-toggle cluster pin", () => {
  const clusterRule = () =>
    SiteChromeStyles.scss().match(/\.sidebar\.left > \.flex-component\s*\{([^}]*)\}/)?.[1] ?? ""

  test("GIVEN the scss WHEN inspected THEN the cluster selector targets the sidebar's flex group", () => {
    assert.equal(SiteChromeStyles.scss().includes(".sidebar.left > .flex-component"), true)
  })

  test("GIVEN the cluster rule WHEN inspected THEN it is fixed-positioned", () => {
    assert.equal(clusterRule().includes("position: fixed"), true)
  })

  test("GIVEN the cluster rule WHEN inspected THEN it pins to the top-RIGHT corner", () => {
    const rule = clusterRule()
    assert.equal(rule.includes("top:") && rule.includes("right:"), true)
  })

  test("GIVEN the scss WHEN inspected THEN mobile reserves sidebar room under the fixed cluster", () => {
    // The mobile header row (spacer pushes search right) must not run under
    // the fixed icons — see siteChromeStyles.ts mobile media block.
    assert.equal(/\$mobile[\s\S]*padding-right/.test(SiteChromeStyles.scss()), true)
  })

  test("GIVEN the scss WHEN inspected THEN it imports quartz style variables (breakpoints)", () => {
    assert.equal(SiteChromeStyles.scss().startsWith('@use "./variables.scss" as *;'), true)
  })
})
