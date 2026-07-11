/**
 * Build-time canvas JSON rewriting (renderer-agnostic — plan/main.md §4.3).
 *
 * Input:  parsed JSON Canvas + the shared resolver context.
 * Output: a rewritten canvas the viewer can render withOUT any client-side
 * resolution, plus everything the page/emitter needs (attachments map, note-card
 * link metadata, outbound links for backlinks/graph, fragments to emit, search text).
 *
 * Invariants:
 *   - Node ids and coordinates are ALWAYS preserved (future commenting anchors,
 *     plan/main.md §1).
 *   - The attachments map is COMPLETE for every remaining MEDIA file node (the
 *     viewer renders fetch-404 bodies for missing entries — Spike B). Note
 *     cards carry a per-NODE fragment URL in noteLinks instead: two nodes may
 *     embed the SAME note with different subpaths, so a per-file map cannot
 *     address their fragments.
 *   - PRIVACY (plan §4.4): a file node whose target is not a staged file becomes
 *     a contentless placeholder; the vault path is REMOVED from the emitted JSON
 *     (a filename is title-derived content). Private and missing targets are
 *     indistinguishable BY CONSTRUCTION — this code only ever sees the staging
 *     directory — so one label serves both and no existence oracle leaks.
 */
import { classifyFileTarget, FileTargetKind } from "./canvasSchema.js"
import { CanvasMarkdownRenderer } from "./markdownRenderer.js"
import { NoteFragmentExtractor } from "./noteFragments.js"
import { VaultLinkResolver } from "./resolver.js"
import GithubSlugger from "github-slugger"

/**
 * @typedef {object} RewriteResult
 * @property {{nodes: any[], edges: any[]}} canvas rewritten canvas JSON
 * @property {Record<string, string>} attachments media node.file -> URL relative to the canvas page
 * @property {Record<string, {href: string, title: string, fragmentUrl: string, subpathLabel?: string}>} noteLinks
 *   per note-card node id: open-note affordance target + that node's own fragment URL
 * @property {string[]} links SimpleSlugs for Quartz `data.links` (backlinks/graph)
 * @property {string[]} searchParts one plain-text entry per visible canvas item
 *   (card, group label, link URL, edge label) in canvas order — the search
 *   preview renders each entry as a bracketed pseudo-card (pageBody.js).
 *   Privacy placeholders contribute nothing; empty items are dropped.
 * @property {string} searchText plain text of EVERYTHING visibly rendered on the
 *   canvas (search index): always `searchParts.join("\n")`.
 * @property {{sitePath: string, html: string}[]} fragments prerendered note fragments to emit
 * @property {string[]} warnings human-readable non-fatal issues
 */

export class CanvasRewriter {
  /**
   * @param {object} args
   * @param {string} args.canvasSlug
   * @param {string[]} args.allSlugs Quartz ctx.allSlugs (staged files only — privacy boundary)
   * @param {(slug: string) => ({tree: any, data: any} | undefined)} args.noteLookup
   *   processed content of a published note by slug (undefined when not published)
   * @param {(slug: string) => (string | undefined)} [args.canvasTitleLookup]
   *   display title of another published canvas by slug — needed since staged
   *   canvas basenames are docids (plan/id-based-publishing.md §4.4); falls
   *   back to the file basename when absent.
   */
  constructor({ canvasSlug, allSlugs, noteLookup, canvasTitleLookup }) {
    this.canvasSlug = canvasSlug
    this.noteLookup = noteLookup
    this.canvasTitleLookup = canvasTitleLookup ?? (() => undefined)
    this.resolver = new VaultLinkResolver(canvasSlug, allSlugs)
    this.markdownRenderer = new CanvasMarkdownRenderer(this.resolver)
  }

  /**
   * @param {{nodes: any[], edges: any[]}} canvas parsed JSON Canvas
   * @returns {RewriteResult}
   */
  rewrite(canvas) {
    /** @type {RewriteResult} */
    const result = {
      canvas: { nodes: [], edges: structuredClone(canvas.edges) },
      attachments: {},
      noteLinks: {},
      links: [],
      searchParts: [],
      searchText: "",
      fragments: [],
      warnings: [],
    }
    const links = new Set()
    const searchParts = []
    for (const node of canvas.nodes) {
      result.canvas.nodes.push(this.rewriteNode(node, result, links, searchParts))
    }
    for (const edge of canvas.edges) {
      if (edge.label) searchParts.push(edge.label)
    }
    result.links = [...links]
    result.searchParts = searchParts.filter((part) => part.trim() !== "")
    result.searchText = result.searchParts.join("\n")
    return result
  }

  /** @returns {any} the rewritten node (id/coords always preserved) */
  rewriteNode(node, result, links, searchParts) {
    switch (node.type) {
      case "text":
        return this.rewriteTextNode(node, links, searchParts)
      case "file":
        return this.rewriteFileNode(node, result, links, searchParts)
      case "group":
        if (node.label) searchParts.push(node.label)
        return structuredClone(node)
      case "link":
        if (node.url) searchParts.push(node.url)
        return structuredClone(node)
      default:
        // Unknown future node types pass through untouched.
        return structuredClone(node)
    }
  }

  rewriteTextNode(node, links, searchParts) {
    const rendered = this.markdownRenderer.render(node.text ?? "")
    for (const slug of rendered.outgoingSimpleSlugs) links.add(slug)
    searchParts.push(plainTextOf(rendered.html))
    // Pre-rendered HTML in `text` + no client parser = the viewer's identity
    // default injects it as-is (Spike B §3).
    return { ...structuredClone(node), text: rendered.html }
  }

