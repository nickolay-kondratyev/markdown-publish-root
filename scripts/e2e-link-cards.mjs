#!/usr/bin/env node
/**
 * E2e for canvas link-node publishing (goals: docs/… canvas URL rendering):
 * whitelisted providers render as embed iframes (YouTube -> nocookie embed
 * URL), everything else as a rich link card — never a dead iframe showing a
 * browser error page. Also checks the CSP meta and click-through affordance.
 *
 * The build uses the REAL metadata fetcher on purpose (this is the shipping
 * path); assertions only rely on offline-safe facts (domain, not fetched
 * title) so the script passes with or without network.
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

const URL_CANVAS_SLUG = `n/${docIdOf("canvases/impl/Canvas With Url.canvas")}.canvas`
// Node ids from the stamped fixture test-vault/canvases/impl/Canvas With Url.canvas.
const GOOGLE_NODE = "453ef57832cea649"
const YOUTUBE_WATCH_NODE = "37709759f2fb9207"
const YOUTUBE_SHORTS_NODE = "cc1662f44426b3a5"

console.log("building test-vault (canvases included)...")
const { siteDir } = await buildTestVaultSite("e2e-link-cards-site")
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

const NODE = (id) => page.locator(`.react-flow__node[data-id="${id}"]`)

await page.goto(`${base}/${URL_CANVAS_SLUG}`)
await page.waitForSelector(`.react-flow__node[data-id="${GOOGLE_NODE}"]`, { timeout: 10000 })
await page.waitForTimeout(900)

// --- provider embeds ----------------------------------------------------------
const watchSrc = await NODE(YOUTUBE_WATCH_NODE).locator("iframe").getAttribute("src")
check(
  "YouTube watch node renders an iframe at the nocookie embed URL",
  watchSrc === "https://www.youtube-nocookie.com/embed/Jk71bPz5VLo",
  `src=[${watchSrc}]`,
)
const shortsSrc = await NODE(YOUTUBE_SHORTS_NODE).locator("iframe").getAttribute("src")
check(
  "YouTube shorts node renders an iframe at the nocookie embed URL",
  shortsSrc === "https://www.youtube-nocookie.com/embed/aj09fctv1Mc",
  `src=[${shortsSrc}]`,
)

// --- link card (the default, non-framable path) --------------------------------
check(
  "google.com node renders a link card, not an iframe",
  (await NODE(GOOGLE_NODE).locator(".canvas-link-card").count()) === 1 &&
    (await NODE(GOOGLE_NODE).locator("iframe").count()) === 0,
)
const cardText = await NODE(GOOGLE_NODE).locator(".canvas-link-card").innerText()
check(
  "link card shows the source domain (offline-safe assertion)",
  cardText.includes("www.google.com"),
  `text=[${cardText.replaceAll("\n", " | ")}]`,
)
const cardHrefTarget = await NODE(GOOGLE_NODE)
  .locator("a.canvas-link-card")
  .evaluate((a) => `${a.href} ${a.target} ${a.rel}`)
check(
  "link card click-through opens the original URL in a new tab",
  cardHrefTarget === "https://www.google.com/ _blank noopener noreferrer",
  `[${cardHrefTarget}]`,
)

// --- no dead frames / CSP ------------------------------------------------------
check(
  "CSP meta with frame-src whitelist is present on the canvas page",
  await page.evaluate(() =>
    (document
      .querySelector('meta[http-equiv="Content-Security-Policy"]')
      ?.getAttribute("content") ?? "").startsWith("frame-src 'self' https://www.youtube-nocookie.com"),
  ),
)
const ownErrors = filterOwnErrors(errors, base)
check("no own-origin console/page errors", ownErrors.length === 0, ownErrors.join(" || "))
const cspViolations = errors.filter((text) => /Content.Security.Policy|frame-src/i.test(text))
check("no CSP frame-src violations for the whitelisted embeds", cspViolations.length === 0, cspViolations.join(" || "))

await page.screenshot({ path: path.join(repoRoot, ".out", "e2e-link-cards.png") })

await browser.close()
await server.stop()
process.exit(summarize())
