import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { CanvasStagingTransformer } from "../../src/canvasStagingTransform.ts"
import { IdMap } from "../../src/idMap.ts"
import { MarkdownStagingTransformer } from "../../src/markdownStagingTransform.ts"

const ID_A = "docid_aaaaaaaaaaaaaaaaaaaaa_e"
const ID_B = "docid_bbbbbbbbbbbbbbbbbbbbb_e"

describe("MarkdownStagingTransformer", () => {
  test("GIVEN no title WHEN transforming THEN the original basename is injected as title", () => {
    const output = MarkdownStagingTransformer.transform(
      `---\nid: ${ID_A}\npublish: true\n---\nBody\n`,
      { titleWhenAbsent: "some-note", rewriteBody: (body) => body },
    )
    assert.equal(output, `---\ntitle: "some-note"\nid: ${ID_A}\npublish: true\n---\nBody\n`)
  })

  test("GIVEN an existing title WHEN transforming THEN frontmatter is untouched", () => {
    const input = `---\ntitle: My Title\nid: ${ID_A}\n---\nBody\n`
    const output = MarkdownStagingTransformer.transform(input, {
      titleWhenAbsent: "some-note",
      rewriteBody: (body) => body,
    })
    assert.equal(output, input)
  })

  test("WHEN transforming THEN only the body is passed to the link rewriter (frontmatter excluded)", () => {
    const seen: string[] = []
    MarkdownStagingTransformer.transform(`---\ntitle: T\nid: ${ID_A}\n---\nBody [[x]]\n`, {
      titleWhenAbsent: "t",
      rewriteBody: (body) => {
        seen.push(body)
        return body
      },
    })
    assert.deepEqual(seen, ["Body [[x]]\n"])
  })

  test("GIVEN a rewriting body transform WHEN transforming THEN its output lands in the result", () => {
    const output = MarkdownStagingTransformer.transform(`---\ntitle: T\nid: ${ID_A}\n---\nlink\n`, {
      titleWhenAbsent: "t",
      rewriteBody: () => "REWRITTEN\n",
    })
    assert.equal(output, `---\ntitle: T\nid: ${ID_A}\n---\nREWRITTEN\n`)
  })
})

describe("CanvasStagingTransformer", () => {
  const idMap = IdMap.build([
    { vaultPath: "notes/foo.md", idValue: ID_A },
    { vaultPath: "canvases/x.canvas", idValue: ID_B },
  ])

  const raw = JSON.stringify({
    nodes: [
      { id: "n1", type: "file", file: "notes/foo.md", subpath: "#Installation" },
      { id: "n2", type: "file", file: "attachments/img.png" },
      { id: "n3", type: "file", file: "notes/private.md" },
      { id: "n4", type: "text", text: "see [[foo]]" },
    ],
    edges: [],
    metadata: { frontmatter: { id: ID_B } },
  })

  const transformed = JSON.parse(
    CanvasStagingTransformer.transform(raw, {
      idMap,
      originalBasename: "x",
      rewriteText: (text) => text.replace("[[foo]]", `[[${ID_A}|foo]]`),
    }),
  )

  test("THEN doc file nodes point at their staged id paths (subpath preserved)", () => {
    assert.deepEqual(
      { file: transformed.nodes[0].file, subpath: transformed.nodes[0].subpath },
      { file: `n/${ID_A}.md`, subpath: "#Installation" },
    )
  })

  test("THEN asset file nodes are untouched", () => {
    assert.equal(transformed.nodes[1].file, "attachments/img.png")
  })

  test("THEN unpublishable doc targets are untouched (privacy placeholder fails closed downstream)", () => {
    assert.equal(transformed.nodes[2].file, "notes/private.md")
  })

  test("THEN text nodes go through the wikilink rewriter", () => {
    assert.equal(transformed.nodes[3].text, `see [[${ID_A}|foo]]`)
  })

  test("THEN the original basename is injected as metadata title when absent", () => {
    assert.equal(transformed.metadata.frontmatter.title, "x")
  })

  test("GIVEN an existing metadata title THEN it is preserved", () => {
    const withTitle = JSON.stringify({
      nodes: [],
      edges: [],
      metadata: { frontmatter: { id: ID_B, title: "Custom" } },
    })
    const result = JSON.parse(
      CanvasStagingTransformer.transform(withTitle, {
        idMap,
        originalBasename: "x",
        rewriteText: (text) => text,
      }),
    )
    assert.equal(result.metadata.frontmatter.title, "Custom")
  })

  test("THEN edges and unknown node types survive round-tripping", () => {
    const withExtras = JSON.stringify({
      nodes: [{ id: "g", type: "group", label: "G" }],
      edges: [{ id: "e", fromNode: "a", toNode: "b" }],
      metadata: { frontmatter: { id: ID_B } },
    })
    const result = JSON.parse(
      CanvasStagingTransformer.transform(withExtras, {
        idMap,
        originalBasename: "x",
        rewriteText: (text) => text,
      }),
    )
    assert.deepEqual(
      { node: result.nodes[0], edge: result.edges[0] },
      { node: { id: "g", type: "group", label: "G" }, edge: { id: "e", fromNode: "a", toNode: "b" } },
    )
  })
})
