import fs from "node:fs"
import path from "node:path"

/**
 * Cheap sanity gate shared by commands that consume a `publish build` output
 * (deploy, preview): a built site always contains index.html. Catches
 * pointing a command at the wrong directory (e.g. the vault) — which for
 * deploy with deleteStale could wipe the site.
 */
export function assertLooksLikeBuiltSite(siteDir: string): void {
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
