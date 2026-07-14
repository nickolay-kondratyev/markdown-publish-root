#!/usr/bin/env node
/**
 * E2e: the reading-mode radio switcher (docs-internal/tickets/mode-switcher.md),
 * successor of e2e-zen-mode.mjs + e2e-reader-mode.mjs. Builds test-vault
 * through the real engine, serves it with the real preview server, then drives
 * headless Chromium to prove:
 *   - the corner cluster renders [magnifier, darkmode, reading, screen] with
 *     the magnifier leftmost, pinned top-right;
 *   - the trigger opens a labeled popover with radio semantics (one open at a
 *     time, outside-click/Escape close, aria-checked tracks the selection);
 *   - Zen strips the chrome while markdown KEEPS the site-wide reading
 *     measure; Reader dims the sidebars (hover-revealed) with the cluster
 *     exempt; the WHOLE cluster (darkmode included) stays visible in every
 *     mode; switching Zen -> Reader directly proves the STRICT radio (the
 *     old stacking behavior is gone);
 *   - reading mode survives SPA navigation and reloads (localStorage), and
 *     the switcher stays usable at tablet/mobile widths.
 *
 * Run: `npm run test:e2e` (Node >= 22 via nvm; system Chromium at /usr/bin/chromium).
 * Screenshots -> .out/mode-switcher-*.png.
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
const { siteDir } = await buildTestVaultSite("e2e-mode-switcher-site")
const { server, base } = await startPreview(siteDir)
console.log(`serving ${siteDir} at ${base}`)

const launched = await launchBrowserPage()
if (launched === undefined) {
  console.log("SKIP: mode-switcher e2e (chromium not found)")
  await server.stop()
  process.exit(0)
}
const { browser, page, errors } = launched

/** Layout + cluster facts the assertions below compare across mode changes. */
const measure = () =>
  page.evaluate(() => {
    const rect = (selector) => document.querySelector(selector)?.getBoundingClientRect()
    const width = (selector) => rect(selector)?.width ?? 0
    // Reader mode hides chrome via opacity (not width) — rects can't see it.
    // Effective opacity multiplies up the ancestor chain (a child of an
    // opacity-0 parent is invisible regardless of its own value).
    const effectiveOpacity = (selector) => {
      let el = document.querySelector(selector)
      if (el === null) return 0
      let opacity = 1
      for (; el !== null; el = el.parentElement) {
        opacity *= Number(getComputedStyle(el).opacity)
      }
      return opacity
    }
    const readingTrigger = rect('.mode-switcher[data-group="reading"] .mode-switcher-trigger')
    const screenTrigger = rect('.mode-switcher[data-group="screen"] .mode-switcher-trigger')
    const magnifier = rect("button.mode-search")
    return {
      readingMode: document.documentElement.getAttribute("reading-mode"),
      readingTriggerVisible: (readingTrigger?.width ?? 0) > 0,
      screenTriggerVisible: (screenTrigger?.width ?? 0) > 0,
      triggersInRightHalf:
        readingTrigger !== undefined &&
        screenTrigger !== undefined &&
        readingTrigger.x > window.innerWidth / 2 &&
        screenTrigger.x > window.innerWidth / 2,
      magnifierVisible: (magnifier?.width ?? 0) > 0,
      // The magnifier must be the LEFTMOST visible icon of the corner cluster
      // (flex order: -1) — in every mode.
      magnifierLeftmost: (() => {
        if (magnifier === undefined) return false
        return [...document.querySelectorAll(".sidebar.left .flex-component button")]
          .filter((b) => b.getBoundingClientRect().width > 0)
          .every((b) => magnifier.left <= b.getBoundingClientRect().left)
      })(),
      darkVisible: width("button.darkmode") > 0 && effectiveOpacity("button.darkmode") > 0,
      // Uniform icon row: every visible cluster button shares one 32px flex
      // line (the vendored darkmode's Flex slot once added 4px of baseline
      // space, sinking the switcher triggers 2px — custom.scss dissolves it).
      clusterRowAligned: (() => {
        const boxes = [...document.querySelectorAll(".sidebar.left .flex-component button")]
          .map((b) => b.getBoundingClientRect())
          .filter((b) => b.width > 0)
        return boxes.length > 0 && boxes.every((b) => b.top === boxes[0].top && b.height === boxes[0].height)
      })(),
      centerWidth: width(".center"),
      rightSidebarWidth: width(".sidebar.right"),
      searchOpacity: effectiveOpacity(".sidebar.left .search"),
      dividerHrVisible: width(".center > hr") > 0,
      breadcrumbsVisible: width(".center .breadcrumb-container") > 0,
      popoversOpen: document.querySelectorAll(".mode-switcher[data-open]").length,
      checkedValues: [...document.querySelectorAll('.mode-switcher-option[aria-checked="true"]')].map(
        (option) => option.getAttribute("data-value"),
      ),
    }
  })

