import { DocId } from "./docId.ts"

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

/** Staged docs live under this directory, making every page URL /n/<docid>. */
export const ID_NAMESPACE_DIR = "n"

/** The vault's root index.md keeps its path so the site keeps a homepage at "/". */
const ROOT_INDEX_PATH = "index.md"

/**
 * vaultPath -> docid mapping for every publishable doc, plus the derived
 * staged path each doc is copied to (plan/id-based-publishing.md §4.1-3).
 * `build` hard-fails on missing, malformed, or duplicate ids — BEFORE any
 * Quartz invocation — listing every offending file.
 */
export class IdMap {
  private readonly docIdByVaultPath: Map<string, string>

  private constructor(docIdByVaultPath: Map<string, string>) {
    this.docIdByVaultPath = docIdByVaultPath
  }

  static build(docs: HarvestedDoc[]): IdMap {
    const problems: string[] = []
    const byId = new Map<string, string[]>()
    const map = new Map<string, string>()
    for (const doc of docs) {
      if (doc.idValue === undefined) {
        problems.push(`${doc.vaultPath}: missing id`)
        continue
      }
      if (!DocId.isValid(doc.idValue)) {
        problems.push(`${doc.vaultPath}: malformed id [${String(doc.idValue)}]`)
        continue
      }
      map.set(doc.vaultPath, doc.idValue)
      byId.set(doc.idValue, [...(byId.get(doc.idValue) ?? []), doc.vaultPath])
    }
    for (const [docId, vaultPaths] of byId) {
      if (vaultPaths.length > 1) {
        problems.push(`duplicate id [${docId}] in: ${vaultPaths.join(", ")}`)
      }
    }
    if (problems.length > 0) throw new DocIdValidationError(problems)
    return new IdMap(map)
  }

  /** docid of a publishable doc; undefined for anything else (assets, unknown paths). */
  docIdOf(vaultPath: string): string | undefined {
    return this.docIdByVaultPath.get(vaultPath)
  }

  /**
   * Where the doc is copied inside the staging dir. Extension-preserving on
   * purpose: Quartz + canvas plugin slug logic stays untouched (plan §6.1).
   */
  stagedPathOf(vaultPath: string): string {
    if (vaultPath === ROOT_INDEX_PATH) return ROOT_INDEX_PATH
    const docId = this.docIdByVaultPath.get(vaultPath)
    if (docId === undefined) {
      throw new Error(`stagedPathOf called for a non-doc path: ${vaultPath}`)
    }
    const extension = vaultPath.slice(vaultPath.lastIndexOf("."))
    return `${ID_NAMESPACE_DIR}/${docId}${extension}`
  }

  /** All mapped docs as [vaultPath, docId] pairs (insertion order). */
  entries(): [string, string][] {
    return [...this.docIdByVaultPath.entries()]
  }
}
