#!/usr/bin/env node
/**
 * E2e: the screen-mode radio switcher (docs-internal/tickets/mode-switcher.md),
 * successor of e2e-full-screen-mode.mjs. Builds test-vault through the real
 * engine, serves it with the real preview server, then drives headless
 * Chromium to prove:
 *   - "Full screen" fullscreens <html> (site-wide) and the intent attribute
 *     tracks it; the mode survives SPA navigation (html is never swapped);
 *   - browser-initiated exits (Esc/F11 -> here document.exitFullscreen())
 *     reset the intent to normal — the attribute never lies;
 *   - "Canvas full screen" is html-level fullscreen + intent; the intent
 *     persists onto non-canvas pages (all three options always offered);
 *   - a reload lands back in normal (fullscreen cannot survive a reload).
 *
 * Run: `npm run test:e2e` (Node >= 22 via nvm; system Chromium at /usr/bin/chromium).
 * Screenshots -> .out/screen-mode-*.png.
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
const { siteDir } = await buildTestVaultSite("e2e-screen-mode-site")
const { server, base } = await startPreview(siteDir)
console.log(`serving ${siteDir} at ${base}`)

const launched = await launchBrowserPage()
if (launched === undefined) {
  console.log("SKIP: screen-mode e2e (chromium not found)")
  await server.stop()
  process.exit(0)
}
const { browser, page, errors } = launched

/** Fullscreen + switcher facts the assertions below compare across steps. */
const measure = () =>
  page.evaluate(() => {
    const trigger = document
      .querySelector('.mode-switcher[data-group="screen"] .mode-switcher-trigger')
      ?.getBoundingClientRect()
    const mount = document.querySelector("[data-canvas-mount]")?.getBoundingClientRect()
    return {
      mode: document.documentElement.getAttribute("screen-mode"),
      htmlFullscreen: document.documentElement.matches(":fullscreen"),
      triggerVisible: trigger !== undefined && trigger.width > 0,
      triggerTopRight: trigger !== undefined && trigger.x > window.innerWidth / 2 && trigger.y < 100,
      checkedScreenValue: document
        .querySelector('.mode-switcher[data-group="screen"] .mode-switcher-option[aria-checked="true"]')
        ?.getAttribute("data-value"),
      mountCoversViewport:
        mount !== undefined &&
        mount.width >= window.innerWidth - 1 &&
        mount.height >= window.innerHeight - 1,
    }
  })

/** Open the screen popover and click one of its radio rows. */
const selectScreenMode = async (value) => {
  await page.click('.mode-switcher[data-group="screen"] .mode-switcher-trigger')
  await page.click(`.mode-switcher[data-group="screen"] .mode-switcher-option[data-value="${value}"]`)
  await page.waitForTimeout(500) // fullscreen transitions settle async
}

const MAIN_CANVAS_ID = docIdOf("canvases/main.canvas")
// deep-dive.md links to [[main.canvas]] — the note -> canvas SPA path.
const NOTE_URL = `${base}/n/${docIdOf("notes/deep-dive.md")}`
await page.goto(NOTE_URL)
await page.waitForSelector(".mode-switcher")
fs.mkdirSync(path.join(repoRoot, ".out"), { recursive: true })
const shot = (name) => page.screenshot({ path: path.join(repoRoot, ".out", `screen-mode-${name}.png`) })

// --- 1. Stock state: normal, trigger top-right --------------------------------
const initial = await measure()
check("initial screen mode is normal (never persisted)", initial.mode === "normal" && !initial.htmlFullscreen)
check("screen trigger renders in the top-right cluster", initial.triggerVisible && initial.triggerTopRight)
check("Normal row pre-checked", initial.checkedScreenValue === "normal")

// --- 2. Full screen: the WHOLE site goes fullscreen ----------------------------
await selectScreenMode("fullscreen")
const on = await measure()
check("Full screen fullscreens <html> (site-wide, not an element)", on.htmlFullscreen)
check("intent attribute flips to fullscreen", on.mode === "fullscreen")
check("Full screen row now checked", on.checkedScreenValue === "fullscreen")
check("trigger stays visible top-right as the exit affordance", on.triggerVisible && on.triggerTopRight)
await shot("fullscreen")

// --- 3. SPA nav INTO a canvas: still fullscreen (html never swapped) -----------
await page.click(`article a[href*="${MAIN_CANVAS_ID}"]`)
await page.waitForSelector(".react-flow", { timeout: 10000 })
await page.waitForTimeout(900)
const onCanvas = await measure()
check("canvas entered while fullscreen -> still fullscreen", onCanvas.htmlFullscreen && onCanvas.mode === "fullscreen")
check("screen trigger visible top-right ON the canvas page", onCanvas.triggerVisible && onCanvas.triggerTopRight)
await shot("fullscreen-canvas-page")

// --- 4. Popover exit: Normal returns to windowed -------------------------------
await selectScreenMode("normal")
const exited = await measure()
check("selecting Normal exits fullscreen", !exited.htmlFullscreen && exited.mode === "normal")

