import assert from "node:assert/strict"
import { describe, test } from "node:test"
import {
  LinkMetadataResolver,
  parseOpenGraph,
  type FetchLike,
} from "../../src/linkMetadata.ts"

const PAGE_URL = "https://blog.example.com/posts/hello"

function htmlResponse(body: string, { ok = true, status = 200 } = {}) {
  return { ok, status, text: async () => body }
}

describe("parseOpenGraph", () => {
  test("GIVEN og tags via property= WHEN parsing THEN title/description/image/siteName extracted", () => {
    const html = `<head>
      <meta property="og:title" content="Hello World">
      <meta property="og:description" content="A post about things">
      <meta property="og:image" content="https://cdn.example.com/img.png">
      <meta property="og:site_name" content="Example Blog">
    </head>`
    assert.deepEqual(parseOpenGraph(html, PAGE_URL), {
      domain: "blog.example.com",
      title: "Hello World",
      description: "A post about things",
      image: "https://cdn.example.com/img.png",
      siteName: "Example Blog",
    })
  })

  test("GIVEN og tags via name= and reversed attribute order WHEN parsing THEN still extracted", () => {
    const html = `<meta content="Reversed" name="og:title"/>`
    assert.equal(parseOpenGraph(html, PAGE_URL).title, "Reversed")
  })

  test("GIVEN html entities in content WHEN parsing THEN decoded", () => {
    const html = `<meta property="og:title" content="Q&amp;A &#x2014; caf&#233;s &lt;3">`
    assert.equal(parseOpenGraph(html, PAGE_URL).title, "Q&A — cafés <3")
  })

  test("GIVEN no og:title WHEN parsing THEN falls back to <title>", () => {
    const html = `<title>Fallback Title</title>`
    assert.equal(parseOpenGraph(html, PAGE_URL).title, "Fallback Title")
  })

  test("GIVEN no og:description WHEN parsing THEN falls back to meta name=description", () => {
    const html = `<meta name="description" content="plain description">`
    assert.equal(parseOpenGraph(html, PAGE_URL).description, "plain description")
  })

  test("GIVEN a relative og:image WHEN parsing THEN resolved absolute against the page URL", () => {
    const html = `<meta property="og:image" content="/assets/img.png">`
    assert.equal(parseOpenGraph(html, PAGE_URL).image, "https://blog.example.com/assets/img.png")
  })

  test("GIVEN a non-http og:image WHEN parsing THEN image omitted", () => {
    const html = `<meta property="og:image" content="data:image/png;base64,AAAA">`
    assert.equal(parseOpenGraph(html, PAGE_URL).image, undefined)
  })

  test("GIVEN duplicate og:title tags WHEN parsing THEN first occurrence wins", () => {
    const html = `<meta property="og:title" content="First"><meta property="og:title" content="Second">`
    assert.equal(parseOpenGraph(html, PAGE_URL).title, "First")
  })

  test("GIVEN metadata-free html WHEN parsing THEN only the domain", () => {
    assert.deepEqual(parseOpenGraph("<p>nothing here</p>", PAGE_URL), {
      domain: "blog.example.com",
    })
  })
})

describe("LinkMetadataResolver", () => {
  test("GIVEN a URL serving og tags WHEN resolving THEN metadata mapped, no warnings", async () => {
    const fetchFn: FetchLike = async () =>
      htmlResponse(`<meta property="og:title" content="Fetched">`)
    const resolver = new LinkMetadataResolver({ fetchFn })
    const { metaByUrl, warnings } = await resolver.resolve([PAGE_URL])
    assert.deepEqual(
      { title: metaByUrl.get(PAGE_URL)?.title, warnings },
      { title: "Fetched", warnings: [] },
    )
  })

  test("GIVEN an HTTP 500 WHEN resolving THEN no entry and one warning", async () => {
    const fetchFn: FetchLike = async () => htmlResponse("", { ok: false, status: 500 })
    const { metaByUrl, warnings } = await new LinkMetadataResolver({ fetchFn }).resolve([PAGE_URL])
    assert.deepEqual(
      { size: metaByUrl.size, warnings },
      { size: 0, warnings: [`${PAGE_URL}: HTTP 500`] },
    )
  })

  test("GIVEN a fetch that throws WHEN resolving THEN never throws — warning instead", async () => {
    const fetchFn: FetchLike = async () => {
      throw new Error("network down")
    }
    const { metaByUrl, warnings } = await new LinkMetadataResolver({ fetchFn }).resolve([PAGE_URL])
    assert.deepEqual(
      { size: metaByUrl.size, warnings },
      { size: 0, warnings: [`${PAGE_URL}: network down`] },
    )
  })

  test("GIVEN duplicate URLs WHEN resolving THEN fetched once", async () => {
    let calls = 0
    const fetchFn: FetchLike = async () => {
      calls += 1
      return htmlResponse("<title>t</title>")
    }
    await new LinkMetadataResolver({ fetchFn }).resolve([PAGE_URL, PAGE_URL, PAGE_URL])
    assert.equal(calls, 1)
  })

  test("GIVEN one failing among many WHEN resolving THEN others still resolve", async () => {
    const bad = "https://bad.example.com/"
    const fetchFn: FetchLike = async (url) => {
      if (url === bad) throw new Error("boom")
      return htmlResponse(`<meta property="og:title" content="ok">`)
    }
    const { metaByUrl, warnings } = await new LinkMetadataResolver({ fetchFn }).resolve([
      PAGE_URL,
      bad,
    ])
    assert.deepEqual(
      { resolved: [...metaByUrl.keys()], warningCount: warnings.length },
      { resolved: [PAGE_URL], warningCount: 1 },
    )
  })
})
