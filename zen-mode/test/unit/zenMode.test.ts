import assert from "node:assert/strict"
import { describe, test } from "node:test"
// Loading through the loader's fallback path proves the whole import chain is
// plain-Node-importable ESM (gotcha G6) — no TS/JSX anywhere.
import { ZenMode } from "../../components/index.js"

const component = ZenMode() as ((props: Record<string, unknown>) => unknown) & {
  css: string
  beforeDOMLoaded: string
}

/** The component renders a fragment of [zen-search, zenmode] buttons. */
function renderButtons(displayClass?: string): { type: string; props: { class: string } }[] {
  const vnode = component({ displayClass }) as {
    props: { children: { type: string; props: { class: string } }[] }
  }
  return vnode.props.children
}

describe("ZenMode component — rendering", () => {
  test("GIVEN the constructor WHEN instantiated THEN it renders a button with the zenmode class", () => {
    const zen = renderButtons().find((b) => b.props.class.includes("zenmode"))
    assert.deepEqual({ type: zen?.type, class: zen?.props.class }, { type: "button", class: "zenmode" })
  })

  test("GIVEN the constructor WHEN instantiated THEN it ALSO renders the zen-search button (search stays reachable in zen)", () => {
    const search = renderButtons().find((b) => b.props.class.includes("zen-search"))
    assert.deepEqual({ type: search?.type, class: search?.props.class }, { type: "button", class: "zen-search" })
  })

  test("GIVEN the buttons WHEN rendered THEN zenmode is LAST (rightmost — the lotus never moves)", () => {
    const classes = renderButtons().map((b) => b.props.class)
    assert.deepEqual(classes, ["zen-search", "zenmode"])
  })

  test("GIVEN a displayClass WHEN rendering THEN it is appended to each button class", () => {
    const classes = renderButtons("desktop-only").map((b) => b.props.class)
    assert.deepEqual(classes, ["zen-search desktop-only", "zenmode desktop-only"])
  })

  test("GIVEN the zenmode button WHEN rendered THEN it holds BOTH state glyphs (outline off / filled on, fullscreenmode pattern)", () => {
    const zen = renderButtons().find((b) => b.props.class.includes("zenmode")) as unknown as {
      props: { children: { props: { class: string } }[] }
    }
    assert.deepEqual(
      zen.props.children.map((glyph) => glyph.props.class),
      ["zenOffIcon", "zenOnIcon"],
    )
  })
})

describe("ZenMode component — CSS (the width reclaim)", () => {
  test("GIVEN the css WHEN inspected THEN rules key on the zen-mode root attribute", () => {
    assert.equal(component.css.includes(':root[zen-mode="on"]'), true)
  })

  test("GIVEN the css WHEN inspected THEN the grid collapses to a single column", () => {
    assert.equal(component.css.includes("grid-template-columns: auto"), true)
  })

  test("GIVEN the css WHEN zen is on THEN the outline glyph hides and the FILLED glyph shows (selected-state cue)", () => {
    assert.equal(
      component.css.includes(':root[zen-mode="on"] .zenmode .zenOffIcon') &&
        component.css.includes(':root[zen-mode="on"] .zenmode .zenOnIcon'),
      true,
    )
  })

  test("GIVEN the css WHEN inspected THEN all toolbar icon WRAPPERS except the zen slot AND fullscreen are hidden in zen", () => {
    // Wrapper-level (not content-level) hiding: emptied wrappers would keep
    // their flex-gap slots between the surviving icons. The fullscreen toggle
    // stacks with zen (ticket full-screen-mode.md) — it stays in the cluster.
    assert.equal(
      component.css.includes(
        ".flex-component > div:not(:has(.zenmode)):not(:has(.fullscreenmode))",
      ),
      true,
    )
  })

  test("GIVEN the css WHEN inspected THEN the zen-search icon is ALWAYS visible and LEFTMOST in the cluster", () => {
    // The plugin's shared Flex wrapper is dissolved (display: contents) so the
    // magnifier is its own flex item and order: -1 puts it first — a
    // permanently discoverable way into search, in and out of zen.
    // Every rule whose selector ends at .zen-search (includes the shared
    // .zenmode,.zen-search base rule): one must order it first, none may hide it.
    const zenSearchRules = [...component.css.matchAll(/\.zen-search\s*\{([^}]*)\}/g)].map(([, body]) => body)
    assert.equal(
      component.css.includes(".flex-component > div:has(> .zenmode) {\n  display: contents;") &&
        zenSearchRules.some((body) => body.includes("order: -1")) &&
        !zenSearchRules.some((body) => body.includes("display: none")),
      true,
    )
  })

  test("GIVEN the css WHEN inspected THEN the search ROOT stays renderable in zen (overlay must be able to appear)", () => {
    // The sidebar-children hiding rule must exempt .search; only the inline
    // full-width button is hidden. Without this, .search-container.active
    // sits under a display:none ancestor and search cannot open in zen.
    assert.equal(
      component.css.includes(".sidebar.left > *:not(.flex-component):not(.search)") &&
        component.css.includes(".sidebar.left > .search > .search-button"),
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

  test("GIVEN beforeDOMLoaded WHEN inspected THEN zen-search delegates to the REAL search button (single search implementation)", () => {
    const script = component.beforeDOMLoaded
    assert.equal(
      script.includes('getElementsByClassName("zen-search")') &&
        script.includes('document.querySelector(".search > .search-button")?.click()'),
      true,
    )
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
