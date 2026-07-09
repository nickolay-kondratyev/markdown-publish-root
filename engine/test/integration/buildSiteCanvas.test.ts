import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { after, before, describe, test } from "node:test"
import { SiteBuilder } from "../../src/siteBuilder.ts"
import { SiteConfigParser } from "../../src/siteConfig.ts"

// The fixture vault's private note carries this sentinel (test-vault/README.md);
// it must appear NOWHERE in emitted output.
const LEAK_SENTINEL = "LEAK-SENTINEL-9f3a72"
// The private note's path/filename is title-derived content — the emitted
// canvas page must not contain it either (plan §4.4).
const PRIVATE_PATH_MARKER = "private-secret"

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..")
const VAULT_DIR = path.join(REPO_ROOT, "test-vault")
const OUT_DIR = path.join(REPO_ROOT, ".build", "integration-canvas-out")

const MAIN_CANVAS_PAGE = "canvases/main.canvas.html"
const SECOND_CANVAS_PAGE = "canvases/second.canvas.html"

interface CanvasPayload {
  canvas: { nodes: any[]; edges: any[] }
  attachments: Record<string, string>
  noteLinks: Record<string, { href: string; title: string; subpathLabel?: string }>
}

describe("SiteBuilder integration — builds test-vault WITH canvases", () => {
  // GIVEN the fixture vault WHEN building once with the canvases folder included
  before(async () => {
    const siteConfig = SiteConfigParser.parse({
      title: "Canvas Integration Test Site",
      baseUrl: "canvas-it.example.com",
      publishFilter: { includeFolders: ["canvases"] },
    })
    fs.rmSync(OUT_DIR, { recursive: true, force: true })
    await new SiteBuilder().buildSite({ vaultDir: VAULT_DIR, siteConfig, outDir: OUT_DIR })
  })

  after(() => fs.rmSync(OUT_DIR, { recursive: true, force: true }))

  test("THEN a page is emitted for each canvas", () => {
    assert.deepEqual(
      [MAIN_CANVAS_PAGE, SECOND_CANVAS_PAGE].map((p) => fs.existsSync(path.join(OUT_DIR, p))),
      [true, true],
    )
  })

  test("THEN the self-hosted viewer bundle is emitted", () => {
    assert.equal(fs.existsSync(path.join(OUT_DIR, "static/canvas-viewer.js")), true)
  })

  test("THEN the content index lists both canvases (graph/search)", () => {
    const contentIndex = readContentIndex()
    assert.deepEqual(
      ["canvases/main.canvas", "canvases/second.canvas"].map((slug) => slug in contentIndex),
      [true, true],
    )
  })

  test("THEN the main canvas registers its outbound links (backlinks/graph)", () => {
    const links: string[] = readContentIndex()["canvases/main.canvas"].links
    assert.deepEqual(
      ["notes/getting-started", "notes/architecture", "canvases/second.canvas"].map((slug) =>
        links.includes(slug),
      ),
      [true, true, true],
    )
  })

  test("THEN the canvas does NOT register a link to the private note", () => {
    const links: string[] = readContentIndex()["canvases/main.canvas"].links
    assert.equal(links.some((l) => l.includes(PRIVATE_PATH_MARKER)), false)
  })

  test("THEN a markdown note's [[main.canvas]] wikilink resolves to the emitted canvas page", () => {
    const html = fs.readFileSync(path.join(OUT_DIR, "notes/getting-started.html"), "utf-8")
    const href = html.match(/href="([^"]*main\.canvas[^"#]*)"/)?.[1]
    assert.notEqual(href, undefined, "expected a main.canvas href in notes/getting-started.html")
    const target = resolveFromPage("notes/getting-started", href as string)
    assert.equal(fs.existsSync(path.join(OUT_DIR, `${target}.html`)), true)
  })

  test("THEN the second canvas page lists the main canvas in its backlinks", () => {
    const html = fs.readFileSync(path.join(OUT_DIR, SECOND_CANVAS_PAGE), "utf-8")
    assert.match(html, /href="\.\.\/canvases\/main\.canvas"/)
  })

  test("THEN the leak sentinel appears NOWHERE in the output", () => {
    assert.deepEqual(filesContaining(OUT_DIR, LEAK_SENTINEL), [])
  })

  test("THEN the private-note card is a contentless placeholder", () => {
    const node = mainCanvasNode("file-private")
    assert.deepEqual(
      { type: node.type, placeholder: /Private note/.test(node.text), file: node.file },
      { type: "text", placeholder: true, file: undefined },
    )
  })

  test("THEN the private note's path appears nowhere on the canvas page", () => {
    const html = fs.readFileSync(path.join(OUT_DIR, MAIN_CANVAS_PAGE), "utf-8")
    assert.equal(html.includes(PRIVATE_PATH_MARKER), false)
  })

  test("THEN the private-note card keeps its id and coordinates (commenting anchors)", () => {
    const node = mainCanvasNode("file-private")
    assert.deepEqual(
      { x: node.x, y: node.y, width: node.width, height: node.height },
      { x: -40, y: 480, width: 400, height: 300 },
    )
  })

  test("THEN every attachments-map URL resolves to an emitted file (viewer renders 404 bodies otherwise)", () => {
    for (const page of ["canvases/main.canvas", "canvases/second.canvas"]) {
      const payload = readCanvasPayload(`${page}.html`)
      const broken = Object.entries(payload.attachments)
        .map(([, url]) => resolveFromPage(page, url))
        .filter((sitePath) => !fs.existsSync(path.join(OUT_DIR, sitePath)))
      assert.deepEqual(broken, [], `broken attachment URLs on ${page}`)
    }
  })

  test("THEN every remaining file node has an attachments entry", () => {
    const payload = readCanvasPayload(MAIN_CANVAS_PAGE)
    const uncovered = payload.canvas.nodes
      .filter((n) => n.type === "file")
      .filter((n) => !(n.file in payload.attachments))
      .map((n) => n.id)
    assert.deepEqual(uncovered, [])
  })

  test("THEN the #Installation subpath fragment contains ONLY that section", () => {
    const fragment = fs.readFileSync(
      path.join(OUT_DIR, "canvases/main.canvas.fragments/file-note-subpath.html"),
      "utf-8",
    )
    assert.deepEqual(
      {
        installation: fragment.includes('id="installation"'),
        usage: fragment.includes('id="usage"'),
        advanced: fragment.includes('id="advanced"'),
      },
      { installation: true, usage: false, advanced: false },
    )
  })

  test("THEN the full-note fragment carries Quartz-rendered content with the block anchor", () => {
    const fragment = fs.readFileSync(
      path.join(OUT_DIR, "canvases/main.canvas.fragments/file-note-full.html"),
      "utf-8",
    )
    assert.match(fragment, /id="engine-def"/)
  })

  test("THEN note-fragment links resolve to emitted pages from the CANVAS page's URL", () => {
    const fragment = fs.readFileSync(
      path.join(OUT_DIR, "canvases/main.canvas.fragments/file-note-full.html"),
      "utf-8",
    )
    // architecture.md links [[getting-started]]; injected into the canvas page,
    // its rebased href must land on the note page.
    const hrefs = [...fragment.matchAll(/href="([^"#]+)"/g)]
      .map((m) => m[1] as string)
      .filter((href) => !href.startsWith("http"))
    const resolved = hrefs.map((href) => resolveFromPage("canvases/main.canvas", href))
    assert.equal(
      resolved.includes(path.normalize("notes/getting-started")),
      true,
      `expected a rebased link to notes/getting-started, got: ${resolved.join(", ")}`,
    )
  })

  test("THEN the open-note affordance targets resolve to emitted pages", () => {
    const payload = readCanvasPayload(MAIN_CANVAS_PAGE)
    const broken = Object.values(payload.noteLinks)
      .map((link) => resolveFromPage("canvases/main.canvas", link.href.split("#")[0] as string))
      .filter((sitePath) => !fs.existsSync(path.join(OUT_DIR, `${sitePath}.html`)))
    assert.deepEqual(broken, [])
  })

  test("THEN text cards carry prebaked HTML with resolved wikilinks", () => {
    const node = mainCanvasNode("text-welcome")
    assert.deepEqual(
      {
        renderedHeading: /<h1[^>]*>/.test(node.text),
        noteLink: node.text.includes("../notes/getting-started"),
        canvasLink: node.text.includes("../canvases/second.canvas"),
      },
      { renderedHeading: true, noteLink: true, canvasLink: true },
    )
  })

  test("THEN the canvas->canvas card is a navigable link card to the second canvas", () => {
    const node = mainCanvasNode("file-canvas-card")
    assert.deepEqual(
      { type: node.type, navigable: node.text.includes('href="../canvases/second.canvas"') },
      { type: "text", navigable: true },
    )
  })

  test("THEN canvas search text (text cards) lands in the content index", () => {
    const entry = readContentIndex()["canvases/main.canvas"]
    assert.match(entry.content, /Main Canvas/)
  })
})

// --- helpers -----------------------------------------------------------------

function readContentIndex(): Record<string, any> {
  return JSON.parse(fs.readFileSync(path.join(OUT_DIR, "static/contentIndex.json"), "utf-8"))
}

function readCanvasPayload(pageRelPath: string): CanvasPayload {
  const html = fs.readFileSync(path.join(OUT_DIR, pageRelPath), "utf-8")
  const match = html.match(/<script type="application\/json"[^>]*data-canvas-data[^>]*>(.*?)<\/script>/s)
  assert.notEqual(match, null, `no embedded canvas payload in ${pageRelPath}`)
  return JSON.parse((match as RegExpMatchArray)[1] as string)
}

function mainCanvasNode(id: string): any {
  const payload = readCanvasPayload(MAIN_CANVAS_PAGE)
  const node = payload.canvas.nodes.find((n) => n.id === id)
  assert.notEqual(node, undefined, `node ${id} missing from main canvas payload`)
  return node
}

/** Resolve a page-relative URL the way a browser would, into a site-relative path. */
function resolveFromPage(pageSlug: string, relativeUrl: string): string {
  const resolved = new URL(relativeUrl, `https://site.example/${pageSlug}`)
  return path.normalize(decodeURIComponent(resolved.pathname).replace(/^\//, ""))
}

function listFiles(dir: string): string[] {
  return fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)))
}

function filesContaining(dir: string, needle: string): string[] {
  return listFiles(dir).filter((relPath) =>
    fs.readFileSync(path.join(dir, relPath)).includes(needle),
  )
}
