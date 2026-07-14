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
    // aria-label is the single source of truth: the vendored darkmode plugin
    // cannot be edited, so the tooltip is engine CSS off that attribute.
    const rule =
      SiteChromeStyles.scss().match(
        /button\[aria-label\]:hover::after\s*\{([^}]*)\}/,
      )?.[1] ?? ""
    assert.equal(rule.includes("content: attr(aria-label)"), true)
  })

  test("GIVEN an expanded mode-switcher trigger WHEN hovered THEN its tooltip is suppressed (the popover owns that spot)", () => {
    const rule =
      SiteChromeStyles.scss().match(
        /button\[aria-expanded="true"\]:hover::after\s*\{([^}]*)\}/,
      )?.[1] ?? ""
    assert.equal(rule.includes("display: none"), true)
  })

  test("GIVEN the vendored darkmode's Flex slot WHEN inspected THEN it is dissolved (display: contents) so its button shares the cluster's 32px flex line", () => {
    // WHY: the slot div is a block box whose inline-block button leaves ~4px
    // of baseline descender space (36px-tall slot) — align-self: center then
    // shifted every 32px switcher item 2px DOWN relative to darkmode/search.
    const rule =
      SiteChromeStyles.scss().match(
        /\.flex-component > div:has\(> \.darkmode\)\s*\{([^}]*)\}/,
      )?.[1] ?? ""
    assert.equal(rule.includes("display: contents"), true)
  })

  test("GIVEN darkmode's edge-to-edge sun/moon glyphs WHEN inspected THEN they are shrunk to the Phosphor optical content size (16.25px) and re-centered", () => {
    // Phosphor glyphs draw ~208/256 of their viewBox (16.25px of a 20px box);
    // darkmode's fill theirs fully and looked one size larger in the row.
    const rule = SiteChromeStyles.scss().match(/\.darkmode svg\s*\{([^}]*)\}/)?.[1] ?? ""
    assert.equal(
      rule.includes("width: 16.25px") &&
        rule.includes("height: 16.25px") &&
        rule.includes("top: calc(50% - 8.125px)") &&
        rule.includes("left: calc(50% - 8.125px)"),
      true,
    )
  })

  test("GIVEN the mode-switcher owns all reading-mode CSS WHEN inspected THEN no legacy reader-mode/zen-mode selectors remain here", () => {
    assert.equal(
      SiteChromeStyles.scss().includes("reader-mode=") ||
        SiteChromeStyles.scss().includes("zen-mode=") ||
        SiteChromeStyles.scss().includes(".readermode"),
      false,
    )
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
