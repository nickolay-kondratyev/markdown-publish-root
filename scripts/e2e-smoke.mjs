#!/usr/bin/env node
/**
 * E2e smoke: build test-vault (canvases included) through the real engine,
 * serve the output, then verify over HTTP + headless Chromium that the canvas
 * viewer actually mounts and renders build-time-rewritten content. Phase 3
 * adds: validation-pass assertions on the build result and a `publish deploy
 * --dry-run` exercise through the real CLI (no aws CLI / credentials needed).
 *
 * Run: `npm run test:e2e` (Node >= 22 via nvm; system Chromium at /usr/bin/chromium).
 * Exits non-zero on any failed check. Screenshot -> .out/phase-2-canvas-smoke.png.
 */
import { spawnSync } from "node:child_process"
import { createServer } from "node:http"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { SiteBuilder, SiteConfigParser } from "../engine/src/index.ts"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const siteDir = path.join(repoRoot, ".build", "e2e-canvas-site")
const CHROMIUM_PATH = "/usr/bin/chromium"
// External hosts stock Quartz references (fonts/katex CDNs); unreachable in a
// sandboxed/offline run, so failures for THEM are not our defects.
const EXTERNAL_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com", "cdn.jsdelivr.net", "cdnjs.cloudflare.com"]

const results = []
const check = (name, ok, detail = "") => {
  results.push({ name, ok })
  console.log(`${ok ? "PASS" : "FAIL"}: ${name}${detail ? ` — ${detail}` : ""}`)
}

// --- 1. Build --------------------------------------------------------------
console.log("building test-vault (canvases included)...")
fs.rmSync(siteDir, { recursive: true, force: true })
const siteConfig = SiteConfigParser.parse({
  title: "E2E Canvas Smoke",
  baseUrl: "e2e.example.com",
  publishFilter: { includeFolders: ["canvases"] },
})
const buildResult = await new SiteBuilder().buildSite({
  vaultDir: path.join(repoRoot, "test-vault"),
  siteConfig,
  outDir: siteDir,
})

// --- 1b. Validation pass (Phase 3) ------------------------------------------
check("validation: no private-content leaks", buildResult.validation.leaks.length === 0)
check(
  "validation: only broken link is the fixture's deliberate private-note wikilink",
  buildResult.validation.brokenLinks.totalBroken === 1 &&
    buildResult.validation.brokenLinks.brokenBySourcePage.index?.[0]?.resolvedSitePath ===
      "private-secret",
  JSON.stringify(buildResult.validation.brokenLinks),
)

// --- 1c. Deploy dry-run through the real CLI (no aws CLI needed) -------------
const deployConfigPath = path.join(repoRoot, ".build", "e2e-deploy.json")
fs.writeFileSync(
  deployConfigPath,
  JSON.stringify({
    bucket: "e2e-smoke-bucket",
    region: "us-east-1",
    prefix: "sites/e2e",
    distributionId: "E2ESMOKE123",
    deleteStale: true,
  }),
)
const dryRun = spawnSync(
  process.execPath,
  [
    path.join(repoRoot, "cli/bin/publish.mjs"),
    "deploy",
    siteDir,
    "--deploy-config",
    deployConfigPath,
    "--dry-run",
  ],
  { encoding: "utf-8" },
)
const dryRunOutput = `${dryRun.stdout}\n${dryRun.stderr}`
check("deploy dry-run exits 0", dryRun.status === 0, `status=${dryRun.status}`)
check(
  "deploy dry-run prints three cache-classed sync passes",
  (dryRunOutput.match(/aws s3 sync /g) ?? []).length === 3 &&
    dryRunOutput.includes("max-age=300") &&
    dryRunOutput.includes("max-age=3600") &&
    dryRunOutput.includes("max-age=31536000, immutable"),
)
check(
  "deploy dry-run targets the prefixed bucket and invalidates CloudFront",
  dryRunOutput.includes("s3://e2e-smoke-bucket/sites/e2e") &&
    dryRunOutput.includes("cloudfront create-invalidation --distribution-id E2ESMOKE123"),
)
check("deploy dry-run executes nothing", dryRunOutput.includes("nothing was executed"))

// --- 2. Serve (extensionless -> .html mapping is a hosting concern; mimic it) ---
const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".xml": "application/xml",
}
const server = createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url ?? "/").split("?")[0])
  let filePath = path.join(siteDir, urlPath === "/" ? "index.html" : urlPath.slice(1))
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    if (fs.existsSync(`${filePath}.html`)) filePath = `${filePath}.html`
  }
  try {
    const body = fs.readFileSync(filePath)
    res.writeHead(200, { "content-type": MIME[path.extname(filePath)] ?? "application/octet-stream" })
    res.end(body)
  } catch {
    res.writeHead(404)
    res.end("not found")
  }
})
await new Promise((resolve) => server.listen(0, resolve))
const base = `http://127.0.0.1:${server.address().port}`
console.log(`serving ${siteDir} at ${base}`)

// --- 3. HTTP checks ----------------------------------------------------------
const status = async (p) => (await fetch(base + p)).status
check("canvas page (main) 200", (await status("/canvases/main.canvas.html")) === 200)
check("canvas page (second) 200", (await status("/canvases/second.canvas.html")) === 200)
check("viewer bundle 200", (await status("/static/canvas-viewer.js")) === 200)
check("note fragment (full) 200", (await status("/canvases/main.canvas.fragments/file-note-full.html")) === 200)
check("note fragment (subpath) 200", (await status("/canvases/main.canvas.fragments/file-note-subpath.html")) === 200)
check("image asset 200", (await status("/attachments/diagram.png")) === 200)
check("private note 404", (await status("/notes/private-secret.html")) === 404)

