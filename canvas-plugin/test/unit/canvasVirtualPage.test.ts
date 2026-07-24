import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { after, before, describe, test } from "node:test"
import VintrinCanvasPage from "../../index.js"

const CANVAS_FILE = "notes/docid_ccccccccccccccccccccc_e.canvas"

describe("VintrinCanvasPage.generate — virtual page frontmatter", () => {
  let stagingDir: string
  let pages: Array<{ slug: string; data: { frontmatter: Record<string, unknown> } }>

  // GIVEN a staged canvas carrying engine-injected metadata (title + vintrinPath)
  before(() => {
    stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), "canvas-vp-test-"))
    const target = path.join(stagingDir, CANVAS_FILE)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(
      target,
      JSON.stringify({
        nodes: [],
        edges: [],
        metadata: {
          frontmatter: {
            id: "docid_ccccccccccccccccccccc_e",
            title: "main",
            vintrinPath: "boards/main.canvas",
          },
        },
      }),
    )
    // WHEN generating virtual pages
    const plugin = VintrinCanvasPage()
    pages = plugin.generate({
      ctx: { allFiles: [CANVAS_FILE], allSlugs: [], argv: { directory: stagingDir } },
      content: [],
    })
  })

  after(() => fs.rmSync(stagingDir, { recursive: true, force: true }))

  test("THEN vintrinPath passes through into the virtual page frontmatter (§4.4)", () => {
    assert.equal(pages[0]?.data.frontmatter.vintrinPath, "boards/main.canvas")
  })

  test("THEN the engine-injected title stays the display title", () => {
    assert.equal(pages[0]?.data.frontmatter.title, "main")
  })
})
