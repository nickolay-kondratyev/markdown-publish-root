import assert from "node:assert/strict"
import { describe, test } from "node:test"
// @ts-expect-error plain-ESM plugin module (no type declarations)
import { CrumbTrailBuilder } from "../../src/crumbTrail.js"

const OPTIONS = { rootName: "Home", showCurrentPage: true }

describe("CrumbTrailBuilder.build", () => {
  test("GIVEN a nested note THEN crumbs are Home > folders (plain) > title (current)", () => {
    assert.deepEqual(
      CrumbTrailBuilder.build(
        { vintrinPath: "notes/projects/alpha.md", title: "Alpha" },
        OPTIONS,
      ),
      [
        { label: "Home", kind: "home" },
        { label: "notes", kind: "folder" },
        { label: "projects", kind: "folder" },
        { label: "Alpha", kind: "current" },
      ],
    )
  })

  test("GIVEN a root-level note THEN crumbs are Home > title only", () => {
    assert.deepEqual(
      CrumbTrailBuilder.build({ vintrinPath: "readme.md", title: "Readme" }, OPTIONS),
      [
        { label: "Home", kind: "home" },
        { label: "Readme", kind: "current" },
      ],
    )
  })

  test("GIVEN a canvas page THEN crumbs derive from its vintrinPath like any doc", () => {
    assert.deepEqual(
      CrumbTrailBuilder.build(
        { vintrinPath: "boards/main.canvas", title: "main" },
        OPTIONS,
      ),
      [
        { label: "Home", kind: "home" },
        { label: "boards", kind: "folder" },
        { label: "main", kind: "current" },
      ],
    )
  })

  test("GIVEN no vintrinPath (tag page, 404) THEN undefined — component renders nothing", () => {
    assert.equal(CrumbTrailBuilder.build({ title: "Tags" }, OPTIONS), undefined)
  })

  test("GIVEN showCurrentPage=false THEN the current-page crumb is omitted", () => {
    assert.deepEqual(
      CrumbTrailBuilder.build(
        { vintrinPath: "notes/x.md", title: "X" },
        { rootName: "Home", showCurrentPage: false },
      ),
      [
        { label: "Home", kind: "home" },
        { label: "notes", kind: "folder" },
      ],
    )
  })

  test("GIVEN a missing title THEN the current crumb falls back to the basename", () => {
    assert.deepEqual(
      CrumbTrailBuilder.build({ vintrinPath: "notes/some-note.md" }, OPTIONS)?.at(-1),
      { label: "some-note", kind: "current" },
    )
  })

  test("GIVEN a custom rootName THEN the home crumb carries it", () => {
    assert.deepEqual(
      CrumbTrailBuilder.build(
        { vintrinPath: "x.md", title: "X" },
        { rootName: "Start", showCurrentPage: true },
      )?.at(0),
      { label: "Start", kind: "home" },
    )
  })
})
