import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { SiteConfigParser, SiteConfigError, DEFAULT_LOCALE } from "../../src/siteConfig.ts"

const MINIMAL_VALID = { title: "T", baseUrl: "example.com" }

describe("SiteConfigParser.parse — happy path", () => {
  test("GIVEN minimal config WHEN parsing THEN title is carried through", () => {
    assert.equal(SiteConfigParser.parse(MINIMAL_VALID).title, "T")
  })

  test("GIVEN no locale WHEN parsing THEN default locale applies", () => {
    assert.equal(SiteConfigParser.parse(MINIMAL_VALID).locale, DEFAULT_LOCALE)
  })

  test("GIVEN no publishFilter WHEN parsing THEN empty folder rules apply", () => {
    assert.deepEqual(SiteConfigParser.parse(MINIMAL_VALID).publishFilter, {
      includeFolders: [],
      excludeFolders: [],
    })
  })

  test("GIVEN includeFolders WHEN parsing THEN they are carried through", () => {
    const parsed = SiteConfigParser.parse({
      ...MINIMAL_VALID,
      publishFilter: { includeFolders: ["notes", "blog/public"] },
    })
    assert.deepEqual(parsed.publishFilter.includeFolders, ["notes", "blog/public"])
  })

  test("GIVEN publishAll true WHEN parsing THEN it is carried through", () => {
    const parsed = SiteConfigParser.parse({
      ...MINIMAL_VALID,
      publishFilter: { publishAll: true },
    })
    assert.equal(parsed.publishFilter.publishAll, true)
  })

  test("GIVEN no publishAll WHEN parsing THEN publishAll is absent (default deny)", () => {
    const parsed = SiteConfigParser.parse({ ...MINIMAL_VALID, publishFilter: {} })
    assert.equal(parsed.publishFilter.publishAll, undefined)
  })
})

describe("SiteConfigParser.parse — publishAll validation", () => {
  test("GIVEN non-boolean publishAll WHEN parsing THEN it is rejected", () => {
    assert.throws(
      () => SiteConfigParser.parse({ ...MINIMAL_VALID, publishFilter: { publishAll: "yes" } }),
      /publishFilter\.publishAll: expected a boolean/,
    )
  })
})

describe("SiteConfigParser.parse — validation errors", () => {
  test("GIVEN missing title WHEN parsing THEN error names the field", () => {
    assert.throws(() => SiteConfigParser.parse({ baseUrl: "example.com" }), /title: required/)
  })

  test("GIVEN baseUrl with protocol WHEN parsing THEN error explains expected shape", () => {
    assert.throws(
      () => SiteConfigParser.parse({ title: "T", baseUrl: "https://example.com" }),
      /baseUrl must not include a protocol/,
    )
  })

  test("GIVEN baseUrl with trailing slash WHEN parsing THEN it is rejected", () => {
    assert.throws(
      () => SiteConfigParser.parse({ title: "T", baseUrl: "example.com/" }),
      /must not end with/,
    )
  })

  test("GIVEN an unknown top-level key WHEN parsing THEN it is rejected (typo protection)", () => {
    assert.throws(() => SiteConfigParser.parse({ ...MINIMAL_VALID, tittle: "oops" }), /unknown key/)
  })

  test("GIVEN an unknown theme color WHEN parsing THEN it is rejected with allowed names", () => {
    assert.throws(
      () => SiteConfigParser.parse({ ...MINIMAL_VALID, theme: { colors: { lightMode: { primary: "#fff" } } } }),
      /unknown color name/,
    )
  })

  test("GIVEN folder with trailing slash WHEN parsing THEN it is rejected", () => {
    assert.throws(
      () => SiteConfigParser.parse({ ...MINIMAL_VALID, publishFilter: { includeFolders: ["notes/"] } }),
      /without leading\/trailing slash/,
    )
  })

  test("GIVEN multiple problems WHEN parsing THEN the error lists all of them", () => {
    try {
      SiteConfigParser.parse({ baseUrl: "https://x/", junk: 1 })
      assert.fail("expected SiteConfigError")
    } catch (error) {
      assert.equal((error as SiteConfigError).message.split("\n").length >= 4, true)
    }
  })

  test("GIVEN a non-object root WHEN parsing THEN a clear error is raised", () => {
    assert.throws(() => SiteConfigParser.parse("not an object"), /expected a JSON object/)
  })
})
