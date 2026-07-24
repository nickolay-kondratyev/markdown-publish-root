#!/usr/bin/env node
/**
 * Extensive e2e of the React Flow canvas viewer: render fidelity for every
 * JSON Canvas node/edge feature, the two-click interaction model, pan/zoom/
 * minimap/controls, site-wide fullscreen (+ survival across SPA nav), canvas<->canvas
 * and canvas->note navigation, browser history, theming, and privacy.
 *
 * Run: `npm run test:e2e` (or directly). Exits non-zero on any failed check.
 * Screenshots -> .out/ (gitignored).
 */
import fs from "node:fs"
import path from "node:path"
import {
  buildTestVaultSite,
  docIdOf,
  ID_NAMESPACE_DIR,
  filterOwnErrors,
  launchBrowserPage,
  makeChecker,
  repoRoot,
  startPreview,
} from "./lib/e2eHarness.mjs"

const { check, summarize } = makeChecker()

// Stable-id slugs (plan/id-based-publishing.md) for every page this flow visits.
const MAIN_CANVAS_SLUG = `${ID_NAMESPACE_DIR}/${docIdOf("canvases/main.canvas")}.canvas`
const SECOND_CANVAS_SLUG = `${ID_NAMESPACE_DIR}/${docIdOf("canvases/second.canvas")}.canvas`
const SPARSE_CANVAS_SLUG = `${ID_NAMESPACE_DIR}/${docIdOf("canvases/sparse.canvas")}.canvas`
const GETTING_STARTED_SLUG = `${ID_NAMESPACE_DIR}/${docIdOf("notes/getting-started.md")}`
const ARCHITECTURE_SLUG = `${ID_NAMESPACE_DIR}/${docIdOf("notes/architecture.md")}`

console.log("building test-vault (canvases included)...")
const { siteDir } = await buildTestVaultSite("e2e-canvas-flow-site")
const { server, base } = await startPreview(siteDir)
console.log(`serving ${siteDir} at ${base}`)

const launched = await launchBrowserPage()
if (launched === undefined) {
  console.log("SKIP: headless browser flow (chromium not found)")
  await server.stop()
  process.exit(0)
}
const { browser, page, errors } = launched
fs.mkdirSync(path.join(repoRoot, ".out"), { recursive: true })
const shot = (name) => page.screenshot({ path: path.join(repoRoot, ".out", `e2e-canvas-flow-${name}.png`) })

const VIEWPORT_TRANSFORM = () =>
  page.evaluate(() => document.querySelector(".react-flow__viewport")?.style.transform ?? "")
const NODE = (id) => page.locator(`.react-flow__node[data-id="${id}"]`)

/** Wait for a canvas page's viewer to mount and its async fragment fetches to settle. */
async function waitForCanvas(nodeId) {
  await page.waitForSelector(`.react-flow__node[data-id="${nodeId}"]`, { timeout: 10000 })
  await page.waitForTimeout(900)
}

/**
 * The two-click model in action: first raw click SELECTS the card (the
 * click-guard swallows it), the second click lands on the link inside.
 */
async function twoClickOn(nodeId, linkSelector) {
  const node = NODE(nodeId)
  const box = await node.boundingBox()
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await page.waitForTimeout(300)
  const link = node.locator(linkSelector)
  const linkBox = await link.boundingBox()
  await page.mouse.click(linkBox.x + linkBox.width / 2, linkBox.y + linkBox.height / 2)
  await page.waitForTimeout(1200)
}

