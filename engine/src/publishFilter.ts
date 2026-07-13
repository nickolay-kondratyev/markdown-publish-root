import type { PublishFilterRules } from "./siteConfig.ts"

const MARKDOWN_EXTENSION = ".md"
const CANVAS_EXTENSION = ".canvas"

/**
 * Decides which vault files are publishable. Pure decision logic — no I/O.
 *
 * Precedence (first match wins; full prose in engine/README.md and
 * docs/publish-exclusion.md):
 *   1. hidden path segment (leading ".", e.g. .obsidian/)  -> NOT published
 *   2. path contains "private" anywhere (case-insensitive) -> NOT published
 *   3. under an excludeFolder                              -> NOT published
 *   4. markdown with frontmatter `publish: false`          -> NOT published
 *      (malformed frontmatter fails closed, same outcome)
 *   5. markdown with frontmatter `publish: true`           -> published
 *   6. markdown under an includeFolder OR publishAll       -> published
 *   7. other markdown                                      -> NOT published
 *   8. canvas under an includeFolder OR publishAll         -> published
 *   9. other canvas                                        -> NOT published
 *  10. non-markdown, non-canvas asset                      -> published
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
    return this.isIncludedByDefault(relPath)
  }

  /** Decision for a `.canvas` file (frontmatter is N/A for canvas JSON). */
  isCanvasPublished(relPath: string): boolean {
    if (this.isAlwaysExcluded(relPath)) return false
    return this.isIncludedByDefault(relPath)
  }

  /** Decision for a non-markdown, non-canvas asset (images, PDFs, ...). */
  isAssetPublished(relPath: string): boolean {
    return !this.isAlwaysExcluded(relPath)
  }

  /** Rules 6/8: content-bearing files opt in via publishAll or an includeFolder. */
  private isIncludedByDefault(relPath: string): boolean {
    if (this.rules.publishAll === true) return true
    return this.isUnderAny(relPath, this.rules.includeFolders)
  }

  /** Rules 1-3: exclusions that win over everything (incl. `publish: true`). */
  private isAlwaysExcluded(relPath: string): boolean {
    if (hasHiddenSegment(relPath)) return true
    if (hasPrivateMarker(relPath)) return true
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

/**
 * Name-based privacy rule (docs/publish-exclusion.md): a path containing
 * "private" anywhere (case-insensitive) is never published. Deliberately
 * substring + case-insensitive — a privacy rule fails closed. Whole-path
 * matching equals per-segment matching: the marker has no "/", so it can
 * never span a segment boundary.
 */
const PRIVATE_MARKER = "private"

function hasPrivateMarker(relPath: string): boolean {
  return relPath.toLowerCase().includes(PRIVATE_MARKER)
}
