import fs from "node:fs"
import path from "node:path"
import { FrontmatterReader } from "./frontmatter.ts"
import { PublishFilter, isMarkdownPath } from "./publishFilter.ts"

/** What got staged (vault-relative "/"-separated paths). */
export interface StagingResult {
  stagedMarkdownFiles: string[]
  stagedAssetFiles: string[]
  excludedFiles: string[]
  /** Human-readable issues that did not stop the build (e.g. malformed frontmatter, fail-closed). */
  warnings: string[]
}

/**
 * Copies ONLY publishable vault files into a staging directory.
 *
 * Staging-exclusion is the privacy enforcement mechanism: Quartz only ever
 * sees the staging directory, so unpublished content cannot leak into the
 * output (plan/main.md §4.4; validation-pass backstop lands in Phase 3).
 */
export class VaultStager {
  private readonly filter: PublishFilter

  constructor(filter: PublishFilter) {
    this.filter = filter
  }

  /** Walks vaultDir and copies publishable files into stagingDir (created if missing). */
  stage(vaultDir: string, stagingDir: string): StagingResult {
    const result: StagingResult = {
      stagedMarkdownFiles: [],
      stagedAssetFiles: [],
      excludedFiles: [],
      warnings: [],
    }
    fs.mkdirSync(stagingDir, { recursive: true })
    for (const relPath of listFilesRecursively(vaultDir)) {
      if (this.decide(vaultDir, relPath, result)) {
        copyPreservingStructure(vaultDir, stagingDir, relPath)
      } else {
        result.excludedFiles.push(relPath)
      }
    }
    return result
  }

  private decide(vaultDir: string, relPath: string, result: StagingResult): boolean {
    if (!isMarkdownPath(relPath)) {
      if (this.filter.isAssetPublished(relPath)) {
        result.stagedAssetFiles.push(relPath)
        return true
      }
      return false
    }
    const markdown = fs.readFileSync(path.join(vaultDir, relPath), "utf-8")
    const flag = FrontmatterReader.readPublishFlag(markdown)
    if (flag.malformed) {
      // Fail closed: an unreadable frontmatter block might contain `publish: false`.
      result.warnings.push(`${relPath}: malformed frontmatter — treated as NOT publishable`)
      return false
    }
    if (this.filter.isMarkdownPublished(relPath, flag.publish)) {
      result.stagedMarkdownFiles.push(relPath)
      return true
    }
    return false
  }
}

/** Vault-relative "/"-separated paths of every regular file under dir. */
function listFilesRecursively(dir: string): string[] {
  const files: string[] = []
  const walk = (subDir: string) => {
    for (const entry of fs.readdirSync(subDir, { withFileTypes: true })) {
      const absolute = path.join(subDir, entry.name)
      if (entry.isDirectory()) walk(absolute)
      else if (entry.isFile()) files.push(path.relative(dir, absolute).split(path.sep).join("/"))
    }
  }
  walk(dir)
  return files.sort()
}

function copyPreservingStructure(fromDir: string, toDir: string, relPath: string): void {
  const target = path.join(toDir, relPath)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.copyFileSync(path.join(fromDir, relPath), target)
}
