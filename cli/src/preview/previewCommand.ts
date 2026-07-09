import path from "node:path"
import { requireValue } from "../argv.ts"
import { assertLooksLikeBuiltSite } from "../builtSiteDir.ts"
import { DEFAULT_PREVIEW_PORT } from "./previewPathResolver.ts"
import { PreviewServer } from "./previewServer.ts"

const MAX_TCP_PORT = 65535

/**
 * `publish preview <site-dir> [--port <n>]`
 *
 * Serves a built site locally with the SAME URL routing production hosting
 * must implement (docs/hosting.md): extensionless page URLs -> `.html`,
 * directory index pages, themed 404. Loopback-only local preview — NOT a
 * production server.
 */
export class PreviewCommand {
  /** Returns the process exit code; resolves after SIGINT shuts the server down. */
  static async run(argv: string[], usage: string): Promise<number> {
    let args: PreviewArgs
    try {
      args = parsePreviewArgs(argv)
    } catch (error) {
      console.error(`publish: ${(error as Error).message}\n\n${usage}`)
      return 2
    }

    try {
      assertLooksLikeBuiltSite(args.siteDir)
      const server = new PreviewServer(args.siteDir)
      const address = await server.start(args.port)
      console.log(`publish: previewing ${args.siteDir} at ${address.url}`)
      console.log("publish: local preview only (loopback) — press Ctrl+C to stop")

      await new Promise<void>((resolve) => {
        process.once("SIGINT", () => resolve())
      })
      await server.stop()
      console.log("publish: preview stopped")
      return 0
    } catch (error) {
      console.error(`publish: preview failed: ${(error as Error).message}`)
      return 1
    }
  }
}

interface PreviewArgs {
  siteDir: string
  port: number
}

function parsePreviewArgs(argv: string[]): PreviewArgs {
  let siteDir: string | undefined
  let port = DEFAULT_PREVIEW_PORT

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string
    if (arg === "--port") port = parsePort(requireValue(argv, ++i, "--port"))
    else if (arg.startsWith("--")) throw new Error(`unknown option "${arg}"`)
    else if (siteDir === undefined) siteDir = arg
    else throw new Error(`unexpected argument "${arg}"`)
  }

  if (siteDir === undefined) throw new Error("missing <site-dir>")
  return { siteDir: path.resolve(siteDir), port }
}

function parsePort(value: string): number {
  const port = Number(value)
  // 0 is valid: the OS assigns a free port (printed on startup; used by tests).
  if (!Number.isInteger(port) || port < 0 || port > MAX_TCP_PORT) {
    throw new Error(`--port must be an integer between 0 and ${MAX_TCP_PORT}, got "${value}"`)
  }
  return port
}
