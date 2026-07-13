/**
 * Publish-time OpenGraph metadata resolution for canvas link cards.
 *
 * ALL network access for link cards lives here — behind an injectable
 * FetchLike so unit tests and offline builds never touch the network. Every
 * failure degrades to "no metadata" (domain-only card) plus a warning; a
 * metadata fetch must NEVER fail a build.
 *
 * WHY-NOT oEmbed: the framable providers are table-embedded
 * (canvas-plugin/src/linkProviders.js), so oEmbed's only extra value —
 * provider player HTML — is unused; OG covers title/description/image for
 * the card path.
 */

/** Metadata for one link card (all optional except domain). */
export interface LinkCardMeta {
  domain: string
  title?: string
  description?: string
  /** Absolute og:image URL (hotlinked by the viewer — user decision). */
  image?: string
  siteName?: string
}

/** Minimal fetch surface (injectable — tests pass fakes, builds pass nothing). */
export type FetchLike = (
  url: string,
  init: { signal: AbortSignal; headers: Record<string, string> },
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>

export interface LinkMetadataResolution {
  metaByUrl: Map<string, LinkCardMeta>
  warnings: string[]
}

const DEFAULT_TIMEOUT_MS = 5000
const DEFAULT_CONCURRENCY = 4
/** OG tags live in <head>; a slice bound keeps regex work off pathological bodies. */
const MAX_HTML_BYTES = 512 * 1024
/**
 * Browser-ish UA: plenty of sites serve bot UAs a 403/challenge page instead
 * of their OG tags. Sites that still block degrade to a domain-only card.
 */
const REQUEST_HEADERS = Object.freeze({
  "user-agent": "Mozilla/5.0 (compatible; vintrin-publish/1.0; link-card metadata fetch)",
  accept: "text/html,application/xhtml+xml",
})

/** Fetches OG metadata for a set of URLs with bounded concurrency. Never throws. */
export class LinkMetadataResolver {
  private readonly fetchFn: FetchLike
  private readonly timeoutMs: number
  private readonly concurrency: number

  constructor(
    options: { fetchFn?: FetchLike; timeoutMs?: number; concurrency?: number } = {},
  ) {
    this.fetchFn = options.fetchFn ?? defaultFetch
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.concurrency = options.concurrency ?? DEFAULT_CONCURRENCY
  }

  async resolve(urls: string[]): Promise<LinkMetadataResolution> {
    const uniqueUrls = [...new Set(urls)]
    const metaByUrl = new Map<string, LinkCardMeta>()
    const warnings: string[] = []
    // Bounded worker pool: workers pull from a shared cursor until drained.
    let cursor = 0
    const worker = async () => {
      while (cursor < uniqueUrls.length) {
        const url = uniqueUrls[cursor]
        cursor += 1
        try {
          const response = await this.fetchFn(url, {
            signal: AbortSignal.timeout(this.timeoutMs),
            headers: { ...REQUEST_HEADERS },
          })
          if (!response.ok) {
            warnings.push(`${url}: HTTP ${response.status}`)
            continue
          }
          const html = (await response.text()).slice(0, MAX_HTML_BYTES)
          metaByUrl.set(url, parseOpenGraph(html, url))
        } catch (error) {
          warnings.push(`${url}: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(this.concurrency, uniqueUrls.length) }, worker),
    )
    return { metaByUrl, warnings }
  }
}

/**
 * Pure OG extraction. Regex over <meta> tags (attribute order agnostic) — a
 * full HTML parser buys nothing for machine-generated head metadata and would
 * add a dependency. Exported for unit tests.
 */
export function parseOpenGraph(html: string, pageUrl: string): LinkCardMeta {
  const tags = collectMetaContent(html)
  const meta: LinkCardMeta = { domain: hostnameOf(pageUrl) }
  const title = tags.get("og:title") ?? titleTagOf(html)
  if (title !== undefined) meta.title = title
  const description = tags.get("og:description") ?? tags.get("description")
  if (description !== undefined) meta.description = description
  const siteName = tags.get("og:site_name")
  if (siteName !== undefined) meta.siteName = siteName
  const image = tags.get("og:image")
  if (image !== undefined) {
    const absolute = absoluteUrlOrUndefined(image, pageUrl)
    if (absolute !== undefined) meta.image = absolute
  }
  return meta
}

/** property=/name= -> entity-decoded content, first occurrence wins (OG convention). */
function collectMetaContent(html: string): Map<string, string> {
  const result = new Map<string, string>()
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    const key = attributeOf(tag, "property") ?? attributeOf(tag, "name")
    const content = attributeOf(tag, "content")
    if (key === undefined || content === undefined) continue
    const normalizedKey = key.toLowerCase()
    if (!result.has(normalizedKey) && content.trim() !== "") {
      result.set(normalizedKey, content.trim())
    }
  }
  return result
}

// Attribute value in single or double quotes (unquoted values are not worth
// supporting: head metadata is machine-generated).
function attributeOf(tag: string, name: string): string | undefined {
  const match = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i").exec(tag)
  if (match === null) return undefined
  return decodeEntities(match[2] ?? match[3] ?? "")
}

function titleTagOf(html: string): string | undefined {
  const match = /<title[^>]*>([^<]*)<\/title>/i.exec(html)
  const title = match === null ? "" : decodeEntities(match[1]).trim()
  return title === "" ? undefined : title
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
}

function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) {
      return String.fromCodePoint(Number.parseInt(body.slice(2), 16))
    }
    if (body.startsWith("#")) {
      return String.fromCodePoint(Number.parseInt(body.slice(1), 10))
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole
  })
}

function hostnameOf(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname
  } catch {
    return ""
  }
}

/** Resolves possibly-relative og:image against the page URL; http(s) only. */
function absoluteUrlOrUndefined(candidate: string, baseUrl: string): string | undefined {
  try {
    const url = new URL(candidate, baseUrl)
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : undefined
  } catch {
    return undefined
  }
}

const defaultFetch: FetchLike = (url, init) => fetch(url, { ...init, redirect: "follow" })
