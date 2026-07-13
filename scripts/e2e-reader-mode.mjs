#!/usr/bin/env node
/**
 * E2e: reader-mode exit affordance (docs/tickets/0005). Stock reader-mode dims
 * BOTH sidebars to opacity 0 — including the mode-toggle cluster holding the
 * reader icon itself. The engine's custom.scss (siteChromeStyles.ts) keeps the
 * book icon visible top-right as the lone exit affordance, mirroring zen mode.
 * This drives headless Chromium to prove: reader ON → book icon stays visible
 * in the rightmost (lotus) corner slot, darkmode/zen hide while the search
 * magnifier STAYS (always-visible search affordance) and still opens a
 * visible overlay, the rest of the chrome keeps the stock dim; one click
 * exits; zen keeps precedence when both modes are on.
 *
 * Run: `npm run test:e2e` (Node >= 22 via nvm; system Chromium at /usr/bin/chromium).
 * Screenshots -> .out/reader-mode-{off,on}.png.
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
const { siteDir } = await buildTestVaultSite("e2e-reader-site")
const { server, base } = await startPreview(siteDir)
console.log(`serving ${siteDir} at ${base}`)

const launched = await launchBrowserPage()
if (launched === undefined) {
  console.log("SKIP: reader-mode e2e (chromium not found)")
  await server.stop()
  process.exit(0)
}
const { browser, page, errors } = launched

/** Visibility facts the assertions below compare across toggles. */
const measure = () =>
  page.evaluate(() => {
    const rect = (selector) => document.querySelector(selector)?.getBoundingClientRect()
    const width = (selector) => rect(selector)?.width ?? 0
    // Reader-mode hides chrome via opacity (not width) — rects can't see it.
    // Effective opacity = the element's computed opacity multiplied up the
    // ancestor chain (a child of an opacity-0 parent is invisible regardless).
    const effectiveOpacity = (selector) => {
      let el = document.querySelector(selector)
      if (el === null) return 0
      let opacity = 1
      for (; el !== null; el = el.parentElement) {
        opacity *= Number(getComputedStyle(el).opacity)
      }
      return opacity
    }
    return {
      mode: document.documentElement.getAttribute("reader-mode"),
      readerVisible: width("button.readermode") > 0 && effectiveOpacity("button.readermode") === 1,
      darkVisible: width("button.darkmode") > 0 && effectiveOpacity("button.darkmode") > 0,
      zenVisible: width("button.zenmode") > 0 && effectiveOpacity("button.zenmode") > 0,
      // The zen slot's search magnifier: an always-visible search affordance,
      // kept in reader mode too (custom.scss exempts it from the wrapper hide).
      zenSearchVisible: width("button.zen-search") > 0 && effectiveOpacity("button.zen-search") > 0,
      searchOpacity: effectiveOpacity(".sidebar.left .search"),
      readerRightEdge: rect("button.readermode")?.right ?? 0,
      zenRightEdge: rect("button.zenmode")?.right ?? 0,
      readerInRightHalf: (rect("button.readermode")?.x ?? 0) > window.innerWidth / 2,
    }
  })

// The dim/reveal animates (transition: opacity 0.2s) — an instant sample reads
// mid-flight values. Resolves true once the search's EFFECTIVE opacity settles
// at the expected value, false on timeout (so a failure stays a clean FAIL).
const searchOpacityBecomes = (expected) =>
  page
    .waitForFunction(
      (target) => {
        let el = document.querySelector(".sidebar.left .search")
        if (el === null) return false
        let opacity = 1
        for (; el !== null; el = el.parentElement) {
          opacity *= Number(getComputedStyle(el).opacity)
        }
        return opacity === target
      },
      expected,
      { timeout: 2000 },
    )
    .then(
      () => true,
      () => false,
    )

const NOTE_URL = `${base}/n/${docIdOf("notes/deep-dive.md")}`
await page.goto(NOTE_URL)
await page.waitForSelector("button.readermode")

// --- 1. Stock state: full cluster visible, zen holds the rightmost slot ------
const off = await measure()
check("initial state is reader off", off.mode !== "on")
check("reader icon visible before toggle", off.readerVisible)
check("darkmode icon visible before toggle", off.darkVisible)
check("zen icon visible before toggle", off.zenVisible)
check("search magnifier visible before toggle", off.zenSearchVisible)
check("search visible before toggle", off.searchOpacity === 1, `opacity=${off.searchOpacity}`)

