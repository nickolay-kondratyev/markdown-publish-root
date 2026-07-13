/**
 * Freshness guard for the self-hosted viewer bundle (dist/canvas-viewer.js).
 *
 * WHY: the bundle is a gitignored build artifact — pulling changes to
 * viewer/* updates the sources but NOT the bundle, so every build path
 * (Makefile, e2e harness, direct CLI) would silently serve stale viewer
 * behavior. Failing the build loudly here protects them all at the single
 * point where the bundle is consumed (index.js emitter).
 */
import fs from "node:fs"
import path from "node:path"

const REBUILD_HINT = "Fix: run `npm run bundle:viewer` (or `npm run setup`) from the repo root."

export class ViewerBundleGuard {
  /**
   * Throws when the bundle is missing, or older than any file in the viewer
   * source dir. A missing source dir passes (plugin installed without
   * sources): then the shipped bundle is the only truth, nothing to compare.
   *
   * @param {{ bundlePath: string, viewerSrcDir: string }} paths
   */
  static assertFresh({ bundlePath, viewerSrcDir }) {
    if (!fs.existsSync(bundlePath)) {
      throw new Error(`canvas viewer bundle missing at ${bundlePath}. ${REBUILD_HINT}`)
    }
    if (!fs.existsSync(viewerSrcDir)) return
    const bundleMtimeMs = fs.statSync(bundlePath).mtimeMs
    for (const fileName of fs.readdirSync(viewerSrcDir)) {
      const sourcePath = path.join(viewerSrcDir, fileName)
      if (fs.statSync(sourcePath).mtimeMs > bundleMtimeMs) {
        throw new Error(
          `canvas viewer bundle at ${bundlePath} is stale: ` +
            `${sourcePath} is newer than the bundle. ${REBUILD_HINT}`,
        )
      }
    }
  }
}
