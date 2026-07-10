#!/usr/bin/env node
/**
 * E2e: folder-shaped navigation over stable-id URLs
 * (plan/folder-nav-over-id-urls.md Phase 4). Builds test-vault through the
 * real engine, serves with the REAL preview server, drives headless Chromium:
 *   - desktop: expand collapsed folders, click a note -> lands on /n/<docid>
 *   - breadcrumbs visible + correct on note AND canvas pages
 *   - folder collapse state survives SPA navigation (localStorage fileTree)
 *   - mobile (390x844): hamburger toggle opens/closes the tree; active doc
 *     visible because its ancestor folders render open server-side
 *
 * Run: `npm run test:e2e` (Node >= 22; system Chromium at /usr/bin/chromium).
 * Exits non-zero on any failed check. Screenshots -> .out/qa-foldernav/.
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { SiteBuilder, SiteConfigParser } from "../engine/src/index.ts"
import { PreviewServer } from "../cli/src/preview/previewServer.ts"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const siteDir = path.join(repoRoot, ".build", "e2e-foldernav-site")
const shotDir = path.join(repoRoot, ".out", "qa-foldernav")
const CHROMIUM_PATH = "/usr/bin/chromium"
// The 200ms mobile slide-in transition must finish before visibility asserts.
const TRANSITION_SETTLE_MS = 500

const results = []
const check = (name, ok, detail = "") => {
  results.push({ name, ok })
  console.log(`${ok ? "PASS" : "FAIL"}: ${name}${detail ? ` — ${detail}` : ""}`)
}

const docIdOf = (vaultRelPath) => {
  const content = fs.readFileSync(path.join(repoRoot, "test-vault", vaultRelPath), "utf-8")
  if (vaultRelPath.endsWith(".canvas")) return JSON.parse(content).metadata.frontmatter.id
  return content.match(/^id: (docid_[0-9a-z]{21}_e)$/m)[1]
}
const DEEP_DIVE_SLUG = `n/${docIdOf("notes/guides/deep-dive.md")}`
const GETTING_STARTED_SLUG = `n/${docIdOf("notes/getting-started.md")}`
const MAIN_CANVAS_SLUG = `n/${docIdOf("canvases/main.canvas")}.canvas`

// --- 1. Build + serve -------------------------------------------------------
console.log("building test-vault (folder-nav e2e)...")
fs.rmSync(siteDir, { recursive: true, force: true })
fs.mkdirSync(shotDir, { recursive: true })
await new SiteBuilder().buildSite({
  vaultDir: path.join(repoRoot, "test-vault"),
  siteConfig: SiteConfigParser.parse({
    title: "Folder Nav E2E",
    baseUrl: "foldernav-e2e.example.com",
    publishFilter: { includeFolders: ["notes", "canvases", "attachments"] },
  }),
  outDir: siteDir,
})
const server = new PreviewServer(siteDir)
const address = await server.start(0)
const base = `http://127.0.0.1:${address.port}`

const { chromium } = await import("playwright-core")
const browser = await chromium.launch({
  executablePath: CHROMIUM_PATH,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
})

try {
  // --- 2. Desktop: expand + click -> stable-id URL -------------------------
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
  await page.goto(`${base}/`, { waitUntil: "networkidle" })
  const notesOuter = page.locator('.folder-container[data-folderpath="notes"] + .folder-outer')
  check(
    "home: notes folder starts collapsed",
    !(await notesOuter.evaluate((el) => el.classList.contains("open"))),
  )
  await page.locator('.folder-container[data-folderpath="notes"] .folder-button').click()
  check(
    "notes folder expands on click",
    await notesOuter.evaluate((el) => el.classList.contains("open")),
  )
  await page.locator('.folder-container[data-folderpath="notes/guides"] .folder-button').click()
  await page.screenshot({ path: path.join(shotDir, "01-home-expanded.png") })
  await page.locator(`.explorer a[data-slug="${DEEP_DIVE_SLUG}"]`).click()
  await page.waitForURL(`**/${DEEP_DIVE_SLUG}`)
  check("clicking the nested note lands on /n/<docid>", page.url() === `${base}/${DEEP_DIVE_SLUG}`, page.url())

  // --- 3. Breadcrumbs on the note page --------------------------------------
  const noteCrumbs = (await page.locator(".breadcrumb-container").innerText()).replace(/\n/g, " ")
  check(
    "note breadcrumbs: Home > notes > guides > Deep Dive",
    /Home[\s❯]+notes[\s❯]+guides[\s❯]+Deep Dive/.test(noteCrumbs),
    JSON.stringify(noteCrumbs),
  )
  check(
    "active explorer link marks the current note",
    await page
      .locator(`.explorer a[data-slug="${DEEP_DIVE_SLUG}"]`)
      .evaluate((el) => el.classList.contains("active")),
  )
  await page.screenshot({ path: path.join(shotDir, "02-deep-dive.png") })

  // --- 4. Collapse state survives SPA nav -----------------------------------
  const canvasesSel = '.folder-container[data-folderpath="canvases"]'
  await page.locator(`${canvasesSel} .folder-button`).click()
  check(
    "canvases folder opened before nav",
    await page.locator(`${canvasesSel} + .folder-outer`).evaluate((el) => el.classList.contains("open")),
  )
  await page.locator(`.explorer a[data-slug="${GETTING_STARTED_SLUG}"]`).click()
  await page.waitForURL(`**/${GETTING_STARTED_SLUG}`)
  await page.waitForTimeout(TRANSITION_SETTLE_MS) // nav handler re-applies saved state
  check(
    "canvases folder STILL open after SPA nav (fileTree persistence)",
    await page.locator(`${canvasesSel} + .folder-outer`).evaluate((el) => el.classList.contains("open")),
  )
  await page.screenshot({ path: path.join(shotDir, "03-after-spa-nav.png") })

  // --- 5. Breadcrumbs on a canvas page ---------------------------------------
  await page.goto(`${base}/${MAIN_CANVAS_SLUG}`, { waitUntil: "networkidle" })
  const canvasCrumbs = (await page.locator(".breadcrumb-container").innerText()).replace(/\n/g, " ")
  check(
    "canvas breadcrumbs: Home > canvases > main",
    /Home[\s❯]+canvases[\s❯]+main/.test(canvasCrumbs),
    JSON.stringify(canvasCrumbs),
  )
  await page.screenshot({ path: path.join(shotDir, "04-canvas-crumbs.png") })
  await page.close()

  // --- 6. Mobile hamburger toggle --------------------------------------------
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } })
  await mobile.goto(`${base}/${DEEP_DIVE_SLUG}`, { waitUntil: "networkidle" })
  await mobile.waitForTimeout(TRANSITION_SETTLE_MS)
  const explorer = mobile.locator("div.explorer")
  check(
    "mobile: explorer starts collapsed",
    await explorer.evaluate((el) => el.classList.contains("collapsed")),
  )
  const hamburger = mobile.locator("button.mobile-explorer")
  check("mobile: hamburger visible", await hamburger.isVisible())
  await hamburger.click()
  check(
    "mobile: hamburger opens the tree",
    !(await explorer.evaluate((el) => el.classList.contains("collapsed"))),
  )
  await mobile.waitForTimeout(TRANSITION_SETTLE_MS)
  check(
    "mobile: tree content visible when open",
    await mobile.locator(".explorer-content").evaluate((el) => getComputedStyle(el).visibility === "visible"),
  )
  check(
    "mobile: ACTIVE doc link on screen (ancestor folders open server-side)",
    await mobile.locator(`.explorer a[data-slug="${DEEP_DIVE_SLUG}"]`).isVisible(),
  )
  await mobile.screenshot({ path: path.join(shotDir, "05-mobile-open.png") })
  await hamburger.click()
  check(
    "mobile: hamburger closes the tree again",
    await explorer.evaluate((el) => el.classList.contains("collapsed")),
  )
  await mobile.close()
} finally {
  await browser.close()
  await server.stop()
}

const failed = results.filter((r) => !r.ok)
console.log(
  failed.length === 0
    ? `folder-nav e2e: ALL ${results.length} CHECKS PASS`
    : `folder-nav e2e: ${failed.length}/${results.length} FAILED`,
)
process.exit(failed.length === 0 ? 0 : 1)
