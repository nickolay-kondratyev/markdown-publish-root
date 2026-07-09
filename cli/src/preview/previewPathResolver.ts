/**
 * PURE URL-path resolution for `publish preview` — no fs, no network
 * (mirrors the DeployPlanner/DeployExecutor split; server wiring lives in
 * previewServer.ts).
 *
 * This implements THE site URL-routing contract: Quartz emits `foo.html` /
 * `X.canvas.html` but links `foo` / `X.canvas`, so any host must map those
 * URLs onto the emitted files. docs/hosting.md is the single documented home
 * of this contract (CloudFront Function recipe included) — keep the two in
 * sync.
 */

/** Default `publish preview` port; overridable via `--port`. */
export const DEFAULT_PREVIEW_PORT = 8080

/** Preview binds loopback only: it is a LOCAL preview, not a production server. */
export const PREVIEW_BIND_HOST = "127.0.0.1"

/** Site-root-relative path of the themed not-found page Quartz emits. */
export const NOT_FOUND_PAGE_PATH = "404.html"

/**
 * What the resolver can see of the site directory. Injected so resolution
 * stays pure: unit tests use an in-memory fake, the server an fs-backed one.
 * Paths are site-root-relative with "/" separators and no leading slash
 * ("" names the site root itself).
 */
export interface SiteFileLookup {
  isFile(siteRelativePath: string): boolean
  isDirectory(siteRelativePath: string): boolean
}

/** Serve this existing file with status 200. */
export interface ServeResolution {
  kind: "serve"
  siteRelativeFilePath: string
}

/** Redirect (302) so relative URLs on directory index pages resolve correctly. */
export interface RedirectResolution {
  kind: "redirect"
  location: string
}

/** Nothing matched: 404, with the site's themed 404 page when it exists. */
export interface NotFoundResolution {
  kind: "not-found"
  notFoundPageFilePath: string | undefined
}

/** Malformed or traversal-attempting request: refuse without touching files. */
export interface RejectedResolution {
  kind: "rejected"
  reason: string
}

export type PreviewResolution =
  | ServeResolution
  | RedirectResolution
  | NotFoundResolution
  | RejectedResolution

/** Resolves raw request URLs to site files per the hosting contract (docs/hosting.md). */
export class PreviewPathResolver {
  static resolve(rawUrl: string, lookup: SiteFileLookup): PreviewResolution {
    const segments = parsePathSegments(rawUrl)
    if (segments.kind === "rejected") return segments

    const relativePath = segments.value.join("/")

    // Rule 2 first for directory-shaped paths ("" is the site root, which is
    // always a directory); a path cannot be both a file and a directory.
    if (relativePath === "" || lookup.isDirectory(relativePath)) {
      const indexPath = relativePath === "" ? "index.html" : `${relativePath}/index.html`
      if (lookup.isFile(indexPath)) {
        // Without the trailing slash the browser would resolve the index
        // page's relative URLs against the PARENT directory — redirect first.
        if (!segments.hadTrailingSlash && relativePath !== "") {
          return { kind: "redirect", location: `/${relativePath}/` }
        }
        return { kind: "serve", siteRelativeFilePath: indexPath }
      }
      return notFound(lookup)
    }

    // Rule 1: exact file match. A trailing slash names a directory, never a file.
    if (!segments.hadTrailingSlash && lookup.isFile(relativePath)) {
      return { kind: "serve", siteRelativeFilePath: relativePath }
    }

    // Rule 3: `<path>.html` fallback for page URLs.
    const lastSegment = segments.value[segments.value.length - 1] as string
    if (!segments.hadTrailingSlash && htmlFallbackApplies(lastSegment)) {
      const htmlPath = `${relativePath}.html`
      if (lookup.isFile(htmlPath)) return { kind: "serve", siteRelativeFilePath: htmlPath }
    }

    // Rule 4: 404.
    return notFound(lookup)
  }
}

/**
 * Quartz links pages WITHOUT `.html`: notes as `notes/foo` (no dot) and
 * canvases as `canvases/X.canvas` (emitted as `X.canvas.html`). A URL whose
 * last segment carries any OTHER extension (e.g. a missing `.png`) must NOT
 * fall back to `.html` — it 404s.
 */
function htmlFallbackApplies(lastSegment: string): boolean {
  return !lastSegment.includes(".") || lastSegment.endsWith(".canvas")
}

function notFound(lookup: SiteFileLookup): NotFoundResolution {
  return {
    kind: "not-found",
    notFoundPageFilePath: lookup.isFile(NOT_FOUND_PAGE_PATH) ? NOT_FOUND_PAGE_PATH : undefined,
  }
}

interface ParsedSegments {
  kind: "segments"
  value: string[]
  hadTrailingSlash: boolean
}

/**
 * Decodes and normalizes the request path into safe site-relative segments.
 * SECURITY BOUNDARY: rejecting `..`/`.`/dotfile/backslash/NUL segments HERE
 * guarantees the joined path can never escape the site directory (the
 * fs-backed lookup re-asserts containment as defense in depth).
 */
function parsePathSegments(rawUrl: string): ParsedSegments | RejectedResolution {
  // Query/hash never select a different file.
  const rawPath = (rawUrl.split("?")[0] as string).split("#")[0] as string

  let decodedPath: string
  try {
    decodedPath = decodeURIComponent(rawPath)
  } catch {
    return { kind: "rejected", reason: `malformed percent-encoding in "${rawPath}"` }
  }

  const segments = decodedPath.split("/").filter((segment) => segment !== "")
  for (const segment of segments) {
    if (segment === ".." || segment === ".") {
      return { kind: "rejected", reason: "path traversal segment" }
    }
    // Dotfiles (.git, .DS_Store, ...) are never part of a built site.
    if (segment.startsWith(".")) {
      return { kind: "rejected", reason: "hidden-file segment" }
    }
    if (segment.includes("\\") || segment.includes("\0")) {
      return { kind: "rejected", reason: "illegal character in path segment" }
    }
  }

  return { kind: "segments", value: segments, hadTrailingSlash: decodedPath.endsWith("/") }
}

const CONTENT_TYPE_BY_EXTENSION: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".xml": "application/xml",
  ".txt": "text/plain; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".pdf": "application/pdf",
}

const DEFAULT_CONTENT_TYPE = "application/octet-stream"

/** Content-Type for a file path, by its (lowercased) extension. */
export function contentTypeFor(filePath: string): string {
  const lastSegment = filePath.split("/").pop() as string
  const dotIndex = lastSegment.lastIndexOf(".")
  if (dotIndex <= 0) return DEFAULT_CONTENT_TYPE
  const extension = lastSegment.slice(dotIndex).toLowerCase()
  return CONTENT_TYPE_BY_EXTENSION[extension] ?? DEFAULT_CONTENT_TYPE
}
