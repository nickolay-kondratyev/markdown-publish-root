import assert from "node:assert/strict"
import { describe, test } from "node:test"
// @ts-expect-error plain-ESM plugin module (no type declarations)
import { VaultTreeBuilder } from "../../src/vaultTree.js"

function file(vintrinPath: string | undefined, title: string, slug: string) {
  return { slug, frontmatter: vintrinPath === undefined ? { title } : { title, vintrinPath } }
}

describe("VaultTreeBuilder.build", () => {
  test("GIVEN docs in nested folders WHEN building THEN folders nest by ORIGINAL path segments", () => {
    const root = VaultTreeBuilder.build([
      file("notes/projects/alpha.md", "Alpha", "n/docid_a"),
      file("notes/beta.md", "Beta", "n/docid_b"),
    ])
    const notes = root.children[0]
    const projects = notes.children[0]
    assert.deepEqual(
      {
        notes: { kind: notes.kind, name: notes.name, path: notes.path },
        projects: { kind: projects.kind, name: projects.name, path: projects.path },
        alphaTitle: projects.children[0].title,
      },
      {
        notes: { kind: "folder", name: "notes", path: "notes" },
        projects: { kind: "folder", name: "projects", path: "notes/projects" },
        alphaTitle: "Alpha",
      },
    )
  })

  test("GIVEN a doc WHEN building THEN the leaf label is the frontmatter title and href source is the slug", () => {
    const root = VaultTreeBuilder.build([file("notes/x.md", "Nice Title", "n/docid_x")])
    assert.deepEqual(root.children[0].children[0], {
      kind: "doc",
      title: "Nice Title",
      slug: "n/docid_x",
    })
  })

  test("GIVEN a canvas virtual page WHEN building THEN it appears as a doc leaf", () => {
    const root = VaultTreeBuilder.build([
      file("boards/main.canvas", "main", "n/docid_c.canvas"),
    ])
    assert.deepEqual(root.children[0].children[0], {
      kind: "doc",
      title: "main",
      slug: "n/docid_c.canvas",
    })
  })

  test("GIVEN the root index.md WHEN building THEN it is excluded (it is Home)", () => {
    const root = VaultTreeBuilder.build([file("index.md", "Home", "index")])
    assert.deepEqual(root.children, [])
  })

  test("GIVEN pages without vintrinPath (tags, 404) WHEN building THEN they are excluded", () => {
    const root = VaultTreeBuilder.build([file(undefined, "Tag Index", "tags/index")])
    assert.deepEqual(root.children, [])
  })

  test("GIVEN a root-level doc WHEN building THEN it is a direct child of the root", () => {
    const root = VaultTreeBuilder.build([file("readme.md", "Readme", "n/docid_r")])
    assert.deepEqual(root.children, [{ kind: "doc", title: "Readme", slug: "n/docid_r" }])
  })

  test("WHEN building THEN folders sort before docs, each natural case-insensitive alpha", () => {
    const root = VaultTreeBuilder.build([
      file("zeta.md", "zeta", "n/docid_1"),
      file("Alpha.md", "Alpha", "n/docid_2"),
      file("beta/x.md", "x", "n/docid_3"),
      file("note10.md", "note10", "n/docid_4"),
      file("note2.md", "note2", "n/docid_5"),
    ])
    assert.deepEqual(
      root.children.map((c: { kind: string; name?: string; title?: string }) =>
        c.kind === "folder" ? `dir:${c.name}` : c.title,
      ),
      ["dir:beta", "Alpha", "note2", "note10", "zeta"],
    )
  })

  test("GIVEN two docs in the same folder WHEN building THEN the folder node is shared (no duplicates)", () => {
    const root = VaultTreeBuilder.build([
      file("notes/a.md", "a", "n/docid_a"),
      file("notes/b.md", "b", "n/docid_b"),
    ])
    assert.deepEqual(
      { folders: root.children.length, docs: root.children[0].children.length },
      { folders: 1, docs: 2 },
    )
  })
})

describe("VaultTreeBuilder.ancestorFolderPaths", () => {
  test("GIVEN a nested path THEN every ancestor folder path is returned root-first", () => {
    assert.deepEqual(VaultTreeBuilder.ancestorFolderPaths("a/b/c.md"), ["a", "a/b"])
  })

  test("GIVEN a root-level path THEN no ancestors are returned", () => {
    assert.deepEqual(VaultTreeBuilder.ancestorFolderPaths("index.md"), [])
  })

  test("GIVEN undefined (page without vintrinPath) THEN no ancestors are returned", () => {
    assert.deepEqual(VaultTreeBuilder.ancestorFolderPaths(undefined), [])
  })
})
