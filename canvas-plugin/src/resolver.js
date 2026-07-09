/**
 * The ONE shared link resolver (plan/main.md §4.2).
 *
 * Thin wrapper over Quartz's own path utilities (`@quartz-community/utils`,
 * pinned in the root package.json to the EXACT commit vendor/quartz uses) so
 * canvas-side resolution is byte-identical to Quartz's markdown resolution.
 * NEVER reimplement slugging here — only compose the utils.
 */
import {
  resolveRelative,
  simplifySlug,
  slugifyFilePath,
  splitAnchor,
  stripSlashes,
  transformLink,
} from "@quartz-community/utils/path"

/**
 * @typedef {object} ResolvedTarget
 * @property {string} relativeUrl URL usable as href from the current page (anchor included).
 * @property {string} targetSlug  Canonical FullSlug of the target (no anchor).
 * @property {string} simpleSlug  SimpleSlug for `data.links` registration (backlinks/graph).
 * @property {boolean} exists     Whether the target slug is a real staged file.
 */

export class VaultLinkResolver {
  /**
   * @param {string} currentSlug slug of the page links appear on (e.g. "canvases/main.canvas")
   * @param {string[]} allSlugs  Quartz's ctx.allSlugs (slug of every staged vault file)
   */
  constructor(currentSlug, allSlugs) {
    this.currentSlug = currentSlug
    this.allSlugs = allSlugs
  }

  /**
   * Resolve an exact vault-relative file path (a canvas file node's `file`).
   * @param {string} vaultPath e.g. "notes/architecture.md"
   * @returns {ResolvedTarget}
   */
  resolveFilePath(vaultPath) {
    const targetSlug = slugifyFilePath(/** @type {any} */ (vaultPath))
    return {
      relativeUrl: resolveRelative(
        /** @type {any} */ (this.currentSlug),
        /** @type {any} */ (targetSlug),
      ),
      targetSlug,
      simpleSlug: simplifySlug(targetSlug),
      exists: this.allSlugs.includes(targetSlug),
    }
  }

  /**
   * Resolve an Obsidian wikilink target (bare name, path, optional "#anchor"),
   * exactly like Quartz's crawl-links transformer: transformLink for the href,
   * then the same URL-canonicalization recipe for the link-registration slug.
   * @param {string} target e.g. "getting-started", "second.canvas", "note#some-heading"
   * @returns {ResolvedTarget}
   */
  resolveWikilinkTarget(target) {
    const relativeUrl = transformLink(
      /** @type {any} */ (this.currentSlug),
      target,
      /** @type {any} */ ({ strategy: "shortest", allSlugs: this.allSlugs }),
    )
    // Canonicalization copied from crawl-links/src/transformer.ts (~line 122):
    // resolve the relative href against a fake absolute base to recover the
    // site-absolute target slug, then simplify for backlinks/graph.
    const url = new URL(relativeUrl, "https://base.com/" + stripSlashes(this.currentSlug, true))
    const [canonicalRaw] = splitAnchor(url.pathname)
    let canonical = canonicalRaw
    if (canonical.endsWith("/")) canonical += "index"
    const targetSlug = decodeURIComponent(stripSlashes(canonical, true))
    return {
      relativeUrl,
      targetSlug,
      simpleSlug: simplifySlug(/** @type {any} */ (targetSlug)),
      exists: this.allSlugs.includes(targetSlug),
    }
  }

  /**
   * URL of an arbitrary site-relative output path (e.g. an emitted fragment
   * or "static/canvas-viewer.js") relative to the current page.
   * @param {string} sitePath
   * @returns {string}
   */
  relativeUrlTo(sitePath) {
    return resolveRelative(
      /** @type {any} */ (this.currentSlug),
      /** @type {any} */ (sitePath),
    )
  }
}

/** Slug of a vault file (what its page URL path is, minus .html). */
export function vaultPathToSlug(vaultPath) {
  return slugifyFilePath(/** @type {any} */ (vaultPath))
}
