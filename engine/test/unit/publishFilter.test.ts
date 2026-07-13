import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { PublishFilter } from "../../src/publishFilter.ts"
import { FrontmatterReader } from "../../src/frontmatter.ts"

const NO_RULES = { includeFolders: [], excludeFolders: [] }

describe("PublishFilter — markdown", () => {
  test("GIVEN frontmatter publish true WHEN deciding THEN published", () => {
    const filter = new PublishFilter(NO_RULES)
    assert.equal(filter.isMarkdownPublished("notes/a.md", true), true)
  })

  test("GIVEN frontmatter publish false WHEN deciding THEN not published", () => {
    const filter = new PublishFilter(NO_RULES)
    assert.equal(filter.isMarkdownPublished("notes/a.md", false), false)
  })

  test("GIVEN no publish flag and no includeFolders WHEN deciding THEN not published (default deny)", () => {
    const filter = new PublishFilter(NO_RULES)
    assert.equal(filter.isMarkdownPublished("notes/a.md", undefined), false)
  })

  test("GIVEN file under includeFolder without publish flag WHEN deciding THEN published", () => {
    const filter = new PublishFilter({ includeFolders: ["notes"], excludeFolders: [] })
    assert.equal(filter.isMarkdownPublished("notes/a.md", undefined), true)
  })

  test("GIVEN file under includeFolder with publish false WHEN deciding THEN not published (publish false wins)", () => {
    const filter = new PublishFilter({ includeFolders: ["notes"], excludeFolders: [] })
    assert.equal(filter.isMarkdownPublished("notes/a.md", false), false)
  })

  test("GIVEN includeFolder that is a path prefix but not a folder WHEN deciding THEN not published", () => {
    const filter = new PublishFilter({ includeFolders: ["note"], excludeFolders: [] })
    assert.equal(filter.isMarkdownPublished("notes/a.md", undefined), false)
  })

  test("GIVEN nested includeFolder WHEN deciding file inside it THEN published", () => {
    const filter = new PublishFilter({ includeFolders: ["blog/public"], excludeFolders: [] })
    assert.equal(filter.isMarkdownPublished("blog/public/post.md", undefined), true)
  })

  test("GIVEN file under excludeFolder with publish true WHEN deciding THEN not published (exclude wins over everything)", () => {
    const filter = new PublishFilter({ includeFolders: [], excludeFolders: ["private"] })
    assert.equal(filter.isMarkdownPublished("private/a.md", true), false)
  })

  test("GIVEN file under both include and exclude folders WHEN deciding THEN not published", () => {
    const filter = new PublishFilter({ includeFolders: ["docs"], excludeFolders: ["docs/internal"] })
    assert.equal(filter.isMarkdownPublished("docs/internal/a.md", undefined), false)
  })

  test("GIVEN file in hidden folder with publish true WHEN deciding THEN not published", () => {
    const filter = new PublishFilter(NO_RULES)
    assert.equal(filter.isMarkdownPublished(".obsidian/plugins/readme.md", true), false)
  })
})

describe("PublishFilter — 'private' path segments (never published, wins over everything)", () => {
  const INCLUDE_ALL = { includeFolders: ["notes", "canvases", "work"], excludeFolders: [] }

  test("GIVEN markdown under a folder named 'private' with publish true WHEN deciding THEN not published", () => {
    const filter = new PublishFilter(INCLUDE_ALL)
    assert.equal(filter.isMarkdownPublished("notes/private/a.md", true), false)
  })

  test("GIVEN markdown under a folder whose name contains 'private' WHEN deciding THEN not published", () => {
    const filter = new PublishFilter(INCLUDE_ALL)
    assert.equal(filter.isMarkdownPublished("work/my-private-notes/a.md", true), false)
  })

  test("GIVEN markdown file name containing 'private' outside any private folder WHEN deciding THEN not published", () => {
    const filter = new PublishFilter(INCLUDE_ALL)
    assert.equal(filter.isMarkdownPublished("notes/private-secret.md", true), false)
  })

  test("GIVEN uppercase 'Private' folder WHEN deciding THEN not published (case-insensitive)", () => {
    const filter = new PublishFilter(INCLUDE_ALL)
    assert.equal(filter.isMarkdownPublished("notes/Private/a.md", true), false)
  })

  test("GIVEN ALL-CAPS 'PRIVATE' in a file name WHEN deciding THEN not published", () => {
    const filter = new PublishFilter(INCLUDE_ALL)
    assert.equal(filter.isMarkdownPublished("notes/TEAM-PRIVATE-PLAN.md", true), false)
  })

  test("GIVEN mixed-case 'PrIvAtE' in a file name WHEN deciding THEN not published", () => {
    const filter = new PublishFilter(INCLUDE_ALL)
    assert.equal(filter.isMarkdownPublished("notes/PrIvAtE-thoughts.md", true), false)
  })

  test("GIVEN private folder several levels up the chain WHEN deciding THEN not published", () => {
    const filter = new PublishFilter(INCLUDE_ALL)
    assert.equal(filter.isMarkdownPublished("work/private/sub/deep/a.md", true), false)
  })

  test("GIVEN canvas file name containing 'private' WHEN deciding THEN not published", () => {
    const filter = new PublishFilter(INCLUDE_ALL)
    assert.equal(filter.isCanvasPublished("canvases/private-board.canvas"), false)
  })

  test("GIVEN asset under a private folder WHEN deciding THEN not published", () => {
    const filter = new PublishFilter(INCLUDE_ALL)
    assert.equal(filter.isAssetPublished("private/diagram.png"), false)
  })

  test("GIVEN name containing 'priv' but not 'private' WHEN deciding THEN published (no false positive)", () => {
    const filter = new PublishFilter(INCLUDE_ALL)
    assert.equal(filter.isMarkdownPublished("notes/privacy-policy.md", undefined), true)
  })
})

