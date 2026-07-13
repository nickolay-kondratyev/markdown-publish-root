import fs from "node:fs"
import path from "node:path"
// Plain-ESM plugin module — established engine<->plugin import pattern
// (see wikilinkRewriter.ts); classification knowledge lives in ONE table.
import { classifyLinkUrl } from "../../canvas-plugin/src/linkProviders.js"
import { LinkMetadataResolver } from "./linkMetadata.ts"

/**
 * Publish-time enrichment of staged canvases with link-card metadata.
 *
 * Runs AFTER VaultStager and BEFORE the Quartz child process (which is sync
 * and cannot fetch): fetched OpenGraph metadata is baked INTO the staged
 * canvas JSON as `node.vintrinLinkMeta`, so the plugin's sync rewriter
 * (CanvasRewriter.rewriteLinkNode) reads it identically from both Quartz
 * hooks. Provider (embed) URLs are never fetched — only card-mode URLs.
 *
 * Staged files are engine-owned temp copies; mutating them never touches the
 * vault.
 */
export class CanvasLinkEnricher {
  private readonly resolver: LinkMetadataResolver

  constructor(resolver: LinkMetadataResolver) {
    this.resolver = resolver
  }

  /**
   * @param stagingDir absolute staging root
   * @param stagedCanvasPaths staging-relative canvas paths
   */
  async enrich(
    stagingDir: string,
    stagedCanvasPaths: string[],
  ): Promise<{ warnings: string[] }> {
    const warnings: string[] = []
    const canvases: Array<{ absolutePath: string; canvas: Record<string, any> }> = []
    const cardUrls = new Set<string>()

    for (const stagedPath of stagedCanvasPaths) {
      const absolutePath = path.join(stagingDir, stagedPath)
      let canvas: Record<string, any>
      try {
        canvas = JSON.parse(fs.readFileSync(absolutePath, "utf-8"))
      } catch (error) {
        // Malformed canvases are the plugin's problem (it warns and skips) —
        // enrichment just leaves them alone.
        warnings.push(`${stagedPath}: unreadable canvas, skipping enrichment (${String(error)})`)
        continue
      }
      canvases.push({ absolutePath, canvas })
      for (const url of cardLinkUrlsOf(canvas)) cardUrls.add(url)
    }
    if (cardUrls.size === 0) return { warnings }

    const resolution = await this.resolver.resolve([...cardUrls])
    warnings.push(...resolution.warnings)

    for (const { absolutePath, canvas } of canvases) {
      let changed = false
      for (const node of canvas.nodes ?? []) {
        if (!isCardLinkNode(node)) continue
        const meta = resolution.metaByUrl.get(node.url)
        if (meta === undefined) continue
        node.vintrinLinkMeta = meta
        changed = true
      }
      if (changed) fs.writeFileSync(absolutePath, JSON.stringify(canvas, null, "\t"))
    }
    return { warnings }
  }
}

function cardLinkUrlsOf(canvas: Record<string, any>): string[] {
  return (canvas.nodes ?? []).filter(isCardLinkNode).map((node: any) => node.url as string)
}

/** Card-mode link node with a fetchable http(s) URL (embeds are never fetched). */
function isCardLinkNode(node: any): boolean {
  if (node?.type !== "link" || typeof node.url !== "string") return false
  if (!/^https?:\/\//i.test(node.url)) return false
  return classifyLinkUrl(node.url).mode === "card"
}
