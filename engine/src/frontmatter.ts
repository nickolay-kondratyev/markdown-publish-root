import { parse as parseYaml } from "yaml"

/** Frontmatter key controlling the publish filter (matches Obsidian Publish convention). */
export const PUBLISH_FRONTMATTER_KEY = "publish"
/** Frontmatter key carrying the stable docid (plan/id-based-publishing.md §2). */
export const ID_FRONTMATTER_KEY = "id"
/** Frontmatter key for the human-readable page title (injected at staging when absent). */
export const TITLE_FRONTMATTER_KEY = "title"
/**
 * RESERVED frontmatter key: the ORIGINAL vault-relative path, injected at
 * staging (plan/folder-nav-over-id-urls.md §4.1). Vault docs must not declare
 * it — VaultStager hard-fails the build when they do.
 */
export const VINTRIN_PATH_FRONTMATTER_KEY = "vintrinPath"

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

/** All frontmatter fields the engine cares about, read in one pass. */
export interface DocFrontmatterRead extends PublishFlagRead {
  /** Raw `id` value (validated by IdMap, not here); undefined when absent. */
  idValue: unknown
  /** Whether an explicit `title` exists (staging injects one when it does not). */
  hasTitle: boolean
  /** Whether the RESERVED `vintrinPath` key is declared (a publishable doc doing so fails the build). */
  declaresVintrinPath: boolean
}

const FRONTMATTER_DELIMITER = "---"

/** Reads engine-relevant frontmatter fields from raw markdown. */
export class FrontmatterReader {
  static readPublishFlag(markdown: string): PublishFlagRead {
    const { publish, malformed } = FrontmatterReader.readDocFields(markdown)
    return { publish, malformed }
  }

  static readDocFields(markdown: string): DocFrontmatterRead {
    const block = extractFrontmatterBlock(markdown)
    if (block === undefined) {
      return EMPTY_DOC_FIELDS
    }
    let data: unknown
    try {
      data = parseYaml(block)
    } catch {
      return { ...EMPTY_DOC_FIELDS, malformed: true }
    }
    if (typeof data !== "object" || data === null) {
      return EMPTY_DOC_FIELDS
    }
    const fields = data as Record<string, unknown>
    return {
      publish: readPublishValue(fields[PUBLISH_FRONTMATTER_KEY]),
      malformed: false,
      idValue: fields[ID_FRONTMATTER_KEY],
      hasTitle: fields[TITLE_FRONTMATTER_KEY] !== undefined,
      declaresVintrinPath: fields[VINTRIN_PATH_FRONTMATTER_KEY] !== undefined,
    }
  }
}

const EMPTY_DOC_FIELDS: DocFrontmatterRead = {
  publish: undefined,
  malformed: false,
  idValue: undefined,
  hasTitle: false,
  declaresVintrinPath: false,
}

function readPublishValue(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value
  // Obsidian's Publish UI writes strings in some versions; accept them explicitly.
  if (value === "true") return true
  if (value === "false") return false
  return undefined
}

/**
 * Returns the YAML between leading `---` fences, or undefined when there is none.
 * Exported for the id-addition script (scripts/add-doc-ids.mjs) — one grammar
 * for "what is a frontmatter block" across the repo.
 */
export function extractFrontmatterBlock(markdown: string): string | undefined {
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
