/**
 * Full-screen-mode toolbar toggle (Quartz component, docs/tickets/full-screen-mode.md).
 *
 * Puts the WHOLE SITE into native browser fullscreen by requesting the
 * Fullscreen API on document.documentElement. Because <html> is never swapped
 * by Quartz's SPA router, fullscreen survives every SPA navigation — so
 * navigating into a canvas while fullscreen shows the canvas fullscreen
 * already, with no per-page retention machinery.
 *
 * The mode is mirrored on <html full-screen-mode="on|off"> (synced from the
 * browser's "fullscreenchange", so Esc/F11 exits stay consistent). It is NOT
 * persisted to localStorage: browsers refuse requestFullscreen without a user
 * gesture, so a reload can never restore it — a stored "on" would be a lie.
 *
 * The icon STACKS with reader/zen mode: zen-mode's hide-everything rules and
 * the engine's reader-mode rules both allowlist .fullscreenmode, so the user
 * can upgrade any reading mode to fullscreen (and exit) from the same corner.
 *
 * Registered by the engine's generated quartz.config.yaml as a LOCAL plugin
 * source. Must stay plain-Node-importable ESM (gotcha G6) — hence h(), no JSX.
 */
import { h } from "preact"

const FULL_SCREEN_MODE_LABEL = "Full screen"

// Phosphor Icons "corners-out" / "corners-in" (regular), 256x256 viewBox.
// Source: https://github.com/phosphor-icons/core/tree/main/assets/regular
// License: MIT — https://github.com/phosphor-icons/core/blob/main/LICENSE
const CORNERS_OUT_ICON_PATH =
  "M216,48V88a8,8,0,0,1-16,0V56H168a8,8,0,0,1,0-16h40A8,8,0,0,1,216,48ZM88,200H56V168a8,8,0,0,0-16,0v40a8,8,0,0,0,8,8H88a8,8,0,0,0,0-16Zm120-40a8,8,0,0,0-8,8v32H168a8,8,0,0,0,0,16h40a8,8,0,0,0,8-8V168A8,8,0,0,0,208,160ZM88,40H48a8,8,0,0,0-8,8V88a8,8,0,0,0,16,0V56H88a8,8,0,0,0,0-16Z"
const CORNERS_IN_ICON_PATH =
  "M208,96H168a8,8,0,0,1-8-8V48a8,8,0,0,1,16,0V80h32a8,8,0,0,1,0,16ZM88,160H48a8,8,0,0,0,0,16H80v32a8,8,0,0,0,16,0V168A8,8,0,0,0,88,160Zm120,0H168a8,8,0,0,0-8,8v40a8,8,0,0,0,16,0V176h32a8,8,0,0,0,0-16ZM88,40a8,8,0,0,0-8,8V80H48a8,8,0,0,0,0,16H88a8,8,0,0,0,8-8V48A8,8,0,0,0,88,40Z"

/** Quartz component constructor (same shape as zen-mode's ZenMode). */
export function FullScreenMode() {
  /** @param {{iconPath: string, iconClass: string}} props one state-specific glyph */
  const icon = ({ iconPath, iconClass }) =>
    h(
      "svg",
      {
        xmlns: "http://www.w3.org/2000/svg",
        class: iconClass,
        fill: "currentColor",
        viewBox: "0 0 256 256",
        width: "64px",
        height: "64px",
        "aria-label": FULL_SCREEN_MODE_LABEL,
      },
      [h("title", null, FULL_SCREEN_MODE_LABEL), h("path", { d: iconPath })],
    )

  /** @param {{displayClass?: string}} props */
  function FullScreenModeComponent({ displayClass }) {
    return h(
      "button",
      {
        class: ["fullscreenmode", displayClass].filter(Boolean).join(" "),
        "aria-label": FULL_SCREEN_MODE_LABEL,
      },
      [
        // Both glyphs render; CSS shows exactly one per <html full-screen-mode>
        // (same pattern as darkmode's day/night icon pair).
        icon({ iconPath: CORNERS_OUT_ICON_PATH, iconClass: "fullscreenEnterIcon" }),
        icon({ iconPath: CORNERS_IN_ICON_PATH, iconClass: "fullscreenExitIcon" }),
      ],
    )
  }

  FullScreenModeComponent.css = FULL_SCREEN_MODE_CSS
  FullScreenModeComponent.beforeDOMLoaded = TOGGLE_SCRIPT
  return FullScreenModeComponent
}

// State source of truth is the BROWSER (document.fullscreenElement), synced to
// the root attribute on "fullscreenchange" — so Esc, F11 and our button all
// converge on the same attribute. Button wiring mirrors zen-mode (nav/render
// re-setup + addCleanup for the SPA-swapped body).
const TOGGLE_SCRIPT = `
document.documentElement.setAttribute("full-screen-mode", "off")

document.addEventListener("fullscreenchange", () => {
  const mode = document.fullscreenElement !== null ? "on" : "off"
  document.documentElement.setAttribute("full-screen-mode", mode)
  document.dispatchEvent(new CustomEvent("fullscreenmodechange", { detail: { mode } }))
})

const setupFullScreenMode = () => {
  const toggleFullScreenMode = () => {
    if (document.fullscreenElement !== null) {
      document.exitFullscreen().catch(() => {})
    } else {
      // The WHOLE site goes fullscreen (site-wide mode, not per-element):
      // <html> is never removed by SPA navigation, so the mode sticks.
      document.documentElement.requestFullscreen().catch(() => {})
    }
  }
  for (const button of document.getElementsByClassName("fullscreenmode")) {
    button.addEventListener("click", toggleFullScreenMode)
    window.addCleanup(() => button.removeEventListener("click", toggleFullScreenMode))
  }
}
document.addEventListener("nav", setupFullScreenMode)
document.addEventListener("render", setupFullScreenMode)
`

// Button mirrors zen-mode's .zenmode (20px icon in the toolbar row).
const FULL_SCREEN_MODE_CSS = `
.fullscreenmode {
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
.fullscreenmode svg {
  position: absolute;
  width: 20px;
  height: 20px;
  top: calc(50% - 10px);
  left: 0;
  fill: var(--darkgray);
}
/* Exactly one glyph per state (attribute set pre-paint by beforeDOMLoaded). */
.fullscreenmode .fullscreenExitIcon,
:root[full-screen-mode="on"] .fullscreenmode .fullscreenEnterIcon {
  display: none;
}
:root[full-screen-mode="on"] .fullscreenmode .fullscreenExitIcon {
  display: block;
}
`