/** Drag on the pane (starting over the non-selectable group region). */
async function panPane(dx, dy) {
  await page.mouse.move(700, 250)
  await page.mouse.down()
  await page.mouse.move(700 + dx, 250 + dy, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(200)
}

// === Phase 1: render fidelity (no interactions yet) ==========================
await page.goto(`${base}/${MAIN_CANVAS_SLUG}`)
await waitForCanvas("text-welcome")
await page.evaluate(() => {
  window.__spaMarker = true
})

// Mistouch prevention MUST be probed before any click: wheel over the canvas
// on a fresh page does not zoom (the page keeps its scroll behavior).
const preWheel = await VIEWPORT_TRANSFORM()
await page.mouse.move(700, 400)
await page.mouse.wheel(0, -300)
await page.waitForTimeout(300)
check("mistouch: wheel before first click does NOT zoom", (await VIEWPORT_TRANSFORM()) === preWheel)

const dom = await page.evaluate(() => {
  const q = (selector) => [...document.querySelectorAll(selector)]
  const nodeEl = (id) => document.querySelector(`.react-flow__node[data-id="${CSS.escape(id)}"]`)
  const edgePath = (id) =>
    document.querySelector(`.react-flow__edge[data-id="${CSS.escape(id)}"] .react-flow__edge-path`)
  return {
    nodeIds: q(".react-flow__node").map((n) => n.getAttribute("data-id")).sort(),
    edgeIds: q(".react-flow__edge").map((n) => n.getAttribute("data-id")).sort(),
    edgeLabels: q(".react-flow__edge-text").map((t) => t.textContent).sort(),
    toCanvasMarkers: {
      end: edgePath("edge-to-canvas")?.getAttribute("marker-end") ?? "",
      start: edgePath("edge-to-canvas")?.getAttribute("marker-start") ?? "",
    },
    bothEndsMarkers: {
      end: edgePath("edge-both-ends")?.getAttribute("marker-end") ?? "",
      start: edgePath("edge-both-ends")?.getAttribute("marker-start") ?? "",
    },
    toCanvasStroke: edgePath("edge-to-canvas")?.style.stroke ?? "",
    welcomeColorVar: nodeEl("text-welcome")?.querySelector(".canvas-flow-card")?.style.getPropertyValue("--canvas-node-color") ?? "",
    hexColorVar: nodeEl("text-colors")?.querySelector(".canvas-flow-card")?.style.getPropertyValue("--canvas-node-color") ?? "",
    welcomeHtml: nodeEl("text-welcome")?.querySelector(".canvas-node-html")?.innerHTML ?? "",
    groupLabel: nodeEl("group-intro")?.querySelector(".canvas-group-label")?.textContent ?? "",
    groupZ: Number(nodeEl("group-intro")?.style.zIndex),
    welcomeZ: Number(nodeEl("text-welcome")?.style.zIndex),
    minimap: document.querySelector(".react-flow__minimap") !== null,
    attribution: document.querySelector(".react-flow__attribution") !== null,
    minimapNodes: q(".react-flow__minimap-node").length,
    controlTitles: q(".react-flow__controls button").map((b) => b.getAttribute("title")),
    linkHeaderHref: nodeEl("link-card")?.querySelector(".canvas-link-url")?.getAttribute("href") ?? "",
    linkCard: {
      // jsoncanvas.org is not a whitelisted embed provider -> link card, no iframe
      // (scripts/e2e-link-cards.mjs covers the embed/card matrix in depth).
      iframeCount: nodeEl("link-card")?.querySelectorAll("iframe").length ?? -1,
      cardHref: nodeEl("link-card")?.querySelector("a.canvas-link-card")?.getAttribute("href") ?? "",
      domainText: nodeEl("link-card")?.querySelector(".canvas-link-card-domain")?.textContent ?? "",
    },
    imageSrc: nodeEl("file-image")?.querySelector("img")?.getAttribute("src") ?? "",
    imageFit: getComputedStyle(nodeEl("file-image")?.querySelector("img")).objectFit,
    privateText: nodeEl("file-private")?.textContent?.trim() ?? "",
    bodyHasPrivatePath: document.body.innerHTML.includes("private-secret"),
    bodyHasSentinel: document.body.innerHTML.includes("LEAK-SENTINEL-9f3a72"),
    noteFullText: nodeEl("file-note-full")?.textContent ?? "",
    noteHeaderHref: nodeEl("file-note-full")?.querySelector(".canvas-note-open")?.getAttribute("href") ?? "",
    subpathHeader: nodeEl("file-note-subpath")?.querySelector(".canvas-note-open")?.textContent ?? "",
    subpathText: nodeEl("file-note-subpath")?.textContent ?? "",
    usageText: nodeEl("file-note-usage")?.textContent ?? "",
  }
})

check(
  "all 11 nodes render with their JSON Canvas ids",
  JSON.stringify(dom.nodeIds) ===
    JSON.stringify(
      [
        "group-intro", "text-welcome", "text-colors", "file-note-full", "file-note-subpath",
        "file-note-usage", "file-image", "file-private", "file-canvas-card", "link-card",
        // Card pointing at the URL-canvas fixture (canvases/impl/Canvas With Url.canvas).
        "3c0efaf16624d732",
      ].sort(),
    ),
  dom.nodeIds.join(","),
)
check(
  "all 5 edges render",
  JSON.stringify(dom.edgeIds) ===
    JSON.stringify(["edge-welcome-note", "edge-subpath", "edge-to-canvas", "edge-private", "edge-both-ends"].sort()),
  dom.edgeIds.join(","),
)
check(
  "edge labels render as DOM text",
  JSON.stringify(dom.edgeLabels) ===
    JSON.stringify(
      ["embeds note", "only #Installation", "go to second canvas", "private placeholder", "reversed arrow"].sort(),
    ),
  dom.edgeLabels.join(","),
)
check(
  "edge fromEnd:'none' + toEnd:'arrow' -> arrow at destination only",
  dom.toCanvasMarkers.end.startsWith("url(") && dom.toCanvasMarkers.start === "",
  JSON.stringify(dom.toCanvasMarkers),
)
check(
  "edge fromEnd:'arrow' + toEnd:'none' -> arrow at source only (fidelity the old renderer lacked)",
  dom.bothEndsMarkers.start.startsWith("url(") && dom.bothEndsMarkers.end === "",
  JSON.stringify(dom.bothEndsMarkers),
)
check("edge preset color '5' resolves to the cyan stroke", dom.toCanvasStroke.includes("#53dfdd") || dom.toCanvasStroke.includes("83, 223, 221"), dom.toCanvasStroke)
check("node preset color '1' resolves on the card", dom.welcomeColorVar.trim() === "#fb464c", dom.welcomeColorVar)
check("node hex color passes through", dom.hexColorVar.trim() === "#8a2be2", dom.hexColorVar)
check("text card carries prebaked HTML with resolved wikilink", dom.welcomeHtml.includes(`href="../${GETTING_STARTED_SLUG}"`))
check("group renders its label", dom.groupLabel === "Intro Group")
check("group stays behind its members (z-order = array order)", dom.groupZ < dom.welcomeZ, `${dom.groupZ} vs ${dom.welcomeZ}`)
check("minimap present with node dots", dom.minimap && dom.minimapNodes >= 8, `nodes=${dom.minimapNodes}`)
check("React Flow attribution banner is hidden (proOptions.hideAttribution)", !dom.attribution)
check(
  "controls: zoom in/out, fit view — and NO fullscreen (the screen-mode switcher owns it)",
  JSON.stringify(dom.controlTitles) === JSON.stringify(["Zoom In", "Zoom Out", "Fit View"]),
  dom.controlTitles.join(","),
)
check("link card shows the URL affordance", dom.linkHeaderHref === "https://jsoncanvas.org/")
check(
  "non-framable link renders a link card (no iframe -> no browser error frame)",
  // Footer shows og:site_name when the live metadata fetch succeeded, the raw
  // domain otherwise — non-empty covers both (offline builds stay green).
  dom.linkCard.iframeCount === 0 &&
    dom.linkCard.cardHref === "https://jsoncanvas.org/" &&
    dom.linkCard.domainText.trim() !== "",
  JSON.stringify(dom.linkCard),
)
check("image card resolved through attachments map", dom.imageSrc.includes("attachments/diagram.png"))
check("image fits inside its card (object-fit contain)", dom.imageFit === "contain")
check("private card is a contentless placeholder", dom.privateText === "Private note")
check("no private vault path anywhere in the DOM", !dom.bodyHasPrivatePath)
check("no leak sentinel anywhere in the DOM", !dom.bodyHasSentinel)
check("note card fetched its prerendered fragment", dom.noteFullText.includes("pure build engine"))
check("open-note affordance targets the note page", dom.noteHeaderHref === `../${ARCHITECTURE_SLUG}`)
check("subpath header shows 'title > subpath'", dom.subpathHeader === "Getting Started > Installation")
check(
  "subpath card renders ONLY the referenced section",
  dom.subpathText.includes("Installation is easy") && !dom.subpathText.includes("Advanced tips"),
)
// Two cards embed the SAME note with different subpaths — fragments are per
// NODE, so each card must show its own section (regression: per-file map).
check(
  "same note twice: #Usage card renders ONLY its own section",
  dom.usageText.includes("Basic usage instructions") && !dom.usageText.includes("Installation is easy"),
)
await shot("main")

// === Phase 2: selection + viewport interactions ==============================
const welcome = NODE("text-welcome")
check("unselected card has its click-guard", (await welcome.locator('[data-testid="click-guard"]').count()) === 1)
const welcomeBox = await welcome.boundingBox()
await page.mouse.click(welcomeBox.x + welcomeBox.width / 2, welcomeBox.y + welcomeBox.height / 2)
await page.waitForTimeout(300)
check("first click selects the card", await welcome.evaluate((el) => el.classList.contains("selected")))
check("selection lifts the click-guard", (await welcome.locator('[data-testid="click-guard"]').count()) === 0)

const mount = await page.locator(".canvas-page-mount").boundingBox()
await page.mouse.click(mount.x + mount.width / 2, mount.y + 12) // empty pane above the group
await page.waitForTimeout(300)
check("pane click deselects (guard returns)", (await welcome.locator('[data-testid="click-guard"]').count()) === 1)

const beforePan = await VIEWPORT_TRANSFORM()
await panPane(120, 90)
check("dragging the pane pans the viewport", (await VIEWPORT_TRANSFORM()) !== beforePan)

const beforeZoom = await VIEWPORT_TRANSFORM()
await page.click('.react-flow__controls button[title="Zoom In"]')
await page.waitForTimeout(400)
const zoomed = await VIEWPORT_TRANSFORM()
check("zoom-in control zooms", zoomed !== beforeZoom)

await page.click('.react-flow__controls button[title="Fit View"]')
await page.waitForTimeout(400)
const afterFit = await VIEWPORT_TRANSFORM()
check("fit-view control re-frames the canvas", afterFit !== "" && afterFit !== zoomed)

const beforeWheel = await VIEWPORT_TRANSFORM()
await page.mouse.move(700, 400)
await page.mouse.wheel(0, -300)
await page.waitForTimeout(300)
check("mistouch gate lifted: wheel zooms after interacting", (await VIEWPORT_TRANSFORM()) !== beforeWheel)

// === Phase 3: screen modes on a canvas page (docs-internal/tickets/mode-switcher.md)
// The screen-mode radio in the corner cluster owns fullscreen; "Canvas full
// screen" = html fullscreen + CSS-expanded mount. The full state matrix lives
// in e2e-screen-mode.mjs — this phase covers the canvas-page specifics.
const selectScreenMode = async (value) => {
  await page.click('.mode-switcher[data-group="screen"] .mode-switcher-trigger')
  await page.click(`.mode-switcher[data-group="screen"] .mode-switcher-option[data-value="${value}"]`)
  await page.waitForTimeout(500) // fullscreen transitions settle async
}
const mountCoversViewport = () =>
  page.evaluate(() => {
    const rect = document.querySelector("[data-canvas-mount]")?.getBoundingClientRect()
    return (
      rect !== undefined &&
      rect.width >= window.innerWidth - 1 &&
      rect.height >= window.innerHeight - 1
    )
  })
check("screen-mode switcher present on canvas pages", (await page.locator('.mode-switcher[data-group="screen"]').count()) === 1)

await selectScreenMode("fullscreen-canvas")
check(
  "Canvas full screen: <html> is the (one) fullscreen element",
  await page.evaluate(() => document.fullscreenElement === document.documentElement),
)
check("Canvas full screen: the mount expands over the viewport (pure CSS)", await mountCoversViewport())
check(
  "Canvas full screen: the switcher stays visible ABOVE the expanded mount (exit affordance)",
  await page.evaluate(() => {
    const rect = document
      .querySelector('.mode-switcher[data-group="screen"] .mode-switcher-trigger')
      ?.getBoundingClientRect()
    return rect !== undefined && rect.width > 0 && rect.x > window.innerWidth / 2 && rect.y < 100
  }),
)
await shot("canvas-expanded")

await selectScreenMode("fullscreen")
check(
  "Downshift to Full screen: html stays fullscreen, mount collapses back",
  (await page.evaluate(() => document.documentElement.matches(":fullscreen"))) &&
    !(await mountCoversViewport()),
)
await selectScreenMode("normal")
check("Normal: fullscreen exits", await page.evaluate(() => document.fullscreenElement === null))

// === Phase 4: navigation ======================================================
await page.click('.react-flow__controls button[title="Fit View"]')
await page.waitForTimeout(300)
await panPane(-250, -200) // clear file-canvas-card from under the minimap overlay
await twoClickOn("file-canvas-card", "a.canvas-card-link")
await waitForCanvas("text-second")
check("canvas card navigates to the second canvas", page.url().endsWith(`/${SECOND_CANVAS_SLUG}`))
check("navigation was SPA (no full reload)", await page.evaluate(() => window.__spaMarker === true))
await shot("second")

// Canvas-full-screen retention across canvas->canvas SPA navigation needs no
// machinery anymore: html-level fullscreen and the screen-mode attribute both
// live on <html>, which the SPA swap never touches — the CSS expansion simply
// applies to the next canvas page's mount.
await selectScreenMode("fullscreen-canvas")
await twoClickOn("file-back", "a.canvas-card-link")
await waitForCanvas("text-welcome")
check("back-navigation lands on main", page.url().endsWith(`/${MAIN_CANVAS_SLUG}`))
check(
  "canvas full screen RETAINED across canvas->canvas SPA navigation",
  (await page.evaluate(() => document.documentElement.matches(":fullscreen"))) &&
    (await mountCoversViewport()),
)
await shot("fullscreen-main")
await selectScreenMode("normal")

// browser history: back button re-mounts the previous canvas via popstate
await page.goBack()
await waitForCanvas("text-second")
check("browser back re-mounts the previous canvas", page.url().endsWith(`/${SECOND_CANVAS_SLUG}`))

// wikilink INSIDE a text card navigates (two-click)
await twoClickOn("text-second", `a.internal[href*="${docIdOf("canvases/main.canvas")}"]`)
await waitForCanvas("text-welcome")
check("wikilink inside a text card navigates to the linked canvas", page.url().endsWith(`/${MAIN_CANVAS_SLUG}`))

// open-note affordance leaves canvas -> viewer unmounts cleanly
await twoClickOn("file-note-full", "a.canvas-note-open")
await page.waitForTimeout(500)
check("open-note affordance navigates to the note page", page.url().endsWith(`/${ARCHITECTURE_SLUG}`))
check("viewer unmounts on non-canvas pages", await page.evaluate(() => document.querySelector(".react-flow") === null))
await page.goBack()
await waitForCanvas("text-welcome")
check("returning from the note re-mounts the canvas", (await NODE("text-welcome").count()) === 1)

// === Phase 5: theming =========================================================
const canvasBg = () =>
  page.evaluate(() => getComputedStyle(document.querySelector(".canvas-flow-viewer .react-flow")).backgroundColor)
const lightBg = await canvasBg()
await page.evaluate(() => {
  document.documentElement.setAttribute("saved-theme", "dark")
  document.dispatchEvent(new CustomEvent("themechange", { detail: { theme: "dark" } }))
})
await page.waitForTimeout(400)
check("themechange -> dark restyles the canvas", (await canvasBg()) !== lightBg)
await shot("dark")
await page.evaluate(() => {
  document.documentElement.setAttribute("saved-theme", "light")
  document.dispatchEvent(new CustomEvent("themechange", { detail: { theme: "light" } }))
})
await page.waitForTimeout(400)
check("themechange -> light restores", (await canvasBg()) === lightBg)

// === Phase 6: sparse canvas — fitting must never zoom IN past 1:1 ===========
// A one-card canvas would fill the screen at React Flow's default maxZoom (20);
// both the initial fit AND the Fit View control must cap at 1:1.
const zoomOf = (transform) => Number(/scale\(([\d.]+)\)/.exec(transform)?.[1] ?? NaN)
await page.goto(`${base}/${SPARSE_CANVAS_SLUG}`)
await waitForCanvas("text-lonely")
check("sparse canvas: initial fit capped at 1:1", zoomOf(await VIEWPORT_TRANSFORM()) <= 1, await VIEWPORT_TRANSFORM())
await page.click('.react-flow__controls button[title="Zoom Out"]')
await page.waitForTimeout(300)
await page.click('.react-flow__controls button[title="Fit View"]')
await page.waitForTimeout(400)
check("sparse canvas: RE-fit via the control capped at 1:1", zoomOf(await VIEWPORT_TRANSFORM()) <= 1, await VIEWPORT_TRANSFORM())

// === Phase 7: collapsible minimap (global preference across canvases) ========
const minimapPresent = () => page.evaluate(() => document.querySelector(".react-flow__minimap") !== null)
const toggleTitle = () =>
  page.evaluate(() => document.querySelector(".canvas-flow-minimap-toggle")?.getAttribute("title") ?? "")
check("minimap toggle affords collapsing while expanded", (await toggleTitle()) === "Hide minimap")
await page.click(".canvas-flow-minimap-toggle")
await page.waitForTimeout(200)
check("collapsing removes the minimap", !(await minimapPresent()))
check("collapsed toggle affords expanding", (await toggleTitle()) === "Show minimap")
await shot("minimap-collapsed")

// The preference is GLOBAL: it must follow the user onto a different canvas.
await page.goto(`${base}/${MAIN_CANVAS_SLUG}`)
await waitForCanvas("text-welcome")
check("collapsed preference sticks on another canvas", !(await minimapPresent()))
check(
  "collapsed preference persisted to localStorage",
  (await page.evaluate(() => localStorage.getItem("canvas-minimap"))) === "collapsed",
)
await page.click(".canvas-flow-minimap-toggle")
await page.waitForTimeout(200)
check("expanding restores the minimap at its original size", await minimapPresent())
check(
  "expanded preference persisted to localStorage",
  (await page.evaluate(() => localStorage.getItem("canvas-minimap"))) === "expanded",
)

// === Phase 8: our origin stayed error-free ===================================
const ownErrors = filterOwnErrors(errors, base)
check("no console/page errors from our origin", ownErrors.length === 0, ownErrors.join(" | "))

await browser.close()
await server.stop()
process.exit(summarize())