const mainHtml = await (await fetch(base + "/canvases/main.canvas.html")).text()
check(
  "canvas JSON embeds rewritten fragment URL",
  mainHtml.includes("main.canvas.fragments/file-note-full.html"),
)
check("canvas JSON embeds rewritten wikilink URL", mainHtml.includes("../notes/getting-started"))
check("no leak sentinel on canvas page", !mainHtml.includes("LEAK-SENTINEL-9f3a72"))
check("no private path on canvas page", !mainHtml.includes("private-secret"))

// --- 4. Headless browser smoke ----------------------------------------------
if (!fs.existsSync(CHROMIUM_PATH)) {
  console.log(`SKIP: headless browser smoke (${CHROMIUM_PATH} not found)`)
} else {
  const { chromium } = await import("playwright-core")
  const browser = await chromium.launch({
    executablePath: CHROMIUM_PATH,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  })
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
  const consoleErrors = []
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text())
  })
  const pageErrors = []
  // Keep the stack: it attributes the error to an origin (link cards embed
  // third-party pages in sandboxed iframes; their own script errors are not ours).
  page.on("pageerror", (error) => pageErrors.push(error.stack ?? String(error)))

  await page.goto(`${base}/canvases/main.canvas.html`)
  await page.waitForSelector(".canvas-page-mount .JSON-Canvas-Viewer", { timeout: 10000 })
  await page.waitForTimeout(1200) // async overlays (fragment fetches) settle

  const dom = await page.evaluate(() => {
    const overlay = (id) => document.querySelector(`.canvas-page-mount #${CSS.escape(id)}`)
    return {
      overlayIds: [...document.querySelectorAll(".canvas-page-mount .JCV-overlay-container")].map((e) => e.id),
      welcomeHtml: overlay("text-welcome")?.innerHTML ?? "",
      noteFullText: overlay("file-note-full")?.textContent ?? "",
      noteSubpathText: overlay("file-note-subpath")?.textContent ?? "",
      privateText: overlay("file-private")?.textContent ?? "",
      canvasCardHtml: overlay("file-canvas-card")?.innerHTML ?? "",
      imageSrc: overlay("file-image")?.querySelector("img")?.getAttribute("src") ?? "",
      openNoteHref: overlay("file-note-full")?.querySelector(".canvas-note-open")?.getAttribute("href") ?? "",
      hasMinimap: document.querySelector(".canvas-page-mount .JCV-minimap") !== null,
    }
  })

  check("viewer mounted with node overlays", dom.overlayIds.length >= 6, `overlays: ${dom.overlayIds.join(",")}`)
  check("text card shows prebaked HTML with resolved wikilink", dom.welcomeHtml.includes('href="../notes/getting-started"'))
  check("note card fetched its prerendered fragment", dom.noteFullText.includes("pure build engine"))
  check(
    "subpath card shows ONLY the Installation section",
    dom.noteSubpathText.includes("Installation is easy") && !dom.noteSubpathText.includes("Advanced tips"),
  )
  check("private card is a contentless placeholder", dom.privateText.trim() === "Private note")
  check("canvas->canvas card links the second canvas", dom.canvasCardHtml.includes('href="../canvases/second.canvas"'))
  check("image card resolved through attachments map", dom.imageSrc.includes("attachments/diagram.png"))
  check("open-note affordance present on note card", dom.openNoteHref === "../notes/architecture")
  check("minimap present", dom.hasMinimap)

  // Theme wiring: Quartz's darkmode toggle dispatches "themechange".
  const themedDark = await page.evaluate(async () => {
    const viewerEl = document.querySelector(".canvas-page-mount .JSON-Canvas-Viewer")
    const before = getComputedStyle(viewerEl).getPropertyValue("--background").trim()
    document.dispatchEvent(new CustomEvent("themechange", { detail: { theme: "dark" } }))
    await new Promise((resolve) => setTimeout(resolve, 300))
    const after = getComputedStyle(viewerEl).getPropertyValue("--background").trim()
    return { before, after }
  })
  check("viewer reacts to themechange", themedDark.before !== themedDark.after, JSON.stringify(themedDark))

  const ownErrors = [...consoleErrors, ...pageErrors]
    .filter((text) => !EXTERNAL_HOSTS.some((host) => text.includes(host)))
    // Errors whose stack points at any non-local origin come from embedded
    // third-party pages (link-card iframes) or blocked CDNs — not our code.
    .filter((text) => {
      const urls = text.match(/https?:\/\/[^\s):]+/g) ?? []
      return urls.length === 0 || urls.some((url) => url.startsWith(base))
    })
  check("no console/page errors from our origin", ownErrors.length === 0, ownErrors.join(" | "))

  fs.mkdirSync(path.join(repoRoot, ".out"), { recursive: true })
  await page.screenshot({ path: path.join(repoRoot, ".out", "phase-2-canvas-smoke.png") })
  await browser.close()
}

// --- 5. Summary ----------------------------------------------------------------
server.close()
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length === 0 ? 0 : 1)
