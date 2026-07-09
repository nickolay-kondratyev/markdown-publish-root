import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, test } from "node:test"
import {
  LinkChecker,
  formatBrokenLinkReport,
  type BrokenLinkReport,
} from "../../src/validation/linkChecker.ts"

describe("LinkChecker", () => {
  const workDirs: string[] = []
  afterEach(() => {
    while (workDirs.length > 0) fs.rmSync(workDirs.pop() as string, { recursive: true, force: true })
  })

  /** GIVEN helper: a synthetic output dir. Returns the check() report. */
  function checkLinks(outputFiles: Record<string, string>): BrokenLinkReport {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "link-check-test-"))
    workDirs.push(outDir)
    for (const [relPath, content] of Object.entries(outputFiles)) {
      const target = path.join(outDir, relPath)
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, content)
    }
    return new LinkChecker().check(outDir)
  }

  test("GIVEN a relative href to a missing page THEN it is reported under its source page", () => {
    const report = checkLinks({
      "notes/a.html": '<a href="../notes/missing">gone</a>',
    })
    assert.deepEqual(report.brokenBySourcePage, {
      "notes/a": [{ target: "../notes/missing", resolvedSitePath: "notes/missing", kind: "page-link" }],
    })
  })

  test("GIVEN an extensionless href whose .html file exists THEN it is NOT reported", () => {
    const report = checkLinks({
      "notes/a.html": '<a href="../notes/b">exists</a>',
      "notes/b.html": "<p>target</p>",
    })
    assert.equal(report.totalBroken, 0)
  })

  test("GIVEN external / mailto / protocol-relative / anchor-only links THEN none are reported", () => {
    const report = checkLinks({
      "index.html":
        '<a href="https://example.com/x">a</a>' +
        '<a href="mailto:x@example.com">b</a>' +
        '<a href="//cdn.example.com/lib.js">c</a>' +
        '<a href="#section">d</a>',
    })
    assert.equal(report.totalBroken, 0)
  })

  test("GIVEN a link with an anchor to an EXISTING page THEN the anchor is stripped and not reported", () => {
    const report = checkLinks({
      "notes/a.html": '<a href="../notes/b#section">anchored</a>',
      "notes/b.html": "<p>target</p>",
    })
    assert.equal(report.totalBroken, 0)
  })

  test("GIVEN a link with an anchor to a MISSING page THEN the page (not the anchor) is reported", () => {
    const report = checkLinks({
      "notes/a.html": '<a href="../gone#section">anchored</a>',
    })
    assert.deepEqual(report.brokenBySourcePage["notes/a"]?.map((l) => l.resolvedSitePath), ["gone"])
  })

  test("GIVEN a root-absolute href THEN it resolves from the site root", () => {
    const report = checkLinks({
      "deep/nested/page.html": '<a href="/index">root</a>',
      "index.html": "<p>home</p>",
    })
    assert.equal(report.totalBroken, 0)
  })

  test("GIVEN img src and data-viewer-src attributes THEN they are checked too", () => {
    const report = checkLinks({
      "page.html": '<img src="images/missing.png"><div data-viewer-src="../static/gone.js"></div>',
    })
    assert.deepEqual(report.brokenBySourcePage["page"]?.map((l) => l.target).sort(), [
      "../static/gone.js",
      "images/missing.png",
    ])
  })

  test("GIVEN a URL-encoded href to an emitted file with spaces THEN it is decoded and found", () => {
    const report = checkLinks({
      "page.html": '<a href="notes/My%20Note">spaced</a>',
      "notes/My Note.html": "<p>target</p>",
    })
    assert.equal(report.totalBroken, 0)
  })

  test("GIVEN the same broken URL repeated on one page THEN it is reported once", () => {
    const report = checkLinks({
      "page.html": '<a href="gone">1</a><a href="gone">2</a>',
    })
    assert.equal(report.totalBroken, 1)
  })

  test("GIVEN a FRAGMENT file linking relative to its canvas page THEN the link is rebased and found", () => {
    // Fragment HTML is injected into the canvas page's DOM: "../notes/b" must
    // resolve from "canvases/main.canvas", not from the fragments directory.
    const report = checkLinks({
      "canvases/main.canvas.fragments/node-1.html": '<a href="../notes/b">note link</a>',
      "notes/b.html": "<p>target</p>",
    })
    assert.equal(report.totalBroken, 0)
  })

  test("GIVEN a fragment with a genuinely missing target THEN it is reported under the CANVAS page", () => {
    const report = checkLinks({
      "canvases/main.canvas.fragments/node-1.html": '<a href="../notes/gone">missing</a>',
    })
    assert.deepEqual(Object.keys(report.brokenBySourcePage), ["canvases/main.canvas"])
  })

  describe("canvas payload", () => {
    function canvasPage(payload: object): string {
      return (
        `<html><script type="application/json" data-canvas-data>` +
        JSON.stringify(payload).replaceAll("<", "\\u003c") +
        `</script><div data-canvas-mount></div></html>`
      )
    }

    test("GIVEN an attachments-map URL pointing at a missing file THEN it is reported as canvas-attachment", () => {
      const report = checkLinks({
        "canvases/main.canvas.html": canvasPage({
          canvas: { nodes: [], edges: [] },
          attachments: { "attachments/pic.png": "../attachments/pic.png" },
          noteLinks: {},
        }),
      })
      assert.deepEqual(report.brokenBySourcePage["canvases/main.canvas"], [
        {
          target: "../attachments/pic.png",
          resolvedSitePath: "attachments/pic.png",
          kind: "canvas-attachment",
        },
      ])
    })

    test("GIVEN attachments and noteLinks pointing at emitted files THEN nothing is reported", () => {
      const report = checkLinks({
        "canvases/main.canvas.html": canvasPage({
          canvas: { nodes: [], edges: [] },
          attachments: { "attachments/pic.png": "../attachments/pic.png" },
          noteLinks: { "node-1": { href: "../notes/b" } },
        }),
        "attachments/pic.png": "png-bytes",
        "notes/b.html": "<p>target</p>",
      })
      assert.equal(report.totalBroken, 0)
    })

    test("GIVEN a noteLinks href with subpath anchor to a missing page THEN it is reported as canvas-note-link", () => {
      const report = checkLinks({
        "canvases/main.canvas.html": canvasPage({
          canvas: { nodes: [], edges: [] },
          attachments: {},
          noteLinks: { "node-1": { href: "../notes/gone#heading" } },
        }),
      })
      assert.deepEqual(report.brokenBySourcePage["canvases/main.canvas"]?.map((l) => l.kind), [
        "canvas-note-link",
      ])
    })

    test("GIVEN a text card whose prebaked HTML links a missing page THEN it is reported as canvas-card-link", () => {
      const report = checkLinks({
        "canvases/main.canvas.html": canvasPage({
          canvas: {
            nodes: [{ id: "t1", type: "text", text: '<p><a href="../notes/gone">x</a></p>' }],
            edges: [],
          },
          attachments: {},
          noteLinks: {},
        }),
      })
      assert.deepEqual(report.brokenBySourcePage["canvases/main.canvas"]?.map((l) => l.kind), [
        "canvas-card-link",
      ])
    })

    test("GIVEN a text card linking an external URL THEN it is ignored", () => {
      const report = checkLinks({
        "canvases/main.canvas.html": canvasPage({
          canvas: {
            nodes: [{ id: "t1", type: "text", text: '<p><a href="https://example.com">x</a></p>' }],
            edges: [],
          },
          attachments: {},
          noteLinks: {},
        }),
      })
      assert.equal(report.totalBroken, 0)
    })
  })

  describe("formatBrokenLinkReport", () => {
    test("GIVEN no broken links THEN it says so", () => {
      assert.equal(
        formatBrokenLinkReport({ brokenBySourcePage: {}, totalBroken: 0 }),
        "No broken internal links.",
      )
    })

    test("GIVEN findings THEN the report is grouped by source page", () => {
      const text = formatBrokenLinkReport({
        brokenBySourcePage: {
          "notes/a": [{ target: "../gone", resolvedSitePath: "gone", kind: "page-link" }],
        },
        totalBroken: 1,
      })
      assert.deepEqual(text.split("\n"), [
        "Broken internal links (1):",
        "  notes/a:",
        "    ../gone -> gone [page-link]",
      ])
    })
  })
})
