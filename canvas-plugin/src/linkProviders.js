/**
 * Table-driven whitelist of link providers whose URLs may be FRAMED on the
 * published site (canvas link nodes). Everything else renders as a link card:
 * arbitrary origins refuse framing (X-Frame-Options / CSP frame-ancestors),
 * so "iframe every URL" is structurally broken outside the desktop app.
 *
 * Adding a provider = adding ONE table entry (host match + embed-URL builder
 * + frame origin); no rendering logic changes. Consumed at BUILD time only —
 * by the rewriter (ref CanvasRewriter.rewriteLinkNode), the canvas-page CSP
 * head (canvas-plugin/index.js), and the engine link-metadata enrichment
 * (engine/src/canvasLinkEnrichment.ts). The client viewer receives already
 * resolved data and never imports this module.
 */

/** Classification of a canvas link-node URL. */
export const LinkMode = Object.freeze({
  /** Provider supports framing: render an iframe at `embedUrl`. */
  EMBED: "embed",
  /** Default path for every other URL: render a rich link card. */
  CARD: "card",
})

/**
 * @typedef {object} LinkProvider
 * @property {string} name stable provider key (diagnostics/tests)
 * @property {string[]} frameOrigins origins the provider's embeds are served
 *   from — the CSP frame-src whitelist derives from these
 * @property {(url: URL) => (string | undefined)} embedUrlFor embed URL for a
 *   matching URL, or undefined when this provider does not claim it
 */

/** Hosts match exactly OR as a "www."/"m." variant. */
function hostMatches(url, bareHost) {
  const host = url.hostname.toLowerCase()
  return host === bareHost || host === `www.${bareHost}` || host === `m.${bareHost}`
}

/** Path segments without empties: "/a/b/" -> ["a", "b"]. */
function segmentsOf(url) {
  return url.pathname.split("/").filter((part) => part !== "")
}

// YouTube video ids are 11 chars today; the loose bound tolerates format drift
// without accepting arbitrary path garbage.
const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{5,20}$/

/**
 * "?t=90", "?t=90s", "?t=1h2m3s" -> whole seconds (YouTube start offset).
 * @returns {number | undefined}
 */
function parseYoutubeStartSeconds(raw) {
  if (raw === null || raw === "") return undefined
  if (/^\d+s?$/.test(raw)) return Number.parseInt(raw, 10)
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(raw)
  if (match === null || match[0] === "") return undefined
  const [, hours, minutes, seconds] = match
  return (
    Number.parseInt(hours ?? "0", 10) * 3600 +
    Number.parseInt(minutes ?? "0", 10) * 60 +
    Number.parseInt(seconds ?? "0", 10)
  )
}

function youtubeEmbedUrl(videoId, sourceUrl) {
  if (videoId === undefined || videoId === null || !YOUTUBE_ID_PATTERN.test(videoId)) {
    return undefined
  }
  // youtube-nocookie.com: Google's privacy-enhanced embed host (no cookies
  // until playback starts) — strictly better than youtube.com for visitors.
  const embed = new URL(`https://www.youtube-nocookie.com/embed/${videoId}`)
  const start = parseYoutubeStartSeconds(sourceUrl.searchParams.get("t") ?? sourceUrl.searchParams.get("start"))
  if (start !== undefined) embed.searchParams.set("start", String(start))
  return embed.href
}

/** @type {LinkProvider} */
const YOUTUBE = {
  name: "youtube",
  frameOrigins: ["https://www.youtube-nocookie.com"],
  embedUrlFor(url) {
    if (hostMatches(url, "youtu.be")) {
      return youtubeEmbedUrl(segmentsOf(url)[0], url)
    }
    if (!hostMatches(url, "youtube.com") && !hostMatches(url, "youtube-nocookie.com")) {
      return undefined
    }
    const segments = segmentsOf(url)
    if (segments[0] === "watch") return youtubeEmbedUrl(url.searchParams.get("v") ?? undefined, url)
    if (["shorts", "live", "embed"].includes(segments[0])) return youtubeEmbedUrl(segments[1], url)
    return undefined
  },
}

