import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { CanvasRewriter } from "../../src/canvasRewriter.js"
import { parseCanvas, classifyFileTarget, FileTargetKind } from "../../src/canvasSchema.js"

const CANVAS_SLUG = "canvases/main.canvas"
const PRIVATE_PATH_MARKER = "private-secret"

// Staged files only — the private note is deliberately absent (privacy boundary).
const ALL_SLUGS = [
  "index",
  "notes/getting-started",
  "notes/architecture",
  "attachments/diagram.png",
  "attachments/manual.pdf",
  "canvases/main.canvas",
  "canvases/second.canvas",
]

function element(tagName: string, properties: object, text: string): object {
  return { type: "element", tagName, properties, children: [{ type: "text", value: text }] }
}

const NOTES: Record<string, { tree: object; data: object }> = {
  "notes/getting-started": {
    tree: {
      type: "root",
      children: [
        element("h2", { id: "installation" }, "Installation"),
        element("p", {}, "INSTALLATION-ONLY-TEXT"),
        element("h2", { id: "usage" }, "Usage"),
        element("p", {}, "USAGE-ONLY-TEXT"),
      ],
    },
    data: { frontmatter: { title: "Getting Started" }, blocks: {} },
  },
  "notes/architecture": {
    tree: { type: "root", children: [element("p", {}, "ARCHITECTURE-BODY")] },
    data: { frontmatter: { title: "Architecture" }, blocks: {} },
  },
}

function rewriter(): CanvasRewriter {
  return new CanvasRewriter({
    canvasSlug: CANVAS_SLUG,
    allSlugs: ALL_SLUGS,
    noteLookup: (slug: string) => NOTES[slug],
  })
}

function baseNode(id: string, overrides: object): object {
  return { id, x: 10, y: 20, width: 400, height: 300, ...overrides }
}

function rewriteNodes(...nodes: object[]) {
  return rewriter().rewrite({ nodes, edges: [] })
}

describe("CanvasRewriter — invariants", () => {
  test("GIVEN any node WHEN rewriting THEN id and coordinates are preserved (commenting anchors)", () => {
    const result = rewriteNodes(
      baseNode("n1", { type: "file", file: "notes/private-secret.md", color: "2" }),
    )
    const node = result.canvas.nodes[0]
    assert.deepEqual(
      { id: node.id, x: node.x, y: node.y, width: node.width, height: node.height, color: node.color },
      { id: "n1", x: 10, y: 20, width: 400, height: 300, color: "2" },
    )
  })

  test("GIVEN edges WHEN rewriting THEN they pass through unchanged", () => {
    const edge = { id: "e1", fromNode: "a", toNode: "b", label: "L", color: "3", toEnd: "arrow" }
    const result = rewriter().rewrite({ nodes: [], edges: [edge] })
    assert.deepEqual(result.canvas.edges, [edge])
  })

  test("GIVEN a group node WHEN rewriting THEN it passes through unchanged", () => {
    const group = baseNode("g1", { type: "group", label: "Intro Group", color: "6" })
    assert.deepEqual(rewriteNodes(group).canvas.nodes[0], group)
  })

  test("GIVEN a web link node WHEN rewriting THEN it passes through unchanged", () => {
    const link = baseNode("l1", { type: "link", url: "https://jsoncanvas.org/" })
    assert.deepEqual(rewriteNodes(link).canvas.nodes[0], link)
  })

  test("GIVEN remaining file nodes WHEN rewriting THEN the attachments map covers every one (404 bodies otherwise)", () => {
    const result = rewriteNodes(
      baseNode("md", { type: "file", file: "notes/architecture.md" }),
      baseNode("img", { type: "file", file: "attachments/diagram.png" }),
    )
    const fileNodes = result.canvas.nodes.filter((n: any) => n.type === "file")
    assert.deepEqual(
      fileNodes.map((n: any) => n.file in result.attachments),
      [true, true],
    )
  })
})

