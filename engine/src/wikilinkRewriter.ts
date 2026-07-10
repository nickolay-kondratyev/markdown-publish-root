import { WIKILINK_REGEX } from "../../canvas-plugin/src/wikilinkGrammar.js"

/**
 * Maps a wikilink target (e.g. "some-note", "second.canvas") to its rewritten
 * staged target ("<docid>" / "<docid>.canvas"), or undefined to leave the link
 * untouched (unresolved targets, assets, root index — conservative rule,
 * plan/id-based-publishing.md §4.5).
 */
export type WikilinkTargetResolver = (target: string) => string | undefined

/**
 * Staging-time wikilink rewriting on raw markdown text (notes AND canvas text
 * cards). Pure text transform: resolution policy is injected.
 *
 * Rules (plan §4.5):
 *   - display text is ALWAYS preserved: bare links gain the original target
 *     (incl. anchor) as alias; existing aliases pass through verbatim
 *   - "#heading" / "#^block" anchors are kept byte-verbatim
 *   - embeds keep embed semantics: target rewritten, NO alias synthesized
 *   - fenced code blocks and inline code spans are never rewritten
 */
export class WikilinkRewriter {
  private readonly resolveTarget: WikilinkTargetResolver

  constructor(resolveTarget: WikilinkTargetResolver) {
    this.resolveTarget = resolveTarget
  }

  rewrite(text: string): string {
    return mapOutsideFencedBlocks(text, (segment) =>
      mapOutsideInlineCode(segment, (fragment) => this.rewriteFragment(fragment)),
    )
  }

  private rewriteFragment(fragment: string): string {
    return fragment.replace(
      WIKILINK_REGEX,
      (full: string, embed: string, target: string, rawAnchor?: string, alias?: string) => {
        const newTarget = this.resolveTarget(target.trim())
        if (newTarget === undefined) return full
        const anchor = rawAnchor ?? ""
        if (embed === "!") {
          return `![[${newTarget}${anchor}${alias === undefined ? "" : `|${alias}`}]]`
        }
        const display = alias ?? `${target.trim()}${anchor}`
        return `[[${newTarget}${anchor}|${display}]]`
      },
    )
  }
}

/** Opening/closing code fence (``` or ~~~, up to 3 leading spaces, CR-tolerant). */
const FENCE_LINE_REGEX = /^ {0,3}(`{3,}|~{3,})/

/**
 * Applies transform to the text between fenced code blocks; fence content
 * passes through byte-identical. Line-based so "\n" joins reconstruct the
 * input exactly (any "\r" stays attached to its line).
 */
function mapOutsideFencedBlocks(text: string, transform: (segment: string) => string): string {
  const lines = text.split("\n")
  const output: string[] = []
  let buffer: string[] = []
  let openFence: string | undefined
  const flushBuffer = () => {
    if (buffer.length > 0) {
      output.push(transform(buffer.join("\n")))
      buffer = []
    }
  }
  for (const line of lines) {
    const fence = line.match(FENCE_LINE_REGEX)?.[1]
    if (openFence === undefined && fence !== undefined) {
      flushBuffer()
      output.push(line)
      openFence = fence
    } else if (openFence !== undefined) {
      output.push(line)
      // Same fence character, at least as long -> closes the block (CommonMark).
      if (fence !== undefined && fence[0] === openFence[0] && fence.length >= openFence.length) {
        openFence = undefined
      }
    } else {
      buffer.push(line)
    }
  }
  flushBuffer()
  return output.join("\n")
}

/**
 * Inline code span: a backtick run up to the next run of the same length.
 * Conservative: masking too much only leaves a link unrewritten, which then
 * surfaces via the existing broken-link report.
 */
const INLINE_CODE_REGEX = /(`+)[\s\S]*?\1/g

function mapOutsideInlineCode(segment: string, transform: (fragment: string) => string): string {
  const parts: string[] = []
  let lastEnd = 0
  for (const match of segment.matchAll(INLINE_CODE_REGEX)) {
    parts.push(transform(segment.slice(lastEnd, match.index)))
    parts.push(match[0])
    lastEnd = match.index + match[0].length
  }
  parts.push(transform(segment.slice(lastEnd)))
  return parts.join("")
}
