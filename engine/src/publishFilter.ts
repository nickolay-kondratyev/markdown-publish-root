import type { PublishFilterRules } from "./siteConfig.ts"

/**
 * Phase 1: canvases are never staged; the generated Quartz config also disables
 * the official canvas-page plugin so nothing claims them. Phase 2 (our own
 * pageType plugin, ADR 0001) removes this exclusion.
 */
export const PHASE1_EXCLUDED_EXTENSIONS: readonly string[] = [".canvas"]

const MARKDOWN_EXTENSION = ".md"

/**
 * Decides which vault files are publishable. Pure decision logic — no I/O.
 *
 * Precedence (first match wins; full prose in engine/README.md):
 *   1. hidden path segment (leading ".", e.g. .obsidian/)  -> NOT published
 *   2. `.canvas` file (Phase 1 only)                       -> NOT published
 *   3. under an excludeFolder                              -> NOT published
 *   4. markdown with frontmatter `publish: false`          -> NOT published
 *      (malformed frontmatter fails closed, same outcome)
 *   5. markdown with frontmatter `publish: true`           -> published
 *   6. markdown under an includeFolder                     -> published
 *   7. other markdown                                      -> NOT published
 *   8. non-markdown asset                                  -> published
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

  /** Decision for a non-markdown asset (images, PDFs, ...). */
  isAssetPublished(relPath: string): boolean {
    return !this.isAlwaysExcluded(relPath)
  }

  /** Rules 1-3: exclusions that win over everything (incl. `publish: true`). */
  private isAlwaysExcluded(relPath: string): boolean {
    if (hasHiddenSegment(relPath)) return true
    if (PHASE1_EXCLUDED_EXTENSIONS.some((ext) => relPath.endsWith(ext))) return true
    return this.isUnderAny(relPath, this.rules.excludeFolders)
  }

  private isUnderAny(relPath: string, folders: string[]): boolean {
    return folders.some((folder) => relPath === folder || relPath.startsWith(folder + "/"))
  }
}

export function isMarkdownPath(relPath: string): boolean {
  return relPath.endsWith(MARKDOWN_EXTENSION)
}

function hasHiddenSegment(relPath: string): boolean {
  return relPath.split("/").some((segment) => segment.startsWith("."))
}
