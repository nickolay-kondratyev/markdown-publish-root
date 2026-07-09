import path from "node:path"
import { SiteBuilder, SiteConfigError, SiteConfigParser } from "../../engine/src/index.ts"

const USAGE = `Usage:
  publish build <vault-dir> --config <site.json> --out <output-dir>

Builds an Obsidian vault into a static site (markdown-only in Phase 1).
  <vault-dir>          Path to the Obsidian vault.
  --config <file>      Site settings JSON (see engine/README.md for the schema).
  --out <dir>          Output directory for the static site.
  --keep-staging       Keep the temporary staging directory (debugging).
`

/** Thin argv boundary around the engine. All real logic lives in engine/. */
export class CliMain {
  /** Returns the process exit code. */
  static async run(argv: string[]): Promise<number> {
    if (argv[0] !== "build") {
      console.error(argv.length === 0 ? USAGE : `publish: unknown command "${argv[0]}"\n\n${USAGE}`)
      return 2
    }
    let args: BuildArgs
    try {
      args = parseBuildArgs(argv.slice(1))
    } catch (error) {
      console.error(`publish: ${(error as Error).message}\n\n${USAGE}`)
      return 2
    }

    try {
      const siteConfig = SiteConfigParser.parseFile(args.configPath)
      const builder = new SiteBuilder()
      const result = await builder.buildSite({
        vaultDir: args.vaultDir,
        siteConfig,
        outDir: args.outDir,
        keepStaging: args.keepStaging,
      })
      for (const warning of result.staging.warnings) {
        console.warn(`publish: WARNING: ${warning}`)
      }
      console.log(
        `publish: built ${result.staging.stagedMarkdownFiles.length} page(s) and ` +
          `${result.staging.stagedAssetFiles.length} asset(s) ` +
          `(${result.staging.excludedFiles.length} file(s) filtered out) -> ${result.outDir}`,
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
  configPath: string
  outDir: string
  keepStaging: boolean
}

function parseBuildArgs(argv: string[]): BuildArgs {
  let vaultDir: string | undefined
  let configPath: string | undefined
  let outDir: string | undefined
  let keepStaging = false

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string
    if (arg === "--config") configPath = requireValue(argv, ++i, "--config")
    else if (arg === "--out") outDir = requireValue(argv, ++i, "--out")
    else if (arg === "--keep-staging") keepStaging = true
    else if (arg.startsWith("--")) throw new Error(`unknown option "${arg}"`)
    else if (vaultDir === undefined) vaultDir = arg
    else throw new Error(`unexpected argument "${arg}"`)
  }

  if (vaultDir === undefined) throw new Error("missing <vault-dir>")
  if (configPath === undefined) throw new Error("missing --config <site.json>")
  if (outDir === undefined) throw new Error("missing --out <output-dir>")
  return {
    vaultDir: path.resolve(vaultDir),
    configPath: path.resolve(configPath),
    outDir: path.resolve(outDir),
    keepStaging,
  }
}

function requireValue(argv: string[], index: number, option: string): string {
  const value = argv[index]
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${option} requires a value`)
  }
  return value
}
