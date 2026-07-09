import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, test } from "node:test"
import {
  LeakChecker,
  MIN_FINGERPRINT_LENGTH,
  type LeakFinding,
} from "../../src/validation/leakChecker.ts"

// A line comfortably above MIN_FINGERPRINT_LENGTH and unique enough to be a fingerprint.
const SECRET_LINE = "TOP-SECRET-c4f9 the quarterly numbers must never go public."
// A short/common line that must NOT become a fingerprint (would false-positive).
const SHORT_LINE = "# Notes"

describe("LeakChecker", () => {
  const workDirs: string[] = []
  afterEach(() => {
    while (workDirs.length > 0) fs.rmSync(workDirs.pop() as string, { recursive: true, force: true })
  })

  /** GIVEN helper: a synthetic vault + output pair. Returns check() findings. */
  function checkLeaks(setup: {
    privateFiles: Record<string, string>
    outputFiles: Record<string, string>
    /** Defaults to every key of privateFiles. */
    excludedFiles?: string[]
  }): LeakFinding[] {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "leak-check-test-"))
    workDirs.push(workDir)
    const vaultDir = path.join(workDir, "vault")
    const outDir = path.join(workDir, "out")
    for (const [relPath, content] of Object.entries(setup.privateFiles)) {
      writeFile(vaultDir, relPath, content)
    }
    for (const [relPath, content] of Object.entries(setup.outputFiles)) {
      writeFile(outDir, relPath, content)
    }
    return new LeakChecker().check({
      vaultDir,
      outDir,
      excludedFiles: setup.excludedFiles ?? Object.keys(setup.privateFiles),
    })
  }

  test("GIVEN an excluded note's line quoted in an emitted HTML file THEN a leak is found naming both files", () => {
    const findings = checkLeaks({
      privateFiles: { "notes/secret.md": `# Secret\n\n${SECRET_LINE}\n` },
      outputFiles: { "blog/post.html": `<html><p>${SECRET_LINE}</p></html>` },
    })
    assert.deepEqual(
      findings.map((f) => ({ from: f.privateVaultPath, to: f.emittedSitePath })),
      [{ from: "notes/secret.md", to: "blog/post.html" }],
    )
  })

  test("GIVEN no private content in the output THEN no leaks are found", () => {
    const findings = checkLeaks({
      privateFiles: { "notes/secret.md": `${SECRET_LINE}\n` },
      outputFiles: { "index.html": "<html><p>All public content here.</p></html>" },
    })
    assert.deepEqual(findings, [])
  })

  test("GIVEN only a short/common line shared with the output THEN it does NOT false-positive", () => {
    assert.equal(SHORT_LINE.length < MIN_FINGERPRINT_LENGTH, true, "fixture must stay short")
    const findings = checkLeaks({
      privateFiles: { "notes/secret.md": `${SHORT_LINE}\nshort\n` },
      outputFiles: { "index.html": `<h1>${SHORT_LINE}</h1>` },
    })
    assert.deepEqual(findings, [])
  })

  test("GIVEN a leak whose whitespace was re-wrapped in the output THEN it is still found", () => {
    const rewrapped = SECRET_LINE.replace(" the quarterly", "\n   the quarterly")
    const findings = checkLeaks({
      privateFiles: { "notes/secret.md": `${SECRET_LINE}\n` },
      outputFiles: { "page.html": `<p>${rewrapped}</p>` },
    })
    assert.equal(findings.length, 1)
  })

  test("GIVEN a leak into an emitted JSON index THEN it is found", () => {
    const findings = checkLeaks({
      privateFiles: { "notes/secret.md": `${SECRET_LINE}\n` },
      outputFiles: { "static/contentIndex.json": JSON.stringify({ content: SECRET_LINE }) },
    })
    assert.equal(findings.length, 1)
  })

  test("GIVEN an excluded CANVAS whose text-card content leaks THEN it is found", () => {
    const canvas = JSON.stringify({
      nodes: [{ id: "n1", type: "text", text: `card intro\n${SECRET_LINE}` }],
      edges: [],
    })
    const findings = checkLeaks({
      privateFiles: { "boards/secret.canvas": canvas },
      outputFiles: { "page.html": `<p>${SECRET_LINE}</p>` },
    })
    assert.deepEqual(
      findings.map((f) => f.privateVaultPath),
      ["boards/secret.canvas"],
    )
  })

  test("GIVEN an excluded canvas THEN its JSON syntax lines are NOT fingerprints (no structural false positives)", () => {
    // The output legitimately contains ANOTHER canvas's payload with identical structure.
    const structure = { nodes: [{ id: "n1", type: "text", text: "short" }], edges: [] }
    const findings = checkLeaks({
      privateFiles: { "boards/secret.canvas": JSON.stringify(structure, null, 2) },
      outputFiles: { "public-canvas.html": JSON.stringify(structure, null, 2) },
    })
    assert.deepEqual(findings, [])
  })

  test("GIVEN an excluded non-text asset THEN it is skipped (binary content is not fingerprinted)", () => {
    const findings = checkLeaks({
      privateFiles: { "attachments/secret.png": SECRET_LINE },
      outputFiles: { "page.html": `<p>${SECRET_LINE}</p>` },
    })
    assert.deepEqual(findings, [])
  })

  test("GIVEN a leak in a non-scanned binary output file THEN only text outputs are scanned", () => {
    const findings = checkLeaks({
      privateFiles: { "notes/secret.md": `${SECRET_LINE}\n` },
      outputFiles: { "attachments/blob.png": SECRET_LINE },
    })
    assert.deepEqual(findings, [])
  })

  test("GIVEN an excluded file listed but deleted from the vault THEN the check does not crash", () => {
    const findings = checkLeaks({
      privateFiles: {},
      outputFiles: { "index.html": "<p>hello world content</p>" },
      excludedFiles: ["notes/gone.md"],
    })
    assert.deepEqual(findings, [])
  })

  test("GIVEN a malformed excluded canvas THEN raw lines are fingerprinted (fail safe)", () => {
    const findings = checkLeaks({
      privateFiles: { "boards/broken.canvas": `not json at all\n${SECRET_LINE}\n` },
      outputFiles: { "page.html": `<p>${SECRET_LINE}</p>` },
    })
    assert.equal(findings.length, 1)
  })
})

function writeFile(baseDir: string, relPath: string, content: string): void {
  const target = path.join(baseDir, relPath)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, content)
}
