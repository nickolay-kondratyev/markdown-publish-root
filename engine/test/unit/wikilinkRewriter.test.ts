import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { WikilinkRewriter } from "../../src/wikilinkRewriter.ts"

const ID_A = "docid_aaaaaaaaaaaaaaaaaaaaa_e"
const ID_CANVAS = "docid_bbbbbbbbbbbbbbbbbbbbb_e.canvas"

/** GIVEN a resolver that knows "some-note" (md) and "second.canvas" (canvas). */
const rewriter = new WikilinkRewriter((target) => {
  if (target === "some-note") return ID_A
  if (target === "second.canvas") return ID_CANVAS
  return undefined
})

describe("WikilinkRewriter", () => {
  test("WHEN rewriting a bare link THEN the original target becomes the alias", () => {
    assert.equal(rewriter.rewrite("See [[some-note]]."), `See [[${ID_A}|some-note]].`)
  })

  test("WHEN rewriting an aliased link THEN the alias is preserved", () => {
    assert.equal(rewriter.rewrite("[[some-note|My Alias]]"), `[[${ID_A}|My Alias]]`)
  })

  test("WHEN rewriting a bare link with heading anchor THEN anchor is kept verbatim and display includes it", () => {
    assert.equal(
      rewriter.rewrite("[[some-note#Some Heading]]"),
      `[[${ID_A}#Some Heading|some-note#Some Heading]]`,
    )
  })

  test("WHEN rewriting an anchored + aliased link THEN only the target changes", () => {
    assert.equal(rewriter.rewrite("[[some-note#h|A]]"), `[[${ID_A}#h|A]]`)
  })

  test("WHEN rewriting a block reference THEN the ^block anchor is kept verbatim", () => {
    assert.equal(
      rewriter.rewrite("[[some-note#^block-id]]"),
      `[[${ID_A}#^block-id|some-note#^block-id]]`,
    )
  })

  test("WHEN rewriting a canvas link THEN the .canvas extension is preserved in the target", () => {
    assert.equal(
      rewriter.rewrite("[[second.canvas]]"),
      `[[${ID_CANVAS}|second.canvas]]`,
    )
  })

  test("WHEN a target does not resolve THEN the link is left untouched (conservative rule)", () => {
    assert.equal(rewriter.rewrite("[[unknown-note]]"), "[[unknown-note]]")
  })

  test("WHEN rewriting an asset embed THEN it is left untouched (assets keep vault paths)", () => {
    assert.equal(rewriter.rewrite("![[diagram.png]]"), "![[diagram.png]]")
  })

  test("WHEN rewriting a note embed THEN the target is rewritten withOUT adding an alias", () => {
    assert.equal(rewriter.rewrite("![[some-note]]"), `![[${ID_A}]]`)
  })

  test("WHEN rewriting a note embed with an alias THEN the alias is preserved", () => {
    assert.equal(rewriter.rewrite("![[some-note|300]]"), `![[${ID_A}|300]]`)
  })

  test("WHEN a wikilink sits inside a fenced code block THEN it is untouched", () => {
    const text = "before\n```\n[[some-note]]\n```\nafter [[some-note]]"
    assert.equal(
      rewriter.rewrite(text),
      `before\n\`\`\`\n[[some-note]]\n\`\`\`\nafter [[${ID_A}|some-note]]`,
    )
  })

  test("WHEN a wikilink sits inside inline code THEN it is untouched", () => {
    assert.equal(
      rewriter.rewrite("`[[some-note]]` and [[some-note]]"),
      `\`[[some-note]]\` and [[${ID_A}|some-note]]`,
    )
  })

  test("WHEN several links share a line THEN all are rewritten", () => {
    assert.equal(
      rewriter.rewrite("[[some-note]], [[second.canvas]]"),
      `[[${ID_A}|some-note]], [[${ID_CANVAS}|second.canvas]]`,
    )
  })

  test("WHEN the text has no wikilinks THEN it is returned byte-identical", () => {
    const text = "# Plain\n\nNothing to do.\n"
    assert.equal(rewriter.rewrite(text), text)
  })
})
