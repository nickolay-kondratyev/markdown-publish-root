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

// Phosphor Icons "arrows-out-simple" / "arrows-in-simple" (regular), 256x256
// viewBox: two DIAGONAL arrows — pointing outward = enter, inward = exit — an
// unambiguous state cue (plain corner brackets read the same in both states).
// ap.rv8cIwZWjlbPzjNjY1Dy4.E: the canvas viewer's fullscreen control renders
// these SAME two paths (canvas-plugin/viewer/canvasApp.jsx) so both fullscreen
// levels share one visual language. Keep the copies in sync.
// Source: https://github.com/phosphor-icons/core/tree/main/assets/regular
// License: MIT — https://github.com/phosphor-icons/core/blob/main/LICENSE
const ARROWS_OUT_ICON_PATH =
  "M216,48V96a8,8,0,0,1-16,0V67.31l-50.34,50.35a8,8,0,0,1-11.32-11.32L188.69,56H160a8,8,0,0,1,0-16h48A8,8,0,0,1,216,48ZM106.34,138.34,56,188.69V160a8,8,0,0,0-16,0v48a8,8,0,0,0,8,8H96a8,8,0,0,0,0-16H67.31l50.35-50.34a8,8,0,0,0-11.32-11.32Z"
const ARROWS_IN_ICON_PATH =
  "M213.66,53.66,163.31,104H192a8,8,0,0,1,0,16H144a8,8,0,0,1-8-8V64a8,8,0,0,1,16,0V92.69l50.34-50.35a8,8,0,0,1,11.32,11.32ZM112,136H64a8,8,0,0,0,0,16H92.69L42.34,202.34a8,8,0,0,0,11.32,11.32L104,163.31V192a8,8,0,0,0,16,0V144A8,8,0,0,0,112,136Z"

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
        icon({ iconPath: ARROWS_OUT_ICON_PATH, iconClass: "fullscreenEnterIcon" }),
        icon({ iconPath: ARROWS_IN_ICON_PATH, iconClass: "fullscreenExitIcon" }),
      ],
    )
  }

  FullScreenModeComponent.css = FULL_SCREEN_MODE_CSS
  FullScreenModeComponent.beforeDOMLoaded = TOGGLE_SCRIPT
  return FullScreenModeComponent
}

// State source of truth is the BROWSER, synced to the root attribute on
// "fullscreenchange" — so Esc, F11 and our button all converge on the same
// attribute. The check is <html>.matches(":fullscreen") — NOT
// document.fullscreenElement !== null — because fullscreen has TWO LEVELS
// (docs/tickets/full-screen-mode.md): the canvas viewer can fullscreen its
// mount ON TOP of (or instead of) the site level, and only elements in the
// fullscreen stack match :fullscreen. The site mode must stay truthful either
// way. Button wiring mirrors zen-mode (nav/render re-setup + addCleanup).
const TOGGLE_SCRIPT = `
document.documentElement.setAttribute("full-screen-mode", "off")

document.addEventListener("fullscreenchange", () => {
  const mode = document.documentElement.matches(":fullscreen") ? "on" : "off"
  if (document.documentElement.getAttribute("full-screen-mode") === mode) return
  document.documentElement.setAttribute("full-screen-mode", mode)
  document.dispatchEvent(new CustomEvent("fullscreenmodechange", { detail: { mode } }))
})

const setupFullScreenMode = () => {
  const toggleFullScreenMode = () => {
    if (document.documentElement.matches(":fullscreen")) {
      // Only reachable when <html> is the TOP fullscreen element (a canvas
      // level on top would cover this button), so this pops the site level.
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
