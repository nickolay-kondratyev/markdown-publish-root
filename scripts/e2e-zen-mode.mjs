#!/usr/bin/env node
/**
 * E2e: zen mode (plan/zen-mode.md). Builds test-vault through the real engine,
 * serves it with the real preview server, then drives headless Chromium to
 * prove the lotus toggle actually RECLAIMS the sidebar width (the thing stock
 * reader-mode does not do), survives SPA navigation and reloads, and stays
 * exitable at desktop/tablet/mobile widths.
 *
 * Run: `npm run test:e2e` (Node >= 22 via nvm; system Chromium at /usr/bin/chromium).
 * Screenshots -> .out/zen-mode-{off,on}.png (visual lotus-icon check).
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
const { siteDir } = await buildTestVaultSite("e2e-zen-site")
const { server, base } = await startPreview(siteDir)
console.log(`serving ${siteDir} at ${base}`)

const launched = await launchBrowserPage()
if (launched === undefined) {
  console.log("SKIP: zen-mode e2e (chromium not found)")
  await server.stop()
  process.exit(0)
}
const { browser, page, errors } = launched

/** Layout facts the assertions below compare across toggles/viewports. */
const measure = () =>
  page.evaluate(() => {
    const rectWidth = (selector) =>
      document.querySelector(selector)?.getBoundingClientRect().width ?? 0
    const zen = document.querySelector("button.zenmode")
    const reader = document.querySelector("button.readermode")
    const dark = document.querySelector("button.darkmode")
    const zenRect = zen?.getBoundingClientRect()
    const sidebarLeft = document.querySelector(".sidebar.left")
    return {
      mode: document.documentElement.getAttribute("zen-mode"),
      // Reader-mode hides sidebars via opacity (not width) — rects can't see it.
      sidebarLeftOpacity: sidebarLeft === null ? "0" : getComputedStyle(sidebarLeft).opacity,
      centerWidth: rectWidth(".center"),
      rightSidebarWidth: rectWidth(".sidebar.right"),
      zenButtonWidth: zenRect?.width ?? 0,
      zenInRightHalf: zenRect !== undefined && zenRect.x > window.innerWidth / 2,
      // The mode-toggle cluster is ALWAYS pinned top-right (custom.scss,
      // ref.ap.0zwhQQya81CGNQ9pmqKkM.E) — darkmode stands in for the cluster.
      // NOTE: .search-button (not .search) — the search ROOT deliberately
      // stays renderable in zen (zero-size) so the overlay can open.
      modeIconsInRightHalf:
        dark !== null && dark.getBoundingClientRect().x > window.innerWidth / 2,
      otherToolbarIconsWidth:
        rectWidth(".sidebar.left .search-button") +
        rectWidth(".sidebar.left button.darkmode") +
        rectWidth(".sidebar.left button.readermode"),
      zenSearchWidth: rectWidth("button.zen-search"),
      // The magnifier must be the LEFTMOST visible icon of the corner cluster
      // (flex order: -1, zenMode.js) — in AND out of zen.
      zenSearchLeftmost: (() => {
        const search = document.querySelector("button.zen-search")
        if (search === null) return false
        const searchLeft = search.getBoundingClientRect().left
        return [...document.querySelectorAll(".sidebar.left .flex-component button")]
          .filter((b) => b.getBoundingClientRect().width > 0)
          .every((b) => searchLeft <= b.getBoundingClientRect().left)
      })(),
      dividerHrVisible: rectWidth(".center > hr") > 0,
      breadcrumbsVisible: rectWidth(".center .breadcrumb-container") > 0,
      // DOCUMENT_POSITION_PRECEDING (2): reader-mode button comes BEFORE zen.
      zenAfterReader:
        zen !== null &&
        reader !== null &&
        (zen.compareDocumentPosition(reader) & Node.DOCUMENT_POSITION_PRECEDING) !== 0,
    }
  })

// The long-form fixture (test-vault/notes/deep-dive.md): TOC, table, code —
// the page zen mode is FOR. Pages live at stable-id URLs (plan/id-based-publishing.md).
const GETTING_STARTED_ID = docIdOf("notes/getting-started.md")
const NOTE_URL = `${base}/n/${docIdOf("notes/deep-dive.md")}`
await page.goto(NOTE_URL)
await page.waitForSelector("button.zenmode")

