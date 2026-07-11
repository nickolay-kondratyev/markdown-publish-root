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
  filterOwnErrors,
  launchBrowserPage,
  makeChecker,
  repoRoot,
  startPreview,
} from "./lib/e2eHarness.mjs"

const { check, summarize } = makeChecker()

// Stable-id slugs (plan/id-based-publishing.md) for every page this flow visits.
const MAIN_CANVAS_SLUG = `n/${docIdOf("canvases/main.canvas")}.canvas`
const SECOND_CANVAS_SLUG = `n/${docIdOf("canvases/second.canvas")}.canvas`
const SPARSE_CANVAS_SLUG = `n/${docIdOf("canvases/sparse.canvas")}.canvas`
const GETTING_STARTED_SLUG = `n/${docIdOf("notes/getting-started.md")}`
const ARCHITECTURE_SLUG = `n/${docIdOf("notes/architecture.md")}`

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
    minimapNodes: q(".react-flow__minimap-node").length,
    controlTitles: q(".react-flow__controls button").map((b) => b.getAttribute("title")),
    linkHeaderHref: nodeEl("link-card")?.querySelector(".canvas-link-url")?.getAttribute("href") ?? "",
    linkIframe: {
      src: nodeEl("link-card")?.querySelector("iframe")?.getAttribute("src") ?? "",
      sandbox: nodeEl("link-card")?.querySelector("iframe")?.getAttribute("sandbox") ?? "",
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
  "all 10 nodes render with their JSON Canvas ids",
  JSON.stringify(dom.nodeIds) ===
    JSON.stringify(
      [
        "group-intro", "text-welcome", "text-colors", "file-note-full", "file-note-subpath",
        "file-note-usage", "file-image", "file-private", "file-canvas-card", "link-card",
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
check(
  "controls: zoom in/out, fit view, canvas fullscreen (the INNER fullscreen level)",
  JSON.stringify(dom.controlTitles) ===
    JSON.stringify(["Zoom In", "Zoom Out", "Fit View", "Enter canvas fullscreen"]),
  dom.controlTitles.join(","),
)
check("link card shows the URL affordance", dom.linkHeaderHref === "https://jsoncanvas.org/")
check(
  "link card embeds the page in a sandboxed iframe",
  dom.linkIframe.src === "https://jsoncanvas.org/" && dom.linkIframe.sandbox.includes("allow-scripts"),
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

// === Phase 3: the TWO fullscreen levels (ticket full-screen-mode.md) =========
// OUTER: site-wide toolbar toggle (<html>). INNER: React Flow control (mount).
check("fullscreen toolbar icon present on canvas pages", (await page.locator("button.fullscreenmode").count()) === 1)

// -- outer level alone
await page.click("button.fullscreenmode")
await page.waitForTimeout(500)
check(
  "OUTER: toolbar toggle fullscreens <html> (site-wide)",
  await page.evaluate(() => document.fullscreenElement === document.documentElement),
)
check(
  "OUTER: root attribute mirrors the mode",
  await page.evaluate(() => document.documentElement.getAttribute("full-screen-mode") === "on"),
)
check(
  "OUTER: fullscreen icon still visible top-right while fullscreen (exit affordance)",
  await page.evaluate(() => {
    const rect = document.querySelector("button.fullscreenmode")?.getBoundingClientRect()
    return rect !== undefined && rect.width > 0 && rect.x > window.innerWidth / 2 && rect.y < 100
  }),
)

// -- inner level NESTED on top of the outer (the Fullscreen API stacks)
await page.click(".canvas-flow-fullscreen")
await page.waitForTimeout(500)
check(
  "NESTED: canvas control fullscreens the MOUNT on top of the site level",
  await page.evaluate(() => document.fullscreenElement?.hasAttribute("data-canvas-mount") ?? false),
)
check(
  "NESTED: site mode attribute STAYS on (<html> is still in the fullscreen stack)",
  await page.evaluate(() => document.documentElement.getAttribute("full-screen-mode") === "on"),
)
await shot("nested-fullscreen")
await page.click(".canvas-flow-fullscreen")
await page.waitForTimeout(400)
check(
  "NESTED: exiting the canvas level pops BACK to the fullscreen <html>, not to windowed",
  await page.evaluate(() => document.fullscreenElement === document.documentElement),
)
await page.click("button.fullscreenmode")
await page.waitForTimeout(400)
check("OUTER: toolbar toggle exits", await page.evaluate(() => document.fullscreenElement === null))

// -- inner level alone (site mode off)
await page.click(".canvas-flow-fullscreen")
await page.waitForTimeout(500)
check(
  "INNER alone: fullscreen enters on the canvas mount",
  await page.evaluate(() => document.fullscreenElement?.hasAttribute("data-canvas-mount") ?? false),
)
check(
  "INNER alone: site mode attribute stays OFF (levels are independent)",
  await page.evaluate(() => document.documentElement.getAttribute("full-screen-mode") === "off"),
)
await page.click(".canvas-flow-fullscreen")
await page.waitForTimeout(400)
check("INNER alone: canvas toggle exits", await page.evaluate(() => document.fullscreenElement === null))

// === Phase 4: navigation ======================================================
await page.click('.react-flow__controls button[title="Fit View"]')
await page.waitForTimeout(300)
await panPane(-250, -200) // clear file-canvas-card from under the minimap overlay
await twoClickOn("file-canvas-card", "a.canvas-card-link")
await waitForCanvas("text-second")
check("canvas card navigates to the second canvas", page.url().endsWith(`/${SECOND_CANVAS_SLUG}`))
check("navigation was SPA (no full reload)", await page.evaluate(() => window.__spaMarker === true))
await shot("second")

// Canvas-level fullscreen retention: the SPA DOM swap removes the fullscreen
// MOUNT (force-exiting it), so FullscreenRetention re-enters on the next
// canvas mount. (The site-wide level needs no retention — <html> survives the
// swap; its SPA survival is covered by e2e-full-screen-mode.mjs.)
await page.click(".canvas-flow-fullscreen")
await page.waitForTimeout(500)
await twoClickOn("file-back", "a.canvas-card-link")
await waitForCanvas("text-welcome")
check("back-navigation lands on main", page.url().endsWith(`/${MAIN_CANVAS_SLUG}`))
check(
  "canvas fullscreen RETAINED across canvas->canvas SPA navigation",
  await page.evaluate(() => document.fullscreenElement?.hasAttribute("data-canvas-mount") ?? false),
)
await shot("fullscreen-main")
await page.click(".canvas-flow-fullscreen")
await page.waitForTimeout(400)

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

// === Phase 7: our origin stayed error-free ===================================
const ownErrors = filterOwnErrors(errors, base)
check("no console/page errors from our origin", ownErrors.length === 0, ownErrors.join(" | "))

await browser.close()
await server.stop()
process.exit(summarize())