/** Open a group's popover and click one of its radio rows. */
const selectMode = async (group, value) => {
  await page.click(`.mode-switcher[data-group="${group}"] .mode-switcher-trigger`)
  await page.click(`.mode-switcher[data-group="${group}"] .mode-switcher-option[data-value="${value}"]`)
}

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

// The long-form fixture (test-vault/notes/deep-dive.md): TOC, table, code —
// the page zen mode is FOR. Pages live at stable-id URLs (plan/id-based-publishing.md).
const GETTING_STARTED_ID = docIdOf("notes/getting-started.md")
const NOTE_URL = `${base}/n/${docIdOf("notes/deep-dive.md")}`
await page.goto(NOTE_URL)
await page.waitForSelector(".mode-switcher")

fs.mkdirSync(path.join(repoRoot, ".out"), { recursive: true })
// Chromium scroll-anchors a few hundred px during progressive render of the
// long note — pin to top so the screenshots are deterministic.
const screenshotFromTop = async (name) => {
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: path.join(repoRoot, ".out", name) })
}

// --- 1. Stock state: cluster pinned top-right, plain mode, defaults checked ---
const initial = await measure()
check("initial reading mode is plain", initial.readingMode === "plain")
check("both switcher triggers render top-right", initial.readingTriggerVisible && initial.screenTriggerVisible && initial.triggersInRightHalf)
check("magnifier visible and LEFTMOST in the cluster", initial.magnifierVisible && initial.magnifierLeftmost)
check("darkmode icon visible in plain mode", initial.darkVisible)
check("cluster icons share one row (equal top + height)", initial.clusterRowAligned)
check("no popover open initially", initial.popoversOpen === 0)
check("default rows pre-checked (plain + normal)", initial.checkedValues.join(",") === "plain,normal")
check("right sidebar visible in plain mode", initial.rightSidebarWidth > 0)
check("divider + breadcrumbs visible in plain mode", initial.dividerHrVisible && initial.breadcrumbsVisible)
await screenshotFromTop("mode-switcher-plain.png")

// --- 2. Popover mechanics: open/close, one at a time, radio labels ------------
await page.click('.mode-switcher[data-group="reading"] .mode-switcher-trigger')
const readingOpen = await page.evaluate(() => {
  const switcher = document.querySelector('.mode-switcher[data-group="reading"]')
  const rows = [...switcher.querySelectorAll(".mode-switcher-option")]
  return {
    open: switcher.hasAttribute("data-open"),
    expanded: switcher.querySelector(".mode-switcher-trigger").getAttribute("aria-expanded"),
    labels: rows.map((row) => row.querySelector(".option-label").textContent),
    visible: rows.every((row) => row.getBoundingClientRect().width > 0),
    onScreen: rows.every((row) => {
      const r = row.getBoundingClientRect()
      return r.right <= window.innerWidth && r.left >= 0
    }),
  }
})
check("trigger click opens the reading popover (aria-expanded syncs)", readingOpen.open && readingOpen.expanded === "true")
check("popover rows are labeled Plain/Reader/Zen and visible on-screen", readingOpen.labels.join(",") === "Plain,Reader,Zen" && readingOpen.visible && readingOpen.onScreen)
await screenshotFromTop("mode-switcher-popover-open.png")

await page.click('.mode-switcher[data-group="screen"] .mode-switcher-trigger')
const afterSecondOpen = await page.evaluate(() => ({
  readingOpen: document.querySelector('.mode-switcher[data-group="reading"]').hasAttribute("data-open"),
  screenOpen: document.querySelector('.mode-switcher[data-group="screen"]').hasAttribute("data-open"),
  screenLabels: [...document.querySelectorAll('.mode-switcher[data-group="screen"] .option-label')].map(
    (label) => label.textContent,
  ),
}))
check("opening the screen popover closes the reading one (one at a time)", !afterSecondOpen.readingOpen && afterSecondOpen.screenOpen)
check("screen rows are labeled Normal/Full screen/Canvas full screen", afterSecondOpen.screenLabels.join(",") === "Normal,Full screen,Canvas full screen")

