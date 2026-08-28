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
    const originalSlugs = allStagedVaultPaths.map((vaultPath) => vaultPathToSlug(vaultPath))
    const originalSlugSet: Set<string> = new Set(originalSlugs)
    this.newTargetByOriginalSlug = new Map()
    const folderNoteAliasSlugs: string[] = []
    for (const [vaultPath, urlSegment] of idMap.entries()) {
      const stagedPath = idMap.stagedPathOf(vaultPath)
      // Root index: staged path unchanged, links to it keep resolving as-is.
      if (stagedPath === vaultPath) continue
      // Link target = staged basename: "<url-segment>" for md (extension-stripped
      // by slugging), "<url-segment>.canvas" for canvas (extension-preserving slugs).
      const stagedBasename = stagedPath.slice(stagedPath.lastIndexOf("/") + 1)
      const linkTarget = stagedBasename.endsWith(".md") ? urlSegment : stagedBasename
      const originalSlug = vaultPathToSlug(vaultPath)
      this.newTargetByOriginalSlug.set(originalSlug, linkTarget)
      // Folder note (basename == parent folder, e.g. "p/Alan-Watts/Alan-Watts.md"):
      // Quartz's slugifyFilePath collapses it to ".../index", so its last path
      // segment is "index", NOT the folder name. Obsidian still resolves
      // `[[Alan-Watts]]` to this file, but transformLink's shortest strategy
      // matches on last segment and would miss it (404). Register the folder-form
      // slug ("p/alan-watts") as an alias so bare-name resolution finds it — unless
      // a real note already owns that slug, in which case we must not shadow it.
      const aliasSlug = folderNoteAliasSlug(vaultPath, originalSlug)
      if (aliasSlug !== undefined && !originalSlugSet.has(aliasSlug)) {
        folderNoteAliasSlugs.push(aliasSlug)
        this.newTargetByOriginalSlug.set(aliasSlug, linkTarget)
      }
    }
    this.allOriginalSlugs = [...originalSlugs, ...folderNoteAliasSlugs]
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

/**
 * If `vaultPath` is an Obsidian "folder note" — its basename (sans extension)
 * equals its parent folder name, e.g. "p/Alan-Watts/Alan-Watts.md" — returns the
 * folder-form slug that bare-name resolution can match ("p/alan-watts"), derived
 * from the already-computed Quartz slug by dropping the collapsed final segment
 * (".../index" for md, ".../index.canvas" for canvas). Returns undefined for
 * every other file. Never reimplements slugging: it only trims the Quartz slug.
 */
function folderNoteAliasSlug(vaultPath: string, originalSlug: string): string | undefined {
  const withoutExtension = vaultPath.slice(0, vaultPath.lastIndexOf("."))
  const segments = withoutExtension.split("/")
  const isFolderNote =
    segments.length >= 2 && segments[segments.length - 1] === segments[segments.length - 2]
  if (!isFolderNote) return undefined
  return originalSlug.slice(0, originalSlug.lastIndexOf("/"))
}
