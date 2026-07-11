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

// Reader-mode exit affordance (ticket 0005, mirrors zen): reader-mode dims
// .sidebar.left to opacity 0, which would fade the reader icon itself. These
// rules keep the book icon visible top-right as the lone exit affordance.
describe("SiteChromeStyles — reader-mode exit affordance", () => {
  const scss = () => SiteChromeStyles.scss()
  /** Body of the rule whose selector ends with the given suffix (reader-scoped). */
  const readerRule = (selectorSuffix: string) => {
    const escaped = selectorSuffix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const pattern = new RegExp(
      `:root\\[reader-mode="on"\\]:not\\(\\[zen-mode="on"\\]\\) ${escaped}\\s*\\{([^}]*)\\}`,
    )
    return scss().match(pattern)?.[1] ?? ""
  }

  test("GIVEN reader on (zen off) WHEN inspected THEN the left sidebar is forced opaque", () => {
    assert.equal(readerRule(".sidebar.left").includes("opacity: 1"), true)
  })

  test("GIVEN reader on WHEN inspected THEN the stock dim moves to the NON-cluster children", () => {
    assert.equal(readerRule(".sidebar.left > *:not(.flex-component)").includes("opacity: 0"), true)
  })

  test("GIVEN reader on WHEN hovering the sidebar THEN non-cluster chrome is revealed (stock behavior kept)", () => {
    assert.equal(
      readerRule(".sidebar.left:hover > *:not(.flex-component)").includes("opacity: 1"),
      true,
    )
  })

  test("GIVEN reader on WHEN inspected THEN sibling icon WRAPPERS hide so the book icon takes the rightmost slot", () => {
    assert.equal(
      readerRule(".sidebar.left > .flex-component > div:not(:has(.readermode))").includes(
        "display: none",
      ),
      true,
    )
  })

  test("GIVEN the reader rules WHEN zen is also on THEN none apply (zen keeps precedence)", () => {
    // Every reader-mode rule must carry the :not([zen-mode="on"]) guard.
    const readerSelectors = scss().match(/^[^\n{]*\[reader-mode="on"\][^\n{]*\{/gm) ?? []
    assert.equal(readerSelectors.length > 0, true)
    for (const selector of readerSelectors) {
      assert.equal(selector.includes(':not([zen-mode="on"])'), true, selector)
    }
  })
})
