import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { UrlSegment } from "../../src/urlSegment.ts"

const CANONICAL_ID = "docid_aaaaaaaaaaaaaaaaaaaaa_e"

describe("UrlSegment.deriveFrom", () => {
  describe("GIVEN an already URL-safe id", () => {
    test("THEN a canonical docid is used verbatim (URL == frontmatter id)", () => {
      assert.equal(UrlSegment.deriveFrom(CANONICAL_ID), CANONICAL_ID)
    })

    test("THEN a foreign lowercase-safe id is used verbatim", () => {
      assert.equal(UrlSegment.deriveFrom("my-note_42"), "my-note_42")
    })
  })

  describe("GIVEN an id that is safe except for casing", () => {
    test("THEN it is lowercased with the lc_ marker prefix", () => {
      assert.equal(UrlSegment.deriveFrom("MyNote42"), "lc_mynote42")
    })

    test("THEN a legacy base62 docid becomes lc_ + lowercased id", () => {
      assert.equal(
        UrlSegment.deriveFrom("docid_A1b2C3d4E5f6G7h8I9j0K_E"),
        "lc_docid_a1b2c3d4e5f6g7h8i9j0k_e",
      )
    })
  })

  describe("GIVEN an id with URL-unfriendly characters", () => {
    test("THEN it is base36-encoded with the ue_ marker prefix", () => {
      const segment = UrlSegment.deriveFrom("my note!")
      assert.match(segment, /^ue_[0-9a-z]+$/)
    })

    test("THEN encoding is injective (distinct ids -> distinct segments)", () => {
      assert.notEqual(UrlSegment.deriveFrom("my note!"), UrlSegment.deriveFrom("my note?"))
    })

    test("THEN encoding is deterministic", () => {
      assert.equal(UrlSegment.deriveFrom("Ünïcode id"), UrlSegment.deriveFrom("Ünïcode id"))
    })

    test("THEN a dot is treated as unsafe (would corrupt extension handling)", () => {
      assert.match(UrlSegment.deriveFrom("v1.2"), /^ue_[0-9a-z]+$/)
    })
  })

  describe("GIVEN ids that would spoof derivation markers or Quartz index routing", () => {
    test("THEN an id starting with lc_ is encoded, so lc_ URLs are always ours", () => {
      assert.match(UrlSegment.deriveFrom("lc_foo"), /^ue_[0-9a-z]+$/)
    })

    test("THEN an id starting with ue_ is encoded (case-insensitive marker check)", () => {
      assert.match(UrlSegment.deriveFrom("UE_foo"), /^ue_[0-9a-z]+$/)
    })

    test("THEN the id [index] is encoded (notes/index.md would hijack the /notes/ folder page)", () => {
      assert.match(UrlSegment.deriveFrom("index"), /^ue_[0-9a-z]+$/)
    })

    test("THEN the id [_index] is encoded (Quartz maps _index -> index)", () => {
      assert.match(UrlSegment.deriveFrom("_index"), /^ue_[0-9a-z]+$/)
    })
  })

  describe("GIVEN any derived segment THEN it is a Quartz-slugification fixed point", () => {
    // Quartz slugifies per segment (whitespace->-, &->-and-, %->-percent, drops ?#,
    // lowercases). [a-z0-9_-]+ passes through byte-for-byte — every derivation
    // rule must land inside that alphabet.
    for (const id of [CANONICAL_ID, "MyNote42", "my note!", "a%b&c?d#e", "Ünïcode", "index"]) {
      test(`id [${id}]`, () => {
        assert.match(UrlSegment.deriveFrom(id), /^[a-z0-9_-]+$/)
      })
    }
  })
})