describe("CanvasRewriter — text cards", () => {
  test("GIVEN markdown text WHEN rewriting THEN the card carries prebaked HTML", () => {
    const result = rewriteNodes(baseNode("t1", { type: "text", text: "# Title\n\n**bold**" }))
    assert.match(result.canvas.nodes[0].text, /<h1>Title<\/h1>/)
  })

  test("GIVEN a wikilink in a text card WHEN rewriting THEN it resolves via the shared resolver", () => {
    const result = rewriteNodes(baseNode("t1", { type: "text", text: "[[getting-started]]" }))
    assert.match(result.canvas.nodes[0].text, /href="\.\.\/notes\/getting-started"/)
  })

  test("GIVEN wikilinks in text cards WHEN rewriting THEN they register as outbound links", () => {
    const result = rewriteNodes(
      baseNode("t1", { type: "text", text: "[[getting-started]] and [[second.canvas]]" }),
    )
    assert.deepEqual(
      [...result.links].sort(),
      ["canvases/second.canvas", "notes/getting-started"],
    )
  })

  test("GIVEN text cards WHEN rewriting THEN their plain text lands in searchText", () => {
    const result = rewriteNodes(baseNode("t1", { type: "text", text: "# Searchable Words" }))
    assert.match(result.searchText, /Searchable Words/)
  })
})

describe("CanvasRewriter — note cards (file -> .md)", () => {
  test("GIVEN a published note card WHEN rewriting THEN the node stays a file node (viewer dispatch by extension)", () => {
    const result = rewriteNodes(baseNode("n1", { type: "file", file: "notes/architecture.md" }))
    assert.equal(result.canvas.nodes[0].type, "file")
  })

  test("GIVEN a note card WHEN rewriting THEN attachments remap the note to an emitted fragment", () => {
    const result = rewriteNodes(baseNode("n1", { type: "file", file: "notes/architecture.md" }))
    assert.equal(
      result.attachments["notes/architecture.md"],
      "../canvases/main.canvas.fragments/n1.html",
    )
  })

  test("GIVEN a note card WHEN rewriting THEN the fragment contains the note's rendered body", () => {
    const result = rewriteNodes(baseNode("n1", { type: "file", file: "notes/architecture.md" }))
    assert.match(result.fragments[0].html, /ARCHITECTURE-BODY/)
  })

  test("GIVEN a note card WHEN rewriting THEN the open-note affordance carries the note URL and title", () => {
    const result = rewriteNodes(baseNode("n1", { type: "file", file: "notes/architecture.md" }))
    assert.deepEqual(result.noteLinks["n1"], {
      href: "../notes/architecture",
      title: "Architecture",
    })
  })

  test("GIVEN a #heading subpath WHEN rewriting THEN the fragment contains only that section", () => {
    const result = rewriteNodes(
      baseNode("n1", { type: "file", file: "notes/getting-started.md", subpath: "#Installation" }),
    )
    assert.deepEqual(
      {
        installation: result.fragments[0].html.includes("INSTALLATION-ONLY-TEXT"),
        usage: result.fragments[0].html.includes("USAGE-ONLY-TEXT"),
      },
      { installation: true, usage: false },
    )
  })

  test("GIVEN a #heading subpath WHEN rewriting THEN the open link deep-links to the slugged anchor", () => {
    const result = rewriteNodes(
      baseNode("n1", { type: "file", file: "notes/getting-started.md", subpath: "#Installation" }),
    )
    assert.equal(result.noteLinks["n1"]?.href, "../notes/getting-started#installation")
  })

  test("GIVEN an unknown subpath WHEN rewriting THEN a warning is surfaced (full note fallback)", () => {
    const result = rewriteNodes(
      baseNode("n1", { type: "file", file: "notes/getting-started.md", subpath: "#Nope" }),
    )
    assert.equal(result.warnings.length, 1)
  })
})

