import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { after, before, describe, test } from "node:test"
import { PublishFilter } from "../../src/publishFilter.ts"
import { VaultStager, type StagingResult } from "../../src/vaultStager.ts"

describe("VaultStager", () => {
  let workDir: string
  let stagingDir: string
  let result: StagingResult

  // GIVEN a small vault with published, private, malformed, asset and canvas files
  before(() => {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), "stager-test-"))
    const vaultDir = path.join(workDir, "vault")
    stagingDir = path.join(workDir, "staging")
    writeFile(vaultDir, "index.md", "---\npublish: true\n---\n# Home\n")
    writeFile(vaultDir, "notes/private.md", "---\npublish: false\n---\nSECRET\n")
    writeFile(vaultDir, "notes/broken.md", "---\npublish: [unclosed\n---\nbody\n")
    writeFile(vaultDir, "attachments/img.png", "png-bytes")
    writeFile(vaultDir, "boards/main.canvas", "{}")
    writeFile(vaultDir, "drafts/wip.canvas", "{}")
    writeFile(vaultDir, ".obsidian/app.json", "{}")

    // WHEN staging with boards included (canvases are default-deny without folder rules)
    const filter = new PublishFilter({ includeFolders: ["boards"], excludeFolders: [] })
    result = new VaultStager(filter).stage(vaultDir, stagingDir)
  })

  after(() => fs.rmSync(workDir, { recursive: true, force: true }))

  test("THEN the published note is copied into staging", () => {
    assert.equal(fs.existsSync(path.join(stagingDir, "index.md")), true)
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

  test("THEN the asset is copied", () => {
    assert.equal(fs.existsSync(path.join(stagingDir, "attachments/img.png")), true)
  })

  test("THEN the canvas under an includeFolder is copied", () => {
    assert.equal(fs.existsSync(path.join(stagingDir, "boards/main.canvas")), true)
  })

  test("THEN the staging result reports the staged canvas", () => {
    assert.deepEqual(result.stagedCanvasFiles, ["boards/main.canvas"])
  })

  test("THEN a canvas outside includeFolders is NOT copied (default deny)", () => {
    assert.equal(fs.existsSync(path.join(stagingDir, "drafts/wip.canvas")), false)
  })

  test("THEN hidden config dirs are NOT copied", () => {
    assert.equal(fs.existsSync(path.join(stagingDir, ".obsidian")), false)
  })

  test("THEN the staging result reports exactly one staged markdown file", () => {
    assert.deepEqual(result.stagedMarkdownFiles, ["index.md"])
  })
})

function writeFile(baseDir: string, relPath: string, content: string): void {
  const target = path.join(baseDir, relPath)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, content)
}
