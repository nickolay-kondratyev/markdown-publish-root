import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { DocIdValidationError, ID_NAMESPACE_DIR, IdMap } from "../../src/idMap.ts"

const ID_A = "docid_aaaaaaaaaaaaaaaaaaaaa_e"
const ID_B = "docid_bbbbbbbbbbbbbbbbbbbbb_e"
const ID_C = "docid_ccccccccccccccccccccc_e"
const ID_D = "docid_ddddddddddddddddddddd_e"

describe("IdMap", () => {
  describe("GIVEN publishable docs with valid ids", () => {
    const map = IdMap.build([
      { vaultPath: "notes/foo.md", idValue: ID_A },
      { vaultPath: "canvases/x.canvas", idValue: ID_B },
      { vaultPath: "index.md", idValue: ID_C },
      { vaultPath: "index.canvas", idValue: ID_D },
    ])

    test("THEN a note stages under notes/<docid>.md", () => {
      assert.equal(map.stagedPathOf("notes/foo.md"), `${ID_NAMESPACE_DIR}/${ID_A}.md`)
    })

    test("THEN a canvas stages under notes/<docid>.canvas", () => {
      assert.equal(map.stagedPathOf("canvases/x.canvas"), `${ID_NAMESPACE_DIR}/${ID_B}.canvas`)
    })

    test("THEN the root index.md stays at index.md (homepage exception)", () => {
      assert.equal(map.stagedPathOf("index.md"), "index.md")
    })

    test("THEN the root index.canvas stays at index.canvas (canvas-homepage exception)", () => {
      assert.equal(map.stagedPathOf("index.canvas"), "index.canvas")
    })

    test("THEN a NON-root index.canvas still stages under notes/", () => {
      const nested = IdMap.build([{ vaultPath: "sub/index.canvas", idValue: ID_D }])
      assert.equal(nested.stagedPathOf("sub/index.canvas"), `${ID_NAMESPACE_DIR}/${ID_D}.canvas`)
    })

    test("THEN urlSegmentOf returns the harvested id verbatim", () => {
      assert.equal(map.urlSegmentOf("notes/foo.md"), ID_A)
    })

    test("THEN urlSegmentOf is undefined for unknown paths (assets)", () => {
      assert.equal(map.urlSegmentOf("attachments/img.png"), undefined)
    })
  })

  describe("GIVEN foreign ids (not our grammar)", () => {
    const map = IdMap.build([
      { vaultPath: "notes/safe.md", idValue: "my-note_42" },
      { vaultPath: "notes/cased.md", idValue: "MyNote42" },
      { vaultPath: "notes/unsafe.md", idValue: "my note!" },
    ])

    test("THEN an already URL-safe id is used verbatim", () => {
      assert.equal(map.urlSegmentOf("notes/safe.md"), "my-note_42")
    })

    test("THEN a mixed-case id gets the lc_ marker prefix", () => {
      assert.equal(map.urlSegmentOf("notes/cased.md"), "lc_mynote42")
    })

    test("THEN a non-URL-friendly id gets the ue_ marker prefix", () => {
      assert.match(map.urlSegmentOf("notes/unsafe.md") ?? "", /^ue_[0-9a-z]+$/)
    })

    test("THEN staged paths use the derived segment, not the raw id", () => {
      assert.equal(map.stagedPathOf("notes/cased.md"), `${ID_NAMESPACE_DIR}/lc_mynote42.md`)
    })
  })

  test("GIVEN a doc with a missing id THEN build fails naming the file", () => {
    assert.throws(
      () => IdMap.build([{ vaultPath: "notes/foo.md", idValue: undefined }]),
      (error: unknown) =>
        error instanceof DocIdValidationError && error.message.includes("notes/foo.md"),
    )
  })

  test("GIVEN a doc with a non-string id THEN build fails naming the file", () => {
    assert.throws(
      () => IdMap.build([{ vaultPath: "notes/foo.md", idValue: 42 }]),
      (error: unknown) =>
        error instanceof DocIdValidationError && error.message.includes("notes/foo.md"),
    )
  })

  test("GIVEN a doc with an empty-string id THEN build fails naming the file", () => {
    assert.throws(
      () => IdMap.build([{ vaultPath: "notes/foo.md", idValue: "" }]),
      (error: unknown) =>
        error instanceof DocIdValidationError && error.message.includes("notes/foo.md"),
    )
  })

  test("GIVEN two docs with the same id THEN build fails naming both files", () => {
    assert.throws(
      () =>
        IdMap.build([
          { vaultPath: "notes/a.md", idValue: ID_A },
          { vaultPath: "notes/b.md", idValue: ID_A },
        ]),
      (error: unknown) =>
        error instanceof DocIdValidationError &&
        error.message.includes("notes/a.md") &&
        error.message.includes("notes/b.md"),
    )
  })

  test("GIVEN distinct ids whose DERIVED segments collide THEN build fails naming both files", () => {
    // [Foo] and [fOO] both derive lc_foo — distinct raw ids, same URL.
    assert.throws(
      () =>
        IdMap.build([
          { vaultPath: "notes/a.md", idValue: "Foo" },
          { vaultPath: "notes/b.md", idValue: "fOO" },
        ]),
      (error: unknown) =>
        error instanceof DocIdValidationError &&
        error.message.includes("lc_foo") &&
        error.message.includes("notes/a.md") &&
        error.message.includes("notes/b.md"),
    )
  })

  test("GIVEN several problems THEN ALL of them are reported at once", () => {
    assert.throws(
      () =>
        IdMap.build([
          { vaultPath: "notes/missing.md", idValue: undefined },
          { vaultPath: "notes/bad.md", idValue: 42 },
          { vaultPath: "notes/ok.md", idValue: ID_A },
        ]),
      (error: unknown) =>
        error instanceof DocIdValidationError &&
        error.message.includes("notes/missing.md") &&
        error.message.includes("notes/bad.md"),
    )
  })
})