fs.mkdirSync(path.join(repoRoot, ".out"), { recursive: true })
const screenshotFromTop = async (name) => {
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: path.join(repoRoot, ".out", name) })
}
await screenshotFromTop("reader-mode-off.png")

// --- 2. Reader ON: book icon stays as the lone corner exit affordance --------
await page.click("button.readermode")
// The click leaves the pointer where the book WAS — the magnifier slides into
// that slot when the other icons collapse, so the pointer would keep
// .sidebar.left hovered and hover-reveal the dim. Park it over the article
// before sampling the dim (pattern: e2e-full-screen-mode.mjs).
await page.mouse.move(700, 400)
const on = await measure()
check("toggle sets reader-mode=on on :root", on.mode === "on")
check("reader icon stays fully visible (the exit affordance)", on.readerVisible)
check("reader icon sits in the right half", on.readerInRightHalf)
check(
  "reader icon takes the rightmost (lotus) slot",
  Math.abs(on.readerRightEdge - off.zenRightEdge) < 1,
  `reader.right=${on.readerRightEdge} stock zen.right=${off.zenRightEdge}`,
)
check("darkmode icon hidden while reader on", !on.darkVisible)
check("zen icon hidden while reader on", !on.zenVisible)
check("search magnifier STAYS visible while reader on", on.zenSearchVisible)
check("rest of chrome keeps the stock dim (search)", await searchOpacityBecomes(0))
await screenshotFromTop("reader-mode-on.png")

// --- 3. Hover-reveal for the dimmed chrome still works (stock behavior) ------
await page.hover(".sidebar.left .search")
check("hovering the sidebar reveals the dimmed chrome", await searchOpacityBecomes(1))
await page.mouse.move(0, 0) // un-hover

// --- 3b. Search from reader: the magnifier opens the REAL search -------------
// The overlay (.search-container.active) is a DESCENDANT of the reader-dimmed
// .search root — custom.scss forces the root opaque while the overlay is open,
// else search would be invisible without a hover (impossible on touch).
await page.click("button.zen-search")
await page.waitForSelector(".search-container.active .search-bar")
// The overlay inherits the .search root's effective opacity — the existing
// helper (transition-safe) walks that exact ancestor chain.
check("magnifier opens search from reader mode with an OPAQUE overlay", await searchOpacityBecomes(1))
await page.keyboard.press("Escape")
const afterSearchClose = await measure()
check(
  "escape closes search and reader stays on",
  (await page.$(".search-container.active")) === null && afterSearchClose.mode === "on",
)

// --- 4. One click exits: stock cluster returns --------------------------------
await page.click("button.readermode")
const restored = await measure()
check("clicking the book icon exits reader mode", restored.mode !== "on")
check("darkmode icon restored", restored.darkVisible)
check("zen icon restored", restored.zenVisible)
check(
  "zen icon back in the rightmost slot",
  Math.abs(restored.zenRightEdge - off.zenRightEdge) < 1,
  `zen.right=${restored.zenRightEdge} stock=${off.zenRightEdge}`,
)

// --- 5. Zen precedence: both modes on → only the lotus shows ------------------
// With reader on the zen button is display:none, so the combo is no longer
// UI-reachable in this order — but both modes persist in localStorage, so the
// state combination still occurs (e.g. zen remembered from a prior visit).
// DOM click() fires the toggle listener regardless of visibility.
await page.click("button.readermode") // reader ON
await page.evaluate(() => document.querySelector("button.zenmode").click()) // zen ON too
const bothOn = await measure()
check("reader+zen: reader icon hidden (zen keeps precedence)", !bothOn.readerVisible)
check("reader+zen: zen icon is the lone visible toggle", bothOn.zenVisible)
// Leave the site as we found it for whoever debugs the .build output next.
await page.click("button.zenmode") // zen OFF
await page.click("button.readermode") // reader OFF — site back to stock

const ownErrors = filterOwnErrors(errors, base)
check("no console/page errors from our origin", ownErrors.length === 0, ownErrors.join(" | "))

await browser.close()
await server.stop()
process.exit(summarize())
