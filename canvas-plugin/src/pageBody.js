/**
 * The canvas page body (Quartz component): an embedded JSON payload + a mount
 * div + a tiny loader that dynamic-imports the self-hosted viewer bundle.
 *
 * Server-side this renders through Quartz's normal page chrome (theme toggle,
 * nav, sidebars all present). The viewer itself boots client-side only.
 */
import { h } from "preact"

/** @typedef {{viewerSrc: string, data: {canvas: object, attachments: object, noteLinks: object}}} CanvasPagePayload */

export function CanvasPageBody() {
  /** @param {{fileData: any}} props */
  function CanvasBody({ fileData }) {
    /** @type {CanvasPagePayload | undefined} */
    const payload = fileData.vintrinCanvas
    if (payload === undefined) {
      return h("p", null, "Canvas data unavailable.")
    }
    // "<" escaped as < (valid JSON) so "</script>" inside canvas content
    // can never terminate the embedding script element.
    const json = JSON.stringify(payload.data).replaceAll("<", "\\u003c")
    return h("div", { class: "canvas-page" }, [
      h("script", {
        type: "application/json",
        "data-canvas-data": "",
        dangerouslySetInnerHTML: { __html: json },
      }),
      h(
        "div",
        {
          class: "canvas-page-mount",
          "data-canvas-mount": "",
          "data-viewer-src": payload.viewerSrc,
        },
        h("p", { class: "canvas-page-loading" }, "Loading canvas..."),
      ),
    ])
  }

  CanvasBody.css = CANVAS_PAGE_CSS
  CanvasBody.afterDOMLoaded = LOADER_SCRIPT
  return CanvasBody
}

// Loader pattern mirrors the official canvas-page plugin's inline script:
// idempotent init guarded by a data flag, re-run on Quartz SPA "nav"/"render"
// events, torn down via window.addCleanup. The viewer bundle is an ESM module
// resolved relative to the page (subpath-hosting safe), loaded lazily so
// non-canvas pages never pay for it.
const LOADER_SCRIPT = `
(function () {
  function mountCanvasPages() {
    var mounts = document.querySelectorAll("[data-canvas-mount]")
    for (var i = 0; i < mounts.length; i++) {
      (function (mount) {
        if (mount.dataset.canvasMounted === "true") return
        if (mount.closest(".popover")) return // never boot inside link-preview popovers
        var dataEl = mount.parentElement && mount.parentElement.querySelector("script[data-canvas-data]")
        if (!dataEl) return
        mount.dataset.canvasMounted = "true"
        var payload = JSON.parse(dataEl.textContent)
        var bundleUrl = new URL(mount.dataset.viewerSrc, document.baseURI).href
        import(bundleUrl)
          .then(function (mod) {
            var view = mod.mountCanvasView(mount, payload)
            if (window.addCleanup) {
              window.addCleanup(function () {
                view.dispose()
                mount.dataset.canvasMounted = "false"
              })
            }
          })
          .catch(function (error) {
            console.error("[vintrin-canvas-page] viewer failed to load", error)
            mount.dataset.canvasMounted = "false"
          })
      })(mounts[i])
    }
  }
  document.addEventListener("nav", mountCanvasPages)
  document.addEventListener("render", mountCanvasPages)
  mountCanvasPages()
})()
`

const CANVAS_PAGE_CSS = `
.canvas-page-mount {
  width: 100%;
  height: min(75vh, 56rem);
  border: 1px solid var(--lightgray);
  border-radius: 8px;
  overflow: hidden;
  position: relative;
  background-color: var(--light);
}
.canvas-page-loading {
  text-align: center;
  padding-top: 3rem;
  color: var(--gray);
}
/* Obsidian fits images inside cards; hesprs defaults to cover (Spike B gap list). */
.canvas-page-mount img {
  object-fit: contain;
}
/* Rewritten cards: canvas->canvas, PDF, unsupported files, private placeholders. */
.canvas-card {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  height: 100%;
  align-items: center;
  justify-content: center;
  text-align: center;
}
.canvas-card-kind {
  font-size: 0.75em;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--gray);
}
.canvas-card-link {
  font-weight: 600;
}
.canvas-card-placeholder {
  color: var(--gray);
  font-style: italic;
}
/* Note cards: header with the open-note affordance, scrollable body. */
.canvas-note-header {
  position: sticky;
  top: 0;
  padding: 0.3rem 0.5rem;
  border-bottom: 1px solid var(--lightgray);
  background-color: var(--light);
  font-size: 0.85em;
}
.canvas-note-body {
  padding: 0 0.5rem;
}
`
