/**
 * JSON Canvas 1.0 parsing + file-target classification.
 * Spec: https://jsoncanvas.org/spec/1.0/ — nodes/edges arrays; node types
 * text/file/link/group; z-order = array order; colors: presets "1".."6" or hex.
 * Renderer-agnostic: no viewer imports here.
 */

/** Thrown when a .canvas file is not valid JSON Canvas. */
export class CanvasParseError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message)
    this.name = "CanvasParseError"
  }
}

/**
 * Parse raw .canvas file content.
 * @param {string} raw
 * @returns {{nodes: any[], edges: any[]}}
 */
export function parseCanvas(raw) {
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    throw new CanvasParseError(`not valid JSON: ${/** @type {Error} */ (error).message}`)
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new CanvasParseError("top level must be a JSON object")
  }
  const nodes = parsed.nodes ?? []
  const edges = parsed.edges ?? []
  if (!Array.isArray(nodes) || !Array.isArray(edges)) {
    throw new CanvasParseError("nodes/edges must be arrays")
  }
  for (const node of nodes) {
    if (typeof node?.id !== "string" || typeof node?.type !== "string") {
      throw new CanvasParseError("every node needs string `id` and `type`")
    }
  }
  return { nodes, edges }
}

/**
 * What kind of card a file node's target produces.
 * NOTE:      `.md` — prerendered note fragment + open-note affordance.
 * CANVAS:    `.canvas` — rewritten to a navigable canvas card.
 * PDF:       `.pdf` — rewritten to a card linking the published PDF (plan §5 MVP fallback).
 * MEDIA:     anything the viewer renders natively from a URL (see MediaKind).
 * OTHER:     unsupported — rewritten to a card linking the published asset.
 */
export const FileTargetKind = Object.freeze({
  NOTE: "note",
  CANVAS: "canvas",
  PDF: "pdf",
  MEDIA: "media",
  OTHER: "other",
})

/**
 * How the viewer renders a MEDIA file node. The extension lists below are the
 * single source of truth shared by build-time classification (MEDIA vs card)
 * and the client viewer's element dispatch (img/audio/video/plain fetch) —
 * "keep as file node" exactly matches what the viewer can render.
 * mdx/markdown/txt render via plain fetch+display, so they are MEDIA, not NOTE.
 */
export const MediaKind = Object.freeze({
  IMAGE: "image",
  AUDIO: "audio",
  VIDEO: "video",
  PLAINTEXT: "plaintext",
})

const MEDIA_EXTENSIONS = Object.freeze({
  [MediaKind.IMAGE]: ["png", "jpg", "jpeg", "gif", "svg", "webp", "avif", "bmp", "ico", "heic", "heif"],
  [MediaKind.AUDIO]: ["mp3", "wav", "ogg", "opus", "aac", "m4a", "flac"],
  [MediaKind.VIDEO]: ["mp4", "webm", "ogv", "mov", "m3u8", "mpd"],
  [MediaKind.PLAINTEXT]: ["mdx", "markdown", "txt"],
})

/**
 * @param {string} filePath
 * @returns {string | undefined} one of MediaKind, or undefined when not media
 */
export function classifyMediaKind(filePath) {
  // Only the basename's tail after a dot is an extension — a vault file
  // literally named "png" must classify OTHER (navigable link card), not MEDIA.
  const basename = filePath.split("/").at(-1) ?? ""
  const dotIndex = basename.lastIndexOf(".")
  if (dotIndex < 0) return undefined
  const extension = basename.slice(dotIndex + 1).toLowerCase()
  for (const [kind, extensions] of Object.entries(MEDIA_EXTENSIONS)) {
    if (extensions.includes(extension)) return kind
  }
  return undefined
}

/**
 * @param {string} filePath vault-relative path of a file node target
 * @returns {string} one of FileTargetKind
 */
export function classifyFileTarget(filePath) {
  if (/\.md$/i.test(filePath)) return FileTargetKind.NOTE
  if (/\.canvas$/i.test(filePath)) return FileTargetKind.CANVAS
  if (/\.pdf$/i.test(filePath)) return FileTargetKind.PDF
  if (classifyMediaKind(filePath) !== undefined) return FileTargetKind.MEDIA
  return FileTargetKind.OTHER
}
