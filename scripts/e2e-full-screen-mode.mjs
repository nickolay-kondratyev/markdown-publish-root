#!/usr/bin/env node
/**
 * E2e: site-wide full screen mode (docs/tickets/full-screen-mode.md). Builds
 * test-vault through the real engine, serves it with the real preview server,
 * then drives headless Chromium to prove the corner toggle fullscreens the
 * WHOLE SITE (<html>), survives SPA navigation into a canvas (the canvas opens
 * already fullscreen), stays visible inside zen AND reader mode (the "stacking"
 * requirement), and that the corner icons show aria-label hover tooltips.
 *
 * Run: `npm run test:e2e` (Node >= 22 via nvm; system Chromium at /usr/bin/chromium).
 * Screenshots -> .out/full-screen-mode-*.png.
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

console.log("building test-vault...")
const { siteDir } = await buildTestVaultSite("e2e-full-screen-site")
const { server, base } = await startPreview(siteDir)
console.log(`serving ${siteDir} at ${base}`)

const launched = await launchBrowserPage()
if (launched === undefined) {
  console.log("SKIP: full-screen-mode e2e (chromium not found)")
  await server.stop()
  process.exit(0)
}
const { browser, page, errors } = launched

/** Fullscreen + toolbar facts the assertions below compare across steps. */
const measure = () =>
  page.evaluate(() => {
    const rect = (selector) => document.querySelector(selector)?.getBoundingClientRect()
    const fullscreenRect = rect("button.fullscreenmode")
    const zen = document.querySelector("button.zenmode")
    const fullscreen = document.querySelector("button.fullscreenmode")
    return {
      mode: document.documentElement.getAttribute("full-screen-mode"),
      isDocumentFullscreen: document.fullscreenElement === document.documentElement,
      buttonVisible: fullscreenRect !== undefined && fullscreenRect.width > 0,
      buttonTopRight:
        fullscreenRect !== undefined &&
        fullscreenRect.x > window.innerWidth / 2 &&
        fullscreenRect.y < 100,
      enterIconShown: (rect("button.fullscreenmode .fullscreenEnterIcon")?.width ?? 0) > 0,
      exitIconShown: (rect("button.fullscreenmode .fullscreenExitIcon")?.width ?? 0) > 0,
      readerButtonVisible: (rect("button.readermode")?.width ?? 0) > 0,
      zenButtonVisible: (rect("button.zenmode")?.width ?? 0) > 0,
      darkButtonVisible: (rect("button.darkmode")?.width ?? 0) > 0,
      // DOCUMENT_POSITION_PRECEDING (2): zen button comes BEFORE fullscreen.
      fullscreenAfterZen:
        fullscreen !== null &&
        zen !== null &&
        (fullscreen.compareDocumentPosition(zen) & Node.DOCUMENT_POSITION_PRECEDING) !== 0,
    }
  })

const MAIN_CANVAS_ID = docIdOf("canvases/main.canvas")
// deep-dive.md links to [[main.canvas]] — the note -> canvas SPA path.
const NOTE_URL = `${base}/n/${docIdOf("notes/deep-dive.md")}`
await page.goto(NOTE_URL)
await page.waitForSelector("button.fullscreenmode")
fs.mkdirSync(path.join(repoRoot, ".out"), { recursive: true })
const shot = (name) =>
  page.screenshot({ path: path.join(repoRoot, ".out", `full-screen-mode-${name}.png`) })

// --- 1. Stock state: button present, rightmost in the corner cluster ---------
const off = await measure()
check("initial state is full-screen off", off.mode === "off" && !off.isDocumentFullscreen)
check("fullscreen button renders in the top-right cluster", off.buttonVisible && off.buttonTopRight)
check("fullscreen button is the RIGHTMOST icon (after zen)", off.fullscreenAfterZen)
check("enter glyph shown while off (exit glyph hidden)", off.enterIconShown && !off.exitIconShown)

