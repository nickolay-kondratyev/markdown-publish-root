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

  test("GIVEN the scss WHEN inspected THEN hovering a cluster icon shows its aria-label as a tooltip (ticket full-screen-mode.md)", () => {
    // aria-label is the single source of truth: the vendored darkmode/reader
    // plugins cannot be edited, so the tooltip is engine CSS off that attribute.
    const rule =
      SiteChromeStyles.scss().match(
        /button\[aria-label\]:hover::after\s*\{([^}]*)\}/,
      )?.[1] ?? ""
    assert.equal(rule.includes("content: attr(aria-label)"), true)
  })
})

// Viewport-anchored layout: rails pinned to the viewport edges on EVERY page,
// reading measure moved off the page grid onto the markdown center column so
// canvas pages can use the full track (see siteChromeStyles.ts layout block).
describe("SiteChromeStyles — viewport-anchored layout", () => {
  const scss = () => SiteChromeStyles.scss()
  /** Body of the rule with the given selector. */
  const ruleBody = (selector: string) => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    return scss().match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? ""
  }
  const CENTER_SELECTOR = '.page[data-frame="default"] > #quartz-body > .center'
  const CANVAS_CENTER_SELECTOR = `${CENTER_SELECTOR}:has(.canvas-page)`

  test("GIVEN the scss WHEN inspected THEN the page-level width cap is removed (rails anchor to viewport edges on all pages)", () => {
    assert.equal(/\.page\s*\{[^}]*max-width: none/.test(scss()), true)
  })

  test("GIVEN the scss WHEN inspected THEN a reading measure of ~65-70ch is defined", () => {
    assert.equal(scss().includes("$readingMeasure: 70ch"), true)
  })

  test("GIVEN a default-frame page WHEN inspected THEN the center column is capped at the reading measure", () => {
    assert.equal(ruleBody(CENTER_SELECTOR).includes("max-width: $readingMeasure"), true)
  })

  test("GIVEN a default-frame page WHEN inspected THEN quartz's min-width floor is released so the measure can bind", () => {
    assert.equal(ruleBody(CENTER_SELECTOR).includes("min-width: 0"), true)
  })

  test("GIVEN a default-frame page WHEN inspected THEN the center is centered within the track", () => {
    const rule = ruleBody(CENTER_SELECTOR)
    assert.equal(rule.includes("margin-left: auto") && rule.includes("margin-right: auto"), true)
  })

  test("GIVEN a canvas page WHEN inspected THEN the center reclaims the full track width", () => {
    const rule = ruleBody(CANVAS_CENTER_SELECTOR)
    assert.equal(rule.includes("max-width: 100%") && rule.includes("min-width: 100%"), true)
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

  test("GIVEN reader on WHEN inspected THEN sibling icon WRAPPERS hide EXCEPT book + fullscreen + the zen slot (its magnifier stays)", () => {
    assert.equal(
      readerRule(
        ".sidebar.left > .flex-component > div:not(:has(.readermode)):not(:has(.fullscreenmode)):not(:has(.zen-search))",
      ).includes("display: none"),
      true,
    )
  })

  test("GIVEN reader on WHEN the zen wrapper is exempted (magnifier stays) THEN the lotus ITSELF is hidden (book is the lone mode-exit affordance)", () => {
    assert.equal(
      readerRule(".sidebar.left > .flex-component button.zenmode").includes("display: none"),
      true,
    )
  })

  test("GIVEN reader dims the .search root WHEN the search overlay is open THEN the root is forced opaque (touch has no hover-reveal)", () => {
    assert.equal(
      readerRule(".sidebar.left > .search:has(.search-container.active)").includes("opacity: 1"),
      true,
    )
  })

  test("GIVEN the vendored book icon (uneditable plugin) WHEN styling the selected state THEN the inline SVG is replaced by a CSS-masked glyph pair", () => {
    // Off state: Phosphor book-open via mask on ::before (::after is the tooltip's).
    const beforeRule = scss().match(/\.readermode::before\s*\{([^}]*)\}/)?.[1] ?? ""
    assert.equal(
      scss().includes(".readermode svg {\n  display: none;") &&
        beforeRule.includes("mask: url(") &&
        beforeRule.includes("background-color: var(--darkgray)"),
      true,
    )
  })

  test("GIVEN reader on WHEN inspected THEN the book glyph swaps to its FILLED variant (selected-state cue)", () => {
    assert.equal(readerRule(".readermode::before").includes("mask-image: url("), true)
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
