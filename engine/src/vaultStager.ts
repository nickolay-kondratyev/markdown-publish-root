import fs from "node:fs"
import path from "node:path"
import { CanvasStagingTransformer } from "./canvasStagingTransform.ts"
import {
  FrontmatterReader,
  VINTRIN_PATH_FRONTMATTER_KEY,
  type DocFrontmatterRead,
} from "./frontmatter.ts"
import { IdMap, type HarvestedDoc } from "./idMap.ts"
import { MarkdownStagingTransformer } from "./markdownStagingTransform.ts"
import { PublishFilter, isCanvasPath, isMarkdownPath } from "./publishFilter.ts"
import { StagingLinkIndex } from "./stagingLinkIndex.ts"
import { WikilinkRewriter } from "./wikilinkRewriter.ts"

/** What got staged (vault-relative "/"-separated ORIGINAL paths). */
export interface StagingResult {
  stagedMarkdownFiles: string[]
  stagedCanvasFiles: string[]
  stagedAssetFiles: string[]
  excludedFiles: string[]
  /** Human-readable issues that did not stop the build (e.g. malformed frontmatter, fail-closed). */
  warnings: string[]
  /** ORIGINAL vault path -> path inside the staging dir (docs land at n/<docid>.*). */
  stagedPathByVaultPath: Record<string, string>
}

/** One publishable doc awaiting transform+write (content kept from the decide pass). */
interface DocToStage {
  vaultPath: string
  content: string
  kind: "markdown" | "canvas"
}

/**
 * A publishable vault doc declares a frontmatter key the engine injects at
 * staging (`vintrinPath`) — the build MUST fail before anything is written,
 * naming every offender (plan/folder-nav-over-id-urls.md §4.1).
 */
export class ReservedFrontmatterKeyError extends Error {
  readonly offendingFiles: string[]

  constructor(offendingFiles: string[]) {
    super(
      `reserved frontmatter key "${VINTRIN_PATH_FRONTMATTER_KEY}" declared by ` +
        `${offendingFiles.length} publishable doc(s) — the engine injects it at staging:\n` +
        offendingFiles.map((file) => `  - ${file}`).join("\n") +
        `\nFix: rename the key in these vault files.`,
    )
    this.name = "ReservedFrontmatterKeyError"
    this.offendingFiles = offendingFiles
  }
}

/**
 * Copies ONLY publishable vault files into a staging directory.
 *
 * Staging-exclusion is the privacy enforcement mechanism: Quartz only ever
 * sees the staging directory, so unpublished content cannot leak into the
 * output (plan/main.md §4.4; validation-pass backstop lands in Phase 3).
 *
 * Since id-based publishing (plan/id-based-publishing.md), staging is ALSO the
 * id transformation surface: docs are staged under `n/<docid>.*` (root
 * index.md excepted), titles are injected, and wikilinks / canvas file nodes
 * are rewritten to docid targets. Ids are validated hard BEFORE anything is
 * written — missing/malformed/duplicate ids throw DocIdValidationError.
 */
export class VaultStager {
  private readonly filter: PublishFilter

  constructor(filter: PublishFilter) {
    this.filter = filter
  }

  /** Walks vaultDir and stages publishable files into stagingDir (created if missing). */
  stage(vaultDir: string, stagingDir: string): StagingResult {
    const result: StagingResult = {
      stagedMarkdownFiles: [],
      stagedCanvasFiles: [],
      stagedAssetFiles: [],
      excludedFiles: [],
      warnings: [],
      stagedPathByVaultPath: {},
    }
    // Pass 1: decide + harvest. No writes yet — validation must be able to
    // fail the build before ANY staging output exists.
    const docs: DocToStage[] = []
    const harvested: HarvestedDoc[] = []
    const reservedKeyOffenders: string[] = []
    for (const relPath of listFilesRecursively(vaultDir)) {
      const doc = this.decide(vaultDir, relPath, result, harvested, reservedKeyOffenders)
      if (doc !== undefined) docs.push(doc)
    }

    // Pass 2: validate (each throws listing every offender): reserved keys,
    // then ids (DocIdValidationError).
    if (reservedKeyOffenders.length > 0) {
      throw new ReservedFrontmatterKeyError(reservedKeyOffenders)
    }
    const idMap = IdMap.build(harvested)

    // Pass 3: transform + write.
    fs.mkdirSync(stagingDir, { recursive: true })
    const allStagedVaultPaths = [
      ...docs.map((doc) => doc.vaultPath),
      ...result.stagedAssetFiles,
    ]
    const linkIndex = new StagingLinkIndex(idMap, allStagedVaultPaths)
    for (const doc of docs) {
      const stagedPath = idMap.stagedPathOf(doc.vaultPath)
      result.stagedPathByVaultPath[doc.vaultPath] = stagedPath
      const rewriter = new WikilinkRewriter(linkIndex.resolverFor(doc.vaultPath))
      const transformed =
        doc.kind === "markdown"
          ? MarkdownStagingTransformer.transform(doc.content, {
              titleWhenAbsent: basenameWithoutExtension(doc.vaultPath),
              vintrinPath: doc.vaultPath,
              rewriteBody: (body) => rewriter.rewrite(body),
            })
          : CanvasStagingTransformer.transform(doc.content, {
              idMap,
              originalBasename: basenameWithoutExtension(doc.vaultPath),
              vintrinPath: doc.vaultPath,
              rewriteText: (text) => rewriter.rewrite(text),
            })
      writeStagedFile(stagingDir, stagedPath, transformed)
    }
    for (const assetPath of result.stagedAssetFiles) {
      result.stagedPathByVaultPath[assetPath] = assetPath
      copyPreservingStructure(vaultDir, stagingDir, assetPath)
    }
    return result
  }

