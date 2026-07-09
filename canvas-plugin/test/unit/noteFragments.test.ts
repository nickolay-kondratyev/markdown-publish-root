import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { NoteFragmentExtractor } from "../../src/noteFragments.js"

const NOTE_SLUG = "notes/getting-started"
const CANVAS_SLUG = "canvases/main.canvas"

function element(tagName: string, properties: object, text: string): object {
  return { type: "element", tagName, properties, children: [{ type: "text", value: text }] }
}

/** Synthetic PROCESSED note hast, shaped like Quartz's output (ids github-slugged). */
function noteTree(): { type: string; children: object[] } {
  return {
    type: "root",
    children: [
      element("h1", { id: "getting-started" }, "Getting Started"),
      element("p", {}, "INTRO-TEXT"),
      element("h2", { id: "installation" }, "Installation"),
      element("p", {}, "INSTALLATION-ONLY-TEXT"),
      element("h2", { id: "usage" }, "Usage"),
      element("p", {}, "USAGE-ONLY-TEXT"),
    ],
  }
}

function noteData(): object {
  return {
    blocks: { "engine-def": element("p", { id: "engine-def" }, "BLOCK-ONLY-TEXT") },
  }
}

function extract(subpath?: string) {
  return NoteFragmentExtractor.extract({
    noteTree: noteTree(),
    noteData: noteData(),
    noteSlug: NOTE_SLUG,
    canvasSlug: CANVAS_SLUG,
    subpath,
  })
}

describe("NoteFragmentExtractor — whole note", () => {
  test("GIVEN no subpath WHEN extracting THEN the whole note is included", () => {
    const { html } = extract()
    assert.deepEqual(
      ["INTRO-TEXT", "INSTALLATION-ONLY-TEXT", "USAGE-ONLY-TEXT"].map((s) => html.includes(s)),
      [true, true, true],
    )
  })
})

describe("NoteFragmentExtractor — #heading subpath (Quartz transclude semantics)", () => {
  test("GIVEN a heading subpath WHEN extracting THEN only that section is included", () => {
    const { html } = extract("#Installation")
    assert.deepEqual(
      {
        installation: html.includes("INSTALLATION-ONLY-TEXT"),
        usage: html.includes("USAGE-ONLY-TEXT"),
        intro: html.includes("INTRO-TEXT"),
      },
      { installation: true, usage: false, intro: false },
    )
  })

  test("GIVEN a heading subpath WHEN extracting THEN the heading itself is included", () => {
    assert.match(extract("#Installation").html, /<h2[^>]*>Installation<\/h2>/)
  })

  test("GIVEN an unknown heading WHEN extracting THEN the full note is returned and flagged", () => {
    const result = extract("#No Such Heading")
    assert.deepEqual(
      { subpathFound: result.subpathFound, full: result.html.includes("USAGE-ONLY-TEXT") },
      { subpathFound: false, full: true },
    )
  })
})

describe("NoteFragmentExtractor — #^block subpath", () => {
  test("GIVEN a block subpath WHEN extracting THEN only the block is included", () => {
    const { html } = extract("#^engine-def")
    assert.deepEqual(
      { block: html.includes("BLOCK-ONLY-TEXT"), rest: html.includes("INTRO-TEXT") },
      { block: true, rest: false },
    )
  })

  test("GIVEN a list-item block WHEN extracting THEN it is wrapped in a ul (like Quartz)", () => {
    const data = { blocks: { item: element("li", {}, "LIST-BLOCK") } }
    const { html } = NoteFragmentExtractor.extract({
      noteTree: noteTree(),
      noteData: data,
      noteSlug: NOTE_SLUG,
      canvasSlug: CANVAS_SLUG,
      subpath: "#^item",
    })
    assert.match(html, /<ul><li>LIST-BLOCK<\/li><\/ul>/)
  })

  test("GIVEN an unknown block id WHEN extracting THEN the full note is returned and flagged", () => {
    assert.equal(extract("#^nope").subpathFound, false)
  })
})

describe("NoteFragmentExtractor — link rebasing (note-relative -> canvas-relative)", () => {
  test("GIVEN a note-relative href WHEN extracting THEN it resolves to the same page from the canvas", () => {
    const tree = {
      type: "root",
      children: [
        {
          type: "element",
          tagName: "p",
          properties: {},
          children: [
            {
              type: "element",
              tagName: "a",
              // crawl-links resolved this relative to notes/getting-started
              properties: { href: "../notes/architecture" },
              children: [{ type: "text", value: "arch" }],
            },
          ],
        },
      ],
    }
    const { html } = NoteFragmentExtractor.extract({
      noteTree: tree,
      noteData: {},
      noteSlug: NOTE_SLUG,
      canvasSlug: CANVAS_SLUG,
    })
    const href = html.match(/href="([^"]+)"/)?.[1]
    assert.notEqual(href, undefined)
    // The fragment is injected into the CANVAS page's DOM — resolving the
    // rebased href against the canvas page URL must land on the note's page.
    const resolved = new URL(href as string, `https://site.example/${CANVAS_SLUG}`)
    assert.equal(resolved.pathname, "/notes/architecture")
  })

  test("GIVEN an absolute URL WHEN extracting THEN it is left untouched", () => {
    const tree = {
      type: "root",
      children: [
        {
          type: "element",
          tagName: "a",
          properties: { href: "https://example.com/x" },
          children: [{ type: "text", value: "ext" }],
        },
      ],
    }
    const { html } = NoteFragmentExtractor.extract({
      noteTree: tree,
      noteData: {},
      noteSlug: NOTE_SLUG,
      canvasSlug: CANVAS_SLUG,
    })
    assert.match(html, /href="https:\/\/example\.com\/x"/)
  })
})