await page.keyboard.press("Escape")
check("Escape closes the open popover", (await measure()).popoversOpen === 0)
await page.click('.mode-switcher[data-group="reading"] .mode-switcher-trigger')
await page.click("article h1") // anywhere outside the switcher
check("outside click closes the open popover", (await measure()).popoversOpen === 0)

// --- 3. Zen: chrome stripped, reading measure kept, exit stays reachable ------
await selectMode("reading", "zen")
const zen = await measure()
check("selecting Zen sets reading-mode=zen", zen.readingMode === "zen")
check("selection closes the popover", zen.popoversOpen === 0)
check("zen row now aria-checked", zen.checkedValues.includes("zen") && !zen.checkedValues.includes("plain"))
check("right sidebar gone in zen", zen.rightSidebarWidth === 0, `w=${zen.rightSidebarWidth}`)
// The viewport-anchored layout (siteChromeStyles.ts) caps markdown at the
// reading measure on EVERY page, zen included — sidebars vanish, prose width
// must not change.
check(
  "center KEEPS the reading measure in zen (no wall-to-wall prose)",
  Math.abs(zen.centerWidth - initial.centerWidth) <= 1,
  `plain=${initial.centerWidth} zen=${zen.centerWidth}`,
)
check("both triggers stay visible in zen (exit stays reachable)", zen.readingTriggerVisible && zen.screenTriggerVisible && zen.triggersInRightHalf)
check("magnifier stays visible and leftmost in zen", zen.magnifierVisible && zen.magnifierLeftmost)
// Approved requirement (2026-07-13): the cluster stays COMPLETE in every mode
// — the theme toggle must never require leaving zen/reader first.
check("darkmode icon stays visible in zen (theme always switchable)", zen.darkVisible)
check("divider + breadcrumbs hidden in zen", !zen.dividerHrVisible && !zen.breadcrumbsVisible)
await screenshotFromTop("mode-switcher-zen.png")

// --- 3b. Search from zen: the corner magnifier opens the REAL search ----------
// The icon delegates to the hidden .search-button, so all search behavior
// (focus, results, Escape) is the stock search plugin's — just re-entered.
await page.click("button.mode-search")
await page.waitForSelector(".search-container.active .search-bar")
const searchBarFocused = await page.evaluate(
  () => document.activeElement?.classList.contains("search-bar") === true,
)
check("magnifier click opens search with the bar focused (zen)", searchBarFocused)
await page.fill(".search-bar", "Basic usage instructions")
// Results render async (FlexSearch addAsync + DOM build) — no completion
// event is exposed, so settle on a fixed debounce-safe delay (e2e-search.mjs).
await page.waitForTimeout(700)
const zenSearchResults = await page.evaluate(
  () => document.querySelectorAll(".result-card:not(.no-match)").length,
)
check("searching from zen yields results", zenSearchResults > 0, `results=${zenSearchResults}`)
await page.keyboard.press("Escape")
check(
  "escape closes search and zen stays on",
  (await page.$(".search-container.active")) === null && (await measure()).readingMode === "zen",
)

// --- 4. STRICT radio: Zen -> Reader in one selection ---------------------------
// The old plugins allowed zen+reader to stack (zen won via CSS). The radio
// makes the combination unrepresentable: one attribute, one value.
await selectMode("reading", "reader")
// The selection click leaves the pointer near the cluster — the sidebar dim is
// hover-revealed, so park the pointer over the article before sampling.
await page.mouse.move(700, 400)
const reader = await measure()
check("selecting Reader FROM zen sets reading-mode=reader (strict radio)", reader.readingMode === "reader")
check("zen layout fully restored on switch (right sidebar back)", reader.rightSidebarWidth === initial.rightSidebarWidth)
check("reader dims the sidebar chrome (search)", await searchOpacityBecomes(0))
check("cluster stays visible in reader (exempt from the dim)", reader.readingTriggerVisible && reader.magnifierVisible)
check("darkmode icon stays visible in reader (theme always switchable)", reader.darkVisible)
await screenshotFromTop("mode-switcher-reader.png")

// --- 4b. Hover-reveal for the dimmed chrome still works (stock behavior) ------
await page.hover(".sidebar.left .search")
check("hovering the sidebar reveals the dimmed chrome", await searchOpacityBecomes(1))
await page.mouse.move(700, 400) // un-hover

