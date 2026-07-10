#!/usr/bin/env node
/**
 * E2e smoke: build test-vault (canvases included) through the real engine,
 * serve the output with the REAL `publish preview` server (the URL-routing
 * contract of docs/hosting.md), then verify over HTTP + headless Chromium
 * that the canvas viewer actually mounts and renders build-time-rewritten
 * content. Phase 3 adds: validation-pass assertions on the build result and
 * a `publish deploy --dry-run` exercise through the real CLI (no aws CLI /
 * credentials needed). Preview routing checks (extensionless URLs, 404 page,
 * traversal rejection) run against this real output too.
 *
 * Run: `npm run test:e2e` (Node >= 22 via nvm; system Chromium at /usr/bin/chromium).
 * Exits non-zero on any failed check. Screenshot -> .out/phase-2-canvas-smoke.png.
 */
import { spawnSync } from "node:child_process"
import http from "node:http"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { SiteBuilder, SiteConfigParser } from "../engine/src/index.ts"
import { PreviewServer } from "../cli/src/preview/previewServer.ts"

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

// Doc pages live at stable-id URLs (plan/id-based-publishing.md); read the
// ids from the stamped fixtures — the vault is the source of truth.
const docIdOf = (vaultRelPath) => {
  const content = fs.readFileSync(path.join(repoRoot, "test-vault", vaultRelPath), "utf-8")
  if (vaultRelPath.endsWith(".canvas")) return JSON.parse(content).metadata.frontmatter.id
  return content.match(/^id: (docid_[0-9a-z]{21}_e)$/m)[1]
}
const MAIN_CANVAS_SLUG = `n/${docIdOf("canvases/main.canvas")}.canvas`
const SECOND_CANVAS_SLUG = `n/${docIdOf("canvases/second.canvas")}.canvas`
const GETTING_STARTED_SLUG = `n/${docIdOf("notes/getting-started.md")}`
const ARCHITECTURE_SLUG = `n/${docIdOf("notes/architecture.md")}`
const PRIVATE_NOTE_SLUG = `n/${docIdOf("notes/private-secret.md")}`

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

// --- 2. Serve with the REAL preview server (the same URL-routing contract
// production hosting implements — docs/hosting.md) --------------------------
const server = new PreviewServer(siteDir)
const address = await server.start(0)
const base = `http://127.0.0.1:${address.port}`
console.log(`serving ${siteDir} at ${base} (publish preview server)`)

// --- 3. HTTP checks ----------------------------------------------------------
const status = async (p) => (await fetch(base + p)).status
check("canvas page (main) 200", (await status(`/${MAIN_CANVAS_SLUG}.html`)) === 200)
check("canvas page (second) 200", (await status(`/${SECOND_CANVAS_SLUG}.html`)) === 200)
check("viewer bundle 200", (await status("/static/canvas-viewer.js")) === 200)
check("note fragment (full) 200", (await status(`/${MAIN_CANVAS_SLUG}.fragments/file-note-full.html`)) === 200)
check("note fragment (subpath) 200", (await status(`/${MAIN_CANVAS_SLUG}.fragments/file-note-subpath.html`)) === 200)
check("image asset 200", (await status("/attachments/diagram.png")) === 200)
check("private note 404 (id URL)", (await status(`/${PRIVATE_NOTE_SLUG}.html`)) === 404)
check("private note 404 (legacy path URL)", (await status("/notes/private-secret.html")) === 404)

// --- 3b. Preview-server routing contract over REAL build output ---------------
// Raw request that sends the path VERBATIM: fetch()/WHATWG URL normalize `..`
// and `%2e%2e` dot-segments client-side, which would hide traversal attempts.
const rawGet = (rawPath) =>
  new Promise((resolve, reject) => {
    const request = http.request(
      { host: "127.0.0.1", port: address.port, path: rawPath, method: "GET" },
      (response) => {
        let body = ""
        response.on("data", (chunk) => (body += chunk))
        response.on("end", () => resolve({ status: response.statusCode, body }))
      },
    )
    request.on("error", reject)
    request.end()
  })

check("preview: site root / 200", (await status("/")) === 200)
check("preview: extensionless canvas URL 200 (the exact URL that 404'd on plain servers)", (await status(`/${MAIN_CANVAS_SLUG}`)) === 200)
check("preview: extensionless note URL 200", (await status(`/${ARCHITECTURE_SLUG}`)) === 200)
check("preview: folder URL without slash redirects to slashed folder index", (await fetch(`${base}/n`, { redirect: "manual" })).status === 302)
check("preview: missing URL serves themed 404 page with status 404", await (async () => {
  const response = await fetch(`${base}/definitely/not/here`)
  return response.status === 404 && (await response.text()).includes("<html")
})())
const traversalPlain = await rawGet("/../package.json")
check(
  "preview: raw /../package.json rejected, not served",
  traversalPlain.status === 400 && !traversalPlain.body.includes("vintrin-markdown-publish"),
  `status=${traversalPlain.status}`,
)
const traversalEncoded = await rawGet("/%2e%2e/package.json")
check(
  "preview: encoded /%2e%2e/package.json rejected, not served",
  traversalEncoded.status === 400 && !traversalEncoded.body.includes("vintrin-markdown-publish"),
  `status=${traversalEncoded.status}`,
)
const traversalNested = await rawGet("/notes/../../package.json")
check(
  "preview: nested /notes/../../package.json rejected, not served",
  traversalNested.status === 400 && !traversalNested.body.includes("vintrin-markdown-publish"),
  `status=${traversalNested.status}`,
)

const mainHtml = await (await fetch(`${base}/${MAIN_CANVAS_SLUG}.html`)).text()
check(
  "canvas JSON embeds rewritten fragment URL",
  mainHtml.includes(`${docIdOf("canvases/main.canvas")}.canvas.fragments/file-note-full.html`),
)
check("canvas JSON embeds rewritten wikilink URL", mainHtml.includes(`../${GETTING_STARTED_SLUG}`))
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

  await page.goto(`${base}/${MAIN_CANVAS_SLUG}.html`)
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
  check("text card shows prebaked HTML with resolved wikilink", dom.welcomeHtml.includes(`href="../${GETTING_STARTED_SLUG}"`))
  check("note card fetched its prerendered fragment", dom.noteFullText.includes("pure build engine"))
  check(
    "subpath card shows ONLY the Installation section",
    dom.noteSubpathText.includes("Installation is easy") && !dom.noteSubpathText.includes("Advanced tips"),
  )
  check("private card is a contentless placeholder", dom.privateText.trim() === "Private note")
  check("canvas->canvas card links the second canvas", dom.canvasCardHtml.includes(`href="../${SECOND_CANVAS_SLUG}"`))
  check("image card resolved through attachments map", dom.imageSrc.includes("attachments/diagram.png"))
  check("open-note affordance present on note card", dom.openNoteHref === `../${ARCHITECTURE_SLUG}`)
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
await server.stop()
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length === 0 ? 0 : 1)
