import { FrontmatterReader } from "./frontmatter.ts"

/** Options for one markdown staging transform. */
export interface MarkdownTransformOptions {
  /**
   * Title injected when frontmatter has none — the ORIGINAL basename, so
   * pages/graph/search never display raw docids (plan/id-based-publishing.md §4.4).
   * An existing `title` always wins; this transform then injects nothing.
   */
  titleWhenAbsent: string
  /** Wikilink rewriting applied to the body ONLY (frontmatter is never rewritten). */
  rewriteBody: (body: string) => string
}

/**
 * Transforms one publishable markdown doc on its way into the staging dir:
 * title injection + body wikilink rewrite. Pure text transform.
 *
 * Precondition: the doc passed id validation, so frontmatter EXISTS (the id
 * lives there) — enforced by IdMap.build before any transform runs.
 */
export class MarkdownStagingTransformer {
  static transform(markdown: string, options: MarkdownTransformOptions): string {
    const split = splitAtFrontmatterEnd(markdown)
    if (split === undefined) {
      throw new Error("markdown staging transform requires frontmatter (id validation ran first)")
    }
    let frontmatterRegion = split.frontmatterRegion
    if (!FrontmatterReader.readDocFields(markdown).hasTitle) {
      const opener = frontmatterRegion.match(/^---[^\S\r\n]*\r?\n/)
      if (opener === null) throw new Error("frontmatter opener not found (inconsistent parse)")
      const eol = frontmatterRegion.includes("\r\n") ? "\r\n" : "\n"
      // JSON.stringify = safe YAML double-quoted scalar for arbitrary basenames.
      frontmatterRegion =
        frontmatterRegion.slice(0, opener[0].length) +
        `title: ${JSON.stringify(options.titleWhenAbsent)}${eol}` +
        frontmatterRegion.slice(opener[0].length)
    }
    return frontmatterRegion + options.rewriteBody(split.body)
  }
}

/**
 * Splits markdown into the frontmatter region (fences included, trailing
 * newline attached) and the body. Line-based, mirroring the block grammar of
 * FrontmatterReader (engine/src/frontmatter.ts). undefined = no frontmatter.
 */
function splitAtFrontmatterEnd(
  markdown: string,
): { frontmatterRegion: string; body: string } | undefined {
  const lines = markdown.split(/(?<=\n)/) // keep line terminators attached
  if (lines[0]?.trim() !== "---") return undefined
  let offset = lines[0].length
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i] as string
    offset += line.length
    if (line.trim() === "---" || line.trim() === "...") {
      return { frontmatterRegion: markdown.slice(0, offset), body: markdown.slice(offset) }
    }
  }
  return undefined
}