// --- 4c. Search from reader: the magnifier opens an OPAQUE overlay ------------
// The overlay (.search-container.active) is a DESCENDANT of the reader-dimmed
// .search root — the mode-switcher CSS forces the root opaque while the
// overlay is open, else search would be invisible without a hover
// (impossible on touch).
await page.click("button.mode-search")
await page.waitForSelector(".search-container.active .search-bar")
check("magnifier opens search from reader mode with an OPAQUE overlay", await searchOpacityBecomes(1))
await page.keyboard.press("Escape")
check(
  "escape closes search and reader stays on",
  (await page.$(".search-container.active")) === null && (await measure()).readingMode === "reader",
)

// --- 5. Back to Plain: stock layout returns ------------------------------------
await selectMode("reading", "plain")
const plainAgain = await measure()
check("selecting Plain restores reading-mode=plain", plainAgain.readingMode === "plain")
check("sidebar chrome opaque again", await searchOpacityBecomes(1))
check("darkmode icon still visible back in plain", plainAgain.darkVisible)
check("divider + breadcrumbs restored", plainAgain.dividerHrVisible && plainAgain.breadcrumbsVisible)

// --- 6. Persistence: SPA navigation, then full reload ---------------------------
await selectMode("reading", "zen")
await page.click(`article a[href*="${GETTING_STARTED_ID}"]`) // Quartz SPA nav
await page.waitForURL(`**/n/${GETTING_STARTED_ID}`)
await page.waitForSelector(".mode-switcher")
const afterNav = await measure()
check("zen survives SPA navigation", afterNav.readingMode === "zen")
check("zen layout holds on the SPA-navigated page", afterNav.rightSidebarWidth === 0)
check("zen row still checked after nav (aria re-synced)", afterNav.checkedValues.includes("zen"))

await page.reload()
await page.waitForSelector(".mode-switcher")
check("zen survives full reload (localStorage)", (await measure()).readingMode === "zen")

// --- 7. Responsive: the switcher stays usable at tablet and mobile widths ------
for (const [label, viewport] of [
  ["tablet", { width: 1000, height: 800 }],
  ["mobile", { width: 500, height: 800 }],
]) {
  await page.setViewportSize(viewport)
  const at = await measure()
  check(`${label}: triggers visible (top-right) while zen on`, at.readingTriggerVisible && at.triggersInRightHalf)
  check(`${label}: right sidebar hidden while zen on`, at.rightSidebarWidth === 0)
  check(`${label}: content visible while zen on`, at.centerWidth > 0, `w=${at.centerWidth}`)
}

// --- 7b. Plain at mobile width: fixed corner icons must not eat the search -----
// custom.scss reserves sidebar padding-right on mobile so the header row
// (spacer pushes search rightward) never runs under the fixed cluster.
// Reload first: a desktop->mobile RESIZE leaves the explorer panel open and
// intercepting all taps (pre-existing, ticket 0004) — a fresh mobile load is
// the real initial state (zen stays on via localStorage).
await page.reload()
await page.waitForSelector(".mode-switcher")
await selectMode("reading", "plain")
const mobilePlain = await page.evaluate(() => {
  const rect = (sel) => document.querySelector(sel)?.getBoundingClientRect()
  const search = rect(".sidebar.left .search")
  const dark = rect(".sidebar.left button.darkmode")
  // The magnifier is the cluster's LEFTMOST icon (order: -1) — it marks the
  // cluster's left boundary for the overlap check.
  const magnifier = rect(".sidebar.left button.mode-search")
  return {
    searchRight: search?.right ?? 0,
    clusterLeft: magnifier?.left ?? Number.POSITIVE_INFINITY,
    iconsInRightHalf: dark !== undefined && dark.x > window.innerWidth / 2,
  }
})
check("mobile plain: mode icons sit in the top-right corner", mobilePlain.iconsInRightHalf)
check(
  "mobile plain: search bar does not run under the corner icons",
  mobilePlain.searchRight <= mobilePlain.clusterLeft,
  `searchRight=${mobilePlain.searchRight} clusterLeft=${mobilePlain.clusterLeft}`,
)
await screenshotFromTop("mode-switcher-mobile-plain.png")

const ownErrors = filterOwnErrors(errors, base)
check("no console/page errors from our origin", ownErrors.length === 0, ownErrors.join(" | "))

await browser.close()
await server.stop()
process.exit(summarize())
