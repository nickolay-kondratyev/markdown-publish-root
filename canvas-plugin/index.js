/**
 * Vintrin canvas-page plugin for Quartz 5 (ADR 0001).
 *
 * Dual category (package.json `quartz.category`):
 *   pageType — claims `.canvas`, generates one VirtualPage per canvas with
 *              rewritten canvas JSON embedded and outbound links registered
 *              (`data.links` -> backlinks + graph + contentIndex).
 *   emitter  — writes the prerendered note fragments and the self-hosted
 *              viewer bundle (static/canvas-viewer.js) into the output.
 *
 * Registered by the engine's generated quartz.config.yaml as a LOCAL plugin
 * source (spike A: local sources are symlinked, bare imports resolve from this
 * repo's node_modules). Must stay plain-Node-importable ESM (gotcha G6).
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { CanvasRewriter } from "./src/canvasRewriter.js"
import { parseCanvas } from "./src/canvasSchema.js"
import { CanvasPageBody } from "./src/pageBody.js"
import { VaultLinkResolver, vaultPathToSlug } from "./src/resolver.js"

const CANVAS_EXTENSION = ".canvas"
/** Site-relative path the viewer bundle is served from. */
export const VIEWER_BUNDLE_SITE_PATH = "static/canvas-viewer.js"
/** Built by `npm run bundle:viewer` (scripts/build-canvas-viewer.mjs). */
const VIEWER_BUNDLE_LOCAL_PATH = fileURLToPath(new URL("./dist/canvas-viewer.js", import.meta.url))

export default function VintrinCanvasPage() {
  return {
    name: "VintrinCanvasPage",
    priority: 30,
    // Excludes raw .canvas files from Quartz's Assets copy; pages come from generate().
    fileExtensions: [CANVAS_EXTENSION],
    match: ({ fileData }) => fileData.vintrinCanvas !== undefined,

    /** pageType phase: one VirtualPage per staged canvas. */
    generate({ ctx, content }) {
      return processAllCanvases(ctx, content).map(({ slug, title, vintrinPath, rewrite }) => ({
        slug,
        title,
        data: {
          // vintrinPath (engine-injected ORIGINAL vault path) passes through
          // so folder-shaped explorer/breadcrumbs place canvases correctly
          // (plan/folder-nav-over-id-urls.md §4.4).
          frontmatter: { title, tags: [], vintrinPath },
          // Outbound links register the canvas in backlinks/graph/contentIndex.
          links: rewrite.links,
          // ALL visible canvas content (text cards, embedded-note fragments,
          // card titles, labels, link URLs) -> search index (contentIndex `content`).
          text: rewrite.searchText,
          vintrinCanvas: {
            viewerSrc: new VaultLinkResolver(slug, ctx.allSlugs).relativeUrlTo(
              VIEWER_BUNDLE_SITE_PATH,
            ),
            data: {
              canvas: rewrite.canvas,
              attachments: rewrite.attachments,
              noteLinks: rewrite.noteLinks,
            },
          },
        },
      }))
    },

    /** emitter phase: note fragments + viewer bundle (only when canvases exist). */
    async emit(ctx, content) {
      const results = processAllCanvases(ctx, content)
      const written = []
      if (results.length === 0) return written
      written.push(copyViewerBundle(ctx.argv.output))
      for (const { rewrite } of results) {
        for (const fragment of rewrite.fragments) {
          const filePath = path.join(ctx.argv.output, fragment.sitePath)
          fs.mkdirSync(path.dirname(filePath), { recursive: true })
          fs.writeFileSync(filePath, fragment.html)
          written.push(filePath)
        }
      }
      return written
    },

    layout: "canvas",
    // WHY-NOT "full-width": that core frame drops the left/right sidebars,
    // losing graph + backlinks on canvas pages — a differentiator (plan §4.1).
    // The canvas itself pans/zooms, so the default content width is fine.
    frame: "default",
    body: CanvasPageBody,
  }
}

/**
 * Parse + rewrite every staged canvas. Pure w.r.t. inputs and cheap, so the
 * pageType and emitter phases each run it independently (no cross-phase cache
 * that could go stale in watch mode).
 */
function processAllCanvases(ctx, content) {
  const contentBySlug = new Map(
    content.map(([tree, file]) => [file.data.slug, { tree, data: file.data }]),
  )
  // Pass 1: parse every staged canvas and collect titles. Staged canvas
  // basenames are docids (plan/id-based-publishing.md), so display titles come
  // from metadata.frontmatter.title (engine-injected), basename as fallback.
  const parsedCanvases = []
  const titleBySlug = new Map()
  for (const filePath of ctx.allFiles) {
    if (!filePath.endsWith(CANVAS_EXTENSION)) continue
    let canvas
    try {
      canvas = parseCanvas(fs.readFileSync(path.join(ctx.argv.directory, filePath), "utf-8"))
    } catch (error) {
      // A malformed canvas should not take the whole site down; surface loudly.
      console.warn(`[vintrin-canvas-page] skipping ${filePath}: ${error.message}`)
      continue
    }
    const slug = vaultPathToSlug(filePath)
    const title =
      canvas.metadata?.frontmatter?.title ?? path.basename(filePath, CANVAS_EXTENSION)
    titleBySlug.set(slug, title)
    parsedCanvases.push({ filePath, slug, title, canvas })
  }
  // Pass 2: rewrite, with cross-canvas titles available for canvas cards.
  const results = []
  for (const { filePath, slug, title, canvas } of parsedCanvases) {
    const vintrinPath = canvas.metadata?.frontmatter?.vintrinPath
    const rewrite = new CanvasRewriter({
      canvasSlug: slug,
      allSlugs: ctx.allSlugs,
      noteLookup: (noteSlug) => contentBySlug.get(noteSlug),
      canvasTitleLookup: (canvasSlug) => titleBySlug.get(canvasSlug),
    }).rewrite(canvas)
    for (const warning of rewrite.warnings) {
      console.warn(`[vintrin-canvas-page] ${warning}`)
    }
    results.push({ filePath, slug, title, vintrinPath, rewrite })
  }
  return results
}

function copyViewerBundle(outputDir) {
  if (!fs.existsSync(VIEWER_BUNDLE_LOCAL_PATH)) {
    throw new Error(
      `canvas viewer bundle missing at ${VIEWER_BUNDLE_LOCAL_PATH}. ` +
        `Fix: run \`npm run setup\` (or \`npm run bundle:viewer\`) from the repo root.`,
    )
  }
  const dest = path.join(outputDir, VIEWER_BUNDLE_SITE_PATH)
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.copyFileSync(VIEWER_BUNDLE_LOCAL_PATH, dest)
  return dest
}
