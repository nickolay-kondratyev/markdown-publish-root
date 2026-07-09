import type { PublishFilterRules } from "./siteConfig.ts"

const MARKDOWN_EXTENSION = ".md"
const CANVAS_EXTENSION = ".canvas"

/**
 * Decides which vault files are publishable. Pure decision logic — no I/O.
 *
 * Precedence (first match wins; full prose in engine/README.md):
 *   1. hidden path segment (leading ".", e.g. .obsidian/)  -> NOT published
 *   2. under an excludeFolder                              -> NOT published
 *   3. markdown with frontmatter `publish: false`          -> NOT published
 *      (malformed frontmatter fails closed, same outcome)
 *   4. markdown with frontmatter `publish: true`           -> published
 *   5. markdown under an includeFolder                     -> published
 *   6. other markdown                                      -> NOT published
 *   7. canvas under an includeFolder                       -> published
 *   8. other canvas                                        -> NOT published
 *   9. non-markdown, non-canvas asset                      -> published
 *
 * Canvas rationale (Phase 2, plan §4.4 + ADR 0001): canvas JSON carries
 * authored content but has NO frontmatter, so folder rules are its only
 * opt-in surface — content-bearing files stay default-deny like markdown,
 * while dumb assets stay default-allow.
 */
export class PublishFilter {
  private readonly rules: PublishFilterRules

  constructor(rules: PublishFilterRules) {
    this.rules = rules
  }

  /**
   * Decision for a markdown file.
   * @param relPath vault-relative "/"-separated path
   * @param publishFlag frontmatter `publish` value; undefined = absent OR malformed
   *                    (malformed must be passed as undefined by the caller — never true)
   */
  isMarkdownPublished(relPath: string, publishFlag: boolean | undefined): boolean {
    if (this.isAlwaysExcluded(relPath)) return false
    if (publishFlag === false) return false
    if (publishFlag === true) return true
    return this.isUnderAny(relPath, this.rules.includeFolders)
  }

  /** Decision for a `.canvas` file (frontmatter is N/A for canvas JSON). */
  isCanvasPublished(relPath: string): boolean {
    if (this.isAlwaysExcluded(relPath)) return false
    return this.isUnderAny(relPath, this.rules.includeFolders)
  }

  /** Decision for a non-markdown, non-canvas asset (images, PDFs, ...). */
  isAssetPublished(relPath: string): boolean {
    return !this.isAlwaysExcluded(relPath)
  }

  /** Rules 1-2: exclusions that win over everything (incl. `publish: true`). */
  private isAlwaysExcluded(relPath: string): boolean {
    if (hasHiddenSegment(relPath)) return true
    return this.isUnderAny(relPath, this.rules.excludeFolders)
  }

  private isUnderAny(relPath: string, folders: string[]): boolean {
    return folders.some((folder) => relPath === folder || relPath.startsWith(folder + "/"))
  }
}

export function isMarkdownPath(relPath: string): boolean {
  return relPath.endsWith(MARKDOWN_EXTENSION)
}

export function isCanvasPath(relPath: string): boolean {
  return relPath.endsWith(CANVAS_EXTENSION)
}

function hasHiddenSegment(relPath: string): boolean {
  return relPath.split("/").some((segment) => segment.startsWith("."))
}
