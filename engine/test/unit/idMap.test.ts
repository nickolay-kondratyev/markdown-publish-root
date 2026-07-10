import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { DocIdValidationError, IdMap } from "../../src/idMap.ts"

const ID_A = "docid_aaaaaaaaaaaaaaaaaaaaa_e"
const ID_B = "docid_bbbbbbbbbbbbbbbbbbbbb_e"
const ID_C = "docid_ccccccccccccccccccccc_e"

describe("IdMap", () => {
  describe("GIVEN publishable docs with valid ids", () => {
    const map = IdMap.build([
      { vaultPath: "notes/foo.md", idValue: ID_A },
      { vaultPath: "canvases/x.canvas", idValue: ID_B },
      { vaultPath: "index.md", idValue: ID_C },
    ])

    test("THEN a note stages under n/<docid>.md", () => {
      assert.equal(map.stagedPathOf("notes/foo.md"), `n/${ID_A}.md`)
    })

    test("THEN a canvas stages under n/<docid>.canvas", () => {
      assert.equal(map.stagedPathOf("canvases/x.canvas"), `n/${ID_B}.canvas`)
    })

    test("THEN the root index.md stays at index.md (homepage exception)", () => {
      assert.equal(map.stagedPathOf("index.md"), "index.md")
    })

    test("THEN docIdOf returns the harvested id", () => {
      assert.equal(map.docIdOf("notes/foo.md"), ID_A)
    })

    test("THEN docIdOf is undefined for unknown paths (assets)", () => {
      assert.equal(map.docIdOf("attachments/img.png"), undefined)
    })
  })

  test("GIVEN a doc with a missing id THEN build fails naming the file", () => {
    assert.throws(
      () => IdMap.build([{ vaultPath: "notes/foo.md", idValue: undefined }]),
      (error: unknown) =>
        error instanceof DocIdValidationError && error.message.includes("notes/foo.md"),
    )
  })

  test("GIVEN a doc with a malformed id THEN build fails naming the file", () => {
    assert.throws(
      () => IdMap.build([{ vaultPath: "notes/foo.md", idValue: "not-a-docid" }]),
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