// --- 2. Hover tooltips (aria-label -> CSS ::after) on the corner icons -------
const tooltipOf = async (selector) => {
  await page.hover(selector)
  return page.evaluate(
    (sel) => getComputedStyle(document.querySelector(sel), "::after").content,
    selector,
  )
}
check("fullscreen icon shows its hover tooltip", (await tooltipOf("button.fullscreenmode")).includes("Full screen"))
// The vendored buttons get the same treatment purely via their aria-labels.
const darkTooltip = await tooltipOf("button.darkmode")
check("darkmode icon shows a hover tooltip too", darkTooltip !== "none" && darkTooltip.length > 2, darkTooltip)
await page.mouse.move(10, 300) // park the cursor away from the cluster

// --- 3. Toggle ON: the WHOLE site goes fullscreen -----------------------------
await page.click("button.fullscreenmode")
await page.waitForTimeout(500)
const on = await measure()
check("toggle fullscreens <html> (site-wide, not an element)", on.isDocumentFullscreen)
check("root attribute flips to on", on.mode === "on")
check("exit glyph shown while on", on.exitIconShown && !on.enterIconShown)
check("button stays visible top-right as the exit affordance", on.buttonVisible && on.buttonTopRight)
await shot("on")

// --- 4. SPA nav INTO a canvas: it opens already fullscreen -------------------
await page.click(`article a[href*="${MAIN_CANVAS_ID}"]`)
await page.waitForSelector(".react-flow", { timeout: 10000 })
await page.waitForTimeout(900)
const onCanvas = await measure()
check("canvas entered while mode on -> canvas is already fullscreen", onCanvas.isDocumentFullscreen && onCanvas.mode === "on")
check("fullscreen icon visible top-right ON the canvas page", onCanvas.buttonVisible && onCanvas.buttonTopRight)
await shot("canvas")

// --- 5. Exit from the canvas page, back to windowed --------------------------
await page.click("button.fullscreenmode")
await page.waitForTimeout(400)
const exited = await measure()
check("second click exits fullscreen", !exited.isDocumentFullscreen && exited.mode === "off")

// --- 6. Programmatic exit (Esc/F11 path): attribute must stay in sync --------
await page.click("button.fullscreenmode")
await page.waitForTimeout(400)
await page.evaluate(() => document.exitFullscreen())
await page.waitForTimeout(400)
check(
  "browser-initiated exit syncs the root attribute back to off",
  (await measure()).mode === "off",
)

// --- 7. Stacking: the fullscreen icon stays visible in zen and reader mode ---
await page.goto(NOTE_URL)
await page.waitForSelector("button.fullscreenmode")
await page.click("button.zenmode")
const inZen = await measure()
check("zen on: fullscreen icon STAYS visible (stacking)", inZen.buttonVisible && inZen.buttonTopRight)
check("zen on: other icons hidden (zen behavior intact)", !inZen.darkButtonVisible && !inZen.readerButtonVisible)
await shot("zen-stack")
await page.click("button.zenmode") // zen OFF

await page.click("button.readermode")
const inReader = await measure()
check("reader on: fullscreen icon STAYS visible (stacking)", inReader.buttonVisible && inReader.buttonTopRight)
check("reader on: book icon stays visible (ticket 0005 intact)", inReader.readerButtonVisible)
check("reader on: darkmode/zen icons hidden", !inReader.darkButtonVisible && !inReader.zenButtonVisible)
await shot("reader-stack")

// While stacked with reader mode, the toggle must still WORK.
await page.click("button.fullscreenmode")
await page.waitForTimeout(500)
check("reader + fullscreen: reading experience upgrades to fullscreen", (await measure()).isDocumentFullscreen)
await page.click("button.fullscreenmode")
await page.waitForTimeout(400)
await page.click("button.readermode") // reader OFF — site back to stock

const ownErrors = filterOwnErrors(errors, base)
check("no console/page errors from our origin", ownErrors.length === 0, ownErrors.join(" | "))

await browser.close()
await server.stop()
process.exit(summarize())
