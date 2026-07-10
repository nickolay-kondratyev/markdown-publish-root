import type { IdMap } from "./idMap.ts"

/** Options for one canvas staging transform. */
export interface CanvasTransformOptions {
  /** Validated docid map — file-node targets are remapped through it. */
  idMap: IdMap
  /** Original canvas basename (no extension) — injected as metadata title when absent. */
  originalBasename: string
  /** Wikilink rewriting applied to every text node. */
  rewriteText: (text: string) => string
}

/**
 * Transforms one publishable canvas on its way into the staging dir
 * (plan/id-based-publishing.md §4.6):
 *   - `file` nodes targeting id-bearing docs -> their staged `n/<docid>.*` path
 *     (unresolvable targets stay untouched: the plugin's privacy placeholder
 *     fails closed downstream)
 *   - wikilinks inside text nodes -> docid form (shared rewriter)
 *   - `metadata.frontmatter.title` <- original basename when absent, so the
 *     canvas page/graph/search never display a raw docid
 *
 * The staged copy is engine-serialized JSON — its formatting is irrelevant
 * (temp file consumed by Quartz only; the vault file is never touched).
 */
export class CanvasStagingTransformer {
  static transform(raw: string, options: CanvasTransformOptions): string {
    const canvas = JSON.parse(raw) as Record<string, any>
    canvas.metadata ??= {}
    canvas.metadata.frontmatter ??= {}
    canvas.metadata.frontmatter.title ??= options.originalBasename
    for (const node of canvas.nodes ?? []) {
      if (node?.type === "file" && typeof node.file === "string") {
        if (options.idMap.docIdOf(node.file) !== undefined) {
          node.file = options.idMap.stagedPathOf(node.file)
        }
      } else if (node?.type === "text" && typeof node.text === "string") {
        node.text = options.rewriteText(node.text)
      }
    }
    return JSON.stringify(canvas, null, "\t")
  }
}
