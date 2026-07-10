/**
 * Vintrin Explorer — folder-shaped navigation over stable-id URLs
 * (plan/folder-nav-over-id-urls.md §4.2).
 *
 * Replaces the stock @quartz-community/explorer, which flattens to the slug
 * tree (`n/<docid>`). This component renders the ORIGINAL vault folder
 * hierarchy SERVER-SIDE from `allFiles` + the engine-injected
 * `frontmatter.vintrinPath`; every doc href stays a stable-id slug.
 *
 * Folders are collapse-only: no folder URLs exist (folders have no docids),
 * so folder rows are never links (plan §2). DOM classes mirror stock so the
 * ported styles/script stay drop-in.
 *
 * Must stay plain-Node-importable ESM (spike A gotcha G6, proven for
 * component plugins by spike C).
 */
import { h } from "preact"
import { resolveRelative } from "@quartz-community/utils/path"
import { EXPLORER_SCRIPT } from "../src/explorerScript.js"
import { EXPLORER_CSS } from "../src/explorerStyles.js"
import { VaultTreeBuilder } from "../src/vaultTree.js"

const EXPLORER_CONTENT_ID = "vintrin-explorer-content"

/** @param {{title?: string} | undefined} opts */
export function VintrinExplorer(opts) {
  const title = opts?.title ?? "Explorer"

  /** @param {{fileData: any, allFiles: any[], displayClass?: string}} props */
  function Explorer({ fileData, allFiles, displayClass }) {
    const currentSlug = fileData.slug
    const root = VaultTreeBuilder.build(allFiles)
    // Ancestors of the current page render open — the active doc is visible
    // without any client JS; everything else starts collapsed (stock default).
    const openFolderPaths = new Set(
      VaultTreeBuilder.ancestorFolderPaths(fileData.frontmatter?.vintrinPath),
    )
    return h(
      "div",
      {
        class: [displayClass, "explorer", "nav-files-container"].filter(Boolean).join(" "),
        "data-behavior": "collapse",
        "data-collapsed": "collapsed",
        "data-savestate": "true",
      },
      [
        h(
          "button",
          {
            type: "button",
            class: "explorer-toggle mobile-explorer hide-until-loaded",
            "data-mobile": "true",
            "aria-controls": EXPLORER_CONTENT_ID,
            "aria-label": title,
          },
          hamburgerSvg(),
        ),
        h(
          "button",
          {
            type: "button",
            class: "title-button explorer-toggle desktop-explorer",
            "data-mobile": "false",
            "aria-expanded": "true",
          },
          [h("h2", null, title), chevronSvg("fold", 14)],
        ),
        h(
          "div",
          { id: EXPLORER_CONTENT_ID, class: "explorer-content", "aria-expanded": "false", role: "group" },
          h(
            "ul",
            { class: "explorer-ul" },
            root.children.map((node) => renderNode(node, currentSlug, openFolderPaths)),
          ),
        ),
      ],
    )
  }

  Explorer.css = EXPLORER_CSS
  Explorer.afterDOMLoaded = EXPLORER_SCRIPT
  return Explorer
}

/**
 * @param {import("../src/vaultTree.js").TreeNode} node
 * @param {string} currentSlug
 * @param {Set<string>} openFolderPaths
 */
function renderNode(node, currentSlug, openFolderPaths) {
  if (node.kind === "doc") {
    const isActive = node.slug === currentSlug
    return h(
      "li",
      null,
      h(
        "a",
        {
          href: resolveRelative(currentSlug, node.slug),
          "data-slug": node.slug,
          class: "nav-file-title tree-item-self" + (isActive ? " active is-active" : ""),
        },
        node.title,
      ),
    )
  }
  const isOpen = openFolderPaths.has(node.path)
  return h("li", null, [
    h(
      "div",
      {
        class: "folder-container nav-folder-title tree-item-self",
        "data-folderpath": node.path,
      },
      [
        chevronSvg("folder-icon nav-folder-collapse-indicator collapse-icon", 12),
        h(
          "div",
          null,
          h(
            "button",
            { type: "button", class: "folder-button", "aria-expanded": String(isOpen) },
            h("span", { class: "folder-title" }, node.name),
          ),
        ),
      ],
    ),
    h(
      "div",
      { class: isOpen ? "folder-outer open" : "folder-outer" },
      h(
        "ul",
        { class: "content tree-item-children" },
        node.children.map((child) => renderNode(child, currentSlug, openFolderPaths)),
      ),
    ),
  ])
}

/** Stock chevron (fold/collapse indicator). @param {string} className @param {number} size */
function chevronSvg(className, size) {
  return h(
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg",
      width: size,
      height: size,
      viewBox: "5 8 14 8",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "2",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      class: className,
    },
    h("polyline", { points: "6 9 12 15 18 9" }),
  )
}

/** Stock mobile hamburger icon. */
function hamburgerSvg() {
  return h(
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg",
      width: 24,
      height: 24,
      viewBox: "0 0 24 24",
      "stroke-width": "2",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      class: "lucide-menu",
    },
    [
      h("line", { x1: "4", x2: "20", y1: "12", y2: "12" }),
      h("line", { x1: "4", x2: "20", y1: "6", y2: "6" }),
      h("line", { x1: "4", x2: "20", y1: "18", y2: "18" }),
    ],
  )
}
