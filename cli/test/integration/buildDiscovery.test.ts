import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { after, before, describe, test } from "node:test"
import { ID_NAMESPACE_DIR } from "../../../engine/src/index.ts"
import { CliMain } from "../../src/main.ts"

/**
 * Zero-flag publish flow: `publish build <vault>` with NO --config/--out uses
 * the vault's committed .external_publish_config.json (discovery + output_dir
 * resolution + publishAll). Exercises the REAL fixture config so the demo
 * config and this regression guard can never drift apart.
 */

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..")
const VAULT_DIR = path.join(REPO_ROOT, "test-vault")
// Must mirror test-vault/.external_publish_config.json "output_dir" (resolved against the vault root).
const OUT_DIR = path.join(REPO_ROOT, ".build", "external-publish-out")

const README_SLUG = `${ID_NAMESPACE_DIR}/${docIdOf("README.md")}`
const MAIN_CANVAS_SLUG = `${ID_NAMESPACE_DIR}/${docIdOf("canvases/main.canvas")}.canvas`
const PRIVATE_NOTE_SLUG = `${ID_NAMESPACE_DIR}/${docIdOf("notes/private-secret.md")}`
// publish:false doc — must stay out even under publishAll. (Its FOLDER name
// sentinel is not asserted here: the vault README documents that name in its
// text and legitimately publishes under publishAll.)
const PUBLISH_FALSE_SLUG = `${ID_NAMESPACE_DIR}/${docIdOf("notes/vintrin-priv-only-x7q3/only-private.md")}`

let exitCode: number

describe("CLI integration — zero-flag build via in-vault .external_publish_config.json", () => {
  // GIVEN the fixture vault WHEN building once with no flags (Quartz run is expensive)
  before(async () => {
    fs.rmSync(OUT_DIR, { recursive: true, force: true })
    exitCode = await CliMain.run(["build", VAULT_DIR])
  })

  after(() => fs.rmSync(OUT_DIR, { recursive: true, force: true }))

  test("THEN the build succeeds (exit code 0)", () => {
    assert.equal(exitCode, 0)
  })

  test("THEN the site lands at the config's output_dir, resolved against the vault root", () => {
    assert.equal(fs.existsSync(path.join(OUT_DIR, "index.html")), true)
  })

  test("THEN a vault-root note outside any includeFolder is published (publishAll)", () => {
    assert.equal(fs.existsSync(path.join(OUT_DIR, `${README_SLUG}.html`)), true)
  })

  test("THEN a canvas is published without listing its folder (publishAll)", () => {
    assert.equal(fs.existsSync(path.join(OUT_DIR, `${MAIN_CANVAS_SLUG}.html`)), true)
  })

  test("THEN the 'private' path rule still wins over publishAll", () => {
    assert.equal(fs.existsSync(path.join(OUT_DIR, `${PRIVATE_NOTE_SLUG}.html`)), false)
  })

  test("THEN frontmatter publish:false still wins over publishAll", () => {
    assert.equal(fs.existsSync(path.join(OUT_DIR, `${PUBLISH_FALSE_SLUG}.html`)), false)
  })

  test("THEN the config file itself is not emitted (hidden-segment rule)", () => {
    assert.deepEqual(
      listFiles(OUT_DIR).filter((p) => p.includes("external_publish_config")),
      [],
    )
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

/** All files (relative paths) under dir. */
function listFiles(dir: string): string[] {
  return fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)))
}

