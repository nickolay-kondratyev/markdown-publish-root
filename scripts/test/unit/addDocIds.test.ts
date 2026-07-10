import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { describe, test } from "node:test"
import { DocId } from "../../../engine/src/docId.ts"
import { CanvasIdStamper, MarkdownIdStamper, VaultIdStamper } from "../../add-doc-ids.mjs"

const ID = "docid_aaaaaaaaaaaaaaaaaaaaa_e"
const OTHER_ID = "docid_bbbbbbbbbbbbbbbbbbbbb_e"

describe("DocId", () => {
  test("GIVEN a generated id THEN it matches the locked grammar", () => {
    assert.match(DocId.generate(), /^docid_[0-9a-z]{21}_e$/)
  })

  test("GIVEN two generated ids THEN they differ", () => {
    assert.notEqual(DocId.generate(), DocId.generate())
  })

  test("GIVEN a wrong-length id THEN it is invalid", () => {
    assert.equal(DocId.isValid("docid_short_e"), false)
  })

  test("GIVEN an uppercase character THEN it is invalid (URLs are lowercase-only)", () => {
    assert.equal(DocId.isValid("docid_aaaaaaaaaaAaaaaaaaaaa_e"), false)
  })

  test("GIVEN a non-base36 character THEN it is invalid", () => {
    assert.equal(DocId.isValid("docid_aaaaaaaaaa-aaaaaaaaaa_e"), false)
  })
})

describe("MarkdownIdStamper", () => {
  test("GIVEN no frontmatter WHEN stamping THEN a minimal block is created and the body is byte-preserved", () => {
    const outcome = MarkdownIdStamper.stamp("# Title\n\nBody text.\n", ID)
    assert.equal(outcome.action, "stamp")
    assert.equal((outcome as any).content, `---\nid: ${ID}\n---\n# Title\n\nBody text.\n`)
  })

  test("GIVEN existing frontmatter WHEN stamping THEN id is inserted as the first key and everything else is byte-preserved", () => {
    const outcome = MarkdownIdStamper.stamp("---\ntitle: Hi\npublish: true\n---\nBody\n", ID)
    assert.equal((outcome as any).content, `---\nid: ${ID}\ntitle: Hi\npublish: true\n---\nBody\n`)
  })

  test("GIVEN CRLF line endings WHEN stamping THEN the inserted line uses CRLF", () => {
    const outcome = MarkdownIdStamper.stamp("---\r\ntitle: Hi\r\n---\r\nBody\r\n", ID)
    assert.equal((outcome as any).content, `---\r\nid: ${ID}\r\ntitle: Hi\r\n---\r\nBody\r\n`)
  })

  test("GIVEN a valid existing id WHEN stamping THEN it is skipped (idempotent)", () => {
    const outcome = MarkdownIdStamper.stamp(`---\nid: ${OTHER_ID}\n---\nBody\n`, ID)
    assert.equal(outcome.action, "skip")
  })

  test("GIVEN a malformed existing id WHEN stamping THEN it errors and never overwrites", () => {
    const outcome = MarkdownIdStamper.stamp("---\nid: not-a-docid\n---\nBody\n", ID)
    assert.equal(outcome.action, "error")
  })

  test("GIVEN malformed frontmatter WHEN stamping THEN it errors", () => {
    const outcome = MarkdownIdStamper.stamp("---\npublish: [unclosed\n---\nBody\n", ID)
    assert.equal(outcome.action, "error")
  })
})

