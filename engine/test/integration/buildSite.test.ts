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

  test("THEN the home page is emitted", () => {
    assert.equal(fs.existsSync(path.join(OUT_DIR, "index.html")), true)
  })

  test("THEN published notes are emitted", () => {
    const emitted = ["notes/getting-started.html", "notes/architecture.html"].map((p) =>
      fs.existsSync(path.join(OUT_DIR, p)),
    )
    assert.deepEqual(emitted, [true, true])
  })

  test("THEN the private note page is NOT emitted", () => {
    assert.equal(fs.existsSync(path.join(OUT_DIR, "notes/private-secret.html")), false)
  })

  test("THEN the leak sentinel appears NOWHERE in the output", () => {
    assert.deepEqual(filesContaining(OUT_DIR, LEAK_SENTINEL), [])
  })

  test("THEN no canvas artifacts are emitted (Phase 1)", () => {
    assert.deepEqual(
      listFiles(OUT_DIR).filter((p) => p.includes(".canvas")),
      [],
    )
  })

  test("THEN the image asset is emitted", () => {
    assert.equal(fs.existsSync(path.join(OUT_DIR, "attachments/diagram.png")), true)
  })

  test("THEN wikilinks between published notes resolve to real emitted pages", () => {
    // getting-started.md links [[architecture]]; resolve its href against the page URL.
    const html = fs.readFileSync(path.join(OUT_DIR, "notes/getting-started.html"), "utf-8")
    const hrefs = internalHrefs(html)
    const resolved = hrefs.map((href) =>
      path.normalize(path.join("notes", stripAnchor(href))),
    )
    assert.equal(
      resolved.includes(path.normalize("notes/architecture")),
      true,
      `expected a wikilink to notes/architecture, got internal hrefs: ${hrefs.join(", ")}`,
    )
  })

  test("THEN the wikilink target page exists for every internal link on the home page", () => {
    const html = fs.readFileSync(path.join(OUT_DIR, "index.html"), "utf-8")
    const broken = internalHrefs(html)
      .map(stripAnchor)
      // Phase 1 known exception: links to unpublished/canvas targets stay unresolved.
      .filter((href) => !href.includes("private-secret") && !href.includes(".canvas"))
      .filter((href) => {
        const target = path.join(OUT_DIR, href)
        return !fs.existsSync(`${target}.html`) && !fs.existsSync(path.join(target, "index.html")) && !fs.existsSync(target)
      })
    assert.deepEqual(broken, [])
  })

  test("THEN the search/graph content index is emitted and lists published notes", () => {
    const indexPath = path.join(OUT_DIR, "static/contentIndex.json")
    const contentIndex = JSON.parse(fs.readFileSync(indexPath, "utf-8"))
    assert.equal("notes/getting-started" in contentIndex, true)
  })

  test("THEN the content index does NOT list the private note", () => {
    const indexPath = path.join(OUT_DIR, "static/contentIndex.json")
    const contentIndex = JSON.parse(fs.readFileSync(indexPath, "utf-8"))
    assert.equal("notes/private-secret" in contentIndex, false)
  })
})

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

function stripAnchor(href: string): string {
  return href.split("#")[0] ?? href
}
