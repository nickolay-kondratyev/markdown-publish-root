/**
 * Zen-mode toolbar toggle (Quartz component, plan/zen-mode.md).
 *
 * Unlike stock reader-mode (opacity: 0 on the sidebars, width kept), zen mode
 * collapses the layout grid so the note content reclaims the sidebar width.
 * Registered by the engine's generated quartz.config.yaml as a LOCAL plugin
 * source. Must stay plain-Node-importable ESM (gotcha G6) — hence h(), no JSX.
 */
import { h } from "preact"

const ZEN_MODE_LABEL = "Zen mode"

// Phosphor Icons "flower-lotus" (regular), 256x256 viewBox.
// Source: https://github.com/phosphor-icons/core/blob/main/assets/regular/flower-lotus.svg
// License: MIT — https://github.com/phosphor-icons/core/blob/main/LICENSE
const LOTUS_ICON_PATH =
  "M245.83,121.63a15.53,15.53,0,0,0-9.52-7.33,73.51,73.51,0,0,0-22.17-2.22c4-19.85,1-35.55-2.06-44.86a16.15,16.15,0,0,0-18.79-10.88,85.53,85.53,0,0,0-28.55,12.12,94.58,94.58,0,0,0-27.11-33.25,16.05,16.05,0,0,0-19.26,0A94.48,94.48,0,0,0,91.26,68.46,85.53,85.53,0,0,0,62.71,56.34,16.15,16.15,0,0,0,43.92,67.22c-3,9.31-6,25-2.06,44.86a73.51,73.51,0,0,0-22.17,2.22,15.53,15.53,0,0,0-9.52,7.33,16,16,0,0,0-1.6,12.27c3.39,12.57,13.8,36.48,45.33,55.32S113.13,208,128.05,208s42.67,0,74-18.78c31.53-18.84,41.94-42.75,45.33-55.32A16,16,0,0,0,245.83,121.63ZM59.14,72.14a.2.2,0,0,1,.23-.15A70.43,70.43,0,0,1,85.18,83.66,118.65,118.65,0,0,0,80,119.17c0,18.74,3.77,34,9.11,46.28A123.59,123.59,0,0,1,69.57,140C51.55,108.62,55.3,84,59.14,72.14Zm3,103.35C35.47,159.57,26.82,140.05,24,129.7a59.82,59.82,0,0,1,22.5-1.17,129.08,129.08,0,0,0,9.15,19.41,142.28,142.28,0,0,0,34,39.56A114.92,114.92,0,0,1,62.1,175.49ZM128,190.4c-9.33-6.94-32-28.23-32-71.23C96,76.7,118.38,55.24,128,48c9.62,7.26,32,28.72,32,71.19C160,162.17,137.33,183.46,128,190.4ZM170.82,83.66A70.43,70.43,0,0,1,196.63,72a.2.2,0,0,1,.23.15C200.7,84,204.45,108.62,186.43,140a123.32,123.32,0,0,1-19.54,25.48c5.34-12.26,9.11-27.54,9.11-46.28A118.65,118.65,0,0,0,170.82,83.66ZM232,129.72c-2.77,10.25-11.4,29.81-38.09,45.77a114.92,114.92,0,0,1-27.55,12,142.28,142.28,0,0,0,34-39.56,129.08,129.08,0,0,0,9.15-19.41A59.69,59.69,0,0,1,232,129.71Z"

/** Quartz component constructor (same shape as reader-mode's default export). */
export function ZenMode() {
  /** @param {{displayClass?: string}} props */
  function ZenModeComponent({ displayClass }) {
    return h(
      "button",
      {
        class: ["zenmode", displayClass].filter(Boolean).join(" "),
        "aria-label": ZEN_MODE_LABEL,
      },
      h(
        "svg",
        {
          xmlns: "http://www.w3.org/2000/svg",
          class: "zenIcon",
          fill: "currentColor",
          viewBox: "0 0 256 256",
          width: "64px",
          height: "64px",
          "aria-label": ZEN_MODE_LABEL,
        },
        [h("title", null, ZEN_MODE_LABEL), h("path", { d: LOTUS_ICON_PATH })],
      ),
    )
  }

  ZenModeComponent.css = ZEN_MODE_CSS
  ZenModeComponent.beforeDOMLoaded = TOGGLE_SCRIPT
  return ZenModeComponent
}

// Persistence mirrors darkmode (localStorage read in beforeDOMLoaded -> the
// root attribute is set before first paint, no flash); toggle/cleanup wiring
// mirrors reader-mode (root attribute + nav/render re-setup + addCleanup).
const TOGGLE_SCRIPT = `
const savedZenMode = localStorage.getItem("zen-mode") ?? "off"
document.documentElement.setAttribute("zen-mode", savedZenMode)

const setupZenMode = () => {
  const toggleZenMode = () => {
    const newMode = document.documentElement.getAttribute("zen-mode") === "on" ? "off" : "on"
    document.documentElement.setAttribute("zen-mode", newMode)
    localStorage.setItem("zen-mode", newMode)
    document.dispatchEvent(new CustomEvent("zenmodechange", { detail: { mode: newMode } }))
  }
  for (const button of document.getElementsByClassName("zenmode")) {
    button.addEventListener("click", toggleZenMode)
    window.addCleanup(() => button.removeEventListener("click", toggleZenMode))
  }
}
document.addEventListener("nav", setupZenMode)
document.addEventListener("render", setupZenMode)
`

