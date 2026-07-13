import assert from "node:assert/strict"
import { describe, test } from "node:test"
// Loading through the loader's fallback path proves the whole import chain is
// plain-Node-importable ESM (gotcha G6) — no TS/JSX anywhere.
import { FullScreenMode } from "../../components/index.js"

const component = FullScreenMode() as ((props: Record<string, unknown>) => unknown) & {
  css: string
  beforeDOMLoaded: string
}

interface VNode {
  type: string
  props: { class: string; "aria-label"?: string; children: { props: { class: string } }[] }
}

describe("FullScreenMode component — rendering", () => {
  test("GIVEN the constructor WHEN instantiated THEN it renders a button with the fullscreenmode class", () => {
    const vnode = component({ displayClass: undefined }) as VNode
    assert.deepEqual(
      { type: vnode.type, class: vnode.props.class },
      { type: "button", class: "fullscreenmode" },
    )
  })

  test("GIVEN a displayClass WHEN rendering THEN it is appended to the button class", () => {
    const vnode = component({ displayClass: "desktop-only" }) as VNode
    assert.equal(vnode.props.class, "fullscreenmode desktop-only")
  })

  test("GIVEN the button WHEN rendered THEN it carries an aria-label (drives the engine's CSS hover tooltip)", () => {
    const vnode = component({}) as VNode
    assert.equal(vnode.props["aria-label"], "Full screen")
  })

  test("GIVEN the button WHEN rendered THEN it holds BOTH state glyphs (CSS shows one per mode, darkmode pattern)", () => {
    const vnode = component({}) as VNode
    assert.deepEqual(
      vnode.props.children.map((child) => child.props.class),
      ["fullscreenEnterIcon", "fullscreenExitIcon"],
    )
  })

  test("GIVEN the canvas viewer's fullscreen control WHEN compared THEN both render the SAME glyph pair (ref.ap.rv8cIwZWjlbPzjNjY1Dy4.E — duplicated across plugin packages, must stay in sync)", async () => {
    const { readFile } = await import("node:fs/promises")
    const canvasAppSource = await readFile(
      new URL("../../../canvas-plugin/viewer/canvasApp.jsx", import.meta.url),
      "utf8",
    )
    const vnode = component({}) as unknown as {
      props: { children: { props: { children: [unknown, { props: { d: string } }] } }[] }
    }
    for (const glyph of vnode.props.children) {
      const path = glyph.props.children[1].props.d
      assert.equal(canvasAppSource.includes(path), true, `canvasApp.jsx is missing glyph path [${path.slice(0, 40)}…]`)
    }
  })
})

describe("FullScreenMode component — CSS", () => {
  test("GIVEN the css WHEN inspected THEN glyph visibility keys on the full-screen-mode root attribute", () => {
    assert.equal(component.css.includes(':root[full-screen-mode="on"]'), true)
  })

  test("GIVEN the css WHEN inspected THEN the enter glyph hides while the mode is on", () => {
    assert.equal(
      component.css.includes(':root[full-screen-mode="on"] .fullscreenmode .fullscreenEnterIcon'),
      true,
    )
  })
})

describe("FullScreenMode component — toggle script", () => {
  test("GIVEN beforeDOMLoaded WHEN inspected THEN fullscreen targets the ROOT element (site-wide, survives SPA nav)", () => {
    assert.equal(
      component.beforeDOMLoaded.includes("document.documentElement.requestFullscreen()"),
      true,
    )
  })

  test("GIVEN beforeDOMLoaded WHEN inspected THEN the root attribute syncs from the browser's fullscreenchange (Esc-safe)", () => {
    assert.equal(component.beforeDOMLoaded.includes('addEventListener("fullscreenchange"'), true)
  })

  test("GIVEN beforeDOMLoaded WHEN inspected THEN state keys on <html>.matches(':fullscreen'), not on ANY fullscreen element (two-level design: canvas-level fullscreen must not flip the site mode)", () => {
    const script = component.beforeDOMLoaded
    assert.equal(
      script.includes('document.documentElement.matches(":fullscreen")') &&
        !script.includes("document.fullscreenElement !== null"),
      true,
    )
  })

  test("GIVEN beforeDOMLoaded WHEN inspected THEN it does NOT persist to localStorage (reload can never restore fullscreen without a gesture)", () => {
    assert.equal(component.beforeDOMLoaded.includes("localStorage"), false)
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
