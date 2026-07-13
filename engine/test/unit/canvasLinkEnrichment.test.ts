import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, test } from "node:test"
import { CanvasLinkEnricher } from "../../src/canvasLinkEnrichment.ts"
import { LinkMetadataResolver, type FetchLike } from "../../src/linkMetadata.ts"

const CARD_URL = "https://www.google.com/"
const EMBED_URL = "https://www.youtube.com/watch?v=Jk71bPz5VLo"

function linkNode(id: string, url: string) {
  return { id, type: "link", x: 0, y: 0, width: 400, height: 300, url }
}

function canvasJson(nodes: object[]): string {
  return JSON.stringify({ nodes, edges: [] })
}

describe("CanvasLinkEnricher", () => {
  let stagingDir: string

  beforeEach(() => {
    stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), "enrich-test-"))
  })
  afterEach(() => {
    fs.rmSync(stagingDir, { recursive: true, force: true })
  })

  function stageCanvas(relativePath: string, content: string): void {
    const absolute = path.join(stagingDir, relativePath)
    fs.mkdirSync(path.dirname(absolute), { recursive: true })
    fs.writeFileSync(absolute, content)
  }

  function readCanvas(relativePath: string): any {
    return JSON.parse(fs.readFileSync(path.join(stagingDir, relativePath), "utf-8"))
  }

  function enricherWith(fetchFn: FetchLike): CanvasLinkEnricher {
    return new CanvasLinkEnricher(new LinkMetadataResolver({ fetchFn }))
  }

  test("GIVEN a card-mode link node WHEN enriching THEN vintrinLinkMeta baked into the staged file", async () => {
    stageCanvas("a.canvas", canvasJson([linkNode("l1", CARD_URL)]))
    const fetchFn: FetchLike = async () => ({
      ok: true,
      status: 200,
      text: async () => `<meta property="og:title" content="Google">`,
    })
    await enricherWith(fetchFn).enrich(stagingDir, ["a.canvas"])
    assert.deepEqual(readCanvas("a.canvas").nodes[0].vintrinLinkMeta, {
      domain: "www.google.com",
      title: "Google",
    })
  })

  test("GIVEN a provider (embed) link node WHEN enriching THEN it is neither fetched nor annotated", async () => {
    stageCanvas("a.canvas", canvasJson([linkNode("l1", EMBED_URL)]))
    const fetched: string[] = []
    const fetchFn: FetchLike = async (url) => {
      fetched.push(url)
      return { ok: true, status: 200, text: async () => "" }
    }
    await enricherWith(fetchFn).enrich(stagingDir, ["a.canvas"])
    assert.deepEqual(
      { fetched, annotated: readCanvas("a.canvas").nodes[0].vintrinLinkMeta },
      { fetched: [], annotated: undefined },
    )
  })

  test("GIVEN a fetch failure WHEN enriching THEN node untouched and warning surfaced", async () => {
    stageCanvas("a.canvas", canvasJson([linkNode("l1", CARD_URL)]))
    const fetchFn: FetchLike = async () => {
      throw new Error("offline")
    }
    const { warnings } = await enricherWith(fetchFn).enrich(stagingDir, ["a.canvas"])
    assert.deepEqual(
      { annotated: readCanvas("a.canvas").nodes[0].vintrinLinkMeta, warnings },
      { annotated: undefined, warnings: [`${CARD_URL}: offline`] },
    )
  })

  test("GIVEN the same card URL across two canvases WHEN enriching THEN fetched once, both annotated", async () => {
    stageCanvas("a.canvas", canvasJson([linkNode("l1", CARD_URL)]))
    stageCanvas("nested/b.canvas", canvasJson([linkNode("l2", CARD_URL)]))
    let calls = 0
    const fetchFn: FetchLike = async () => {
      calls += 1
      return { ok: true, status: 200, text: async () => `<title>Shared</title>` }
    }
    await enricherWith(fetchFn).enrich(stagingDir, ["a.canvas", "nested/b.canvas"])
    assert.deepEqual(
      {
        calls,
        titles: [
          readCanvas("a.canvas").nodes[0].vintrinLinkMeta?.title,
          readCanvas("nested/b.canvas").nodes[0].vintrinLinkMeta?.title,
        ],
      },
      { calls: 1, titles: ["Shared", "Shared"] },
    )
  })

  test("GIVEN a non-http link node (garbage url) WHEN enriching THEN never fetched", async () => {
    stageCanvas("a.canvas", canvasJson([linkNode("l1", "not a url")]))
    let calls = 0
    const fetchFn: FetchLike = async () => {
      calls += 1
      return { ok: true, status: 200, text: async () => "" }
    }
    await enricherWith(fetchFn).enrich(stagingDir, ["a.canvas"])
    assert.equal(calls, 0)
  })

  test("GIVEN a malformed canvas file WHEN enriching THEN skipped with a warning, others enriched", async () => {
    stageCanvas("broken.canvas", "{not json")
    stageCanvas("ok.canvas", canvasJson([linkNode("l1", CARD_URL)]))
    const fetchFn: FetchLike = async () => ({
      ok: true,
      status: 200,
      text: async () => `<title>OK</title>`,
    })
    const { warnings } = await enricherWith(fetchFn).enrich(stagingDir, [
      "broken.canvas",
      "ok.canvas",
    ])
    assert.deepEqual(
      {
        okTitle: readCanvas("ok.canvas").nodes[0].vintrinLinkMeta?.title,
        brokenWarned: warnings.some((warning) => warning.startsWith("broken.canvas:")),
      },
      { okTitle: "OK", brokenWarned: true },
    )
  })
})