/** @type {LinkProvider} */
const VIMEO = {
  name: "vimeo",
  frameOrigins: ["https://player.vimeo.com"],
  embedUrlFor(url) {
    if (!hostMatches(url, "vimeo.com")) return undefined
    const segments = segmentsOf(url)
    if (segments.length !== 1 || !/^\d+$/.test(segments[0])) return undefined
    return `https://player.vimeo.com/video/${segments[0]}`
  },
}

const SPOTIFY_EMBEDDABLE_TYPES = Object.freeze([
  "track",
  "album",
  "playlist",
  "episode",
  "show",
  "artist",
])

/** @type {LinkProvider} */
const SPOTIFY = {
  name: "spotify",
  frameOrigins: ["https://open.spotify.com"],
  embedUrlFor(url) {
    if (url.hostname.toLowerCase() !== "open.spotify.com") return undefined
    const segments = segmentsOf(url)
    // Locale prefix ("/intl-fr/track/...") is presentational — drop it.
    if (segments[0]?.startsWith("intl-")) segments.shift()
    const [type, id] = segments
    if (!SPOTIFY_EMBEDDABLE_TYPES.includes(type) || !/^[A-Za-z0-9]+$/.test(id ?? "")) {
      return undefined
    }
    return `https://open.spotify.com/embed/${type}/${id}`
  },
}

/** @type {LinkProvider} */
const CODEPEN = {
  name: "codepen",
  frameOrigins: ["https://codepen.io"],
  embedUrlFor(url) {
    if (!hostMatches(url, "codepen.io")) return undefined
    const [user, kind, id] = segmentsOf(url)
    if (kind !== "pen" || user === undefined || !/^[A-Za-z0-9]+$/.test(id ?? "")) return undefined
    return `https://codepen.io/${encodeURIComponent(user)}/embed/preview/${id}?default-tab=result`
  },
}

/** @type {LinkProvider} */
const TWITTER = {
  name: "twitter",
  frameOrigins: ["https://platform.twitter.com"],
  embedUrlFor(url) {
    if (!hostMatches(url, "twitter.com") && !hostMatches(url, "x.com")) return undefined
    const [, kind, id] = segmentsOf(url)
    if (kind !== "status" || !/^\d+$/.test(id ?? "")) return undefined
    return `https://platform.twitter.com/embed/Tweet.html?id=${id}`
  },
}

/** @type {LinkProvider} */
const LOOM = {
  name: "loom",
  frameOrigins: ["https://www.loom.com"],
  embedUrlFor(url) {
    if (!hostMatches(url, "loom.com")) return undefined
    const [kind, id] = segmentsOf(url)
    if (kind !== "share" || !/^[A-Za-z0-9]+$/.test(id ?? "")) return undefined
    return `https://www.loom.com/embed/${id}`
  },
}

/** @type {readonly LinkProvider[]} */
export const LINK_PROVIDERS = Object.freeze([YOUTUBE, VIMEO, SPOTIFY, CODEPEN, TWITTER, LOOM])

/**
 * @param {string} rawUrl a canvas link node's `url` value
 * @returns {{mode: "embed", provider: string, embedUrl: string} | {mode: "card"}}
 *   invalid/non-http(s) URLs classify as card — the card renders the raw text.
 */
export function classifyLinkUrl(rawUrl) {
  let url
  try {
    url = new URL(rawUrl)
  } catch {
    return { mode: LinkMode.CARD }
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { mode: LinkMode.CARD }
  for (const provider of LINK_PROVIDERS) {
    const embedUrl = provider.embedUrlFor(url)
    if (embedUrl !== undefined) return { mode: LinkMode.EMBED, provider: provider.name, embedUrl }
  }
  return { mode: LinkMode.CARD }
}

/** @returns {string[]} deduped frame origins across the provider table */
export function allFrameOrigins() {
  return [...new Set(LINK_PROVIDERS.flatMap((provider) => provider.frameOrigins))]
}

/**
 * CSP directive for canvas pages: only self (note fragments et al. are not
 * framed today, but 'self' keeps same-origin future-safe) and the provider
 * table may be framed — defense in depth behind the classifier whitelist.
 */
export function cspFrameSrcContent() {
  return `frame-src 'self' ${allFrameOrigins().join(" ")}`
}

/** @returns {string} hostname of the URL, or "" when unparsable (card label fallback) */
export function domainOf(rawUrl) {
  try {
    return new URL(rawUrl).hostname
  } catch {
    return ""
  }
}
