import { parse as parseYaml } from "yaml"

/** Frontmatter key controlling the publish filter (matches Obsidian Publish convention). */
export const PUBLISH_FRONTMATTER_KEY = "publish"

/** Result of reading the publish flag from a markdown file. */
export interface PublishFlagRead {
  /** true / false when explicitly set; undefined when absent or no frontmatter. */
  publish: boolean | undefined
  /**
   * true when a frontmatter block exists but could not be parsed.
   * Callers MUST fail closed (treat as not publishable): a malformed block
   * might contain `publish: false` we could not read.
   */
  malformed: boolean
}

const FRONTMATTER_DELIMITER = "---"

/** Reads the `publish` frontmatter flag from raw markdown. */
export class FrontmatterReader {
  static readPublishFlag(markdown: string): PublishFlagRead {
    const block = extractFrontmatterBlock(markdown)
    if (block === undefined) return { publish: undefined, malformed: false }

    let data: unknown
    try {
      data = parseYaml(block)
    } catch {
      return { publish: undefined, malformed: true }
    }
    if (typeof data !== "object" || data === null) {
      return { publish: undefined, malformed: false }
    }
    const value = (data as Record<string, unknown>)[PUBLISH_FRONTMATTER_KEY]
    if (typeof value === "boolean") return { publish: value, malformed: false }
    // Obsidian's Publish UI writes strings in some versions; accept them explicitly.
    if (value === "true") return { publish: true, malformed: false }
    if (value === "false") return { publish: false, malformed: false }
    return { publish: undefined, malformed: false }
  }
}

/** Returns the YAML between leading `---` fences, or undefined when there is none. */
function extractFrontmatterBlock(markdown: string): string | undefined {
  const lines = markdown.split(/\r?\n/)
  if (lines[0]?.trim() !== FRONTMATTER_DELIMITER) return undefined
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i] ?? ""
    if (line.trim() === FRONTMATTER_DELIMITER || line.trim() === "...") {
      return lines.slice(1, i).join("\n")
    }
  }
  return undefined // opening fence without closing fence: not frontmatter
}
