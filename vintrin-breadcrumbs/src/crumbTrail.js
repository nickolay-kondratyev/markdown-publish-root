/**
 * Pure crumb-trail derivation for the folder-shaped breadcrumbs
 * (plan/folder-nav-over-id-urls.md §4.3).
 *
 * Derived from the engine-injected `frontmatter.vintrinPath` ALONE — never
 * from slugs and never from Quartz's `ctx.trie` slug-trie cache (stock
 * breadcrumbs/dispatcher own that; we must not touch it).
 */

/**
 * @typedef {{label: string, kind: "home" | "folder" | "current"}} Crumb
 *   "home" is the only linked crumb (folders have no URLs — collapse-only
 *   navigation, plan §2); "current" is the unlinked page title.
 */

export class CrumbTrailBuilder {
  /**
   * @param {{vintrinPath?: string, title?: string}} page the page's frontmatter fields
   * @param {{rootName: string, showCurrentPage: boolean}} options
   * @returns {Crumb[] | undefined} undefined when the page has no vintrinPath
   *   (tag pages, 404) — the component then renders nothing.
   */
  static build(page, options) {
    if (typeof page.vintrinPath !== "string") return undefined
    const segments = page.vintrinPath.split("/")
    const leaf = segments.pop() ?? page.vintrinPath
    /** @type {Crumb[]} */
    const crumbs = [{ label: options.rootName, kind: "home" }]
    for (const segment of segments) {
      crumbs.push({ label: segment, kind: "folder" })
    }
    if (options.showCurrentPage) {
      crumbs.push({ label: page.title ?? stripExtension(leaf), kind: "current" })
    }
    return crumbs
  }
}

/** @param {string} basename @returns {string} */
function stripExtension(basename) {
  return basename.replace(/\.[^.]+$/, "")
}