// --- 5. Browser-initiated exit (Esc/F11 path): the attribute must not lie ------
await selectScreenMode("fullscreen")
check("re-entered fullscreen for the sync check", (await measure()).htmlFullscreen)
await page.evaluate(() => document.exitFullscreen())
await page.waitForTimeout(400)
const synced = await measure()
check("browser-initiated exit resets the intent to normal", synced.mode === "normal" && synced.checkedScreenValue === "normal")

// --- 6. Reload while fullscreen: lands back in normal ---------------------------
await selectScreenMode("fullscreen")
await page.reload()
await page.waitForSelector(".mode-switcher")
const reloaded = await measure()
check("reload lands in normal (fullscreen cannot survive a reload)", reloaded.mode === "normal" && !reloaded.htmlFullscreen)

// --- 7. Canvas full screen ON A NOTE page: html fullscreen, intent persists ----
// All three options are always offered; on a page without a canvas the mode
// behaves like Full screen and the intent waits for the next canvas.
await page.goto(NOTE_URL)
await page.waitForSelector(".mode-switcher")
await selectScreenMode("fullscreen-canvas")
const intentOnNote = await measure()
check("Canvas full screen on a note -> html fullscreen", intentOnNote.htmlFullscreen)
check("intent attribute holds fullscreen-canvas on the note page", intentOnNote.mode === "fullscreen-canvas")
check("Canvas full screen row checked on the note page", intentOnNote.checkedScreenValue === "fullscreen-canvas")

// --- 8. SPA nav to the canvas with the intent held: the mount expands ----------
await page.click(`article a[href*="${MAIN_CANVAS_ID}"]`)
await page.waitForSelector(".react-flow", { timeout: 10000 })
await page.waitForTimeout(900)
const expanded = await measure()
check("canvas entered with fullscreen-canvas intent -> still fullscreen", expanded.htmlFullscreen && expanded.mode === "fullscreen-canvas")
check("canvas mount expands to cover the viewport", expanded.mountCoversViewport)
check("switcher stays visible ABOVE the expanded canvas", expanded.triggerVisible && expanded.triggerTopRight)
await shot("canvas-expanded")

// --- 9. Downshift to Full screen: mount collapses, fullscreen kept -------------
await selectScreenMode("fullscreen")
const downshifted = await measure()
check("switching to Full screen keeps html fullscreen (attribute-only switch)", downshifted.htmlFullscreen && downshifted.mode === "fullscreen")
check("canvas mount back to its embedded size", !downshifted.mountCoversViewport)

// --- 10. Re-expand, then browser exit: everything resets ------------------------
await selectScreenMode("fullscreen-canvas")
check("re-expand works from the same popover", (await measure()).mountCoversViewport)
await page.evaluate(() => document.exitFullscreen())
await page.waitForTimeout(400)
const fullyExited = await measure()
check("browser exit from canvas-expanded resets to normal", fullyExited.mode === "normal" && !fullyExited.htmlFullscreen)
check("mount collapses when fullscreen drops", !fullyExited.mountCoversViewport)

// --- 11. Search Enter-nav while Canvas full screen: the mode must survive ------
// The vendored search plugin's Enter handler detaches the focused result card
// (hideSearch) BEFORE synthetically clicking it; a detached anchor's click
// cannot bubble to the SPA router, so the browser used to do a FULL page load —
// dropping html fullscreen and resetting the intent (ticket 0007). The
// mode-switcher's capture-phase Enter shim re-routes to an attached click.
await selectScreenMode("fullscreen-canvas")
check("re-entered canvas full screen for the search-nav check", (await measure()).mountCoversViewport)

const NOTE_ID = docIdOf("notes/getting-started.md")
await page.click(".mode-search")
await page.waitForSelector(".search-container.active .search-bar", { timeout: 5000 })
await page.fill(".search-bar", "Basic usage instructions")
await page.waitForTimeout(700) // results render async (FlexSearch), no completion event
await page.hover(`.result-card[href*="${NOTE_ID}"]`) // deterministic keyboard focus target
await page.keyboard.press("Enter")
await page.waitForTimeout(1200)
const afterEnterNav = await measure()
check("Enter-nav from search lands on the note", page.url().includes(NOTE_ID))
check("Enter-nav from search keeps html fullscreen", afterEnterNav.htmlFullscreen)
check("Enter-nav from search keeps the fullscreen-canvas intent", afterEnterNav.mode === "fullscreen-canvas")

// --- 12. Search click-nav back to the canvas: the mount re-expands -------------
await page.click(".mode-search")
await page.waitForSelector(".search-container.active .search-bar", { timeout: 5000 })
await page.fill(".search-bar", "Intro Group")
await page.waitForTimeout(700)
await page.click(`.result-card[href*="${MAIN_CANVAS_ID}"]`)
await page.waitForSelector(".react-flow", { timeout: 10000 })
await page.waitForTimeout(900)
const backOnCanvas = await measure()
check("search-nav back to the canvas keeps html fullscreen", backOnCanvas.htmlFullscreen && backOnCanvas.mode === "fullscreen-canvas")
check("canvas mount re-expands after the search round-trip", backOnCanvas.mountCoversViewport)

const ownErrors = filterOwnErrors(errors, base)
check("no console/page errors from our origin", ownErrors.length === 0, ownErrors.join(" | "))

await browser.close()
await server.stop()
process.exit(summarize())
