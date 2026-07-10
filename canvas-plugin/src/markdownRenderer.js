/**
 * Build-time markdown rendering for canvas TEXT cards.
 *
 * Same remark/rehype pipeline family Quartz uses (unified + remark-parse +
 * remark-gfm + remark-rehype + rehype-raw), with wikilinks resolved through
 * the SHARED resolver (resolver.js -> @quartz-community/utils) so canvas text
 * cards get the same slugs as every markdown page.
 *
 * Trust model: raw HTML is allowed through (allowDangerousHtml + rehype-raw),
 * matching Quartz's own obsidian-flavored-markdown behavior — the input is the
 * site owner's own vault, exactly as trusted as their notes. Do not weaken or
 * strengthen this in only one of the two pipelines.
 */
import GithubSlugger from "github-slugger"
import rehypeRaw from "rehype-raw"
import rehypeStringify from "rehype-stringify"
import remarkGfm from "remark-gfm"
import remarkParse from "remark-parse"
import remarkRehype from "remark-rehype"
import { unified } from "unified"
import { visit, SKIP } from "unist-util-visit"
import { WIKILINK_REGEX } from "./wikilinkGrammar.js"

const IMAGE_EMBED_REGEX = /\.(png|jpg|jpeg|gif|svg|webp|avif|bmp|ico)$/i

export class CanvasMarkdownRenderer {
  /** @param {import("./resolver.js").VaultLinkResolver} resolver */
  constructor(resolver) {
    this.resolver = resolver
    this.processor = unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkWikilinks, { resolver })
      .use(remarkRehype, { allowDangerousHtml: true })
      .use(rehypeRaw)
      .use(rehypeStringify)
  }

  /**
   * @param {string} markdown
   * @returns {{html: string, outgoingSimpleSlugs: string[]}} rendered HTML plus
   *   the SimpleSlugs of all wikilink targets (for canvas `data.links`).
   */
  render(markdown) {
    const file = this.processor.processSync(markdown)
    const outgoing = /** @type {string[]} */ (file.data.canvasOutgoingSlugs ?? [])
    return { html: String(file), outgoingSimpleSlugs: [...new Set(outgoing)] }
  }
}

/**
 * remark plugin: replace wikilink text with resolved links/images.
 * Registers each target's SimpleSlug on `file.data.canvasOutgoingSlugs`.
 * @param {{resolver: import("./resolver.js").VaultLinkResolver}} options
 */
function remarkWikilinks({ resolver }) {
  return (/** @type {any} */ tree, /** @type {any} */ file) => {
    const outgoing = []
    visit(tree, "text", (node, index, parent) => {
      if (parent === undefined || index === undefined) return
      const replacements = splitTextOnWikilinks(node.value, resolver, outgoing)
      if (replacements === undefined) return
      parent.children.splice(index, 1, ...replacements)
      return [SKIP, index + replacements.length]
    })
    file.data.canvasOutgoingSlugs = outgoing
  }
}

/**
 * @param {string} text
 * @param {import("./resolver.js").VaultLinkResolver} resolver
 * @param {string[]} outgoing collector for SimpleSlugs
 * @returns {any[] | undefined} mdast nodes, or undefined when no wikilink found
 */
function splitTextOnWikilinks(text, resolver, outgoing) {
  WIKILINK_REGEX.lastIndex = 0
  if (!WIKILINK_REGEX.test(text)) return undefined
  WIKILINK_REGEX.lastIndex = 0

  const nodes = []
  let lastEnd = 0
  for (const match of text.matchAll(WIKILINK_REGEX)) {
    const [full, embed, target, rawAnchor, alias] = match
    const start = /** @type {number} */ (match.index)
    if (start > lastEnd) nodes.push({ type: "text", value: text.slice(lastEnd, start) })
    nodes.push(wikilinkToNode({ embed: embed === "!", target, rawAnchor, alias }, resolver, outgoing))
    lastEnd = start + full.length
  }
  if (lastEnd < text.length) nodes.push({ type: "text", value: text.slice(lastEnd) })
  return nodes
}

/**
 * @param {{embed: boolean, target: string, rawAnchor?: string, alias?: string}} link
 * @param {import("./resolver.js").VaultLinkResolver} resolver
 * @param {string[]} outgoing
 * @returns {any} mdast link/image/text node
 */
function wikilinkToNode({ embed, target, rawAnchor, alias }, resolver, outgoing) {
  const anchor = slugAnchor(rawAnchor)
  const resolved = resolver.resolveWikilinkTarget(target.trim() + anchor)
  outgoing.push(resolved.simpleSlug)

  if (embed && IMAGE_EMBED_REGEX.test(target)) {
    return { type: "image", url: resolved.relativeUrl, alt: alias ?? target.trim() }
  }
  // Non-image embeds (![[note]], ![[x.canvas]]) degrade to a plain link for MVP
  // (inline transclusion in text cards is a follow-up, plan/main.md §4.2).
  const displayText = alias?.trim() || target.trim() + (rawAnchor ?? "")
  return {
    type: "link",
    url: resolved.relativeUrl,
    children: [{ type: "text", value: displayText }],
    data: {
      // hProperties: same classes Quartz's crawl-links puts on internal links,
      // so theme CSS / SPA router / popover treat these identically.
      hProperties: { className: ["internal"], "data-slug": resolved.targetSlug },
    },
  }
}

/**
 * Anchor normalization, mirroring Quartz ofm: heading anchors are
 * github-slugged; block references (#^id) are kept verbatim.
 * @param {string | undefined} rawAnchor including leading "#", e.g. "#Some Heading"
 * @returns {string} "" when absent
 */
function slugAnchor(rawAnchor) {
  if (rawAnchor === undefined || rawAnchor === "") return ""
  if (rawAnchor.startsWith("#^")) return rawAnchor
  return "#" + new GithubSlugger().slug(rawAnchor.slice(1))
}
