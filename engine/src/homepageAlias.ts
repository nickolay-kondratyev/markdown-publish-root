import fs from "node:fs"
import path from "node:path"
import { ROOT_INDEX_CANVAS_PATH, ROOT_INDEX_MD_PATH } from "./idMap.ts"
import type { StagingResult } from "./vaultStager.ts"

/** Emitted page of the root canvas (canvas slugs keep their extension, docs/hosting.md). */
const ROOT_CANVAS_PAGE = `${ROOT_INDEX_CANVAS_PATH}.html`
const HOMEPAGE_PAGE = "index.html"

/**
 * ap.rGs0fu3jLTTAsMrPrRmb8.E
 *
 * Canvas-homepage aliasing: a vault whose landing page is a root
 * `index.canvas` (staged in place — ROOT_INDEX_CANVAS_PATH in idMap.ts — so
 * Quartz emits /index.canvas.html) gets that page COPIED to /index.html after
 * the Quartz build, making `/` serve the canvas.
 *
 * A plain copy is correct because both files live at the site root: every
 * relative URL inside (viewer bundle, fragments, note links) resolves
 * identically from "/" and "/index.canvas". Keeping BOTH files means existing
 * [[index.canvas]] links keep working. A root `index.md` always wins — with
 * one present, Quartz already emitted the markdown homepage and nothing is
 * overwritten; without either, Quartz's auto-generated root folder listing
 * is what the copy replaces.
 */
export class HomepageAlias {
  /**
   * @param staging what VaultStager staged (decides eligibility)
   * @param outDir the built site directory
   * @returns true when /index.html was (over)written with the canvas page
   */
  static apply(
    staging: Pick<StagingResult, "stagedMarkdownFiles" | "stagedCanvasFiles">,
    outDir: string,
  ): boolean {
    if (!staging.stagedCanvasFiles.includes(ROOT_INDEX_CANVAS_PATH)) return false
    if (staging.stagedMarkdownFiles.includes(ROOT_INDEX_MD_PATH)) return false
    const canvasPage = path.join(outDir, ROOT_CANVAS_PAGE)
    if (!fs.existsSync(canvasPage)) {
      throw new Error(
        `root ${ROOT_INDEX_CANVAS_PATH} was staged but ${ROOT_CANVAS_PAGE} is missing from the ` +
          `build output at ${outDir} — refusing to ship a site without its canvas homepage`,
      )
    }
    fs.copyFileSync(canvasPage, path.join(outDir, HOMEPAGE_PAGE))
    return true
  }
}
