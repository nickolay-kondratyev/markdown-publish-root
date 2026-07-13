import assert from "node:assert/strict"
import { describe, test } from "node:test"
import {
  LINK_PROVIDERS,
  allFrameOrigins,
  classifyLinkUrl,
  cspFrameSrcContent,
  domainOf,
} from "../../src/linkProviders.js"

function embedUrlOf(rawUrl: string): string {
  const classified = classifyLinkUrl(rawUrl)
  assert.equal(classified.mode, "embed", `expected embed for ${rawUrl}`)
  return (classified as { embedUrl: string }).embedUrl
}

describe("classifyLinkUrl embeds", () => {
  const EMBED_CASES: Array<[string, string]> = [
    // youtube: watch / shorts / live / youtu.be / mobile / pre-embedded / start time
    ["https://www.youtube.com/watch?v=Jk71bPz5VLo", "https://www.youtube-nocookie.com/embed/Jk71bPz5VLo"],
    ["https://youtube.com/watch?v=Jk71bPz5VLo", "https://www.youtube-nocookie.com/embed/Jk71bPz5VLo"],
    ["https://m.youtube.com/watch?v=Jk71bPz5VLo", "https://www.youtube-nocookie.com/embed/Jk71bPz5VLo"],
    ["https://www.youtube.com/shorts/aj09fctv1Mc", "https://www.youtube-nocookie.com/embed/aj09fctv1Mc"],
    ["https://www.youtube.com/live/Jk71bPz5VLo", "https://www.youtube-nocookie.com/embed/Jk71bPz5VLo"],
    ["https://youtu.be/Jk71bPz5VLo", "https://www.youtube-nocookie.com/embed/Jk71bPz5VLo"],
    ["https://www.youtube.com/embed/Jk71bPz5VLo", "https://www.youtube-nocookie.com/embed/Jk71bPz5VLo"],
    ["https://www.youtube.com/watch?v=Jk71bPz5VLo&t=90s", "https://www.youtube-nocookie.com/embed/Jk71bPz5VLo?start=90"],
    ["https://youtu.be/Jk71bPz5VLo?t=1h2m3s", "https://www.youtube-nocookie.com/embed/Jk71bPz5VLo?start=3723"],
    // vimeo
    ["https://vimeo.com/76979871", "https://player.vimeo.com/video/76979871"],
    // spotify (incl. locale prefix)
    ["https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC", "https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC"],
    ["https://open.spotify.com/intl-fr/album/2noRn2Aes5aoNVsU6iWThc", "https://open.spotify.com/embed/album/2noRn2Aes5aoNVsU6iWThc"],
    // codepen
    ["https://codepen.io/chriscoyier/pen/gOaJpMy", "https://codepen.io/chriscoyier/embed/preview/gOaJpMy?default-tab=result"],
    // twitter / x
    ["https://twitter.com/anthropic/status/1234567890", "https://platform.twitter.com/embed/Tweet.html?id=1234567890"],
    ["https://x.com/anthropic/status/1234567890", "https://platform.twitter.com/embed/Tweet.html?id=1234567890"],
    // loom
    ["https://www.loom.com/share/0281766fa2d04bb788eaf19e65135184", "https://www.loom.com/embed/0281766fa2d04bb788eaf19e65135184"],
  ]

  for (const [rawUrl, expectedEmbedUrl] of EMBED_CASES) {
    test(`GIVEN ${rawUrl} WHEN classifying THEN embed at ${expectedEmbedUrl}`, () => {
      assert.equal(embedUrlOf(rawUrl), expectedEmbedUrl)
    })
  }
})

describe("classifyLinkUrl cards (the default path)", () => {
  const CARD_CASES = [
    "https://www.google.com",
    "https://example.com/some/blog/post",
    // provider hosts with NON-embeddable paths must not produce broken embeds
    "https://www.youtube.com/@somechannel",
    "https://www.youtube.com/watch", // no video id
    "https://vimeo.com/features/video-player",
    "https://open.spotify.com/download",
    "https://codepen.io/chriscoyier",
    "https://x.com/anthropic",
    "https://www.loom.com/looms/videos",
    // lookalike hosts must not match (suffix spoofing)
    "https://notyoutube.com/watch?v=Jk71bPz5VLo",
    "https://evil.com/youtube.com/watch?v=Jk71bPz5VLo",
    // invalid / non-http
    "not a url",
    "",
    "ftp://example.com/file",
    "javascript:alert(1)",
  ]

  for (const rawUrl of CARD_CASES) {
    test(`GIVEN ${JSON.stringify(rawUrl)} WHEN classifying THEN card`, () => {
      assert.deepEqual(classifyLinkUrl(rawUrl), { mode: "card" })
    })
  }
})

describe("CSP derivation", () => {
  test("GIVEN the provider table WHEN collecting frame origins THEN deduped and complete", () => {
    assert.deepEqual(allFrameOrigins(), [
      "https://www.youtube-nocookie.com",
      "https://player.vimeo.com",
      "https://open.spotify.com",
      "https://codepen.io",
      "https://platform.twitter.com",
      "https://www.loom.com",
    ])
  })

  test("GIVEN the provider table WHEN building the CSP directive THEN the exact frame-src string", () => {
    assert.equal(
      cspFrameSrcContent(),
      "frame-src 'self' https://www.youtube-nocookie.com https://player.vimeo.com " +
        "https://open.spotify.com https://codepen.io https://platform.twitter.com https://www.loom.com",
    )
  })

  test("GIVEN any provider WHEN inspecting the table THEN it declares at least one frame origin", () => {
    for (const provider of LINK_PROVIDERS) {
      assert.ok(provider.frameOrigins.length > 0, provider.name)
    }
  })
})

describe("domainOf", () => {
  test("GIVEN a URL WHEN extracting THEN the hostname", () => {
    assert.equal(domainOf("https://blog.example.com/post?x=1"), "blog.example.com")
  })

  test("GIVEN an unparsable URL WHEN extracting THEN empty string", () => {
    assert.equal(domainOf("not a url"), "")
  })
})