describe("CanvasIdStamper", () => {
  test("GIVEN a canvas without metadata WHEN stamping THEN metadata is spliced in and the rest is byte-preserved", () => {
    const original = `{\n\t"nodes":[\n\t\t{"id":"a","type":"text","text":"hi"}\n\t],\n\t"edges":[]\n}`
    const outcome = CanvasIdStamper.stamp(original, ID)
    assert.equal(outcome.action, "stamp")
    const content = (outcome as any).content as string
    assert.equal(JSON.parse(content).metadata.frontmatter.id, ID)
    // Everything after the spliced metadata is the original bytes.
    assert.equal(content.endsWith(original.slice(1)), true)
  })

  test("GIVEN an empty canvas object WHEN stamping THEN the result is still valid JSON", () => {
    const outcome = CanvasIdStamper.stamp("{}", ID)
    assert.equal(JSON.parse((outcome as any).content).metadata.frontmatter.id, ID)
  })

  test("GIVEN existing metadata WHEN stamping THEN id lands under metadata.frontmatter and other keys survive", () => {
    const outcome = CanvasIdStamper.stamp(`{"nodes":[],"edges":[],"metadata":{"custom":1}}`, ID)
    const parsed = JSON.parse((outcome as any).content)
    assert.equal(parsed.metadata.frontmatter.id, ID)
    assert.equal(parsed.metadata.custom, 1)
  })

  test("GIVEN existing metadata WHEN stamping THEN a re-serialization warning is reported", () => {
    const outcome = CanvasIdStamper.stamp(`{"nodes":[],"edges":[],"metadata":{}}`, ID)
    assert.equal(typeof (outcome as any).warning, "string")
  })

  test("GIVEN a valid existing id WHEN stamping THEN it is skipped (idempotent)", () => {
    const outcome = CanvasIdStamper.stamp(
      `{"nodes":[],"edges":[],"metadata":{"frontmatter":{"id":"${OTHER_ID}"}}}`,
      ID,
    )
    assert.equal(outcome.action, "skip")
  })

  test("GIVEN a malformed existing id WHEN stamping THEN it errors and never overwrites", () => {
    const outcome = CanvasIdStamper.stamp(
      `{"nodes":[],"edges":[],"metadata":{"frontmatter":{"id":"nope"}}}`,
      ID,
    )
    assert.equal(outcome.action, "error")
  })

  test("GIVEN invalid JSON WHEN stamping THEN it errors", () => {
    assert.equal(CanvasIdStamper.stamp("{not json", ID).action, "error")
  })
})

describe("VaultIdStamper", () => {
  test("GIVEN a vault WHEN run twice THEN the second run stamps nothing (idempotent)", () => {
    const vaultDir = makeVault({
      "note.md": "# A note\n",
      "boards/b.canvas": `{\n\t"nodes":[],\n\t"edges":[]\n}`,
      ".obsidian/app.json": "{}",
    })
    const first = new VaultIdStamper().run(vaultDir)
    assert.deepEqual(
      { stamped: first.stamped, errors: first.errors },
      { stamped: ["boards/b.canvas", "note.md"], errors: [] },
    )
    const second = new VaultIdStamper().run(vaultDir)
    assert.deepEqual(
      { stamped: second.stamped, skipped: second.skipped },
      { stamped: [], skipped: ["boards/b.canvas", "note.md"] },
    )
  })

  test("GIVEN any malformed file WHEN running THEN nothing at all is written (error atomicity)", () => {
    const vaultDir = makeVault({
      "good.md": "# fine\n",
      "bad.md": "---\nid: broken-id\n---\n",
    })
    const result = new VaultIdStamper().run(vaultDir)
    assert.equal(result.errors.length, 1)
    assert.equal(fs.readFileSync(path.join(vaultDir, "good.md"), "utf-8"), "# fine\n")
  })

  test("GIVEN --dry-run WHEN running THEN files are reported but not written", () => {
    const vaultDir = makeVault({ "note.md": "# A note\n" })
    const result = new VaultIdStamper().run(vaultDir, { dryRun: true })
    assert.deepEqual(result.stamped, ["note.md"])
    assert.equal(fs.readFileSync(path.join(vaultDir, "note.md"), "utf-8"), "# A note\n")
  })
})

function makeVault(files: Record<string, string>): string {
  const vaultDir = fs.mkdtempSync(path.join(os.tmpdir(), "add-ids-test-"))
  for (const [relPath, content] of Object.entries(files)) {
    const target = path.join(vaultDir, relPath)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, content)
  }
  return vaultDir
}
