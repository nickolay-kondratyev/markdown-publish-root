import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { CanvasMarkdownRenderer } from "../../src/markdownRenderer.js"
import { VaultLinkResolver } from "../../src/resolver.js"

const ALL_SLUGS = [
  "index",
  "notes/getting-started",
  "notes/architecture",
  "attachments/diagram.png",
  "canvases/main.canvas",
  "canvases/second.canvas",
]

function renderer(): CanvasMarkdownRenderer {
  return new CanvasMarkdownRenderer(new VaultLinkResolver("canvases/main.canvas", ALL_SLUGS))
}

describe("CanvasMarkdownRenderer — markdown basics", () => {
  test("GIVEN a heading WHEN rendering THEN an h1 is produced", () => {
    assert.match(renderer().render("# Hello").html, /<h1>Hello<\/h1>/)
  })

  test("GIVEN GFM strikethrough WHEN rendering THEN a del element is produced", () => {
    assert.match(renderer().render("~~gone~~").html, /<del>gone<\/del>/)
  })

  test("GIVEN a blockquote WHEN rendering THEN a blockquote element is produced", () => {
    assert.match(renderer().render("> quoted").html, /<blockquote>/)
  })

  test("GIVEN raw HTML WHEN rendering THEN it passes through (own-vault trust model, like Quartz ofm)", () => {
    assert.match(renderer().render('a <span class="x">b</span>').html, /<span class="x">b<\/span>/)
  })
})

describe("CanvasMarkdownRenderer — wikilinks (shared resolver)", () => {
  test("GIVEN a note wikilink WHEN rendering THEN the href resolves relative to the canvas page", () => {
    assert.match(
      renderer().render("see [[getting-started]]").html,
      /<a[^>]*href="\.\.\/notes\/getting-started"[^>]*>getting-started<\/a>/,
    )
  })

  test("GIVEN a note wikilink WHEN rendering THEN the anchor carries Quartz's internal class", () => {
    assert.match(renderer().render("[[getting-started]]").html, /class="internal"/)
  })

  test("GIVEN a canvas wikilink WHEN rendering THEN it resolves to the canvas page", () => {
    assert.match(
      renderer().render("go to [[second.canvas]]").html,
      /href="\.\.\/canvases\/second\.canvas"/,
    )
  })

  test("GIVEN an aliased wikilink WHEN rendering THEN the alias is the link text", () => {
    assert.match(renderer().render("[[getting-started|Start Here]]").html, />Start Here<\/a>/)
  })

  test("GIVEN a heading anchor WHEN rendering THEN the anchor is github-slugged like ofm", () => {
    assert.match(
      renderer().render("[[getting-started#Some Heading]]").html,
      /href="\.\.\/notes\/getting-started#some-heading"/,
    )
  })

  test("GIVEN a block-ref anchor WHEN rendering THEN it is slugged exactly like Quartz's transformLink", () => {
    // The shared resolver (transformLink) github-slugs ALL anchors, dropping
    // the "^" — canvas links must match markdown-page links byte-for-byte.
    assert.match(
      renderer().render("[[architecture#^engine-def]]").html,
      /href="\.\.\/notes\/architecture#engine-def"/,
    )
  })

  test("GIVEN an image embed WHEN rendering THEN an img with the resolved asset URL is produced", () => {
    assert.match(
      renderer().render("![[diagram.png]]").html,
      /<img[^>]*src="\.\.\/attachments\/diagram\.png"/,
    )
  })

  test("GIVEN wikilinks WHEN rendering THEN their targets are reported for data.links", () => {
    const rendered = renderer().render("[[getting-started]] and [[second.canvas]]")
    assert.deepEqual(
      [...rendered.outgoingSimpleSlugs].sort(),
      ["canvases/second.canvas", "notes/getting-started"],
    )
  })

  test("GIVEN duplicate wikilinks WHEN rendering THEN targets are deduplicated", () => {
    const rendered = renderer().render("[[getting-started]] then [[getting-started]]")
    assert.deepEqual(rendered.outgoingSimpleSlugs, ["notes/getting-started"])
  })

  test("GIVEN text around a wikilink WHEN rendering THEN the surrounding text is preserved", () => {
    assert.match(renderer().render("before [[getting-started]] after").html, /before <a.*<\/a> after/)
  })
})
