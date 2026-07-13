import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { after, before, describe, test } from "node:test"
import { SiteBuilder } from "../../src/siteBuilder.ts"
import { SiteConfigParser } from "../../src/siteConfig.ts"
import { UrlSegment } from "../../src/urlSegment.ts"

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..")
const VAULT_DIR = path.join(REPO_ROOT, "test-vault")

// Foreign ids (not our DocId grammar) — one needing lowercasing, one needing encoding.
const MIXED_CASE_ID = "MyForeign_Id42"
const UNSAFE_ID = "my id! (v1.2)"

const LC_SLUG = `n/${UrlSegment.deriveFrom(MIXED_CASE_ID)}`
const UE_SLUG = `n/${UrlSegment.deriveFrom(UNSAFE_ID)}`

/**
 * End-to-end check of the UrlSegment fixed-point invariant: derived `lc_`/`ue_`
 * segments must survive Quartz's slugification BYTE-FOR-BYTE — pages are emitted
 * exactly at /n/<derived-segment> and rewritten wikilinks resolve to them.
 */
describe("Foreign-id integration — lc_/ue_ URLs survive a real Quartz build", () => {
  let workDir: string
  let outDir: string

  // GIVEN a COPY of the fixture vault where two published notes carry foreign ids
  before(async () => {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), "foreign-id-integration-test-"))
    const vaultDir = path.join(workDir, "vault")
    outDir = path.join(workDir, "out")
    fs.cpSync(VAULT_DIR, vaultDir, { recursive: true })
    replaceId(path.join(vaultDir, "notes/getting-started.md"), MIXED_CASE_ID)
    replaceId(path.join(vaultDir, "notes/architecture.md"), UNSAFE_ID)
    const siteConfig = SiteConfigParser.parse({
      title: "Foreign Id Test Site",
      baseUrl: "it.example.com",
    })
    await new SiteBuilder().buildSite({ vaultDir, siteConfig, outDir })
  })

  after(() => fs.rmSync(workDir, { recursive: true, force: true }))

  test("THEN the mixed-case-id note is emitted at its lc_ URL", () => {
    assert.equal(fs.existsSync(path.join(outDir, `${LC_SLUG}.html`)), true)
  })

  test("THEN the unsafe-id note is emitted at its ue_ URL", () => {
    assert.equal(fs.existsSync(path.join(outDir, `${UE_SLUG}.html`)), true)
  })

  test("THEN the raw mixed-case id appears in NO emitted path (Quartz would have mangled it)", () => {
    const stray = listFiles(outDir).filter((p) => p.includes(MIXED_CASE_ID))
    assert.deepEqual(stray, [])
  })

  test("THEN the wikilink to the unsafe-id note resolves to its ue_ page", () => {
    // getting-started.md links [[architecture]]; staged as [[<ue_segment>|architecture]].
    const html = fs.readFileSync(path.join(outDir, `${LC_SLUG}.html`), "utf-8")
    assert.match(html, new RegExp(UE_SLUG.slice("n/".length)))
  })
})

/** Swap the stamped canonical docid line for a foreign id (YAML-quoted). */
function replaceId(notePath: string, foreignId: string): void {
  const content = fs.readFileSync(notePath, "utf-8")
  const replaced = content.replace(/^id: docid_[0-9a-z]{21}_e$/m, `id: "${foreignId}"`)
  assert.notEqual(replaced, content, `no canonical docid line found in ${notePath}`)
  fs.writeFileSync(notePath, replaced)
}

/** All files (relative paths) under dir. */
function listFiles(dir: string): string[] {
  return fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)))
}
