/**
 * Vintrin Breadcrumbs — folder-shaped crumbs over stable-id URLs
 * (plan/folder-nav-over-id-urls.md §4.3).
 *
 * Replaces the stock @quartz-community/breadcrumbs, which derives crumbs from
 * the slug trie (`Home ❯ n ❯ <docid>`). Crumbs come from the engine-injected
 * `frontmatter.vintrinPath`: `Home` (linked) ❯ folder segments (plain text —
 * folders have no URLs) ❯ current title (unlinked). Pages without vintrinPath
 * (tags, 404) render nothing; the Home page itself is excluded by the layout
 * `condition: "not-index"` wrapper.
 *
 * Must stay plain-Node-importable ESM (spike A gotcha G6 / spike C).
 */
import { h } from "preact"
import { resolveRelative, simplifySlug } from "@quartz-community/utils/path"
import { BREADCRUMBS_CSS } from "../src/breadcrumbStyles.js"
import { CrumbTrailBuilder } from "../src/crumbTrail.js"

/** Mirrors the meaningful stock options (plan §4.3). */
const DEFAULT_OPTIONS = {
  spacerSymbol: "❯",
  rootName: "Home",
  showCurrentPage: true,
}

/** @param {{spacerSymbol?: string, rootName?: string, showCurrentPage?: boolean} | undefined} opts */
export function VintrinBreadcrumbs(opts) {
  const options = { ...DEFAULT_OPTIONS, ...opts }

  /** @param {{fileData: any, displayClass?: string}} props */
  function Breadcrumbs({ fileData, displayClass }) {
    const crumbs = CrumbTrailBuilder.build(
      {
        vintrinPath: fileData.frontmatter?.vintrinPath,
        title: fileData.frontmatter?.title,
      },
      options,
    )
    if (crumbs === undefined) return null
    const homeHref = resolveRelative(fileData.slug, simplifySlug("index"))
    return h(
      "nav",
      {
        class: [displayClass, "breadcrumb-container"].filter(Boolean).join(" "),
        "aria-label": "breadcrumbs",
      },
      crumbs.map((crumb, index) =>
        h("div", { class: "breadcrumb-element" }, [
          crumb.kind === "home"
            ? h("a", { href: homeHref }, crumb.label)
            : h("span", null, crumb.label),
          index !== crumbs.length - 1 ? h("p", null, ` ${options.spacerSymbol} `) : null,
        ]),
      ),
    )
  }

  Breadcrumbs.css = BREADCRUMBS_CSS
  return Breadcrumbs
}
