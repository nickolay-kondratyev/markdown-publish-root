/**
 * Pure tree builder for the folder-shaped Explorer
 * (plan/folder-nav-over-id-urls.md §4.2).
 *
 * Input: Quartz `allFiles` (every page's data, canvas virtual pages included).
 * The tree derives ONLY from the engine-injected `frontmatter.vintrinPath`
 * (the ORIGINAL vault-relative path), so:
 *   - hrefs stay stable-id slugs while labels/placement stay folder-shaped,
 *   - pages without vintrinPath (tag pages, 404) never appear,
 *   - folders holding only unpublished docs can never appear (only staged
 *     docs carry vintrinPath).
 */

/** The vault's root index.md is the "Home" page — never a tree leaf. */
const ROOT_INDEX_VINTRIN_PATH = "index.md"

/**
 * @typedef {{kind: "folder", name: string, path: string, children: TreeNode[]}} FolderNode
 *   `name` = raw folder segment (label), `path` = original folder path from
 *   the vault root (stable localStorage collapse key, e.g. "notes/projects").
 * @typedef {{kind: "doc", title: string, slug: string}} DocNode
 *   `title` = engine-injected display title, `slug` = stable-id page slug.
 * @typedef {FolderNode | DocNode} TreeNode
 */

export class VaultTreeBuilder {
  /**
   * @param {Array<{slug?: string, frontmatter?: {title?: string, vintrinPath?: string}}>} allFiles
   * @returns {FolderNode} the (unnamed) root; render its `children`.
   */
  static build(allFiles) {
    /** @type {FolderNode} */
    const root = { kind: "folder", name: "", path: "", children: [] }
    for (const file of allFiles ?? []) {
      const vintrinPath = file?.frontmatter?.vintrinPath
      if (typeof vintrinPath !== "string" || vintrinPath === ROOT_INDEX_VINTRIN_PATH) continue
      if (typeof file.slug !== "string") continue
      const segments = vintrinPath.split("/")
      const leaf = segments.pop() ?? vintrinPath
      const folder = descendCreating(root, segments)
      folder.children.push({
        kind: "doc",
        // Engine staging guarantees a title; basename fallback keeps the tree
        // usable if a non-engine page ever carries vintrinPath without one.
        title: file.frontmatter?.title ?? stripExtension(leaf),
        slug: file.slug,
      })
    }
    sortRecursively(root)
    return root
  }

  /**
   * Folder paths (root-first) a doc's vintrinPath sits under — the folders a
   * page's Explorer renders open so the active doc is visible without JS.
   * @param {string | undefined} vintrinPath
   * @returns {string[]} e.g. "a/b/c.md" -> ["a", "a/b"]
   */
  static ancestorFolderPaths(vintrinPath) {
    if (typeof vintrinPath !== "string") return []
    const segments = vintrinPath.split("/").slice(0, -1)
    return segments.map((_, i) => segments.slice(0, i + 1).join("/"))
  }
}

/** @param {FolderNode} root @param {string[]} segments @returns {FolderNode} */
function descendCreating(root, segments) {
  let node = root
  for (const segment of segments) {
    let child = node.children.find((c) => c.kind === "folder" && c.name === segment)
    if (child === undefined) {
      const path = node.path === "" ? segment : `${node.path}/${segment}`
      child = { kind: "folder", name: segment, path, children: [] }
      node.children.push(child)
    }
    node = /** @type {FolderNode} */ (child)
  }
  return node
}

/**
 * Stock Explorer order: folders first, then natural case-insensitive alpha by
 * display name (plan §2 "Sort order").
 * @param {FolderNode} node
 */
function sortRecursively(node) {
  node.children.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1
    const aName = a.kind === "folder" ? a.name : a.title
    const bName = b.kind === "folder" ? b.name : b.title
    return aName.localeCompare(bName, undefined, { numeric: true, sensitivity: "base" })
  })
  for (const child of node.children) {
    if (child.kind === "folder") sortRecursively(child)
  }
}

/** @param {string} basename @returns {string} */
function stripExtension(basename) {
  return basename.replace(/\.[^.]+$/, "")
}
