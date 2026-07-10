import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { after, before, describe, test } from "node:test"
import { DocIdValidationError } from "../../src/idMap.ts"
import { PublishFilter } from "../../src/publishFilter.ts"
import { VaultStager, type StagingResult } from "../../src/vaultStager.ts"

const ID_INDEX = "docid_iiiiiiiiiiiiiiiiiiiii_e"
const ID_NOTE = "docid_nnnnnnnnnnnnnnnnnnnnn_e"
const ID_CANVAS = "docid_ggggggggggggggggggggg_e"

const FILTER = new PublishFilter({ includeFolders: ["boards", "notes"], excludeFolders: [] })

describe("VaultStager", () => {
  let workDir: string
  let stagingDir: string
  let result: StagingResult

  // GIVEN a small vault with published, private, malformed, asset and canvas files
  before(() => {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), "stager-test-"))
    const vaultDir = path.join(workDir, "vault")
    stagingDir = path.join(workDir, "staging")
    writeFile(vaultDir, "index.md", `---\nid: ${ID_INDEX}\npublish: true\n---\n# Home\n\n[[note]]\n`)
    writeFile(vaultDir, "notes/note.md", `---\nid: ${ID_NOTE}\npublish: true\n---\nBody\n`)
    writeFile(vaultDir, "notes/private.md", "---\npublish: false\n---\nSECRET\n")
    writeFile(vaultDir, "notes/broken.md", "---\npublish: [unclosed\n---\nbody\n")
    writeFile(vaultDir, "attachments/img.png", "png-bytes")
    writeFile(
      vaultDir,
      "boards/main.canvas",
      `{"nodes":[],"edges":[],"metadata":{"frontmatter":{"id":"${ID_CANVAS}"}}}`,
    )
    writeFile(vaultDir, "boards/bad.canvas", "{not json")
    writeFile(vaultDir, "drafts/wip.canvas", "{}")
    writeFile(vaultDir, ".obsidian/app.json", "{}")

    // WHEN staging with boards/notes included (canvases are default-deny without folder rules)
    result = new VaultStager(FILTER).stage(vaultDir, stagingDir)
  })

  after(() => fs.rmSync(workDir, { recursive: true, force: true }))

  test("THEN the root index.md stages at index.md (homepage exception)", () => {
    assert.equal(fs.existsSync(path.join(stagingDir, "index.md")), true)
  })

  test("THEN a published note stages under n/<docid>.md", () => {
    assert.equal(fs.existsSync(path.join(stagingDir, `n/${ID_NOTE}.md`)), true)
  })

  test("THEN the note's staged path is reported in stagedPathByVaultPath", () => {
    assert.equal(result.stagedPathByVaultPath["notes/note.md"], `n/${ID_NOTE}.md`)
  })

  test("THEN a published canvas stages under n/<docid>.canvas", () => {
    assert.equal(fs.existsSync(path.join(stagingDir, `n/${ID_CANVAS}.canvas`)), true)
  })

  test("THEN wikilinks in staged markdown are rewritten to docid targets", () => {
    const staged = fs.readFileSync(path.join(stagingDir, "index.md"), "utf-8")
    assert.equal(staged.includes(`[[${ID_NOTE}|note]]`), true)
  })

  test("THEN a title is injected from the original basename when absent", () => {
    const staged = fs.readFileSync(path.join(stagingDir, `n/${ID_NOTE}.md`), "utf-8")
    assert.equal(staged.includes(`title: "note"`), true)
  })

  test("THEN the private note is NOT copied", () => {
    assert.equal(fs.existsSync(path.join(stagingDir, "notes/private.md")), false)
  })

  test("THEN the malformed-frontmatter note is NOT copied (fail closed)", () => {
    assert.equal(fs.existsSync(path.join(stagingDir, "notes/broken.md")), false)
  })

  test("THEN the malformed-frontmatter note produces a warning", () => {
    assert.equal(result.warnings.some((w) => w.includes("notes/broken.md")), true)
  })

  test("THEN a malformed canvas is NOT copied and produces a warning (fail closed)", () => {
    assert.deepEqual(
      {
        staged: fs.existsSync(path.join(stagingDir, "boards/bad.canvas")),
        warned: result.warnings.some((w) => w.includes("boards/bad.canvas")),
      },
      { staged: false, warned: true },
    )
  })

  test("THEN the asset is copied at its vault path", () => {
    assert.equal(fs.existsSync(path.join(stagingDir, "attachments/img.png")), true)
  })

  test("THEN the staging result reports the staged canvas by ORIGINAL path", () => {
    assert.deepEqual(result.stagedCanvasFiles, ["boards/main.canvas"])
  })

  test("THEN a canvas outside includeFolders is NOT copied (default deny)", () => {
    assert.equal(fs.existsSync(path.join(stagingDir, "drafts/wip.canvas")), false)
  })

  test("THEN hidden config dirs are NOT copied", () => {
    assert.equal(fs.existsSync(path.join(stagingDir, ".obsidian")), false)
  })

  test("THEN the staging result reports staged markdown by ORIGINAL path", () => {
    assert.deepEqual(result.stagedMarkdownFiles, ["index.md", "notes/note.md"])
  })
})

describe("VaultStager id validation", () => {
  test("GIVEN a publishable note without an id WHEN staging THEN the build fails early naming the file", () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "stager-noid-"))
    writeFile(path.join(workDir, "vault"), "notes/no-id.md", "---\npublish: true\n---\nBody\n")
    assert.throws(
      () => new VaultStager(FILTER).stage(path.join(workDir, "vault"), path.join(workDir, "staging")),
      (error: unknown) =>
        error instanceof DocIdValidationError && error.message.includes("notes/no-id.md"),
    )
    fs.rmSync(workDir, { recursive: true, force: true })
  })

  test("GIVEN a missing id WHEN staging THEN NOTHING has been written to the staging dir", () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "stager-noid2-"))
    const vaultDir = path.join(workDir, "vault")
    const stagingDir = path.join(workDir, "staging")
    writeFile(vaultDir, "notes/good.md", `---\nid: ${ID_NOTE}\npublish: true\n---\nBody\n`)
    writeFile(vaultDir, "notes/no-id.md", "---\npublish: true\n---\nBody\n")
    assert.throws(() => new VaultStager(FILTER).stage(vaultDir, stagingDir))
    assert.equal(fs.existsSync(stagingDir), false)
    fs.rmSync(workDir, { recursive: true, force: true })
  })
})

function writeFile(baseDir: string, relPath: string, content: string): void {
  const target = path.join(baseDir, relPath)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, content)
}
