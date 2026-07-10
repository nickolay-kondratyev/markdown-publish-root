// The ONE shared resolver (plan/main.md §4.2): staging resolves wikilinks with
// Quartz's own transformLink via the canvas plugin's VaultLinkResolver —
// NEVER reimplement slugging (docs/current/dev.md invariant).
import { VaultLinkResolver, vaultPathToSlug } from "../../canvas-plugin/src/resolver.js"
import type { IdMap } from "./idMap.ts"
import type { WikilinkTargetResolver } from "./wikilinkRewriter.ts"

/**
 * Resolves ORIGINAL wikilink targets ("some-note", "x.canvas#h") to their
 * rewritten staged targets ("<docid>", "<docid>.canvas").
 *
 * Resolution runs against the ORIGINAL path-based slug set (docs + assets),
 * i.e. exactly what Quartz would have seen before the id rename; the resolved
 * path-slug is then mapped to its docid target. Anything that does not map —
 * unresolved links, assets, the root index (path unchanged) — yields
 * undefined, which the WikilinkRewriter leaves untouched (fails closed).
 */
export class StagingLinkIndex {
  private readonly allOriginalSlugs: string[]
  private readonly newTargetByOriginalSlug: Map<string, string>

  /**
   * @param idMap validated docid map
   * @param allStagedVaultPaths ORIGINAL vault paths of every staged file (docs AND assets)
   */
  constructor(idMap: IdMap, allStagedVaultPaths: string[]) {
    this.allOriginalSlugs = allStagedVaultPaths.map((vaultPath) => vaultPathToSlug(vaultPath))
    this.newTargetByOriginalSlug = new Map()
    for (const [vaultPath, docId] of idMap.entries()) {
      const stagedPath = idMap.stagedPathOf(vaultPath)
      // Root index: staged path unchanged, links to it keep resolving as-is.
      if (stagedPath === vaultPath) continue
      // Link target = staged basename: "<docid>" for md (extension-stripped by
      // slugging), "<docid>.canvas" for canvas (extension-preserving slugs).
      const stagedBasename = stagedPath.slice(stagedPath.lastIndexOf("/") + 1)
      const linkTarget = stagedBasename.endsWith(".md") ? docId : stagedBasename
      this.newTargetByOriginalSlug.set(vaultPathToSlug(vaultPath), linkTarget)
    }
  }

  /** Target resolver for wikilinks appearing in the given source doc. */
  resolverFor(sourceVaultPath: string): WikilinkTargetResolver {
    const resolver = new VaultLinkResolver(vaultPathToSlug(sourceVaultPath), this.allOriginalSlugs)
    return (target: string) => {
      const resolved = resolver.resolveWikilinkTarget(target)
      if (!resolved.exists) return undefined // conservative: leave broken links as-is
      return this.newTargetByOriginalSlug.get(resolved.targetSlug)
    }
  }
}
