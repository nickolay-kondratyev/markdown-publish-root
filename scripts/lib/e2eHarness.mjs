/**
 * Shared harness for the e2e scripts (e2e-smoke.mjs, e2e-canvas-flow.mjs):
 * build the test-vault through the real engine, serve it with the REAL
 * `publish preview` server, drive it in headless system Chromium.
 * One home for this knowledge — the scripts stay assertion-only.
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { ID_NAMESPACE_DIR, SiteBuilder, SiteConfigParser } from "../../engine/src/index.ts"
import { PreviewServer } from "../../cli/src/preview/previewServer.ts"

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..")

/** Published namespace dir every doc page lives under (engine's ID_NAMESPACE_DIR). */
export { ID_NAMESPACE_DIR }

/**
 * Doc pages live at stable-id URLs (plan/id-based-publishing.md); read the
 * ids from the stamped test-vault fixtures — the vault is the source of truth.
 */
export function docIdOf(vaultRelPath) {
  const content = fs.readFileSync(path.join(repoRoot, "test-vault", vaultRelPath), "utf-8")
  if (vaultRelPath.endsWith(".canvas")) return JSON.parse(content).metadata.frontmatter.id
  return content.match(/^id: (docid_[0-9a-z]{21}_e)$/m)[1]
}
export const CHROMIUM_PATH = "/usr/bin/chromium"
// External hosts stock Quartz / embedded link-card pages reference (fonts/katex
// CDNs); unreachable in a sandboxed/offline run, so failures for THEM are not
// our defects.
export const EXTERNAL_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com", "cdn.jsdelivr.net", "cdnjs.cloudflare.com"]

/** Build test-vault (canvases included) into .build/<dirName>. */
export async function buildTestVaultSite(dirName) {
  const siteDir = path.join(repoRoot, ".build", dirName)
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
  return { siteDir, buildResult }
}

/** @returns {Promise<{server: PreviewServer, base: string}>} preview server on a free port */
export async function startPreview(siteDir) {
  const server = new PreviewServer(siteDir)
  const address = await server.start(0)
  return { server, base: `http://127.0.0.1:${address.port}` }
}

/**
 * Launch headless system Chromium and collect console/page errors.
 * @returns {Promise<{browser: any, page: any, errors: string[]} | undefined>}
 *   undefined when Chromium is not installed (caller should SKIP).
 */
export async function launchBrowserPage({ width = 1400, height = 900 } = {}) {
  if (!fs.existsSync(CHROMIUM_PATH)) return undefined
  const { chromium } = await import("playwright-core")
  const browser = await chromium.launch({
    executablePath: CHROMIUM_PATH,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  })
  const page = await browser.newPage({ viewport: { width, height } })
  const errors = []
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text())
  })
  // Keep the stack: it attributes the error to an origin (link cards embed
  // third-party pages in sandboxed iframes; their own script errors are not ours).
  page.on("pageerror", (error) => errors.push(error.stack ?? String(error)))
  return { browser, page, errors }
}

/** Errors attributable to OUR origin (drops CDN failures + embedded third-party pages). */
export function filterOwnErrors(errors, base) {
  return errors
    .filter((text) => !EXTERNAL_HOSTS.some((host) => text.includes(host)))
    .filter((text) => {
      // `:` must stay IN the match: `base` always carries a port
      // (http://127.0.0.1:<port>), and startsWith is unharmed by a trailing
      // stack-trace `:line:col`. Excluding it silently dropped ALL own-origin
      // errors — the checks passed while real viewer errors went unseen.
      const urls = text.match(/https?:\/\/[^\s)]+/g) ?? []
      return urls.length === 0 || urls.some((url) => url.startsWith(base))
    })
}

/** PASS/FAIL check collector; `summarize()` prints totals and returns the exit code. */
export function makeChecker() {
  const results = []
  const check = (name, ok, detail = "") => {
    results.push({ name, ok })
    console.log(`${ok ? "PASS" : "FAIL"}: ${name}${detail ? ` — ${detail}` : ""}`)
  }
  const summarize = () => {
    const failed = results.filter((r) => !r.ok)
    console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
    return failed.length === 0 ? 0 : 1
  }
  return { check, summarize }
}
