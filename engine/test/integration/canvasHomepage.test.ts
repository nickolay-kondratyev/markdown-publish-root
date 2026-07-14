import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { after, before, describe, test } from "node:test"
import { SiteBuilder } from "../../src/siteBuilder.ts"
import { SiteConfigParser } from "../../src/siteConfig.ts"

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..")
const VAULT_DIR = path.join(REPO_ROOT, "test-vault")

const HOMEPAGE_CANVAS_ID = "docid_homepagecanvas000000x_e"

// Minimal root canvas: one text card whose wikilink must keep resolving from "/".
const INDEX_CANVAS = JSON.stringify({
  metadata: { frontmatter: { id: HOMEPAGE_CANVAS_ID } },
  nodes: [
    {
      id: "text-welcome",
      type: "text",
      x: 0,
      y: 0,
      width: 400,
      height: 200,
      text: "# Canvas Homepage\n\nStart at [[getting-started]].",
    },
  ],
  edges: [],
})

/**
 * End-to-end check of the canvas-homepage feature: a vault whose landing page
 * is a root index.canvas (NO index.md) must serve that canvas at "/" —
 * Quartz emits /index.canvas.html, the engine aliases it to /index.html.
 */
describe("Canvas-homepage integration — root index.canvas serves at /", () => {
  let workDir: string
  let outDir: string

  // GIVEN a COPY of the fixture vault with index.md REPLACED by index.canvas
  before(async () => {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), "canvas-homepage-integration-test-"))
    const vaultDir = path.join(workDir, "vault")
    outDir = path.join(workDir, "out")
    fs.cpSync(VAULT_DIR, vaultDir, { recursive: true })
    fs.rmSync(path.join(vaultDir, "index.md"))
    fs.writeFileSync(path.join(vaultDir, "index.canvas"), INDEX_CANVAS)
    // publishAll: a ROOT-level canvas has no enclosing folder to opt in via
    // includeFolders (canvases carry no publish frontmatter).
    const siteConfig = SiteConfigParser.parse({
      title: "Canvas Homepage Test Site",
      baseUrl: "canvas-home.example.com",
      publishFilter: { publishAll: true },
    })
    await new SiteBuilder().buildSite({
      vaultDir,
      siteConfig,
      outDir,
      linkMetadataFetcher: async () => ({ ok: false, status: 404, text: async () => "" }),
    })
  })

  after(() => fs.rmSync(workDir, { recursive: true, force: true }))

  test("THEN the canvas page is emitted at the site root", () => {
    assert.equal(fs.existsSync(path.join(outDir, "index.canvas.html")), true)
  })

  test("THEN /index.html is a byte-identical copy of the canvas page", () => {
    const homepage = fs.readFileSync(path.join(outDir, "index.html"), "utf-8")
    const canvasPage = fs.readFileSync(path.join(outDir, "index.canvas.html"), "utf-8")
    assert.equal(homepage, canvasPage)
  })

  test("THEN the homepage carries the embedded canvas payload", () => {
    const homepage = fs.readFileSync(path.join(outDir, "index.html"), "utf-8")
    assert.match(homepage, /data-canvas-data/)
  })

  test("THEN every relative asset URL on the homepage resolves from / (root depth)", () => {
    const homepage = fs.readFileSync(path.join(outDir, "index.html"), "utf-8")
    const urls = [...homepage.matchAll(/(?:href|src)="([^"#]+)"/g)]
      .map((m) => m[1] as string)
      .filter((url) => !url.startsWith("http") && !url.startsWith("data:"))
    const broken = urls
      .map((url) => resolveFromRoot(url))
      .filter(
        (sitePath) =>
          !fs.existsSync(path.join(outDir, sitePath)) &&
          !fs.existsSync(path.join(outDir, `${sitePath}.html`)),
      )
    assert.deepEqual(broken, [], "homepage URLs must resolve at root depth")
  })
})

/** Resolve a homepage-relative URL the way a browser at "/" would. */
function resolveFromRoot(relativeUrl: string): string {
  const resolved = new URL(relativeUrl, "https://site.example/")
  return path.normalize(decodeURIComponent(resolved.pathname).replace(/^\//, "").replace(/\/$/, ""))
}
