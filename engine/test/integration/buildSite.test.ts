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

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..")
const VAULT_DIR = path.join(REPO_ROOT, "test-vault")
const OUT_DIR = path.join(REPO_ROOT, ".build", "integration-out")

// Doc pages are published under stable-id URLs (plan/id-based-publishing.md):
// page slug = n/<docid>, read from the fixture's frontmatter.
const GETTING_STARTED_SLUG = `n/${docIdOf("notes/getting-started.md")}`
const ARCHITECTURE_SLUG = `n/${docIdOf("notes/architecture.md")}`
const PRIVATE_NOTE_SLUG = `n/${docIdOf("notes/private-secret.md")}`

describe("SiteBuilder integration — builds test-vault markdown-only", () => {
  // GIVEN the fixture vault WHEN building once (Quartz run is expensive)
  before(async () => {
    const siteConfig = SiteConfigParser.parse({
      title: "Integration Test Site",
      baseUrl: "it.example.com",
    })
    fs.rmSync(OUT_DIR, { recursive: true, force: true })
    await new SiteBuilder().buildSite({ vaultDir: VAULT_DIR, siteConfig, outDir: OUT_DIR })
  })

  after(() => fs.rmSync(OUT_DIR, { recursive: true, force: true }))

  test("THEN the home page is emitted at the site root (root-index exception)", () => {
    assert.equal(fs.existsSync(path.join(OUT_DIR, "index.html")), true)
  })

  test("THEN published notes are emitted under their stable-id URLs", () => {
    const emitted = [`${GETTING_STARTED_SLUG}.html`, `${ARCHITECTURE_SLUG}.html`].map((p) =>
      fs.existsSync(path.join(OUT_DIR, p)),
    )
    assert.deepEqual(emitted, [true, true])
  })

  test("THEN every doc page URL matches the docid grammar (except /)", () => {
    const docPages = listFiles(OUT_DIR)
      .filter((p) => p.endsWith(".html"))
      .filter((p) => !p.startsWith("static") && !p.startsWith("tags") && p !== "index.html" && p !== "404.html")
    const offGrammar = docPages.filter(
      (p) => !/^n\/docid_[0-9a-z]{21}_e(\.canvas)?\.html$/.test(p),
    )
    assert.deepEqual(offGrammar, [])
  })

  test("THEN the private note page is NOT emitted (neither id nor path URL)", () => {
    assert.deepEqual(
      [
        fs.existsSync(path.join(OUT_DIR, `${PRIVATE_NOTE_SLUG}.html`)),
        fs.existsSync(path.join(OUT_DIR, "notes/private-secret.html")),
      ],
      [false, false],
    )
  })

  test("THEN the leak sentinel appears NOWHERE in the output", () => {
    assert.deepEqual(filesContaining(OUT_DIR, LEAK_SENTINEL), [])
  })

  test("THEN no canvas artifacts are emitted (no includeFolders cover the canvases)", () => {
    assert.deepEqual(
      listFiles(OUT_DIR).filter((p) => p.includes(".canvas")),
      [],
    )
  })

  test("THEN the image asset is emitted at its vault path (assets stay path-based)", () => {
    assert.equal(fs.existsSync(path.join(OUT_DIR, "attachments/diagram.png")), true)
  })

  test("THEN wikilinks between published notes resolve to the target's stable-id page", () => {
    // getting-started.md links [[architecture]]; staged as [[<docid>|architecture]].
    const html = fs.readFileSync(path.join(OUT_DIR, `${GETTING_STARTED_SLUG}.html`), "utf-8")
    const resolved = internalHrefs(html).map((href) =>
      resolveFromPage(GETTING_STARTED_SLUG, stripAnchor(href)),
    )
    assert.equal(
      resolved.includes(path.normalize(ARCHITECTURE_SLUG)),
      true,
      `expected a wikilink to ${ARCHITECTURE_SLUG}, got: ${resolved.join(", ")}`,
    )
  })

  test("THEN the rewritten wikilink still displays the human-readable name", () => {
    const html = fs.readFileSync(path.join(OUT_DIR, `${GETTING_STARTED_SLUG}.html`), "utf-8")
    assert.match(html, />architecture</)
  })

  test("THEN the wikilink target page exists for every internal link on the home page", () => {
    const html = fs.readFileSync(path.join(OUT_DIR, "index.html"), "utf-8")
    const broken = internalHrefs(html)
      .map(stripAnchor)
      // Known exceptions: private target and (in this bare-config build) unstaged canvases.
      .filter((href) => !href.includes("private-secret") && !href.includes(".canvas"))
      .filter((href) => {
        const target = path.join(OUT_DIR, href)
        return !fs.existsSync(`${target}.html`) && !fs.existsSync(path.join(target, "index.html")) && !fs.existsSync(target)
      })
    assert.deepEqual(broken, [])
  })

  test("THEN the search/graph content index lists published notes by id slug", () => {
    assert.equal(GETTING_STARTED_SLUG in readContentIndex(), true)
  })

  test("THEN the content index shows the human title, not the docid", () => {
    assert.equal(readContentIndex()[GETTING_STARTED_SLUG].title, "Getting Started")
  })

  test("THEN the content index does NOT list the private note", () => {
    const contentIndex = readContentIndex()
    const listed = Object.keys(contentIndex).filter(
      (slug) => slug === PRIVATE_NOTE_SLUG || slug.includes("private-secret"),
    )
    assert.deepEqual(listed, [])
  })
})

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

/** All files (relative paths) under dir. */
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

/** href values of Quartz-internal links (class="internal") in an HTML page. */
function internalHrefs(html: string): string[] {
  const hrefs: string[] = []
  // Non-obvious WHAT: matches <a ... href="X" ... class="...internal..."> in either
  // attribute order, capturing X. Good enough for build verification (no HTML parser dep).
  const anchorTags = html.match(/<a\b[^>]*>/g) ?? []
  for (const tag of anchorTags) {
    if (!/class="[^"]*\binternal\b[^"]*"/.test(tag)) continue
    const href = tag.match(/href="([^"]+)"/)?.[1]
    if (href !== undefined && !href.startsWith("http")) hrefs.push(href)
  }
  return hrefs
}

/** Resolve a page-relative URL the way a browser would, into a site-relative path. */
function resolveFromPage(pageSlug: string, relativeUrl: string): string {
  const resolved = new URL(relativeUrl, `https://site.example/${pageSlug}`)
  return path.normalize(decodeURIComponent(resolved.pathname).replace(/^\//, ""))
}

function stripAnchor(href: string): string {
  return href.split("#")[0] ?? href
}
