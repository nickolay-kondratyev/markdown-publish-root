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
 * Viewer interactions (selection, pan/zoom, fullscreen, navigation) are
 * covered in depth by scripts/e2e-canvas-flow.mjs — this smoke only proves
 * the viewer MOUNTS and shows build-time-rewritten content.
 *
 * Run: `npm run test:e2e` (Node >= 22 via nvm; system Chromium at /usr/bin/chromium).
 * Exits non-zero on any failed check. Screenshot -> .out/phase-2-canvas-smoke.png.
 */
import { spawnSync } from "node:child_process"
import http from "node:http"
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

// --- 1. Build --------------------------------------------------------------
console.log("building test-vault (canvases included)...")
const { siteDir, buildResult } = await buildTestVaultSite("e2e-canvas-site")

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
const { server, base } = await startPreview(siteDir)
console.log(`serving ${siteDir} at ${base} (publish preview server)`)

// --- 3. HTTP checks ----------------------------------------------------------
const status = async (p) => (await fetch(base + p)).status
check("canvas page (main) 200", (await status("/canvases/main.canvas.html")) === 200)
check("canvas page (second) 200", (await status("/canvases/second.canvas.html")) === 200)
check("viewer bundle 200", (await status("/static/canvas-viewer.js")) === 200)
check("note fragment (full) 200", (await status("/canvases/main.canvas.fragments/file-note-full.html")) === 200)
check("note fragment (subpath) 200", (await status("/canvases/main.canvas.fragments/file-note-subpath.html")) === 200)
check("image asset 200", (await status("/attachments/diagram.png")) === 200)
check("private note 404", (await status("/notes/private-secret.html")) === 404)

// --- 3b. Preview-server routing contract over REAL build output ---------------
// Raw request that sends the path VERBATIM: fetch()/WHATWG URL normalize `..`
// and `%2e%2e` dot-segments client-side, which would hide traversal attempts.
const rawGet = (rawPath) =>
  new Promise((resolve, reject) => {
    const request = http.request(
      { host: "127.0.0.1", port: new URL(base).port, path: rawPath, method: "GET" },
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
check("preview: extensionless canvas URL 200 (the exact URL that 404'd on plain servers)", (await status("/canvases/main.canvas")) === 200)
check("preview: extensionless note URL 200", (await status("/notes/architecture")) === 200)
check("preview: folder URL without slash redirects to slashed folder index", (await fetch(`${base}/notes`, { redirect: "manual" })).status === 302)
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

const mainHtml = await (await fetch(base + "/canvases/main.canvas.html")).text()
check(
  "canvas JSON embeds rewritten fragment URL",
  mainHtml.includes("main.canvas.fragments/file-note-full.html"),
)
check("canvas JSON embeds rewritten wikilink URL", mainHtml.includes("../notes/getting-started"))
check("no leak sentinel on canvas page", !mainHtml.includes("LEAK-SENTINEL-9f3a72"))
check("no private path on canvas page", !mainHtml.includes("private-secret"))

// --- 4. Headless browser smoke ----------------------------------------------
const launched = await launchBrowserPage()
if (launched === undefined) {
  console.log("SKIP: headless browser smoke (chromium not found)")
} else {
  const { browser, page, errors } = launched

  await page.goto(`${base}/canvases/main.canvas.html`)
  await page.waitForSelector(".canvas-page-mount .react-flow__node", { timeout: 10000 })
  await page.waitForTimeout(1200) // async node bodies (fragment fetches) settle

  const dom = await page.evaluate(() => {
    const node = (id) => document.querySelector(`.canvas-page-mount .react-flow__node[data-id="${CSS.escape(id)}"]`)
    return {
      nodeIds: [...document.querySelectorAll(".canvas-page-mount .react-flow__node")].map((e) =>
        e.getAttribute("data-id"),
      ),
      welcomeHtml: node("text-welcome")?.innerHTML ?? "",
      noteFullText: node("file-note-full")?.textContent ?? "",
      noteSubpathText: node("file-note-subpath")?.textContent ?? "",
      privateText: node("file-private")?.textContent ?? "",
      canvasCardHtml: node("file-canvas-card")?.innerHTML ?? "",
      imageSrc: node("file-image")?.querySelector("img")?.getAttribute("src") ?? "",
      openNoteHref: node("file-note-full")?.querySelector(".canvas-note-open")?.getAttribute("href") ?? "",
      hasMinimap: document.querySelector(".canvas-page-mount .react-flow__minimap") !== null,
    }
  })

  check("viewer mounted with rendered nodes", dom.nodeIds.length >= 6, `nodes: ${dom.nodeIds.join(",")}`)
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

  // Theme wiring: Quartz's darkmode toggle sets <html saved-theme> (drives the
  // CSS vars our cards use) AND dispatches "themechange" (drives React Flow's
  // colorMode) — mirror both, like the real toggle.
  const themedDark = await page.evaluate(async () => {
    const viewerEl = document.querySelector(".canvas-page-mount .canvas-flow-viewer .react-flow")
    const before = getComputedStyle(viewerEl).backgroundColor
    document.documentElement.setAttribute("saved-theme", "dark")
    document.dispatchEvent(new CustomEvent("themechange", { detail: { theme: "dark" } }))
    await new Promise((resolve) => setTimeout(resolve, 300))
    const after = getComputedStyle(viewerEl).backgroundColor
    return { before, after }
  })
  check("viewer reacts to themechange", themedDark.before !== themedDark.after, JSON.stringify(themedDark))

  const ownErrors = filterOwnErrors(errors, base)
  check("no console/page errors from our origin", ownErrors.length === 0, ownErrors.join(" | "))

  fs.mkdirSync(path.join(repoRoot, ".out"), { recursive: true })
  await page.screenshot({ path: path.join(repoRoot, ".out", "phase-2-canvas-smoke.png") })
  await browser.close()
}

// --- 5. Summary ----------------------------------------------------------------
await server.stop()
process.exit(summarize())
