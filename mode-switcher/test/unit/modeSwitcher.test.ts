import assert from "node:assert/strict"
import { describe, test } from "node:test"
// Loading through the loader's fallback path proves the whole import chain is
// plain-Node-importable ESM (gotcha G6) — no TS/JSX anywhere.
import { ModeSwitcher } from "../../components/index.js"

const component = ModeSwitcher() as ((props: Record<string, unknown>) => unknown) & {
  css: string
  beforeDOMLoaded: string
}

interface VNode {
  type: string
  props: Record<string, unknown> & { class?: string; children?: VNode | VNode[] }
}

function children(vnode: VNode): VNode[] {
  const child = vnode.props.children
  if (child === undefined) return []
  return Array.isArray(child) ? child : [child]
}

/** The component renders a fragment of [mode-search, reading group, screen group]. */
function renderItems(displayClass?: string): VNode[] {
  const vnode = component({ displayClass }) as VNode
  return children(vnode)
}

function groupOf(items: VNode[], group: string): VNode {
  const found = items.find((item) => item.props["data-group"] === group)
  assert.notEqual(found, undefined, `no .mode-switcher[data-group="${group}"] rendered`)
  return found as VNode
}

function optionsOf(groupNode: VNode): VNode[] {
  const popover = children(groupNode).find((child) =>
    (child.props.class ?? "").includes("mode-switcher-popover"),
  ) as VNode
  return children(popover)
}

describe("ModeSwitcher component — rendering", () => {
  test("GIVEN the constructor WHEN instantiated THEN it renders [mode-search, reading group, screen group] in that order", () => {
    const classes = renderItems().map((item) => item.props.class)
    assert.deepEqual(classes, ["mode-search", "mode-switcher", "mode-switcher"])
  })

  test("GIVEN a displayClass WHEN rendering THEN it is appended to every top-level item", () => {
    const classes = renderItems("desktop-only").map((item) => item.props.class)
    assert.deepEqual(classes, [
      "mode-search desktop-only",
      "mode-switcher desktop-only",
      "mode-switcher desktop-only",
    ])
  })

  test("GIVEN the reading group WHEN rendered THEN its popover offers exactly plain/reader/zen radio rows", () => {
    const options = optionsOf(groupOf(renderItems(), "reading"))
    assert.deepEqual(
      options.map((option) => ({ role: option.props.role, value: option.props["data-value"] })),
      [
        { role: "menuitemradio", value: "plain" },
        { role: "menuitemradio", value: "reader" },
        { role: "menuitemradio", value: "zen" },
      ],
    )
  })

  test("GIVEN the screen group WHEN rendered THEN its popover offers exactly normal/fullscreen/fullscreen-canvas radio rows", () => {
    const options = optionsOf(groupOf(renderItems(), "screen"))
    assert.deepEqual(
      options.map((option) => option.props["data-value"]),
      ["normal", "fullscreen", "fullscreen-canvas"],
    )
  })

  test("GIVEN every screen option WHEN rendered on any page type THEN none is conditionally omitted (all three always offered)", () => {
    // Approved requirement: the choices must not change between markdown and
    // canvas pages — users should never wonder why an option (dis)appeared.
    const options = optionsOf(groupOf(renderItems(), "screen"))
    assert.equal(options.length, 3)
  })

  test("GIVEN a trigger WHEN rendered THEN it carries the popup affordance aria wiring (label, haspopup, collapsed)", () => {
    const trigger = children(groupOf(renderItems(), "reading"))[0]
    assert.deepEqual(
      {
        label: trigger.props["aria-label"],
        haspopup: trigger.props["aria-haspopup"],
        expanded: trigger.props["aria-expanded"],
      },
      { label: "Reading mode", haspopup: "menu", expanded: "false" },
    )
  })

  test("GIVEN a trigger WHEN rendered THEN it holds one glyph per mode and nothing else (CSS shows exactly one glyph)", () => {
    const trigger = children(groupOf(renderItems(), "screen"))[0]
    assert.deepEqual(
      children(trigger).map((svg) => svg.props.class),
      [
        "trigger-glyph trigger-glyph--normal",
        "trigger-glyph trigger-glyph--fullscreen",
        "trigger-glyph trigger-glyph--fullscreen-canvas",
      ],
    )
  })

  test("GIVEN popover rows WHEN rendered THEN each has a visible text label (accessible name WITHOUT aria-label — the cluster tooltip keys on aria-label)", () => {
    const options = optionsOf(groupOf(renderItems(), "reading"))
    const labels = options.map(
      (option) =>
        children(option).find((child) => (child.props.class ?? "").includes("option-label"))
          ?.props.children,
    )
    assert.deepEqual(labels, ["Plain", "Reader", "Zen"])
    assert.equal(
      options.some((option) => option.props["aria-label"] !== undefined),
      false,
    )
  })

  test("GIVEN the default modes WHEN rendered THEN their rows are pre-checked (plain + normal)", () => {
    const items = renderItems()
    const checkedValues = ["reading", "screen"].flatMap((group) =>
      optionsOf(groupOf(items, group))
        .filter((option) => option.props["aria-checked"] === "true")
        .map((option) => option.props["data-value"]),
    )
    assert.deepEqual(checkedValues, ["plain", "normal"])
  })
})