describe("CanvasRewriter — privacy (plan §4.4)", () => {
  function privateResult() {
    return rewriteNodes(baseNode("p1", { type: "file", file: "notes/private-secret.md" }))
  }

  test("GIVEN an unpublished note card WHEN rewriting THEN it becomes a contentless placeholder", () => {
    assert.match(privateResult().canvas.nodes[0].text, /Private note/)
  })

  test("GIVEN an unpublished note card WHEN rewriting THEN the vault path appears NOWHERE in the output", () => {
    assert.equal(JSON.stringify(privateResult()).includes(PRIVATE_PATH_MARKER), false)
  })

  test("GIVEN an unpublished note card WHEN rewriting THEN no outbound link is registered", () => {
    assert.deepEqual(privateResult().links, [])
  })

  test("GIVEN an unpublished note card WHEN rewriting THEN no attachment entry exists", () => {
    assert.deepEqual(privateResult().attachments, {})
  })

  test("GIVEN a MISSING file card WHEN rewriting THEN it gets the SAME placeholder (no existence oracle)", () => {
    const missing = rewriteNodes(baseNode("m1", { type: "file", file: "does/not/exist.md" }))
    assert.equal(missing.canvas.nodes[0].text, privateResult().canvas.nodes[0].text)
  })
})

describe("CanvasRewriter — canvas / pdf / media cards", () => {
  test("GIVEN a canvas card WHEN rewriting THEN it becomes a navigable internal link card", () => {
    const result = rewriteNodes(baseNode("c1", { type: "file", file: "canvases/second.canvas" }))
    assert.match(
      result.canvas.nodes[0].text,
      /<a class="internal canvas-card-link"[^>]*href="\.\.\/canvases\/second\.canvas">second<\/a>/,
    )
  })

  test("GIVEN a canvas card WHEN rewriting THEN the target canvas registers as an outbound link", () => {
    const result = rewriteNodes(baseNode("c1", { type: "file", file: "canvases/second.canvas" }))
    assert.deepEqual(result.links, ["canvases/second.canvas"])
  })

  test("GIVEN a PDF card WHEN rewriting THEN it becomes a card linking the published PDF", () => {
    const result = rewriteNodes(baseNode("pdf1", { type: "file", file: "attachments/manual.pdf" }))
    assert.match(
      result.canvas.nodes[0].text,
      /href="\.\.\/attachments\/manual\.pdf">manual\.pdf<\/a>/,
    )
  })

  test("GIVEN an image card WHEN rewriting THEN it stays a file node with a real asset URL", () => {
    const result = rewriteNodes(baseNode("i1", { type: "file", file: "attachments/diagram.png" }))
    assert.deepEqual(
      { type: result.canvas.nodes[0].type, url: result.attachments["attachments/diagram.png"] },
      { type: "file", url: "../attachments/diagram.png" },
    )
  })
})

describe("parseCanvas", () => {
  test("GIVEN valid canvas JSON WHEN parsing THEN nodes and edges are returned", () => {
    const parsed = parseCanvas('{"nodes":[{"id":"a","type":"text"}],"edges":[]}')
    assert.equal(parsed.nodes.length, 1)
  })

  test("GIVEN an empty object WHEN parsing THEN empty arrays are defaulted", () => {
    assert.deepEqual(parseCanvas("{}"), { nodes: [], edges: [] })
  })

  test("GIVEN invalid JSON WHEN parsing THEN a CanvasParseError is thrown", () => {
    assert.throws(() => parseCanvas("not json"), /not valid JSON/)
  })

  test("GIVEN a node without an id WHEN parsing THEN a CanvasParseError is thrown", () => {
    assert.throws(() => parseCanvas('{"nodes":[{"type":"text"}]}'), /string `id`/)
  })
})

describe("classifyFileTarget", () => {
  test("GIVEN representative extensions WHEN classifying THEN kinds match the viewer's dispatch", () => {
    assert.deepEqual(
      ["a.md", "b.canvas", "c.pdf", "d.png", "e.mp3", "f.mp4", "g.txt", "h.xyz"].map(
        classifyFileTarget,
      ),
      [
        FileTargetKind.NOTE,
        FileTargetKind.CANVAS,
        FileTargetKind.PDF,
        FileTargetKind.MEDIA,
        FileTargetKind.MEDIA,
        FileTargetKind.MEDIA,
        FileTargetKind.MEDIA,
        FileTargetKind.OTHER,
      ],
    )
  })
})
