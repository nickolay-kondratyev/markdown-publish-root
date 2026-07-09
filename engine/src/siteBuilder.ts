import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { PublishFilter } from "./publishFilter.ts"
import { QuartzConfigGenerator } from "./quartzConfigGenerator.ts"
import { QuartzRunner } from "./quartzRunner.ts"
import type { SiteConfig } from "./siteConfig.ts"
import { VaultStager, type StagingResult } from "./vaultStager.ts"

/** Input to a site build. */
export interface BuildSiteOptions {
  /** Absolute path to the Obsidian vault (read-only input). */
  vaultDir: string
  /** Validated site settings (use SiteConfigParser at the boundary). */
  siteConfig: SiteConfig
  /** Where the static site is written. */
  outDir: string
  /**
   * Optional staging directory override. Default: a fresh directory under
   * os.tmpdir(). MUST NOT live under a gitignored path of a git repo —
   * Quartz's content glob honors .gitignore and would see 0 files
   * (Phase 0 gotcha G2; verified empirically again in Phase 1).
   */
  stagingDir?: string
  /** Keep the staging directory after the build (debugging). Default: delete it. */
  keepStaging?: boolean
}

/** Result of a successful build. */
export interface BuildSiteResult {
  outDir: string
  staging: StagingResult
  /** Where publishable files were staged (deleted unless keepStaging). */
  stagingDir: string
}

const STAGING_DIR_PREFIX = "publish-staging-"

/**
 * The engine entry point: a pure `(vault, site config) -> static site dir`
 * build (plan/main.md §3). No AWS, auth, or tenancy in here — ever.
 *
 * Pipeline: stage publishable files (VaultStager) -> generate quartz.config.yaml
 * (QuartzConfigGenerator) -> run the vendored Quartz CLI (QuartzRunner).
 */
export class SiteBuilder {
  private readonly runner: QuartzRunner

  /** @param quartzDir override for the vendored Quartz checkout (default: <repo>/vendor/quartz). */
  constructor(quartzDir: string = defaultQuartzDir()) {
    this.runner = new QuartzRunner(quartzDir)
  }

  /** Builds the static site. Throws (with actionable messages) on any failure. */
  async buildSite(options: BuildSiteOptions): Promise<BuildSiteResult> {
    if (!fs.existsSync(options.vaultDir) || !fs.statSync(options.vaultDir).isDirectory()) {
      throw new Error(`vault directory not found: ${options.vaultDir}`)
    }
    this.runner.assertReady()

    const stagingDir =
      options.stagingDir ?? fs.mkdtempSync(path.join(os.tmpdir(), STAGING_DIR_PREFIX))
    try {
      const filter = new PublishFilter(options.siteConfig.publishFilter)
      const staging = new VaultStager(filter).stage(options.vaultDir, stagingDir)

      this.runner.writeConfig(QuartzConfigGenerator.generateYaml(options.siteConfig))
      const buildOutput = this.runner.build(path.resolve(stagingDir), path.resolve(options.outDir))
      assertQuartzSawStagedContent(buildOutput.stdout, staging, stagingDir)

      return { outDir: path.resolve(options.outDir), staging, stagingDir }
    } finally {
      if (options.keepStaging !== true) {
        fs.rmSync(stagingDir, { recursive: true, force: true })
      }
    }
  }
}

/**
 * Guard for gotcha G2: Quartz's content glob honors .gitignore, so a shadowed
 * staging dir makes Quartz silently build an empty site. We staged N markdown
 * files; if Quartz reports finding 0, something ate them — fail loudly.
 */
function assertQuartzSawStagedContent(
  quartzStdout: string,
  staging: StagingResult,
  stagingDir: string,
): void {
  if (staging.stagedMarkdownFiles.length === 0) return
  if (/Found 0 input files/.test(quartzStdout)) {
    throw new Error(
      `Quartz found 0 input files but ${staging.stagedMarkdownFiles.length} markdown file(s) were staged at ${stagingDir}. ` +
        `Most likely the staging directory is shadowed by a .gitignore of an enclosing git repo ` +
        `(Quartz's content glob honors .gitignore). Use a staging dir outside any git repo.`,
    )
  }
}

function defaultQuartzDir(): string {
  // engine/src/ -> repo root -> vendor/quartz
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "vendor", "quartz")
}
