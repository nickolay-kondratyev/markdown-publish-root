import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { after, before, describe, test } from "node:test"
import { SiteBuilder } from "../../src/siteBuilder.ts"
import { SiteConfigParser } from "../../src/siteConfig.ts"

/**
 * Folder-shaped navigation over stable-id URLs
 * (plan/folder-nav-over-id-urls.md Phase 4): the Explorer/breadcrumbs show
 * the ORIGINAL vault hierarchy while every doc href stays /n/<docid>[.canvas].
 */

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..")
const VAULT_DIR = path.join(REPO_ROOT, "test-vault")
const OUT_DIR = path.join(REPO_ROOT, ".build", "integration-foldernav-out")

// The private-only folder's NAME is the leak sentinel (test-vault/README.md).
const FOLDER_LEAK_SENTINEL = "vintrin-priv-only-x7q3"
const DOC_HREF_GRAMMAR = /^\/n\/docid_[0-9a-z]{21}_e(\.canvas)?$/

const NESTED_NOTE_SLUG = `n/${docIdOf("notes/guides/deep-dive.md")}`
const MAIN_CANVAS_SLUG = `n/${canvasDocIdOf("canvases/main.canvas")}.canvas`

describe("Folder-nav integration — explorer + breadcrumbs on the fixture vault", () => {
  before(async () => {
    const siteConfig = SiteConfigParser.parse({
      title: "Folder Nav Test Site",
      baseUrl: "foldernav-it.example.com",
      publishFilter: { includeFolders: ["notes", "canvases", "attachments"] },
    })
    fs.rmSync(OUT_DIR, { recursive: true, force: true })
    await new SiteBuilder().buildSite({ vaultDir: VAULT_DIR, siteConfig, outDir: OUT_DIR })
  })

  after(() => fs.rmSync(OUT_DIR, { recursive: true, force: true }))

  test("THEN the explorer shows the nested ORIGINAL folder structure", () => {
    const html = pageHtml("index.html")
    const folderPaths = [...html.matchAll(/data-folderpath="([^"]+)"/g)].map((m) => m[1]).sort()
    // canvases/impl: the URL-canvas fixture folder (canvases/impl/Canvas With Url.canvas).
    assert.deepEqual(folderPaths, ["canvases", "canvases/impl", "notes", "notes/guides"])
  })

  test("THEN the nested note appears under its folder with its TITLE as label", () => {
    assert.equal(pageHtml("index.html").includes(">Deep Dive</a>"), true)
  })

  test("THEN every explorer doc href resolves to a stable-id URL (docid grammar)", () => {
    const pagePath = `${NESTED_NOTE_SLUG}.html`
    const html = pageHtml(pagePath)
    const explorerHrefs = [
      ...html.matchAll(/<a href="([^"]+)" data-slug="[^"]*" class="nav-file-title[^"]*"/g),
    ].map((m) => m[1])
    assert.notEqual(explorerHrefs.length, 0, "explorer must render doc links")
    const resolved = explorerHrefs.map(
      (href) => new URL(href, `https://x.example/${pagePath.replace(/\.html$/, "")}`).pathname,
    )
    assert.deepEqual(
      resolved.filter((sitePath) => !DOC_HREF_GRAMMAR.test(sitePath)),
      [],
    )
  })

  test("THEN explorer folder rows contain NO links (collapse-only folders)", () => {
    const folderContainers = pageHtml("index.html").match(
      /<div class="folder-container[^"]*"[\s\S]*?<\/div>/g,
    )
    assert.notEqual(folderContainers, null)
    assert.deepEqual((folderContainers as string[]).filter((c) => c.includes("<a ")), [])
  })

  test("THEN the nested note's breadcrumbs are Home > notes > guides > Deep Dive", () => {
    const crumbs = crumbTexts(pageHtml(`${NESTED_NOTE_SLUG}.html`))
    assert.deepEqual(crumbs, ["Home", "notes", "guides", "Deep Dive"])
  })

  test("THEN the canvas page's breadcrumbs are Home > canvases > main", () => {
    const crumbs = crumbTexts(pageHtml(`${MAIN_CANVAS_SLUG}.html`))
    assert.deepEqual(crumbs, ["Home", "canvases", "main"])
  })

  test("THEN only the Home crumb is a link (folder crumbs are plain text)", () => {
    const nav = breadcrumbNav(pageHtml(`${NESTED_NOTE_SLUG}.html`))
    assert.deepEqual([...nav.matchAll(/<a [^>]*>([^<]*)<\/a>/g)].map((m) => m[1]), ["Home"])
  })

  test("THEN a folder holding ONLY unpublished docs appears NOWHERE in the output", () => {
    assert.deepEqual(filesContaining(OUT_DIR, FOLDER_LEAK_SENTINEL), [])
  })

  test("THEN no /n/ folder-listing page is emitted (folder-page disabled)", () => {
    assert.equal(fs.existsSync(path.join(OUT_DIR, "n", "index.html")), false)
  })
})

function pageHtml(relPath: string): string {
  return fs.readFileSync(path.join(OUT_DIR, relPath), "utf-8")
}

function breadcrumbNav(html: string): string {
  const match = html.match(/<nav class="breadcrumb-container[^>]*>[\s\S]*?<\/nav>/)
  assert.notEqual(match, null, "page must render breadcrumbs")
  return (match as RegExpMatchArray)[0]
}

function crumbTexts(html: string): string[] {
  return [...breadcrumbNav(html).matchAll(/<(?:a|span)[^>]*>([^<]*)<\/(?:a|span)>/g)].map(
    (m) => m[1],
  )
}

function docIdOf(vaultRelPath: string): string {
  const raw = fs.readFileSync(path.join(VAULT_DIR, vaultRelPath), "utf-8")
  const match = raw.match(/^id: (docid_[0-9a-z]{21}_e)$/m)
  assert.notEqual(match, null, `fixture ${vaultRelPath} must carry a docid`)
  return (match as RegExpMatchArray)[1]
}

function canvasDocIdOf(vaultRelPath: string): string {
  const canvas = JSON.parse(fs.readFileSync(path.join(VAULT_DIR, vaultRelPath), "utf-8"))
  return canvas.metadata.frontmatter.id
}

function filesContaining(dir: string, needle: string): string[] {
  const hits: string[] = []
  for (const entry of fs.readdirSync(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue
    const absolute = path.join(entry.parentPath, entry.name)
    const relative = path.relative(dir, absolute)
    if (relative.includes(needle) || fs.readFileSync(absolute, "latin1").includes(needle)) {
      hits.push(relative)
    }
  }
  return hits
}
