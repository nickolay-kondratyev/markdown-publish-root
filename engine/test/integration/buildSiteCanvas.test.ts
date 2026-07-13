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

// Stable-id slugs (plan/id-based-publishing.md): read from the stamped fixtures.
const MAIN_CANVAS_SLUG = `n/${docIdOf("canvases/main.canvas")}.canvas`
const SECOND_CANVAS_SLUG = `n/${docIdOf("canvases/second.canvas")}.canvas`
const URL_CANVAS_SLUG = `n/${docIdOf("canvases/impl/Canvas With Url.canvas")}.canvas`
const GETTING_STARTED_SLUG = `n/${docIdOf("notes/getting-started.md")}`
const ARCHITECTURE_SLUG = `n/${docIdOf("notes/architecture.md")}`

const MAIN_CANVAS_PAGE = `${MAIN_CANVAS_SLUG}.html`
const SECOND_CANVAS_PAGE = `${SECOND_CANVAS_SLUG}.html`
const URL_CANVAS_PAGE = `${URL_CANVAS_SLUG}.html`

// Canned metadata stub returned by the injected fetcher for google.com
// (deterministic + offline: integration builds must never hit the network).
const STUB_GOOGLE_TITLE = "STUB-GOOGLE-TITLE"
const CANNED_OG_BY_URL: Record<string, string> = {
  "https://www.google.com": `<meta property="og:title" content="${STUB_GOOGLE_TITLE}"><meta property="og:description" content="stub description">`,
}

