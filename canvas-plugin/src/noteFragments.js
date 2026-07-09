/**
 * Build-time note fragments for canvas NOTE cards (`file` -> .md).
 *
 * Slices the note's ALREADY-PROCESSED Quartz hast (full transformer chain:
 * syntax highlighting, callouts, resolved wikilinks, ...) instead of
 * re-rendering markdown — one rendering pipeline per content kind (DRY).
 *
 * Subpath semantics copied from Quartz core's transclude expansion
 * (quartz/components/renderPage.tsx ~175-260):
 *   - "#^blockId" -> noteData.blocks[blockId] (ofm populates it, key WITHOUT "^");
 *     an <li> block is wrapped in a <ul> exactly like Quartz does.
 *   - "#Heading"  -> top-level slice from the heading (matched by github-slug id)
 *     until the next heading of the same-or-higher level.
 *
 * Link rebasing: the note's hrefs/srcs are relative to the NOTE's slug, but the
 * fragment is injected into the CANVAS page's DOM — normalizeHastElement (the
 * same @quartz-community/utils function Quartz uses for transcludes) rebases them.
 */
import GithubSlugger from "github-slugger"
import { toHtml } from "hast-util-to-html"
import { normalizeHastElement } from "@quartz-community/utils/path"

const HEADING_TAG_REGEX = /^h[1-6]$/

export class NoteFragmentExtractor {
  /**
   * @param {object} args
   * @param {any} args.noteTree    processed hast Root of the note (ProcessedContent[0])
   * @param {any} args.noteData    the note's vfile.data (for data.blocks)
   * @param {string} args.noteSlug
   * @param {string} args.canvasSlug slug of the canvas page embedding the fragment
   * @param {string} [args.subpath]  Obsidian subpath: "#Heading" or "#^blockId"
   * @returns {{html: string, subpathFound: boolean}} subpathFound=false means the
   *   subpath did not match and the FULL note was returned instead (content is
   *   published either way, so falling back is safe; callers surface a warning).
   */
  static extract({ noteTree, noteData, noteSlug, canvasSlug, subpath }) {
    const selection = selectChildren(noteTree, noteData, subpath)
    const rebased = selection.children.map((child) =>
      child.type === "element"
        ? normalizeHastElement(child, /** @type {any} */ (canvasSlug), /** @type {any} */ (noteSlug))
        : child,
    )
    return {
      html: toHtml({ type: "root", children: rebased }, { allowDangerousHtml: true }),
      subpathFound: selection.subpathFound,
    }
  }
}

/**
 * @param {any} noteTree
 * @param {any} noteData
 * @param {string | undefined} subpath
 * @returns {{children: any[], subpathFound: boolean}}
 */
function selectChildren(noteTree, noteData, subpath) {
  if (subpath === undefined || subpath === "") {
    return { children: noteTree.children, subpathFound: true }
  }
  if (subpath.startsWith("#^")) {
    const block = noteData.blocks?.[subpath.slice(2)]
    if (block === undefined) return { children: noteTree.children, subpathFound: false }
    // Quartz wraps a bare <li> block in a <ul> so it renders standalone.
    const element =
      block.tagName === "li"
        ? { type: "element", tagName: "ul", properties: {}, children: [block] }
        : block
    return { children: [element], subpathFound: true }
  }
  return sliceHeadingSection(noteTree, subpath.slice(1))
}

/**
 * Top-level heading slice, copied from Quartz's header-transclude logic.
 * @param {any} noteTree
 * @param {string} headingText raw Obsidian heading text (e.g. "Installation")
 * @returns {{children: any[], subpathFound: boolean}}
 */
function sliceHeadingSection(noteTree, headingText) {
  // Quartz heading ids are github-slugged heading text; Obsidian subpaths carry
  // the raw text — slug it the same way to match.
  const headingId = new GithubSlugger().slug(headingText)
  let startIdx
  let startDepth
  let endIdx
  for (const [i, child] of noteTree.children.entries()) {
    if (!(child.type === "element" && HEADING_TAG_REGEX.test(child.tagName))) continue
    const depth = Number(child.tagName.substring(1))
    if (startIdx === undefined || startDepth === undefined) {
      if (child.properties?.id === headingId) {
        startIdx = i
        startDepth = depth
      }
    } else if (depth <= startDepth) {
      endIdx = i
      break
    }
  }
  if (startIdx === undefined) return { children: noteTree.children, subpathFound: false }
  return { children: noteTree.children.slice(startIdx, endIdx), subpathFound: true }
}