  rewriteFileNode(node, result, links, searchParts) {
    const resolved = this.resolver.resolveFilePath(node.file)
    if (!resolved.exists) {
      // Unpublished or missing — same contentless card either way (see header).
      // PRIVACY: contributes NOTHING to searchText (a filename is content).
      return placeholderNode(node)
    }
    links.add(resolved.simpleSlug)
    const kind = classifyFileTarget(node.file)
    switch (kind) {
      case FileTargetKind.NOTE:
        return this.rewriteNoteCard(node, resolved, result, searchParts)
      case FileTargetKind.CANVAS: {
        const title = this.canvasTitleLookup(resolved.targetSlug) ?? titleFromPath(node.file)
        searchParts.push(title)
        return cardNode(node, {
          kindLabel: "Canvas",
          href: resolved.relativeUrl,
          text: title,
          internal: true,
          targetSlug: resolved.targetSlug,
        })
      }
      case FileTargetKind.MEDIA:
        // No visible text on a media card — nothing for searchText.
        result.attachments[node.file] = resolved.relativeUrl
        return structuredClone(node)
      default: {
        // PDF + unsupported extensions: navigable card linking the published
        // asset (plan §5 MVP fallback; the viewer renders neither natively).
        const text = baseName(node.file)
        searchParts.push(text)
        return cardNode(node, {
          kindLabel: kind === FileTargetKind.PDF ? "PDF" : "File",
          href: resolved.relativeUrl,
          text,
          internal: false,
        })
      }
    }
  }

  rewriteNoteCard(node, resolved, result, searchParts) {
    const note = this.noteLookup(resolved.targetSlug)
    if (note === undefined) {
      // Staged .md that produced no processed content (should not happen) —
      // degrade to the placeholder rather than risk leaking anything.
      result.warnings.push(`${this.canvasSlug}: no processed content for staged note ${node.file}`)
      return placeholderNode(node)
    }
    const fragment = NoteFragmentExtractor.extract({
      noteTree: note.tree,
      noteData: note.data,
      noteSlug: resolved.targetSlug,
      canvasSlug: this.canvasSlug,
      subpath: node.subpath,
    })
    if (!fragment.subpathFound) {
      result.warnings.push(
        `${this.canvasSlug}: subpath "${node.subpath}" not found in ${node.file} — rendering the whole note`,
      )
    }
    const sitePath = `${this.canvasSlug}.fragments/${sanitizeNodeId(node.id)}.html`
    result.fragments.push({
      sitePath,
      html: `<div class="canvas-note-embed">${fragment.html}</div>`,
    })
    // Keyed by NODE id (not node.file): fragments are extracted per node, and
    // two nodes may embed the same note with different subpaths.
    const title = note.data.frontmatter?.title ?? titleFromPath(node.file)
    result.noteLinks[node.id] = {
      href: resolved.relativeUrl + subpathToAnchor(node.subpath),
      title,
      fragmentUrl: this.resolver.relativeUrlTo(sitePath),
      ...(node.subpath ? { subpathLabel: node.subpath.replace(/^#\^?/, "") } : {}),
    }
    // The card visibly shows the note title + the fragment body — index BOTH,
    // as ONE part (one search-preview pseudo-card per canvas card). Only the
    // fragment (not the whole note) so a subpath card contributes exactly
    // what the canvas displays.
    searchParts.push(`${title} ${plainTextOf(fragment.html)}`.trim())
    return structuredClone(node)
  }
}

/** Contentless privacy placeholder: keeps geometry, drops the vault path. */
function placeholderNode(node) {
  const clone = structuredClone(node)
  delete clone.file
  delete clone.subpath
  return {
    ...clone,
    type: "text",
    text: `<div class="canvas-card canvas-card-placeholder"><span class="canvas-card-kind">Private note</span></div>`,
  }
}

/** Styled navigable card (canvas / pdf / unsupported file targets). */
function cardNode(node, { kindLabel, href, text, internal, targetSlug }) {
  const clone = structuredClone(node)
  delete clone.file
  delete clone.subpath
  const linkAttrs = internal
    ? ` class="internal canvas-card-link" data-slug="${escapeHtml(targetSlug)}"`
    : ` class="canvas-card-link"`
  return {
    ...clone,
    type: "text",
    text:
      `<div class="canvas-card canvas-card-${kindLabel.toLowerCase()}">` +
      `<span class="canvas-card-kind">${escapeHtml(kindLabel)}</span>` +
      `<a${linkAttrs} href="${escapeHtml(href)}">${escapeHtml(text)}</a>` +
      `</div>`,
  }
}

/**
 * Obsidian subpath -> URL anchor on the note's page. Quartz's transformLink
 * github-slugs every anchor (headings AND "#^block" refs, dropping the "^") —
 * the open-note href must match markdown-page links byte-for-byte.
 */
function subpathToAnchor(subpath) {
  if (subpath === undefined || subpath === "") return ""
  return "#" + new GithubSlugger().slug(subpath.replace(/^#\^?/, ""))
}

function titleFromPath(filePath) {
  return baseName(filePath).replace(/\.[^.]+$/, "")
}

function baseName(filePath) {
  return filePath.split("/").at(-1) ?? filePath
}

/** Node ids become file names — restrict to a filesystem/URL-safe alphabet. */
function sanitizeNodeId(id) {
  return id.replace(/[^A-Za-z0-9_-]/g, "-")
}

// Tag-strip is sufficient for a search-index string of our OWN rendered HTML
// (no untrusted input; fidelity beyond words is irrelevant to search).
function plainTextOf(html) {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}