describe("PublishFilter — assets", () => {
  test("GIVEN plain asset WHEN deciding THEN published (default allow)", () => {
    const filter = new PublishFilter(NO_RULES)
    assert.equal(filter.isAssetPublished("attachments/diagram.png"), true)
  })

  test("GIVEN asset under excludeFolder WHEN deciding THEN not published", () => {
    const filter = new PublishFilter({ includeFolders: [], excludeFolders: ["attachments"] })
    assert.equal(filter.isAssetPublished("attachments/diagram.png"), false)
  })

  test("GIVEN asset in hidden folder WHEN deciding THEN not published", () => {
    const filter = new PublishFilter(NO_RULES)
    assert.equal(filter.isAssetPublished(".trash/old.png"), false)
  })

})

describe("PublishFilter — canvases (content-bearing, default deny; frontmatter N/A)", () => {
  test("GIVEN canvas with no includeFolders WHEN deciding THEN not published (default deny)", () => {
    const filter = new PublishFilter(NO_RULES)
    assert.equal(filter.isCanvasPublished("canvases/main.canvas"), false)
  })

  test("GIVEN canvas under includeFolder WHEN deciding THEN published", () => {
    const filter = new PublishFilter({ includeFolders: ["canvases"], excludeFolders: [] })
    assert.equal(filter.isCanvasPublished("canvases/main.canvas"), true)
  })

  test("GIVEN canvas under both include and exclude folders WHEN deciding THEN not published (exclude wins)", () => {
    const filter = new PublishFilter({ includeFolders: ["canvases"], excludeFolders: ["canvases"] })
    assert.equal(filter.isCanvasPublished("canvases/main.canvas"), false)
  })

  test("GIVEN canvas in hidden folder under includeFolder WHEN deciding THEN not published", () => {
    const filter = new PublishFilter({ includeFolders: [".trash"], excludeFolders: [] })
    assert.equal(filter.isCanvasPublished(".trash/old.canvas"), false)
  })
})

describe("FrontmatterReader.readPublishFlag", () => {
  test("GIVEN publish true frontmatter WHEN reading THEN publish is true", () => {
    const read = FrontmatterReader.readPublishFlag("---\npublish: true\n---\n# Hi\n")
    assert.equal(read.publish, true)
  })

  test("GIVEN publish false frontmatter WHEN reading THEN publish is false", () => {
    const read = FrontmatterReader.readPublishFlag("---\ntitle: X\npublish: false\n---\nbody")
    assert.equal(read.publish, false)
  })

  test("GIVEN string 'true' value WHEN reading THEN publish is true", () => {
    const read = FrontmatterReader.readPublishFlag('---\npublish: "true"\n---\n')
    assert.equal(read.publish, true)
  })

  test("GIVEN no frontmatter WHEN reading THEN publish is undefined", () => {
    const read = FrontmatterReader.readPublishFlag("# Just a note\n")
    assert.equal(read.publish, undefined)
  })

  test("GIVEN frontmatter without publish key WHEN reading THEN publish is undefined", () => {
    const read = FrontmatterReader.readPublishFlag("---\ntitle: X\n---\n")
    assert.equal(read.publish, undefined)
  })

  test("GIVEN unparseable frontmatter WHEN reading THEN malformed is true (fail closed)", () => {
    const read = FrontmatterReader.readPublishFlag("---\npublish: [unclosed\n---\n")
    assert.equal(read.malformed, true)
  })

  test("GIVEN unclosed frontmatter fence WHEN reading THEN treated as no frontmatter", () => {
    const read = FrontmatterReader.readPublishFlag("---\npublish: true\nno closing fence")
    assert.equal(read.publish, undefined)
  })
})