describe("ModeSwitcher component — CSS (cluster + popover)", () => {
  test("GIVEN the css WHEN inspected THEN it keys ONLY on the new attributes (no legacy zen-mode/reader-mode selectors)", () => {
    assert.equal(
      component.css.includes(":root[reading-mode=") &&
        component.css.includes(":root[screen-mode=") &&
        !component.css.includes("zen-mode=") &&
        !component.css.includes("reader-mode="),
      true,
    )
  })

  test("GIVEN the css WHEN inspected THEN each mode's trigger glyph shows under its root attribute", () => {
    const rules = [
      ':root[reading-mode="zen"] .mode-switcher[data-group="reading"] .trigger-glyph--zen',
      ':root[screen-mode="fullscreen-canvas"] .mode-switcher[data-group="screen"] .trigger-glyph--fullscreen-canvas',
    ]
    assert.equal(rules.every((rule) => component.css.includes(rule)), true)
  })

  test("GIVEN the css WHEN inspected THEN the selected popover row is highlighted and swaps to its FILL glyph", () => {
    const row =
      ':root[reading-mode="reader"] .mode-switcher[data-group="reading"] .mode-switcher-option[data-value="reader"]'
    assert.equal(
      component.css.includes(`${row} {\n  background-color: var(--highlight);`) &&
        component.css.includes(`${row} .option-glyph--fill {\n  display: block;`),
      true,
    )
  })

  test("GIVEN the css WHEN inspected THEN the popover only shows while its switcher is open", () => {
    assert.equal(
      component.css.includes(".mode-switcher-popover {\n  display: none;") &&
        component.css.includes(".mode-switcher[data-open] .mode-switcher-popover {\n  display: flex;"),
      true,
    )
  })

  test("GIVEN the css WHEN inspected THEN the mode-search icon is ALWAYS visible and LEFTMOST in the cluster", () => {
    // The plugin's shared Flex wrapper is dissolved (display: contents) so the
    // magnifier is its own flex item and order: -1 puts it first — a
    // permanently discoverable way into search, in every mode.
    const searchRules = [...component.css.matchAll(/\.mode-search\s*\{([^}]*)\}/g)].map(([, body]) => body)
    assert.equal(
      component.css.includes(".flex-component > div:has(> .mode-search) {\n  display: contents;") &&
        searchRules.some((body) => body.includes("order: -1")) &&
        !searchRules.some((body) => body.includes("display: none")),
      true,
    )
  })

  test("GIVEN reading modes WHEN active THEN cluster wrappers WITHOUT switcher content hide (darkmode) while both switchers survive", () => {
    assert.equal(
      component.css.includes(
        ".flex-component > div:not(:has(.mode-search)):not(:has(.mode-switcher))",
      ),
      true,
    )
  })
})