// The width reclaim. Base sidebar rules nest under `.page > #quartz-body`
// (base.scss) — an ID — so every zen rule that fights them MUST carry
// #quartz-body too, or it loses the cascade regardless of class count.
// With the ID matched, the attribute+class selectors win; no !important.
// The single grid override (no media query) beats base's desktop/tablet/
// mobile variants because base's media queries add no specificity.
const ZEN_MODE_CSS = `
/* Button mirrors reader-mode's .readermode (20px icon in the toolbar row). */
.zenmode {
  cursor: pointer;
  padding: 0;
  position: relative;
  background: none;
  border: none;
  width: 20px;
  height: 32px;
  margin: 0;
  text-align: inherit;
  flex-shrink: 0;
}
.zenmode svg {
  position: absolute;
  width: 20px;
  height: 20px;
  top: calc(50% - 10px);
  left: 0;
  fill: var(--darkgray);
}

/* Collapse the grid: single column, no sidebar areas
   (pattern: base.scss .page[data-frame="full-width"]). */
:root[zen-mode="on"] .page > #quartz-body {
  grid-template-columns: auto;
  grid-template-rows: auto auto auto;
  grid-template-areas: "grid-header" "grid-center" "grid-footer";
  /* Base's 5px row-gap × the two empty trailing rows = 10px of dead scroll
     at the page bottom (breaks the canvas viewport fill in pageBody.js). */
  row-gap: 0;
}
/* Right sidebar (graph/backlinks/TOC): gone entirely. Also removes its
   grid-area reference, which would otherwise resurrect implicit columns. */
:root[zen-mode="on"] #quartz-body .sidebar.right {
  display: none;
}
/* Left sidebar: everything hidden (page title, search, explorer) EXCEPT the
   mode-toggle cluster holding the zen button — the single exit affordance.
   The cluster renders as a generic .flex-component div (Flex.tsx adds no
   group-name class) — the only stable selector for it; it is the sidebar's
   ONLY group (ref.ap.0zwhQQya81CGNQ9pmqKkM.E).
   WHY-NOT display:none on .sidebar.left itself: it would hide the zen button
   (fixed-position descendants of display:none ancestors don't render). */
:root[zen-mode="on"] #quartz-body .sidebar.left > *:not(.flex-component) {
  display: none;
}
/* Inside the mode-toggle cluster, hide every icon except zen. Each item sits
   in an inline-styled wrapper div (Flex.tsx); hiding the CONTENT (not the
   wrapper) stays generic — new cluster plugins hide automatically. The empty
   wrappers keep 0 width, and zen is the LAST (rightmost) item, so the lotus
   does not move when the others vanish. */
:root[zen-mode="on"] #quartz-body .sidebar.left .flex-component > div > *:not(.zenmode) {
  display: none;
}
/* Reclaim the .page cap too — zen means full available width. */
:root[zen-mode="on"] .page {
  max-width: 100%;
}
/* Frugal vertical space: base's .page-header carries margin-top $topSpacing
   (6rem) to clear the sticky sidebars — both are gone in zen, so pull the
   first heading up. 2rem matches the pinned toggle cluster's top offset
   (ref.ap.0zwhQQya81CGNQ9pmqKkM.E). Desktop/tablet only: base already zeroes
   this margin on mobile (<800px), which this rule would otherwise override. */
@media (min-width: 800px) {
  :root[zen-mode="on"] #quartz-body .page-header {
    margin-top: 2rem;
  }
}
/* Zen reads as pure content: drop the article/footer divider and the
   breadcrumbs trail too. */
:root[zen-mode="on"] .center > hr,
:root[zen-mode="on"] .center .breadcrumb-container {
  display: none;
}
/* Take the left sidebar OUT of the collapsed grid (its grid-area would
   otherwise resurrect an implicit column). The visible corner position of the
   zen icon comes from the ALWAYS-ON cluster pin in the engine's custom.scss
   (unlayered, so it wins — ref.ap.0zwhQQya81CGNQ9pmqKkM.E); the fixed
   top-right placement here keeps this rule self-sufficient regardless. */
:root[zen-mode="on"] #quartz-body .sidebar.left {
  position: fixed;
  top: 0;
  right: 0;
  left: auto;
  height: auto;
  width: auto;
  padding: 1rem;
  z-index: 2;
  /* Reader-mode (independent root attribute, can be on simultaneously) dims
     .sidebar.left to opacity 0 — which would hide this lone exit affordance
     and make zen un-exitable. Force it opaque; #quartz-body wins the cascade
     over reader-mode's :root[reader-mode="on"] .sidebar.left rule. */
  opacity: 1;
}
/* Full-bleed, not glued to the viewport edge (mobile keeps base's 1rem). */
@media (min-width: 800px) {
  :root[zen-mode="on"] .page > #quartz-body {
    padding: 0 2rem;
  }
}
`