  /**
   * Classifies one file: publishable doc (returned for staging), publishable
   * asset (recorded), or excluded. Publishable docs get their id harvested
   * and reserved-key (`vintrinPath`) declarations recorded.
   */
  private decide(
    vaultDir: string,
    relPath: string,
    result: StagingResult,
    harvested: HarvestedDoc[],
    reservedKeyOffenders: string[],
  ): DocToStage | undefined {
    if (isCanvasPath(relPath)) {
      if (!this.filter.isCanvasPublished(relPath)) {
        result.excludedFiles.push(relPath)
        return undefined
      }
      const content = fs.readFileSync(path.join(vaultDir, relPath), "utf-8")
      const metadata = readCanvasDocMetadata(content)
      if (metadata === MALFORMED_CANVAS) {
        // Fail closed, mirroring malformed md frontmatter: unreadable JSON
        // cannot prove it is publishable — exclude it, do not hard-fail.
        result.warnings.push(`${relPath}: malformed canvas JSON — treated as NOT publishable`)
        result.excludedFiles.push(relPath)
        return undefined
      }
      if (metadata.declaresVintrinPath) reservedKeyOffenders.push(relPath)
      result.stagedCanvasFiles.push(relPath)
      harvested.push({ vaultPath: relPath, idValue: metadata.idValue })
      return { vaultPath: relPath, content, kind: "canvas" }
    }
    if (!isMarkdownPath(relPath)) {
      if (this.filter.isAssetPublished(relPath)) {
        result.stagedAssetFiles.push(relPath)
      } else {
        result.excludedFiles.push(relPath)
      }
      return undefined
    }
    const content = fs.readFileSync(path.join(vaultDir, relPath), "utf-8")
    const fields: DocFrontmatterRead = FrontmatterReader.readDocFields(content)
    if (fields.malformed) {
      // Fail closed: an unreadable frontmatter block might contain `publish: false`.
      result.warnings.push(`${relPath}: malformed frontmatter — treated as NOT publishable`)
      result.excludedFiles.push(relPath)
      return undefined
    }
    if (!this.filter.isMarkdownPublished(relPath, fields.publish)) {
      result.excludedFiles.push(relPath)
      return undefined
    }
    if (fields.declaresVintrinPath) reservedKeyOffenders.push(relPath)
    result.stagedMarkdownFiles.push(relPath)
    harvested.push({ vaultPath: relPath, idValue: fields.idValue })
    return { vaultPath: relPath, content, kind: "markdown" }
  }
}

/** Sentinel: canvas JSON could not be parsed (distinct from "id absent"). */
const MALFORMED_CANVAS = Symbol("malformed-canvas")

/** Engine-relevant canvas metadata (canvas analogue of DocFrontmatterRead). */
interface CanvasDocMetadata {
  idValue: unknown
  declaresVintrinPath: boolean
}

function readCanvasDocMetadata(content: string): CanvasDocMetadata | typeof MALFORMED_CANVAS {
  try {
    const parsed = JSON.parse(content)
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return MALFORMED_CANVAS
    }
    const frontmatter = parsed.metadata?.frontmatter
    return {
      idValue: frontmatter?.id,
      declaresVintrinPath: frontmatter?.[VINTRIN_PATH_FRONTMATTER_KEY] !== undefined,
    }
  } catch {
    return MALFORMED_CANVAS
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

function basenameWithoutExtension(relPath: string): string {
  const base = relPath.split("/").at(-1) ?? relPath
  return base.replace(/\.[^.]+$/, "")
}

function writeStagedFile(stagingDir: string, stagedPath: string, content: string): void {
  const target = path.join(stagingDir, stagedPath)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, content)
}

function copyPreservingStructure(fromDir: string, toDir: string, relPath: string): void {
  const target = path.join(toDir, relPath)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.copyFileSync(path.join(fromDir, relPath), target)
}
