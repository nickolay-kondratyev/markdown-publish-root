import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, test } from "node:test"
import { HomepageAlias } from "../../src/homepageAlias.ts"

const CANVAS_PAGE_HTML = "<html>canvas homepage</html>"
const QUARTZ_FOLDER_LISTING_HTML = "<html>auto folder listing</html>"
const MARKDOWN_HOMEPAGE_HTML = "<html>markdown homepage</html>"

describe("HomepageAlias", () => {
  let outDir: string

  beforeEach(() => {
    outDir = fs.mkdtempSync(path.join(os.tmpdir(), "homepage-alias-test-"))
  })

  afterEach(() => fs.rmSync(outDir, { recursive: true, force: true }))

  describe("GIVEN a root index.canvas staged and NO root index.md", () => {
    // WHEN Quartz emitted the canvas page plus its own auto root listing
    beforeEach(() => {
      fs.writeFileSync(path.join(outDir, "index.canvas.html"), CANVAS_PAGE_HTML)
      fs.writeFileSync(path.join(outDir, "index.html"), QUARTZ_FOLDER_LISTING_HTML)
    })

    test("THEN index.html becomes a copy of the canvas page", () => {
      HomepageAlias.apply(stagingWith({ canvasFiles: ["index.canvas"] }), outDir)
      assert.equal(fs.readFileSync(path.join(outDir, "index.html"), "utf-8"), CANVAS_PAGE_HTML)
    })

    test("THEN apply reports the alias was written", () => {
      assert.equal(HomepageAlias.apply(stagingWith({ canvasFiles: ["index.canvas"] }), outDir), true)
    })

    test("THEN the original /index.canvas page keeps existing (links keep working)", () => {
      HomepageAlias.apply(stagingWith({ canvasFiles: ["index.canvas"] }), outDir)
      assert.equal(
        fs.readFileSync(path.join(outDir, "index.canvas.html"), "utf-8"),
        CANVAS_PAGE_HTML,
      )
    })
  })

  describe("GIVEN BOTH a root index.md and a root index.canvas staged", () => {
    test("THEN the markdown homepage wins (no aliasing)", () => {
      fs.writeFileSync(path.join(outDir, "index.canvas.html"), CANVAS_PAGE_HTML)
      fs.writeFileSync(path.join(outDir, "index.html"), MARKDOWN_HOMEPAGE_HTML)
      const applied = HomepageAlias.apply(
        stagingWith({ markdownFiles: ["index.md"], canvasFiles: ["index.canvas"] }),
        outDir,
      )
      assert.deepEqual(
        { applied, homepage: fs.readFileSync(path.join(outDir, "index.html"), "utf-8") },
        { applied: false, homepage: MARKDOWN_HOMEPAGE_HTML },
      )
    })
  })

  describe("GIVEN no root index.canvas staged", () => {
    test("THEN apply is a no-op (non-root canvases do not qualify)", () => {
      const applied = HomepageAlias.apply(
        stagingWith({ canvasFiles: ["canvases/main.canvas"] }),
        outDir,
      )
      assert.deepEqual(
        { applied, homepageExists: fs.existsSync(path.join(outDir, "index.html")) },
        { applied: false, homepageExists: false },
      )
    })
  })

  describe("GIVEN a root index.canvas staged but its page was never emitted", () => {
    test("THEN apply fails loudly (build corruption, never a silent 404 homepage)", () => {
      assert.throws(
        () => HomepageAlias.apply(stagingWith({ canvasFiles: ["index.canvas"] }), outDir),
        /index\.canvas\.html/,
      )
    })
  })
})

function stagingWith(files: { markdownFiles?: string[]; canvasFiles?: string[] }) {
  return {
    stagedMarkdownFiles: files.markdownFiles ?? [],
    stagedCanvasFiles: files.canvasFiles ?? [],
  }
}
