import path from "node:path"
import {
  SiteBuilder,
  SiteConfigError,
  formatBrokenLinkReport,
} from "../../engine/src/index.ts"
import { requireValue } from "./argv.ts"
import { ExternalPublishConfigLoader, VAULT_CONFIG_FILE_NAME } from "./externalPublishConfig.ts"
import { DeployCommand } from "./deploy/deployCommand.ts"
import { PreviewCommand } from "./preview/previewCommand.ts"
import { DEFAULT_PREVIEW_PORT } from "./preview/previewPathResolver.ts"

const USAGE = `Usage:
  publish build <vault-dir> [--config <site.json>] [--out <output-dir>]
  publish preview <site-dir> [--port <n>]
  publish deploy <site-dir> --deploy-config <deploy.json> [--dry-run]

build: builds an Obsidian vault (markdown + canvases) into a static site.
  <vault-dir>          Path to the Obsidian vault.
  --config <file>      Site settings JSON (docs/config-format.md). Default:
                       ${VAULT_CONFIG_FILE_NAME} at the vault root.
  --out <dir>          Output directory for the static site. Default: the
                       config's output_dir (relative to the config file).
  --keep-staging       Keep the temporary staging directory (debugging).
  --strict-links       Fail the build if the validation pass finds broken
                       internal links (leak findings ALWAYS fail the build).

preview: serves a built site locally with production URL routing
         (extensionless page URLs, canvas pages, 404 page — docs/hosting.md).
  <site-dir>           A directory produced by \`publish build\`.
  --port <n>           Port to listen on (default ${DEFAULT_PREVIEW_PORT}). Binds 127.0.0.1:
                       LOCAL preview only, not a production server.

deploy: uploads a built site to S3 and invalidates CloudFront.
  <site-dir>           A directory produced by \`publish build\`.
  --deploy-config <f>  Deploy settings JSON (see cli/README.md for the schema).
  --dry-run            Print the aws commands without executing anything.
`

/** Thin argv boundary around the engine. All real logic lives in engine/ (build) or cli/src/deploy/ (deploy). */
export class CliMain {
  /** Returns the process exit code. */
  static async run(argv: string[]): Promise<number> {
    if (argv[0] === "build") return CliMain.runBuild(argv.slice(1))
    if (argv[0] === "preview") return PreviewCommand.run(argv.slice(1), USAGE)
    if (argv[0] === "deploy") return DeployCommand.run(argv.slice(1), USAGE)
    console.error(argv.length === 0 ? USAGE : `publish: unknown command "${argv[0]}"\n\n${USAGE}`)
    return 2
  }

  private static async runBuild(argv: string[]): Promise<number> {
    let args: BuildArgs
    try {
      args = parseBuildArgs(argv)
    } catch (error) {
      console.error(`publish: ${(error as Error).message}\n\n${USAGE}`)
      return 2
    }

    try {
      const configPath = ExternalPublishConfigLoader.resolveConfigPath(args.vaultDir, args.configPath)
      const config = ExternalPublishConfigLoader.load(configPath)
      const outDir = args.outDir ?? config.outputDir
      if (outDir === undefined) {
        console.error(
          `publish: no output directory: pass --out <dir> or set "output_dir" in ${configPath}\n\n${USAGE}`,
        )
        return 2
      }
      const builder = new SiteBuilder()
      const result = await builder.buildSite({
        vaultDir: args.vaultDir,
        siteConfig: config.siteConfig,
        outDir,
        keepStaging: args.keepStaging,
        strictLinks: args.strictLinks,
      })
      for (const warning of result.staging.warnings) {
        console.warn(`publish: WARNING: ${warning}`)
      }
      if (result.validation.brokenLinks.totalBroken > 0) {
        console.warn(`publish: WARNING: ${formatBrokenLinkReport(result.validation.brokenLinks)}`)
        console.warn("publish: (use --strict-links to make broken internal links fail the build)")
      }
      console.log(
        `publish: built ${result.staging.stagedMarkdownFiles.length} page(s), ` +
          `${result.staging.stagedCanvasFiles.length} canvas(es) and ` +
          `${result.staging.stagedAssetFiles.length} asset(s) ` +
          `(${result.staging.excludedFiles.length} file(s) filtered out) -> ${result.outDir}`,
      )
      console.log(
        `publish: validation passed — no private-content leaks, ` +
          `${result.validation.brokenLinks.totalBroken} broken internal link(s)`,
      )
      return 0
    } catch (error) {
      if (error instanceof SiteConfigError) {
        console.error(`publish: ${error.message}`)
      } else {
        console.error(`publish: build failed: ${(error as Error).message}`)
      }
      return 1
    }
  }
}

interface BuildArgs {
  vaultDir: string
  /** Absent -> discover VAULT_CONFIG_FILE_NAME at the vault root. */
  configPath: string | undefined
  /** Absent -> use the config's output_dir. */
  outDir: string | undefined
  keepStaging: boolean
  strictLinks: boolean
}

function parseBuildArgs(argv: string[]): BuildArgs {
  let vaultDir: string | undefined
  let configPath: string | undefined
  let outDir: string | undefined
  let keepStaging = false
  let strictLinks = false

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string
    if (arg === "--config") configPath = requireValue(argv, ++i, "--config")
    else if (arg === "--out") outDir = requireValue(argv, ++i, "--out")
    else if (arg === "--keep-staging") keepStaging = true
    else if (arg === "--strict-links") strictLinks = true
    else if (arg.startsWith("--")) throw new Error(`unknown option "${arg}"`)
    else if (vaultDir === undefined) vaultDir = arg
    else throw new Error(`unexpected argument "${arg}"`)
  }

  if (vaultDir === undefined) throw new Error("missing <vault-dir>")
  return {
    vaultDir: path.resolve(vaultDir),
    configPath: configPath === undefined ? undefined : path.resolve(configPath),
    outDir: outDir === undefined ? undefined : path.resolve(outDir),
    keepStaging,
    strictLinks,
  }
}
