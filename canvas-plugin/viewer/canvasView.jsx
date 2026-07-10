/**
 * CanvasView — the ONLY module tree in the codebase that imports the React
 * Flow renderer (renderer isolation rule, plan/main.md §4.3). Everything
 * upstream hands it fully-prebaked data: rewritten canvas JSON, a complete
 * attachments map, and resolved note-link URLs. No link resolution and no
 * markdown parsing happen client-side.
 *
 * Swapping the renderer again means rewriting canvas-plugin/viewer/ only.
 *
 * Bundled self-hosted by scripts/build-canvas-viewer.mjs -> dist/canvas-viewer.js
 * (no CDN at runtime); loaded by the page's loader script (src/pageBody.js).
 */
import { createElement, Fragment } from "react"
import { createRoot } from "react-dom/client"
// esbuild loads .css as text (scripts/build-canvas-viewer.mjs); the stylesheet
// is rendered INSIDE the mount so it survives Quartz SPA head/body morphing.
import xyflowCss from "@xyflow/react/dist/style.css"
import viewerCss from "./viewer.css"
import { CanvasApp } from "./canvasApp.jsx"
import { canvasToFlow } from "./canvasToFlow.js"
import { FullscreenRetention } from "./fullscreenRetention.js"

const STYLESHEET = `${xyflowCss}\n${viewerCss}`

// Module-level state survives SPA navigations: this bundle is dynamic-imported
// once and cached, while CanvasView instances are disposed/recreated per page.
const fullscreenRetention = new FullscreenRetention()
if (typeof document !== "undefined") {
  // Quartz fires "prenav" right before it swaps the DOM (which force-exits
  // native fullscreen). Recomputed on every nav — see FullscreenRetention.
  document.addEventListener("prenav", () => {
    fullscreenRetention.capture(
      document.fullscreenElement !== null &&
        document.fullscreenElement.closest("[data-canvas-mount]") !== null,
    )
  })
}

/** @typedef {import("./canvasToFlow.js").CanvasViewPayload} CanvasViewPayload */

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
   * @param {HTMLElement} container the page mount div (also the fullscreen target)
   * @param {CanvasViewPayload} payload
   */
  constructor(container, payload) {
    this.container = container
    this.flow = canvasToFlow(payload)
    this.theme = currentSiteTheme()
    this.restoreFullscreen = fullscreenRetention.consume()
    this.onThemeChange = (event) => {
      this.setTheme(event.detail?.theme === "dark" ? "dark" : "light")
    }
    // Quartz's darkmode toggle dispatches this document-level event.
    document.addEventListener("themechange", this.onThemeChange)
    this.root = createRoot(container)
    this.render()
  }

  render() {
    this.root.render(
      createElement(
        Fragment,
        null,
        createElement("style", null, STYLESHEET),
        createElement(CanvasApp, {
          flow: this.flow,
          theme: this.theme,
          fullscreenTarget: this.container,
          restoreFullscreen: this.restoreFullscreen,
        }),
      ),
    )
  }

  /** @param {"light" | "dark"} theme */
  setTheme(theme) {
    this.theme = theme
    this.render()
  }

  dispose() {
    document.removeEventListener("themechange", this.onThemeChange)
    this.root.unmount()
  }
}

/** @returns {"light" | "dark"} Quartz persists the toggle on <html saved-theme>. */
function currentSiteTheme() {
  const saved = document.documentElement.getAttribute("saved-theme")
  if (saved === "dark" || saved === "light") return saved
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}