interface CanvasPayload {
  canvas: { nodes: any[]; edges: any[] }
  attachments: Record<string, string>
  noteLinks: Record<string, { href: string; title: string; fragmentUrl: string; subpathLabel?: string }>
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
    await new SiteBuilder().buildSite({
      vaultDir: VAULT_DIR,
      siteConfig,
      outDir: OUT_DIR,
      linkMetadataFetcher: async (url) => ({
        ok: url in CANNED_OG_BY_URL,
        status: url in CANNED_OG_BY_URL ? 200 : 404,
        text: async () => CANNED_OG_BY_URL[url] ?? "",
      }),
    })
  })

  after(() => fs.rmSync(OUT_DIR, { recursive: true, force: true }))

  test("THEN a page is emitted for each canvas under its stable-id URL", () => {
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
      [MAIN_CANVAS_SLUG, SECOND_CANVAS_SLUG].map((slug) => slug in contentIndex),
      [true, true],
    )
  })

  test("THEN the canvas page title is the original basename, NOT the docid", () => {
    assert.equal(readContentIndex()[MAIN_CANVAS_SLUG].title, "main")
  })

  test("THEN the main canvas registers its outbound links (backlinks/graph)", () => {
    const links: string[] = readContentIndex()[MAIN_CANVAS_SLUG].links
    assert.deepEqual(
      [GETTING_STARTED_SLUG, ARCHITECTURE_SLUG, SECOND_CANVAS_SLUG].map((slug) =>
        links.includes(slug),
      ),
      [true, true, true],
    )
  })

  test("THEN the canvas does NOT register a link to the private note", () => {
    const links: string[] = readContentIndex()[MAIN_CANVAS_SLUG].links
    assert.equal(links.some((l) => l.includes(PRIVATE_PATH_MARKER)), false)
  })

  test("THEN a markdown note's [[main.canvas]] wikilink resolves to the emitted canvas page", () => {
    const html = fs.readFileSync(path.join(OUT_DIR, `${GETTING_STARTED_SLUG}.html`), "utf-8")
    const escapedSlugTail = `${docIdOf("canvases/main.canvas")}\\.canvas`
    const href = html.match(new RegExp(`href="([^"]*${escapedSlugTail}[^"#]*)"`))?.[1]
    assert.notEqual(href, undefined, "expected a main-canvas href in the getting-started page")
    const target = resolveFromPage(GETTING_STARTED_SLUG, href as string)
    assert.equal(fs.existsSync(path.join(OUT_DIR, `${target}.html`)), true)
  })

  test("THEN the second canvas page lists the main canvas in its backlinks", () => {
    const html = fs.readFileSync(path.join(OUT_DIR, SECOND_CANVAS_PAGE), "utf-8")
    const backlink = [...html.matchAll(/href="([^"#]+)"/g)]
      .map((m) => resolveFromPage(SECOND_CANVAS_SLUG, m[1] as string))
      .includes(path.normalize(MAIN_CANVAS_SLUG))
    assert.equal(backlink, true)
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

  test("THEN every content URL (attachments + per-node fragmentUrls) resolves to an emitted file (viewer renders 404 bodies otherwise)", () => {
    for (const page of [MAIN_CANVAS_SLUG, SECOND_CANVAS_SLUG]) {
      const payload = readCanvasPayload(`${page}.html`)
      const urls = [
        ...Object.values(payload.attachments),
        ...Object.values(payload.noteLinks).map((link) => link.fragmentUrl),
      ]
      const broken = urls
        .map((url) => resolveFromPage(page, url))
        .filter((sitePath) => !fs.existsSync(path.join(OUT_DIR, sitePath)))
      assert.deepEqual(broken, [], `broken content URLs on ${page}`)
    }
  })

  test("THEN every remaining file node has a content URL (media: attachments, notes: per-node fragmentUrl)", () => {
    const payload = readCanvasPayload(MAIN_CANVAS_PAGE)
    const uncovered = payload.canvas.nodes
      .filter((n) => n.type === "file")
      .filter((n) => !(n.file in payload.attachments) && payload.noteLinks[n.id]?.fragmentUrl === undefined)
      .map((n) => n.id)
    assert.deepEqual(uncovered, [])
  })

  test("THEN the #Installation subpath fragment contains ONLY that section", () => {
    const fragment = fs.readFileSync(
      path.join(OUT_DIR, `${MAIN_CANVAS_SLUG}.fragments/file-note-subpath.html`),
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
      path.join(OUT_DIR, `${MAIN_CANVAS_SLUG}.fragments/file-note-full.html`),
      "utf-8",
    )
    assert.match(fragment, /id="engine-def"/)
  })

  test("THEN note-fragment links resolve to emitted pages from the CANVAS page's URL", () => {
    const fragment = fs.readFileSync(
      path.join(OUT_DIR, `${MAIN_CANVAS_SLUG}.fragments/file-note-full.html`),
      "utf-8",
    )
    // architecture.md links [[getting-started]]; injected into the canvas page,
    // its rebased href must land on the note's stable-id page.
    const hrefs = [...fragment.matchAll(/href="([^"#]+)"/g)]
      .map((m) => m[1] as string)
      .filter((href) => !href.startsWith("http"))
    const resolved = hrefs.map((href) => resolveFromPage(MAIN_CANVAS_SLUG, href))
    assert.equal(
      resolved.includes(path.normalize(GETTING_STARTED_SLUG)),
      true,
      `expected a rebased link to ${GETTING_STARTED_SLUG}, got: ${resolved.join(", ")}`,
    )
  })

  test("THEN the open-note affordance targets resolve to emitted pages", () => {
    const payload = readCanvasPayload(MAIN_CANVAS_PAGE)
    const broken = Object.values(payload.noteLinks)
      .map((link) => resolveFromPage(MAIN_CANVAS_SLUG, link.href.split("#")[0] as string))
      .filter((sitePath) => !fs.existsSync(path.join(OUT_DIR, `${sitePath}.html`)))
    assert.deepEqual(broken, [])
  })

  test("THEN the open-note affordance shows the human title, not the docid", () => {
    const payload = readCanvasPayload(MAIN_CANVAS_PAGE)
    const titles = Object.values(payload.noteLinks).map((link) => link.title)
    assert.equal(titles.includes("Architecture"), true, `titles: ${titles.join(", ")}`)
  })

  test("THEN text cards carry prebaked HTML with resolved stable-id wikilinks", () => {
    const node = mainCanvasNode("text-welcome")
    assert.deepEqual(
      {
        renderedHeading: /<h1[^>]*>/.test(node.text),
        noteLink: node.text.includes(docIdOf("notes/getting-started.md")),
        canvasLink: node.text.includes(`${docIdOf("canvases/second.canvas")}.canvas`),
        displayText: node.text.includes(">getting-started<"),
      },
      { renderedHeading: true, noteLink: true, canvasLink: true, displayText: true },
    )
  })

  test("THEN the canvas->canvas card is a navigable link card to the second canvas", () => {
    const node = mainCanvasNode("file-canvas-card")
    assert.deepEqual(
      {
        type: node.type,
        navigable: node.text.includes(`${docIdOf("canvases/second.canvas")}.canvas`),
        humanTitle: node.text.includes(">second<"),
      },
      { type: "text", navigable: true, humanTitle: true },
    )
  })

  test("THEN canvas search text (text cards) lands in the content index", () => {
    const entry = readContentIndex()[MAIN_CANVAS_SLUG]
    assert.match(entry.content, /Main Canvas/)
  })

  // --- search-in-canvas: EVERYTHING visible on the canvas is searchable --------

  test("THEN embedded-note body text lands in the canvas's content-index entry", () => {
    const entry = readContentIndex()[MAIN_CANVAS_SLUG]
    assert.match(entry.content, /pure build engine/)
  })

  test("THEN a subpath note card contributes ONLY its embedded section", () => {
    const content: string = readContentIndex()[MAIN_CANVAS_SLUG].content
    assert.deepEqual(
      {
        installation: content.includes("Installation is easy"),
        usage: content.includes("Basic usage instructions"),
        advancedNotEmbedded: content.includes("Advanced tips"),
      },
      { installation: true, usage: true, advancedNotEmbedded: false },
    )
  })

  test("THEN group labels, link URLs, edge labels, and card titles are searchable", () => {
    const content: string = readContentIndex()[MAIN_CANVAS_SLUG].content
    assert.deepEqual(
      {
        groupLabel: content.includes("Intro Group"),
        linkUrl: content.includes("jsoncanvas.org"),
        edgeLabel: content.includes("embeds note"),
        canvasCardTitle: content.includes("second"),
      },
      { groupLabel: true, linkUrl: true, edgeLabel: true, canvasCardTitle: true },
    )
  })

  // --- search preview (docs/tickets/canvas-in-search-results.md) ---------------
  // The search preview panel (and link popovers) clone `.popover-hint` from the
  // FETCHED static HTML — the canvas page must server-render its text preview.

  test("THEN the canvas page embeds a popover-hint text preview with one bracketed line per card", () => {
    const html = fs.readFileSync(path.join(OUT_DIR, MAIN_CANVAS_PAGE), "utf-8")
    assert.deepEqual(
      {
        previewBlock: html.includes('class="popover-hint canvas-text-preview"'),
        bracketedGroupLabel: html.includes("[Intro Group]"),
      },
      { previewBlock: true, bracketedGroupLabel: true },
    )
  })

  test("THEN the embedded client payload stays lean (no previewParts in the data script)", () => {
    const payload = readCanvasPayload(MAIN_CANVAS_PAGE)
    assert.equal("previewParts" in payload, false)
  })

  // --- link nodes: provider embeds + link cards (canvases/impl/Canvas With Url) --

  test("THEN YouTube watch/shorts link nodes carry nocookie embed URLs", () => {
    const payload = readCanvasPayload(URL_CANVAS_PAGE)
    const linkOf = (id: string) => payload.canvas.nodes.find((n) => n.id === id)?.vintrinLink
    assert.deepEqual(
      { watch: linkOf("37709759f2fb9207"), shorts: linkOf("cc1662f44426b3a5") },
      {
        watch: { mode: "embed", embedUrl: "https://www.youtube-nocookie.com/embed/Jk71bPz5VLo" },
        shorts: { mode: "embed", embedUrl: "https://www.youtube-nocookie.com/embed/aj09fctv1Mc" },
      },
    )
  })

  test("THEN the non-framable google.com node is a link card with fetched metadata", () => {
    const payload = readCanvasPayload(URL_CANVAS_PAGE)
    const node = payload.canvas.nodes.find((n) => n.id === "453ef57832cea649")
    assert.deepEqual(node?.vintrinLink, {
      mode: "card",
      meta: {
        domain: "www.google.com",
        title: STUB_GOOGLE_TITLE,
        description: "stub description",
      },
    })
  })

  test("THEN the engine-internal vintrinLinkMeta key never reaches the client payload", () => {
    const payload = readCanvasPayload(URL_CANVAS_PAGE)
    assert.deepEqual(
      payload.canvas.nodes.filter((n) => "vintrinLinkMeta" in n).map((n) => n.id),
      [],
    )
  })

  test("THEN the fetched card title lands in the canvas's search content", () => {
    assert.match(readContentIndex()[URL_CANVAS_SLUG].content, new RegExp(STUB_GOOGLE_TITLE))
  })

  test("THEN canvas pages carry the frame-src CSP meta; note pages do not", () => {
    // Preact renders attribute values with literal single quotes (no escaping).
    const cspMeta = /<meta http-equiv="Content-Security-Policy" content="frame-src 'self'/
    const canvasHtml = fs.readFileSync(path.join(OUT_DIR, URL_CANVAS_PAGE), "utf-8")
    const noteHtml = fs.readFileSync(path.join(OUT_DIR, `${GETTING_STARTED_SLUG}.html`), "utf-8")
    assert.deepEqual(
      { canvas: cspMeta.test(canvasHtml), note: noteHtml.includes("Content-Security-Policy") },
      { canvas: true, note: false },
    )
  })

  test("THEN the CSP whitelists the youtube-nocookie embed origin", () => {
    const canvasHtml = fs.readFileSync(path.join(OUT_DIR, URL_CANVAS_PAGE), "utf-8")
    assert.match(canvasHtml, /https:\/\/www\.youtube-nocookie\.com/)
  })

  test("THEN the private note contributes NOTHING to the canvas's search content", () => {
    const content: string = readContentIndex()[MAIN_CANVAS_SLUG].content
    assert.deepEqual(
      {
        path: content.includes(PRIVATE_PATH_MARKER),
        sentinel: content.includes(LEAK_SENTINEL),
        placeholderLabel: content.includes("Private note"),
      },
      { path: false, sentinel: false, placeholderLabel: false },
    )
  })
})

// --- helpers -----------------------------------------------------------------

/** Stable id of a fixture doc, read from the stamped vault (source of truth). */
function docIdOf(vaultRelPath: string): string {
  const content = fs.readFileSync(path.join(VAULT_DIR, vaultRelPath), "utf-8")
  if (vaultRelPath.endsWith(".canvas")) {
    return JSON.parse(content).metadata.frontmatter.id
  }
  const match = content.match(/^id: (docid_[0-9a-z]{21}_e)$/m)
  assert.notEqual(match, null, `no docid in fixture ${vaultRelPath}`)
  return (match as RegExpMatchArray)[1] as string
}

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
