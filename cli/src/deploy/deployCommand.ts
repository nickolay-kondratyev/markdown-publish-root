import fs from "node:fs"
import path from "node:path"
import { requireValue } from "../argv.ts"
import { DeployConfigError, DeployConfigParser } from "./deployConfig.ts"
import { DeployExecutor } from "./deployExecutor.ts"
import { DeployPlanner, formatCommandLine } from "./deployPlanner.ts"

/**
 * `publish deploy <site-dir> --deploy-config deploy.json [--dry-run]`
 *
 * Thin hosting layer OUTSIDE the engine (plan/main.md §3: deploy is "aws s3
 * sync + invalidation script"). Plan computation is pure (DeployPlanner);
 * execution shells out to the AWS CLI (DeployExecutor).
 */
export class DeployCommand {
  /** Returns the process exit code. */
  static run(argv: string[], usage: string): number {
    let args: DeployArgs
    try {
      args = parseDeployArgs(argv)
    } catch (error) {
      console.error(`publish: ${(error as Error).message}\n\n${usage}`)
      return 2
    }

    try {
      assertLooksLikeBuiltSite(args.siteDir)
      const config = DeployConfigParser.parseFile(args.configPath)
      const plan = DeployPlanner.plan(args.siteDir, config)

      if (config.distributionId === undefined) {
        console.warn(
          "publish: WARNING: no distributionId in deploy config — skipping CloudFront invalidation " +
            "(cached pages stay stale until their TTL expires)",
        )
      }

      if (args.dryRun) {
        console.log(`publish: deploy plan for ${args.siteDir} -> ${plan.s3TargetUrl} (dry run):`)
        for (const command of plan.commands) {
          console.log(`  # ${command.description}`)
          console.log(`  ${formatCommandLine(command)}`)
        }
        console.log("publish: dry run — nothing was executed.")
        return 0
      }

      new DeployExecutor().execute(plan)
      console.log(`publish: deployed ${args.siteDir} -> ${plan.s3TargetUrl}`)
      return 0
    } catch (error) {
      if (error instanceof DeployConfigError) {
        console.error(`publish: ${error.message}`)
      } else {
        console.error(`publish: deploy failed: ${(error as Error).message}`)
      }
      return 1
    }
  }
}

/**
 * Cheap sanity gate before touching the bucket: a `publish build` output
 * always contains index.html. Catches pointing deploy at the wrong directory
 * (e.g. the vault) — which with deleteStale could wipe the site.
 */
function assertLooksLikeBuiltSite(siteDir: string): void {
  if (!fs.existsSync(siteDir) || !fs.statSync(siteDir).isDirectory()) {
    throw new Error(`site directory not found: ${siteDir}`)
  }
  if (!fs.existsSync(path.join(siteDir, "index.html"))) {
    throw new Error(
      `${siteDir} does not look like a built site (no index.html). ` +
        `Run \`publish build\` first and pass its --out directory.`,
    )
  }
}

interface DeployArgs {
  siteDir: string
  configPath: string
  dryRun: boolean
}

function parseDeployArgs(argv: string[]): DeployArgs {
  let siteDir: string | undefined
  let configPath: string | undefined
  let dryRun = false

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string
    if (arg === "--deploy-config") configPath = requireValue(argv, ++i, "--deploy-config")
    else if (arg === "--dry-run") dryRun = true
    else if (arg.startsWith("--")) throw new Error(`unknown option "${arg}"`)
    else if (siteDir === undefined) siteDir = arg
    else throw new Error(`unexpected argument "${arg}"`)
  }

  if (siteDir === undefined) throw new Error("missing <site-dir>")
  if (configPath === undefined) throw new Error("missing --deploy-config <deploy.json>")
  return { siteDir: path.resolve(siteDir), configPath: path.resolve(configPath), dryRun }
}
