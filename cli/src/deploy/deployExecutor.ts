import { spawnSync } from "node:child_process"
import { formatCommandLine, type DeployPlan } from "./deployPlanner.ts"

/**
 * Runs a DeployPlan by invoking the AWS CLI (`aws`), one command at a time,
 * stopping at the first failure. All planning intelligence lives in
 * DeployPlanner; this class only executes and reports.
 */
export class DeployExecutor {
  /** Fails with an actionable message if the `aws` CLI is not on PATH. */
  assertAwsCliAvailable(): void {
    const probe = spawnSync("aws", ["--version"], { encoding: "utf-8" })
    if (probe.error !== undefined) {
      throw new Error(
        "aws CLI not found on PATH — deploy needs AWS CLI v2.\n" +
          "Install: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html\n" +
          "Then configure credentials (`aws configure` or SSO) and retry.\n" +
          "To only preview the commands, re-run with --dry-run (needs no aws CLI).",
      )
    }
  }

  /** Executes every command in order. Throws on the first non-zero exit. */
  execute(plan: DeployPlan): void {
    this.assertAwsCliAvailable()
    for (const command of plan.commands) {
      console.log(`deploy: ${command.description}`)
      console.log(`deploy: $ ${formatCommandLine(command)}`)
      // stdio inherit: aws's own progress/error output goes straight to the user.
      const run = spawnSync("aws", command.args, { stdio: "inherit" })
      if (run.status !== 0) {
        throw new Error(
          `aws command failed (exit ${run.status ?? "signal"}): ${formatCommandLine(command)}`,
        )
      }
    }
  }
}
