import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

/** Outcome of a Quartz CLI invocation. */
export interface QuartzBuildOutput {
  stdout: string
}

const ERROR_LOG_TAIL_LINES = 40
// Big builds are chatty; default maxBuffer (1 MiB) is too small.
const MAX_OUTPUT_BYTES = 64 * 1024 * 1024

/**
 * Runs the vendored Quartz CLI. Quartz 5 has no stable programmatic API
 * (spike A §3), so the CLI IS the programmatic interface:
 * `node quartz/bootstrap-cli.mjs build -d <content> -o <out>` with
 * cwd = the Quartz checkout root (cwd is load-bearing, gotcha G11).
 */
export class QuartzRunner {
  private readonly quartzDir: string

  constructor(quartzDir: string) {
    this.quartzDir = quartzDir
  }

  /** Fails fast with an actionable message when `npm run setup` has not been run. */
  assertReady(): void {
    const problems: string[] = []
    if (!fs.existsSync(path.join(this.quartzDir, "quartz", "bootstrap-cli.mjs"))) {
      problems.push(`Quartz checkout missing at ${this.quartzDir}`)
    } else {
      if (!fs.existsSync(path.join(this.quartzDir, "node_modules"))) {
        problems.push("Quartz dependencies not installed (node_modules missing)")
      }
      if (!fs.existsSync(path.join(this.quartzDir, ".quartz", "plugins", "index.ts"))) {
        problems.push("Quartz community plugins not installed (.quartz/plugins missing)")
      }
    }
    if (problems.length > 0) {
      throw new Error(
        `Quartz is not set up:\n  - ${problems.join("\n  - ")}\n` +
          `Fix: run \`npm run setup\` (Node >= 22) from the repo root.`,
      )
    }
  }

  /** Writes the generated quartz.config.yaml into the checkout (Quartz resolves config from cwd). */
  writeConfig(configYaml: string): void {
    fs.writeFileSync(path.join(this.quartzDir, "quartz.config.yaml"), configYaml)
  }

  /** Runs `quartz build -d contentDir -o outDir`. Throws with a log tail on failure. */
  build(contentDir: string, outDir: string): QuartzBuildOutput {
    const result = spawnSync(
      process.execPath,
      [path.join("quartz", "bootstrap-cli.mjs"), "build", "-d", contentDir, "-o", outDir],
      { cwd: this.quartzDir, encoding: "utf-8", maxBuffer: MAX_OUTPUT_BYTES },
    )
    const combined = `${result.stdout ?? ""}\n${result.stderr ?? ""}`
    if (result.status !== 0) {
      const tail = combined.trim().split("\n").slice(-ERROR_LOG_TAIL_LINES).join("\n")
      throw new Error(`Quartz build failed (exit ${result.status}). Last output:\n${tail}`)
    }
    return { stdout: combined }
  }
}
