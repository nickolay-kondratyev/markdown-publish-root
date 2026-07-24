#!/usr/bin/env node
/**
 * E2e of site search over CANVAS content (search-in-canvas): the Quartz search
 * UI must surface a canvas page for terms that exist ONLY inside the canvas —
 * a text card, a group label, and an embedded note's body — and clicking the
 * result must land on the working canvas viewer. Also guards privacy: private
 * note content is not reachable through search.
 *
 * Run: `npm run test:e2e` (or directly). Exits non-zero on any failed check.
 */
import {
  buildTestVaultSite,
  docIdOf,
  ID_NAMESPACE_DIR,
  filterOwnErrors,
  launchBrowserPage,
  makeChecker,
  startPreview,
} from "./lib/e2eHarness.mjs"

const { check, summarize } = makeChecker()

const MAIN_CANVAS_SLUG = `${ID_NAMESPACE_DIR}/${docIdOf("canvases/main.canvas")}.canvas`
const GETTING_STARTED_SLUG = `${ID_NAMESPACE_DIR}/${docIdOf("notes/getting-started.md")}`

console.log("building test-vault (canvases included)...")
const { siteDir } = await buildTestVaultSite("e2e-search-site")
const { server, base } = await startPreview(siteDir)
console.log(`serving ${siteDir} at ${base}`)

const launched = await launchBrowserPage()
if (launched === undefined) {
  console.log("SKIP: headless browser flow (chromium not found)")
  await server.stop()
  process.exit(0)
}
const { browser, page, errors } = launched

/** Type a query into the (already open) search bar and wait for results to settle. */
async function searchFor(query) {
  await page.fill(".search-bar", "")
  await page.fill(".search-bar", query)
  // Results render async (FlexSearch addAsync + DOM build) — no completion
  // event is exposed, so settle on a fixed debounce-safe delay.
  await page.waitForTimeout(700)
}

/** Site-relative hrefs of the current result cards (no-match excluded). */
function resultHrefs() {
  return page.evaluate(() =>
    [...document.querySelectorAll(".result-card:not(.no-match)")].map(
      (card) => new URL(card.href).pathname,
    ),
  )
}

const hasResult = (hrefs, slug) => hrefs.some((href) => href.endsWith(`/${slug}`))

await page.goto(`${base}/`)
await page.waitForSelector(".search-button", { timeout: 10000 })
await page.click(".search-button")
await page.waitForSelector(".search-container.active .search-bar", { timeout: 5000 })

// === text-card content (exists ONLY in main.canvas) ==========================
await searchFor("Blockquotes")
check("text-card term surfaces the canvas", hasResult(await resultHrefs(), MAIN_CANVAS_SLUG))

// === group label (exists ONLY in main.canvas) ================================
await searchFor("Intro Group")
check("group-label term surfaces the canvas", hasResult(await resultHrefs(), MAIN_CANVAS_SLUG))

// === embedded-note body (source text lives in getting-started.md) ============
await searchFor("Basic usage instructions")
const embeddedHrefs = await resultHrefs()
check("embedded-note term surfaces the canvas", hasResult(embeddedHrefs, MAIN_CANVAS_SLUG))
check("embedded-note term still surfaces the note itself", hasResult(embeddedHrefs, GETTING_STARTED_SLUG))

// === privacy: private note content is NOT searchable ==========================
await searchFor("LEAK-SENTINEL-9f3a72")
check("private note content yields no results", (await resultHrefs()).length === 0)

// === preview panel shows the canvas's bracketed pseudo-cards, highlighted ====
// (docs/tickets/canvas-in-search-results.md — previously EMPTY: the panel
// clones `.popover-hint` from fetched HTML, which the canvas page lacked.)
await searchFor("Intro Group")
await page.hover(`.result-card[href*="${docIdOf("canvases/main.canvas")}"]`)
// Preview populates async: 150ms focus debounce + page fetch — settle like searchFor.
await page.waitForTimeout(700)
const previewText = (await page.textContent(".preview-container")) ?? ""
check("canvas preview shows the bracketed card text", previewText.includes("[Intro Group]"))
const highlightedInPreview = await page.evaluate(() =>
  [...document.querySelectorAll(".preview-container .highlight")]
    .map((el) => el.textContent)
    .join(" "),
)
check("canvas preview highlights the matched term", /intro/i.test(highlightedInPreview))

// === clicking a canvas result lands on a WORKING canvas page =================
await searchFor("Intro Group")
await page.click(`.result-card[href*="${docIdOf("canvases/main.canvas")}"]`)
await page.waitForSelector('.react-flow__node[data-id="text-welcome"]', { timeout: 10000 })
check("clicking the result mounts the canvas viewer", page.url().endsWith(`/${MAIN_CANVAS_SLUG}`))

const ownErrors = filterOwnErrors(errors, base)
check("no console/page errors from our origin", ownErrors.length === 0, ownErrors.join(" | "))

await browser.close()
await server.stop()
process.exit(summarize())
