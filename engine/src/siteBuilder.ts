import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { CanvasLinkEnricher } from "./canvasLinkEnrichment.ts"
import { HomepageAlias } from "./homepageAlias.ts"
import { LinkMetadataResolver, type FetchLike } from "./linkMetadata.ts"
import { PublishFilter } from "./publishFilter.ts"
import { QuartzConfigGenerator } from "./quartzConfigGenerator.ts"
import { QuartzRunner } from "./quartzRunner.ts"
import { SiteChromeStyles } from "./siteChromeStyles.ts"
import type { SiteConfig } from "./siteConfig.ts"
import {
  BrokenInternalLinksError,
  PrivateContentLeakError,
  SiteValidator,
  type ValidationResult,
} from "./validation/siteValidator.ts"
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
  /**
   * Escalate broken internal links from a report to a build FAILURE
   * (BrokenInternalLinksError). Default: false — the report is returned in
   * BuildSiteResult.validation either way. Leak findings ALWAYS fail the build.
   */
  strictLinks?: boolean
  /**
   * Fetch used for publish-time link-card metadata (canvas link nodes).
   * Default: real network fetch. Tests inject a fake for determinism; fetch
   * failures NEVER fail the build (linkMetadataWarnings + domain-only cards).
   */
  linkMetadataFetcher?: FetchLike
}

/** Result of a successful build. */
export interface BuildSiteResult {
  outDir: string
  staging: StagingResult
  /** Where publishable files were staged (deleted unless keepStaging). */
  stagingDir: string
  /** Validation-pass outcome. leaks is always empty here (leaks throw instead). */
  validation: ValidationResult
  /** Non-fatal link-card metadata fetch issues (canvas link nodes). */
  linkMetadataWarnings: string[]
}

const STAGING_DIR_PREFIX = "publish-staging-"

/**
 * The engine entry point: a pure `(vault, site config) -> static site dir`
 * build (plan/main.md §3). No AWS, auth, or tenancy in here — ever.
 *
 * Pipeline: stage publishable files (VaultStager) -> generate quartz.config.yaml
 * (QuartzConfigGenerator) + custom.scss (SiteChromeStyles) -> run the vendored
 * Quartz CLI (QuartzRunner).
 */
export class SiteBuilder {
  private readonly runner: QuartzRunner
  private readonly canvasPluginDir: string

  /**
   * @param quartzDir override for the vendored Quartz checkout (default: <repo>/vendor/quartz).
   * @param canvasPluginDir override for the canvas plugin dir (default: <repo>/canvas-plugin).
   */
  constructor(
    quartzDir: string = defaultQuartzDir(),
    canvasPluginDir: string = defaultCanvasPluginDir(),
  ) {
    this.runner = new QuartzRunner(quartzDir)
    this.canvasPluginDir = canvasPluginDir
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
      if (staging.stagedCanvasFiles.length > 0) {
        this.assertViewerBundleReady()
      }
      const linkMetadataWarnings = await this.enrichCanvasLinks(options, staging, stagingDir)

      this.runner.writeConfig(
        QuartzConfigGenerator.generateYaml(options.siteConfig, {
          canvasPluginDir: this.canvasPluginDir,
        }),
      )
      this.runner.writeCustomStyles(SiteChromeStyles.scss())
      const buildOutput = this.runner.build(path.resolve(stagingDir), path.resolve(options.outDir))
      assertQuartzSawStagedContent(buildOutput.stdout, staging, stagingDir)

      // Canvas homepage (ref.ap.rGs0fu3jLTTAsMrPrRmb8.E): a root index.canvas
      // without a root index.md serves at "/" — BEFORE validation, so the
      // aliased index.html is leak-scanned like every other output file.
      HomepageAlias.apply(staging, path.resolve(options.outDir))

      // Final stage: validation pass (plan §6 Phase 3). Leaks ALWAYS fail the
      // build (§4.4 backstop); broken links fail only under strictLinks.
      const validation = new SiteValidator().validate({
        vaultDir: options.vaultDir,
        outDir: path.resolve(options.outDir),
        excludedFiles: staging.excludedFiles,
      })
      if (validation.leaks.length > 0) {
        throw new PrivateContentLeakError(validation.leaks)
      }
      if (options.strictLinks === true && validation.brokenLinks.totalBroken > 0) {
        throw new BrokenInternalLinksError(validation.brokenLinks)
      }

      return {
        outDir: path.resolve(options.outDir),
        staging,
        stagingDir,
        validation,
        linkMetadataWarnings,
      }
    } finally {
      if (options.keepStaging !== true) {
        fs.rmSync(stagingDir, { recursive: true, force: true })
      }
    }
  }

  /**
   * Publish-time link-card metadata (canvas link nodes): fetched HERE because
   * the Quartz child process is sync and cannot await network calls; results
   * are baked into the staged canvas JSON (CanvasLinkEnricher). Warnings only —
   * a metadata fetch never fails the build.
   */
  private async enrichCanvasLinks(
    options: BuildSiteOptions,
    staging: StagingResult,
    stagingDir: string,
  ): Promise<string[]> {
    if (staging.stagedCanvasFiles.length === 0) return []
    const stagedCanvasPaths = staging.stagedCanvasFiles.map(
      (vaultPath) => staging.stagedPathByVaultPath[vaultPath],
    )
    const enricher = new CanvasLinkEnricher(
      new LinkMetadataResolver({ fetchFn: options.linkMetadataFetcher }),
    )
    const { warnings } = await enricher.enrich(stagingDir, stagedCanvasPaths)
    for (const warning of warnings) {
      console.warn(`[link-metadata] ${warning}`)
    }
    return warnings
  }

  /**
   * Canvases are staged, so the plugin WILL emit pages that load the viewer —
   * fail before the (slow) Quartz run if the bundle was never built.
   */
  private assertViewerBundleReady(): void {
    const bundlePath = path.join(this.canvasPluginDir, "dist", "canvas-viewer.js")
    if (!fs.existsSync(bundlePath)) {
      throw new Error(
        `canvas viewer bundle missing at ${bundlePath}.\n` +
          `Fix: run \`npm run setup\` (or \`npm run bundle:viewer\`) from the repo root.`,
      )
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

function defaultCanvasPluginDir(): string {
  // engine/src/ -> repo root -> canvas-plugin
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "canvas-plugin")
}
