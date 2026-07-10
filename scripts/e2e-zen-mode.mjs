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
    return {
      mode: document.documentElement.getAttribute("zen-mode"),
      centerWidth: rectWidth(".center"),
      rightSidebarWidth: rectWidth(".sidebar.right"),
      zenButtonWidth: zen?.getBoundingClientRect().width ?? 0,
      // DOCUMENT_POSITION_PRECEDING (2): reader-mode button comes BEFORE zen.
      zenAfterReader:
        zen !== null &&
        reader !== null &&
        (zen.compareDocumentPosition(reader) & Node.DOCUMENT_POSITION_PRECEDING) !== 0,
    }
  })

const NOTE_URL = `${base}/notes/architecture`
await page.goto(NOTE_URL)
await page.waitForSelector("button.zenmode")

// --- 1. Stock state: button present, in the toolbar, after the book icon ----
const off = await measure()
check("zen button renders next to (after) the reader-mode book icon", off.zenAfterReader)
check("initial state is zen off", off.mode === "off")
check("right sidebar visible before toggle", off.rightSidebarWidth > 0, `w=${off.rightSidebarWidth}`)

fs.mkdirSync(path.join(repoRoot, ".out"), { recursive: true })
await page.screenshot({ path: path.join(repoRoot, ".out", "zen-mode-off.png") })

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
await page.screenshot({ path: path.join(repoRoot, ".out", "zen-mode-on.png") })

// --- 3. Toggle OFF: stock layout returns ------------------------------------
await page.click("button.zenmode")
const restored = await measure()
check("second click restores zen-mode=off", restored.mode === "off")
check("right sidebar restored", restored.rightSidebarWidth === off.rightSidebarWidth)
check("center width restored", restored.centerWidth === off.centerWidth)

// --- 4. Persistence: SPA navigation, then full reload ------------------------
await page.click("button.zenmode") // zen back ON
await page.click('article a[href*="getting-started"]') // Quartz SPA nav
await page.waitForURL("**/notes/getting-started")
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
  check(`${label}: zen button visible while zen on`, at.zenButtonWidth > 0)
  check(`${label}: right sidebar hidden while zen on`, at.rightSidebarWidth === 0)
  check(`${label}: content visible while zen on`, at.centerWidth > 0, `w=${at.centerWidth}`)
}

// Leave the site as we found it for whoever debugs the .build output next.
await page.click("button.zenmode")

const ownErrors = filterOwnErrors(errors, base)
check("no console/page errors from our origin", ownErrors.length === 0, ownErrors.join(" | "))

await browser.close()
await server.stop()
process.exit(summarize())
