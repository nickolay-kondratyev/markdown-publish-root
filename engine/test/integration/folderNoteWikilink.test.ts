import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { after, before, describe, test } from "node:test"
import { ID_NAMESPACE_DIR } from "../../src/idMap.ts"
import { SiteBuilder } from "../../src/siteBuilder.ts"
import { SiteConfigParser } from "../../src/siteConfig.ts"

/**
 * Regression for the "folder note" wikilink bug
 * (_tickets/bug-issue-with-publishing-note-that-is-within-a-folder.md):
 * a note whose basename equals its parent folder ("p/Alan-Watts/Alan-Watts.md")
 * is slugged by Quartz to "p/alan-watts/index", so a bare `[[Alan-Watts]]` used
 * to resolve to nothing and 404. It must now resolve to the note's stable-id page.
 */

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..")
const OUT_DIR = path.join(REPO_ROOT, ".build", "integration-foldernote-out")
const VAULT_DIR = path.join(REPO_ROOT, ".build", "integration-foldernote-vault")

// The exact id from the ticket; URL-safe, so its URL segment is verbatim.
const FOLDER_NOTE_ID = "e33wd60mupdafm8n2p9v4as"
const FOLDER_NOTE_SLUG = `${ID_NAMESPACE_DIR}/${FOLDER_NOTE_ID}`
const REF_NOTE_ID = "refnote0000000000000000"
const REF_NOTE_SLUG = `${ID_NAMESPACE_DIR}/${REF_NOTE_ID}`

describe("SiteBuilder integration — folder-note wikilink resolves to the note's id page", () => {
  before(async () => {
    writeVault()
    const siteConfig = SiteConfigParser.parse({ title: "Folder Note Test", baseUrl: "fn.example.com" })
    fs.rmSync(OUT_DIR, { recursive: true, force: true })
    await new SiteBuilder().buildSite({ vaultDir: VAULT_DIR, siteConfig, outDir: OUT_DIR })
  })

  after(() => {
    fs.rmSync(OUT_DIR, { recursive: true, force: true })
    fs.rmSync(VAULT_DIR, { recursive: true, force: true })
  })

  test("THEN the folder note is emitted at its stable-id page", () => {
    assert.equal(fs.existsSync(path.join(OUT_DIR, `${FOLDER_NOTE_SLUG}.html`)), true)
  })

  test("THEN a bare [[Alan-Watts]] wikilink resolves to the folder note's id page (was 404)", () => {
    const html = fs.readFileSync(path.join(OUT_DIR, `${REF_NOTE_SLUG}.html`), "utf-8")
    const resolved = internalHrefs(html).map((href) => resolveFromPage(REF_NOTE_SLUG, stripAnchor(href)))
    assert.equal(
      resolved.includes(path.normalize(FOLDER_NOTE_SLUG)),
      true,
      `expected a wikilink to ${FOLDER_NOTE_SLUG}, got: ${resolved.join(", ")}`,
    )
  })

  test("THEN the rewritten wikilink still displays the human-readable name", () => {
    const html = fs.readFileSync(path.join(OUT_DIR, `${REF_NOTE_SLUG}.html`), "utf-8")
    assert.match(html, />Alan-Watts</)
  })
})

function writeVault(): void {
  fs.rmSync(VAULT_DIR, { recursive: true, force: true })
  writeNote("index.md", "docid_259usfl54rzkcwbdhw2qm_e", "Home", "# Home\n")
  writeNote(
    "p/Alan-Watts/Alan-Watts.md",
    FOLDER_NOTE_ID,
    "Alan-Watts",
    "# Alan Watts\n\nOn praise & blame.\n",
  )
  writeNote("notes/ref.md", REF_NOTE_ID, "Ref", "See [[Alan-Watts]] on praise & blame.\n")
}

function writeNote(relPath: string, id: string, title: string, body: string): void {
  const abs = path.join(VAULT_DIR, relPath)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, `---\nid: ${id}\ntitle: ${title}\npublish: true\n---\n\n${body}`)
}

/** href values of Quartz-internal links (class="internal") in an HTML page. */
function internalHrefs(html: string): string[] {
  const hrefs: string[] = []
  for (const tag of html.match(/<a\b[^>]*>/g) ?? []) {
    if (!/class="[^"]*\binternal\b[^"]*"/.test(tag)) continue
    const href = tag.match(/href="([^"]+)"/)?.[1]
    if (href !== undefined && !href.startsWith("http")) hrefs.push(href)
  }
  return hrefs
}

function resolveFromPage(pageSlug: string, relativeUrl: string): string {
  const resolved = new URL(relativeUrl, `https://site.example/${pageSlug}`)
  return path.normalize(decodeURIComponent(resolved.pathname).replace(/^\//, ""))
}

function stripAnchor(href: string): string {
  return href.split("#")[0] ?? href
}
