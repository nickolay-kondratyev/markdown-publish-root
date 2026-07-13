import { UrlSegment } from "./urlSegment.ts"

/** A publishable doc and the raw `id` value harvested from it (undefined = absent). */
export interface HarvestedDoc {
  /** Vault-relative "/"-separated path, e.g. "notes/foo.md". */
  vaultPath: string
  /** Raw frontmatter/metadata id value — validated here, not at harvest. */
  idValue: unknown
}

/** Ids are the URL space: any inconsistency is corruption -> the build MUST fail early. */
export class DocIdValidationError extends Error {
  readonly problems: string[]

  constructor(problems: string[]) {
    super(
      `doc id validation failed (${problems.length} problem${problems.length === 1 ? "" : "s"}):\n` +
        problems.map((problem) => `  - ${problem}`).join("\n") +
        `\nFix: run \`make vault-add-ids VAULT=<vault>\` to stamp missing ids.`,
    )
    this.name = "DocIdValidationError"
    this.problems = problems
  }
}

/** Staged docs live under this directory, making every page URL /n/<url-segment>. */
export const ID_NAMESPACE_DIR = "n"

/** The vault's root index.md keeps its path so the site keeps a homepage at "/". */
const ROOT_INDEX_PATH = "index.md"

/**
 * vaultPath -> URL-segment mapping for every publishable doc, plus the derived
 * staged path each doc is copied to (plan/id-based-publishing.md §4.1-3).
 *
 * Any non-empty string id is accepted; UrlSegment derives the published
 * segment (verbatim for URL-safe ids — all ids WE generate; `lc_`/`ue_`
 * marker-prefixed forms for foreign ids needing transformation). `build`
 * hard-fails on missing/non-string/empty ids and on segment collisions —
 * BEFORE any Quartz invocation — listing every offending file.
 */
export class IdMap {
  private readonly urlSegmentByVaultPath: Map<string, string>

  private constructor(urlSegmentByVaultPath: Map<string, string>) {
    this.urlSegmentByVaultPath = urlSegmentByVaultPath
  }

  static build(docs: HarvestedDoc[]): IdMap {
    const problems: string[] = []
    const docsBySegment = new Map<string, { vaultPath: string; rawId: string }[]>()
    const map = new Map<string, string>()
    for (const doc of docs) {
      if (doc.idValue === undefined) {
        problems.push(`${doc.vaultPath}: missing id`)
        continue
      }
      if (typeof doc.idValue !== "string" || doc.idValue.length === 0) {
        problems.push(`${doc.vaultPath}: invalid id [${String(doc.idValue)}] (must be a non-empty string)`)
        continue
      }
      const urlSegment = UrlSegment.deriveFrom(doc.idValue)
      map.set(doc.vaultPath, urlSegment)
      docsBySegment.set(urlSegment, [
        ...(docsBySegment.get(urlSegment) ?? []),
        { vaultPath: doc.vaultPath, rawId: doc.idValue },
      ])
    }
    // Collide on DERIVED segments, not raw ids: e.g. ids [Foo] and [foo] both
    // publish at lc_foo/foo-adjacent URLs and must be rejected together.
    for (const [urlSegment, collidingDocs] of docsBySegment) {
      if (collidingDocs.length > 1) {
        const described = collidingDocs.map((d) => `${d.vaultPath} (id [${d.rawId}])`).join(", ")
        problems.push(`url-segment collision [${urlSegment}] in: ${described}`)
      }
    }
    if (problems.length > 0) throw new DocIdValidationError(problems)
    return new IdMap(map)
  }

  /** Published URL segment of a doc; undefined for anything else (assets, unknown paths). */
  urlSegmentOf(vaultPath: string): string | undefined {
    return this.urlSegmentByVaultPath.get(vaultPath)
  }

  /**
   * Where the doc is copied inside the staging dir. Extension-preserving on
   * purpose: Quartz + canvas plugin slug logic stays untouched (plan §6.1).
   */
  stagedPathOf(vaultPath: string): string {
    if (vaultPath === ROOT_INDEX_PATH) return ROOT_INDEX_PATH
    const urlSegment = this.urlSegmentByVaultPath.get(vaultPath)
    if (urlSegment === undefined) {
      throw new Error(`stagedPathOf called for a non-doc path: ${vaultPath}`)
    }
    const extension = vaultPath.slice(vaultPath.lastIndexOf("."))
    return `${ID_NAMESPACE_DIR}/${urlSegment}${extension}`
  }

  /** All mapped docs as [vaultPath, urlSegment] pairs (insertion order). */
  entries(): [string, string][] {
    return [...this.urlSegmentByVaultPath.entries()]
  }
}