// --- 1. Stock state: button present, in the toolbar, after the book icon ----
const off = await measure()
check("zen button renders next to (after) the reader-mode book icon", off.zenAfterReader)
check("initial state is zen off", off.mode === "off")
check("right sidebar visible before toggle", off.rightSidebarWidth > 0, `w=${off.rightSidebarWidth}`)
check("other toolbar icons visible before toggle", off.otherToolbarIconsWidth > 0)
check("zen-search icon visible while zen off (always-present search affordance)", off.zenSearchWidth > 0)
check("zen-search is the LEFTMOST cluster icon while zen off", off.zenSearchLeftmost)
check("mode toggles pinned to the top-right corner while zen off", off.modeIconsInRightHalf)
check("article/footer divider visible before toggle", off.dividerHrVisible)
check("breadcrumbs visible before toggle", off.breadcrumbsVisible)

fs.mkdirSync(path.join(repoRoot, ".out"), { recursive: true })
// Chromium scroll-anchors a few hundred px during progressive render of the
// long note — pin to top so the screenshots are deterministic.
const screenshotFromTop = async (name) => {
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: path.join(repoRoot, ".out", name) })
}
await screenshotFromTop("zen-mode-off.png")

// --- 2. Toggle ON: the width reclaim ----------------------------------------
await page.click("button.zenmode")
const on = await measure()
check("toggle sets zen-mode=on on :root", on.mode === "on")
check("right sidebar gone", on.rightSidebarWidth === 0, `w=${on.rightSidebarWidth}`)
check(
  "center RECLAIMS sidebar width (strictly wider than stock)",
  on.centerWidth > off.centerWidth,
  `off=${off.centerWidth} on=${on.centerWidth}`,
)
check("zen button still visible in zen (exit stays reachable)", on.zenButtonWidth > 0)
check("zen button pinned to the top-right corner", on.zenInRightHalf)
check("all OTHER toolbar icons hidden in zen", on.otherToolbarIconsWidth === 0)
check("zen-search icon visible in zen", on.zenSearchWidth > 0)
check("zen-search stays the LEFTMOST cluster icon in zen", on.zenSearchLeftmost)
check("article/footer divider hidden in zen", !on.dividerHrVisible)
check("breadcrumbs hidden in zen", !on.breadcrumbsVisible)
await screenshotFromTop("zen-mode-on.png")

// --- 2b. Search from zen: the corner magnifier opens the REAL search ---------
// The icon delegates to the hidden .search-button, so all search behavior
// (focus, results, Escape) is the stock search plugin's — just re-entered.
await page.click("button.zen-search")
await page.waitForSelector(".search-container.active .search-bar")
const searchBarFocused = await page.evaluate(
  () => document.activeElement?.classList.contains("search-bar") === true,
)
check("zen-search click opens search with the bar focused", searchBarFocused)
await page.fill(".search-bar", "Basic usage instructions")
// Results render async (FlexSearch addAsync + DOM build) — no completion
// event is exposed, so settle on a fixed debounce-safe delay (e2e-search.mjs).
await page.waitForTimeout(700)
const zenSearchResults = await page.evaluate(
  () => document.querySelectorAll(".result-card:not(.no-match)").length,
)
check("searching from zen yields results", zenSearchResults > 0, `results=${zenSearchResults}`)
await screenshotFromTop("zen-mode-search-open.png")
await page.keyboard.press("Escape")
const afterSearchClose = await measure()
check(
  "escape closes search and zen stays on",
  (await page.$(".search-container.active")) === null && afterSearchClose.mode === "on",
)

// --- 3. Toggle OFF: stock layout returns ------------------------------------
await page.click("button.zenmode")
const restored = await measure()
check("second click restores zen-mode=off", restored.mode === "off")
check("right sidebar restored", restored.rightSidebarWidth === off.rightSidebarWidth)
check("center width restored", restored.centerWidth === off.centerWidth)
check("toolbar icons restored", restored.otherToolbarIconsWidth === off.otherToolbarIconsWidth)
check("zen-search icon still visible after exiting zen", restored.zenSearchWidth === off.zenSearchWidth && restored.zenSearchWidth > 0)
check("article/footer divider restored", restored.dividerHrVisible)
check("breadcrumbs restored", restored.breadcrumbsVisible)

// --- 4. Persistence: SPA navigation, then full reload ------------------------
await page.click("button.zenmode") // zen back ON
await page.click(`article a[href*="${GETTING_STARTED_ID}"]`) // Quartz SPA nav
await page.waitForURL(`**/n/${GETTING_STARTED_ID}`)
await page.waitForSelector("button.zenmode")
const afterNav = await measure()
check("zen survives SPA navigation", afterNav.mode === "on")
check("zen layout holds on the SPA-navigated page", afterNav.rightSidebarWidth === 0)