describe("ModeSwitcher component — CSS (zen width reclaim, ported from zen-mode)", () => {
  test("GIVEN the css WHEN inspected THEN the grid collapses to a single column under reading-mode=zen", () => {
    const gridRule =
      component.css.match(/:root\[reading-mode="zen"\] \.page > #quartz-body\s*\{([^}]*)\}/)?.[1] ?? ""
    assert.equal(gridRule.includes("grid-template-columns: auto"), true)
  })

  test("GIVEN base's 5px grid row-gap WHEN zen leaves the trailing grid rows empty THEN the gap is zeroed (no dead scroll at the page bottom)", () => {
    const gridRule =
      component.css.match(/:root\[reading-mode="zen"\] \.page > #quartz-body\s*\{([^}]*)\}/)?.[1] ?? ""
    assert.equal(gridRule.includes("row-gap: 0"), true)
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

  test("GIVEN the css WHEN inspected THEN the zen exit cluster pins to the top-RIGHT corner", () => {
    const sidebarLeftRule =
      component.css.match(/:root\[reading-mode="zen"\] #quartz-body \.sidebar\.left\s*\{([^}]*)\}/)?.[1] ?? ""
    assert.equal(sidebarLeftRule.includes("right: 0") && sidebarLeftRule.includes("left: auto"), true)
  })

  test("GIVEN the css WHEN inspected THEN the article/footer divider and breadcrumbs hide in zen", () => {
    assert.equal(
      component.css.includes(':root[reading-mode="zen"] .center > hr') &&
        component.css.includes(':root[reading-mode="zen"] .center .breadcrumb-container'),
      true,
    )
  })

  test("GIVEN base's 6rem sidebar-clearing top margin WHEN zen removes the sidebars THEN the page header is pulled up to reclaim the vertical space", () => {
    const headerRule =
      component.css.match(/:root\[reading-mode="zen"\] #quartz-body \.page-header\s*\{([^}]*)\}/)?.[1] ?? ""
    assert.equal(headerRule.includes("margin-top: 2rem"), true)
  })

  test("GIVEN the css WHEN inspected THEN .sidebar.left ITSELF is never display:none (would hide the exit cluster)", () => {
    // Child-filter selectors (`.sidebar.left > ...`) may hide children; a rule
    // whose selector ENDS at .sidebar.left must not contain display: none.
    const sidebarLeftRules = [...component.css.matchAll(/\.sidebar\.left\s*\{([^}]*)\}/g)]
    assert.equal(
      sidebarLeftRules.some(([, body]) => body.includes("display: none")),
      false,
    )
  })
})

describe("ModeSwitcher component — CSS (canvas full screen chrome)", () => {
  test("GIVEN the expanded canvas mount (z-index 1) WHEN fullscreen-canvas is active on a canvas page THEN the sticky sidebar's stacking context lifts ABOVE it (cluster stays clickable)", () => {
    const rule =
      component.css.match(
        /:root\[screen-mode="fullscreen-canvas"\] #quartz-body:has\(\.canvas-page\) \.sidebar\.left\s*\{([^}]*)\}/,
      )?.[1] ?? ""
    assert.equal(rule.includes("z-index: 2"), true)
  })

  test("GIVEN the lifted sidebar WHEN fullscreen-canvas is active THEN its non-cluster chrome hides (nothing floats over the canvas, search overlay stays openable)", () => {
    assert.equal(
      component.css.includes(
        ':root[screen-mode="fullscreen-canvas"] #quartz-body:has(.canvas-page) .sidebar.left > *:not(.flex-component):not(.search)',
      ),
      true,
    )
  })
})

describe("ModeSwitcher component — CSS (reader dim, owned from the retired vendored plugin)", () => {
  test("GIVEN reading-mode=reader WHEN active THEN sidebar chrome dims but the cluster is exempt (exit affordance stays visible)", () => {
    assert.equal(
      component.css.includes(
        ':root[reading-mode="reader"] .sidebar.left > *:not(.flex-component)',
      ) && component.css.includes(':root[reading-mode="reader"] .sidebar.right'),
      true,
    )
  })

  test("GIVEN the dimmed sidebar WHEN hovered THEN it reveals (opacity restored)", () => {
    assert.equal(
      component.css.includes(
        ':root[reading-mode="reader"] .sidebar.left:hover > *:not(.flex-component)',
      ),
      true,
    )
  })

  test("GIVEN the search overlay is open in reader mode THEN its dimmed ancestor is forced opaque (touch devices have no hover)", () => {
    assert.equal(
      component.css.includes(
        ':root[reading-mode="reader"] .sidebar.left > .search:has(.search-container.active)',
      ),
      true,
    )
  })
})

describe("ModeSwitcher component — client script", () => {
  const script = component.beforeDOMLoaded

  test("GIVEN beforeDOMLoaded WHEN inspected THEN reading-mode restores from localStorage pre-paint with value validation", () => {
    assert.equal(
      script.includes('localStorage.getItem("reading-mode")') &&
        script.includes('localStorage.setItem("reading-mode"') &&
        script.includes('["plain","reader","zen"]'),
      true,
    )
  })

  test("GIVEN beforeDOMLoaded WHEN inspected THEN screen-mode initializes to normal and is NEVER stored (fullscreen cannot survive a reload)", () => {
    assert.equal(
      script.includes('setAttribute("screen-mode", "normal")') &&
        !script.includes('localStorage.setItem("screen-mode"') &&
        !script.includes('localStorage.getItem("screen-mode")'),
      true,
    )
  })

  test("GIVEN the fullscreen sync WHEN inspected THEN it keys on <html>.matches(':fullscreen') and resets the intent to normal", () => {
    assert.equal(
      script.includes('addEventListener("fullscreenchange"') &&
        script.includes('document.documentElement.matches(":fullscreen")'),
      true,
    )
  })

  test("GIVEN a fullscreen mode selection WHEN applied THEN fullscreen is requested on documentElement (site level, the ONLY API level)", () => {
    assert.equal(script.includes("document.documentElement.requestFullscreen()"), true)
  })

  test("GIVEN mode changes WHEN applied THEN they announce via readingmodechange/screenmodechange CustomEvents", () => {
    assert.equal(
      script.includes('"readingmodechange"') && script.includes('"screenmodechange"'),
      true,
    )
  })

  test("GIVEN beforeDOMLoaded WHEN inspected THEN mode-search delegates to the REAL search button (single search implementation)", () => {
    assert.equal(
      script.includes('getElementsByClassName("mode-search")') &&
        script.includes('document.querySelector(".search > .search-button")?.click()'),
      true,
    )
  })

  test("GIVEN beforeDOMLoaded WHEN inspected THEN popovers close on outside click and Escape", () => {
    assert.equal(
      script.includes('addEventListener("click", onDocumentClick)') &&
        script.includes('event.key === "Escape"'),
      true,
    )
  })

  test("GIVEN beforeDOMLoaded WHEN inspected THEN it re-binds on SPA nav/render with cleanup", () => {
    assert.equal(
      script.includes('addEventListener("nav"') &&
        script.includes('addEventListener("render"') &&
        script.includes("window.addCleanup"),
      true,
    )
  })
})
