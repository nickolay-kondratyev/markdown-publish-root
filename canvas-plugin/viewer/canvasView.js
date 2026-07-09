/**
 * CanvasView — the ONLY module in the entire codebase that imports the hesprs
 * `json-canvas-viewer` (renderer isolation rule, plan/main.md §4.3). Everything
 * upstream hands it fully-prebaked data: rewritten canvas JSON, a complete
 * attachments map, and resolved note-link URLs. No link resolution and no
 * markdown parsing happen client-side.
 *
 * Swapping the renderer (e.g. to React Flow) means rewriting THIS file only.
 *
 * Bundled self-hosted by scripts/build-canvas-viewer.mjs -> dist/canvas-viewer.js
 * (no CDN at runtime); loaded by the page's loader script (src/pageBody.js).
 */
import { Controls, JSONCanvasViewer, Minimap, MistouchPreventer } from "json-canvas-viewer"

/**
 * @typedef {object} CanvasViewPayload
 * @property {object} canvas       rewritten JSON Canvas (text cards are prebaked HTML)
 * @property {Record<string, string>} attachments original node.file -> page-relative URL
 * @property {Record<string, {href: string, title: string, subpathLabel?: string}>} noteLinks
 */

/**
 * @param {HTMLElement} container
 * @param {CanvasViewPayload} payload
 * @returns {CanvasView}
 */
export function mountCanvasView(container, payload) {
  return new CanvasView(container, payload)
}

export class CanvasView {
  /**
   * @param {HTMLElement} container
   * @param {CanvasViewPayload} payload
   */
  constructor(container, payload) {
    const noteLinks = payload.noteLinks ?? {}
    this.onThemeChange = (event) => {
      this.setTheme(event.detail?.theme === "dark" ? "dark" : "light")
    }
    this.viewer = new JSONCanvasViewer(
      {
        container,
        // The viewer mutates node.file in place when applying attachments
        // (Spike B caveat) — never hand it shared objects.
        canvas: structuredClone(payload.canvas),
        attachments: { ...payload.attachments },
        theme: currentSiteTheme(),
        // No `parser` option: the identity default injects our build-time
        // prebaked HTML as-is (text cards AND fetched note fragments).
        nodeComponents: {
          markdown: (args) => renderNoteCard(args, noteLinks),
        },
      },
      [Controls, Minimap, MistouchPreventer],
    )
    // Quartz's darkmode toggle dispatches this document-level event.
    document.addEventListener("themechange", this.onThemeChange)
  }

  /** @param {"light" | "dark"} theme */
  setTheme(theme) {
    this.viewer.changeTheme(theme)
  }

  dispose() {
    document.removeEventListener("themechange", this.onThemeChange)
    this.viewer.dispose()
  }
}

/**
 * Custom renderer for markdown-kind file nodes: a sticky header with the
 * open-note link (the affordance — first click on the card still just SELECTS
 * it, matching Obsidian Publish; the header link is what navigates) above the
 * prerendered fragment body.
 *
 * @param {{container: HTMLElement, content: string, node: any}} args
 *   `content` is the attachments-resolved URL (the fragment for note cards).
 * @param {Record<string, {href: string, title: string, subpathLabel?: string}>} noteLinks
 */
async function renderNoteCard({ container, content, node }, noteLinks) {
  const info = noteLinks[node.id]
  if (info !== undefined) {
    const header = document.createElement("div")
    header.className = "canvas-note-header"
    const link = document.createElement("a")
    link.className = "internal canvas-note-open"
    link.href = info.href
    link.textContent = info.subpathLabel ? `${info.title} > ${info.subpathLabel}` : info.title
    header.appendChild(link)
    container.appendChild(header)
  }
  const body = document.createElement("div")
  body.className = "canvas-note-body"
  container.appendChild(body)
  try {
    const response = await fetch(content)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const text = await response.text()
    if (info !== undefined) {
      body.innerHTML = text // prerendered fragment — trusted build output
    } else {
      body.textContent = text // plain text passthrough (.txt/.mdx media-kind files)
    }
  } catch {
    body.textContent = "Failed to load content."
  }
}

/** @returns {"light" | "dark"} Quartz persists the toggle on <html saved-theme>. */
function currentSiteTheme() {
  const saved = document.documentElement.getAttribute("saved-theme")
  if (saved === "dark" || saved === "light") return saved
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}