await page.reload()
await page.waitForSelector("button.zenmode")
const afterReload = await measure()
check("zen survives full reload (localStorage)", afterReload.mode === "on")

// --- 5. Responsive: zen stays exitable at tablet and mobile widths -----------
for (const [label, viewport] of [
  ["tablet", { width: 1000, height: 800 }],
  ["mobile", { width: 500, height: 800 }],
]) {
  await page.setViewportSize(viewport)
  const at = await measure()
  check(`${label}: zen button visible (top-right) while zen on`, at.zenButtonWidth > 0 && at.zenInRightHalf)
  check(`${label}: other toolbar icons hidden while zen on`, at.otherToolbarIconsWidth === 0)
  check(`${label}: right sidebar hidden while zen on`, at.rightSidebarWidth === 0)
  check(`${label}: content visible while zen on`, at.centerWidth > 0, `w=${at.centerWidth}`)
}

// --- 5b. Zen OFF at mobile width: fixed corner icons must not eat the search --
// custom.scss reserves sidebar padding-right on mobile so the header row
// (spacer pushes search rightward) never runs under the fixed cluster.
// Reload first: a desktop→mobile RESIZE leaves the explorer panel open and
// intercepting all taps (pre-existing, ticket 0004) — a fresh mobile load is
// the real initial state (zen stays on via localStorage).
await page.reload()
await page.waitForSelector("button.zenmode")
await page.click("button.zenmode") // zen OFF (mobile viewport from section 5)
const mobileOff = await page.evaluate(() => {
  const rect = (sel) => document.querySelector(sel)?.getBoundingClientRect()
  const search = rect(".sidebar.left .search")
  const dark = rect(".sidebar.left button.darkmode")
  // The magnifier is the cluster's LEFTMOST icon (order: -1, zenMode.js) —
  // it marks the cluster's left boundary for the overlap check.
  const magnifier = rect(".sidebar.left button.zen-search")
  return {
    searchRight: search?.right ?? 0,
    clusterLeft: magnifier?.left ?? Number.POSITIVE_INFINITY,
    iconsInRightHalf: dark !== undefined && dark.x > window.innerWidth / 2,
  }
})
check("mobile zen-off: mode icons sit in the top-right corner", mobileOff.iconsInRightHalf)
check(
  "mobile zen-off: search bar does not run under the corner icons",
  mobileOff.searchRight <= mobileOff.clusterLeft,
  `searchRight=${mobileOff.searchRight} clusterLeft=${mobileOff.clusterLeft}`,
)
// (zen stays OFF here; clicking again at mobile would be eaten by the open
// explorer panel — the second repro in ticket 0004. Section 6 is desktop.)

// --- 6. Reader mode first, then zen: the exit icon must stay VISIBLE ---------
// Reader-mode dims .sidebar.left to opacity 0 (hover-revealed). Zen pins that
// same sidebar as the lone exit affordance — it must force opacity back to 1
// or zen becomes un-exitable (ticket 0000).
await page.setViewportSize({ width: 1280, height: 720 }) // zen OFF after 5b
await page.click("button.readermode") // reader ON — sidebar now opacity 0
// Reader mode hides the zen button (ticket 0005: the book icon is the lone
// corner affordance), so Playwright's visibility-gated click can't reach it.
// The state combo is still reachable (both modes persist in localStorage) —
// DOM click() fires the toggle listener regardless of visibility.
await page.evaluate(() => document.querySelector("button.zenmode").click()) // zen ON while reader is on
const readerThenZen = await measure()
check(
  "reader-then-zen: zen exit icon stays opaque (not hidden by reader-mode)",
  readerThenZen.sidebarLeftOpacity === "1",
  `opacity=${readerThenZen.sidebarLeftOpacity}`,
)
check("reader-then-zen: zen layout still applies", readerThenZen.rightSidebarWidth === 0)
await screenshotFromTop("zen-mode-reader-then-zen.png")
// Leave the site as we found it for whoever debugs the .build output next.
await page.click("button.zenmode") // zen OFF
await page.click("button.readermode") // reader OFF — site back to stock

const ownErrors = filterOwnErrors(errors, base)
check("no console/page errors from our origin", ownErrors.length === 0, ownErrors.join(" | "))

await browser.close()
await server.stop()
process.exit(summarize())
