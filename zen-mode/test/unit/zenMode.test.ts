import assert from "node:assert/strict"
import { describe, test } from "node:test"
// Loading through the loader's fallback path proves the whole import chain is
// plain-Node-importable ESM (gotcha G6) — no TS/JSX anywhere.
import { ZenMode } from "../../components/index.js"

const component = ZenMode() as ((props: Record<string, unknown>) => unknown) & {
  css: string
  beforeDOMLoaded: string
}

describe("ZenMode component — rendering", () => {
  test("GIVEN the constructor WHEN instantiated THEN it renders a button with the zenmode class", () => {
    const vnode = component({ displayClass: undefined }) as { type: string; props: { class: string } }
    assert.deepEqual({ type: vnode.type, class: vnode.props.class }, { type: "button", class: "zenmode" })
  })

  test("GIVEN a displayClass WHEN rendering THEN it is appended to the button class", () => {
    const vnode = component({ displayClass: "desktop-only" }) as { props: { class: string } }
    assert.equal(vnode.props.class, "zenmode desktop-only")
  })
})

describe("ZenMode component — CSS (the width reclaim)", () => {
  test("GIVEN the css WHEN inspected THEN rules key on the zen-mode root attribute", () => {
    assert.equal(component.css.includes(':root[zen-mode="on"]'), true)
  })

  test("GIVEN the css WHEN inspected THEN the grid collapses to a single column", () => {
    assert.equal(component.css.includes("grid-template-columns: auto"), true)
  })

  test("GIVEN the css WHEN inspected THEN all toolbar icons except zen AND fullscreen are hidden in zen", () => {
    // The fullscreen toggle stacks with zen (ticket full-screen-mode.md).
    assert.equal(
      component.css.includes(".flex-component > div > *:not(.zenmode):not(.fullscreenmode)"),
      true,
    )
  })

  test("GIVEN the css WHEN inspected THEN the zen exit icon pins to the top-RIGHT corner", () => {
    const sidebarLeftRule = component.css.match(/\.sidebar\.left\s*\{([^}]*)\}/)?.[1] ?? ""
    assert.equal(sidebarLeftRule.includes("right: 0") && sidebarLeftRule.includes("left: auto"), true)
  })

  test("GIVEN the css WHEN inspected THEN the article/footer divider (hr) is hidden in zen", () => {
    assert.equal(component.css.includes(':root[zen-mode="on"] .center > hr'), true)
  })

  test("GIVEN the css WHEN inspected THEN breadcrumbs are hidden in zen", () => {
    assert.equal(component.css.includes(':root[zen-mode="on"] .center .breadcrumb-container'), true)
  })

  test("GIVEN base's 5px grid row-gap WHEN zen leaves the trailing grid rows empty THEN the gap is zeroed (no dead scroll at the page bottom)", () => {
    const gridRule =
      component.css.match(/:root\[zen-mode="on"\] \.page > #quartz-body\s*\{([^}]*)\}/)?.[1] ?? ""
    assert.equal(gridRule.includes("row-gap: 0"), true)
  })

  test("GIVEN base's 6rem sidebar-clearing top margin WHEN zen removes the sidebars THEN the page header is pulled up to reclaim the vertical space", () => {
    // base.scss gives .page-header `margin: $topSpacing 0 0 0` (6rem) to clear
    // the sticky sidebars — pointless in zen where the sidebars are gone.
    const headerRule =
      component.css.match(/:root\[zen-mode="on"\] #quartz-body \.page-header\s*\{([^}]*)\}/)?.[1] ?? ""
    assert.equal(headerRule.includes("margin-top: 2rem"), true)
  })

  test("GIVEN reader-mode dims .sidebar.left to opacity 0 WHEN zen pins it as the exit affordance THEN zen forces opacity back to 1 (ticket 0000)", () => {
    // Stock reader-mode sets `:root[reader-mode="on"] .sidebar.left { opacity: 0 }`.
    // Both modes can be on at once; without an opacity reset the lotus exit
    // icon is invisible and zen mode cannot be undone.
    const sidebarLeftRule = component.css.match(/\.sidebar\.left\s*\{([^}]*)\}/)?.[1] ?? ""
    assert.equal(sidebarLeftRule.includes("opacity: 1"), true)
  })

  test("GIVEN the css WHEN inspected THEN .sidebar.left ITSELF is never display:none (would hide the exit button)", () => {
    // Child-filter selectors (`.sidebar.left > ...`) may hide children; a rule
    // whose selector ENDS at .sidebar.left must not contain display: none.
    const sidebarLeftRules = [...component.css.matchAll(/\.sidebar\.left\s*\{([^}]*)\}/g)]
    assert.equal(
      sidebarLeftRules.some(([, body]) => body.includes("display: none")),
      false,
    )
  })
})

describe("ZenMode component — toggle script", () => {
  test("GIVEN beforeDOMLoaded WHEN inspected THEN it persists via localStorage under the zen-mode key", () => {
    const script = component.beforeDOMLoaded
    assert.equal(script.includes('localStorage.getItem("zen-mode")') && script.includes('localStorage.setItem("zen-mode"'), true)
  })

  test("GIVEN beforeDOMLoaded WHEN inspected THEN it re-binds on SPA nav/render with cleanup", () => {
    const script = component.beforeDOMLoaded
    assert.equal(
      script.includes('addEventListener("nav"') &&
        script.includes('addEventListener("render"') &&
        script.includes("window.addCleanup"),
      true,
    )
  })
})
