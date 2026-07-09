import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { VaultLinkResolver, vaultPathToSlug } from "../../src/resolver.js"

// Mirrors the staged test-vault: notes, both canvases, and the image asset.
const ALL_SLUGS = [
  "index",
  "notes/getting-started",
  "notes/architecture",
  "attachments/diagram.png",
  "canvases/main.canvas",
  "canvases/second.canvas",
]

const CANVAS_SLUG = "canvases/main.canvas"

function resolver(): VaultLinkResolver {
  return new VaultLinkResolver(CANVAS_SLUG, ALL_SLUGS)
}

describe("vaultPathToSlug", () => {
  test("GIVEN a canvas path WHEN slugifying THEN the extension is kept (Quartz semantics)", () => {
    assert.equal(vaultPathToSlug("canvases/main.canvas"), "canvases/main.canvas")
  })

  test("GIVEN a note path with spaces WHEN slugifying THEN Quartz slugging applies", () => {
    assert.equal(vaultPathToSlug("Folder Name/My Note.md"), "folder-name/my-note")
  })
})

describe("VaultLinkResolver.resolveFilePath", () => {
  test("GIVEN a staged note path WHEN resolving THEN it exists with a canvas-relative URL", () => {
    const resolved = resolver().resolveFilePath("notes/architecture.md")
    assert.deepEqual(
      { exists: resolved.exists, relativeUrl: resolved.relativeUrl },
      { exists: true, relativeUrl: "../notes/architecture" },
    )
  })

  test("GIVEN an unstaged (private) note path WHEN resolving THEN exists is false", () => {
    assert.equal(resolver().resolveFilePath("notes/private-secret.md").exists, false)
  })

  test("GIVEN another canvas WHEN resolving THEN the target slug keeps its extension", () => {
    assert.equal(resolver().resolveFilePath("canvases/second.canvas").targetSlug, "canvases/second.canvas")
  })

  test("GIVEN an asset WHEN resolving THEN the simple slug suits data.links registration", () => {
    assert.equal(resolver().resolveFilePath("attachments/diagram.png").simpleSlug, "attachments/diagram.png")
  })
})

describe("VaultLinkResolver.resolveWikilinkTarget", () => {
  test("GIVEN a bare note name WHEN resolving THEN shortest-match resolution applies (Obsidian semantics)", () => {
    assert.equal(resolver().resolveWikilinkTarget("getting-started").relativeUrl, "../notes/getting-started")
  })

  test("GIVEN a bare note name WHEN resolving THEN the canonical target slug is recovered", () => {
    assert.equal(resolver().resolveWikilinkTarget("getting-started").targetSlug, "notes/getting-started")
  })

  test("GIVEN a canvas wikilink WHEN resolving THEN it resolves to the canvas page", () => {
    assert.equal(resolver().resolveWikilinkTarget("second.canvas").targetSlug, "canvases/second.canvas")
  })

  test("GIVEN a target with an anchor WHEN resolving THEN the anchor is preserved in the URL", () => {
    assert.equal(
      resolver().resolveWikilinkTarget("getting-started#installation").relativeUrl,
      "../notes/getting-started#installation",
    )
  })

  test("GIVEN an unknown target WHEN resolving THEN exists is false but a URL is still produced", () => {
    const resolved = resolver().resolveWikilinkTarget("no-such-note")
    assert.deepEqual(
      { exists: resolved.exists, hasUrl: resolved.relativeUrl.length > 0 },
      { exists: false, hasUrl: true },
    )
  })
})

describe("VaultLinkResolver.relativeUrlTo", () => {
  test("GIVEN a static site path WHEN resolving from a nested canvas THEN the URL climbs to root", () => {
    assert.equal(resolver().relativeUrlTo("static/canvas-viewer.js"), "../static/canvas-viewer.js")
  })
})
