/**
 * Mode-switcher toolbar cluster (Quartz component, docs-internal/tickets/mode-switcher.md).
 *
 * Renders the top-right corner's TWO radio-style mode groups plus the
 * always-visible search magnifier (one layout slot per plugin, so all three
 * ship as siblings — the zen-mode plugin pioneered this shape):
 *
 *   - .mode-search                     magnifier, ALWAYS leftmost (order: -1);
 *                                      delegates to the real .search-button.
 *   - .mode-switcher[data-group="reading"]  Plain / Reader / Zen
 *   - .mode-switcher[data-group="screen"]   Normal / Full screen / Canvas full screen
 *
 * Each group is ONE trigger button showing the CURRENT mode's glyph (outline
 * while the default mode is active, FILLED for any non-default mode — the fill
 * IS the "something is on" cue, same language as darkmode's glyph swap),
 * opening a labeled vertical popover with radio semantics. No caret: the
 * cluster reads as a uniform icon row; the click itself reveals the choices.
 *
 * State contract (attributes on <html> — never swapped by the SPA router, so
 * both survive every navigation):
 *   reading-mode="plain|reader|zen"                localStorage-persisted
 *   screen-mode="normal|fullscreen|fullscreen-canvas"  session intent, browser
 *                                                  fullscreen is ground truth
 * "Canvas full screen" is html-level fullscreen + a CSS-expanded canvas mount
 * (canvas-plugin owns that rule): two requestFullscreen calls in one gesture
 * are impossible (the first consumes the transient activation), and a
 * natively-fullscreen mount would hide this very cluster.
 *
 * Registered by the engine's generated quartz.config.yaml as a LOCAL plugin
 * source. Must stay plain-Node-importable ESM (gotcha G6) — hence h(), no JSX.
 */
import { Fragment, h } from "preact"

export const READING_MODE_ATTR = "reading-mode"
export const SCREEN_MODE_ATTR = "screen-mode"
const READING_GROUP_LABEL = "Reading mode"
const SCREEN_GROUP_LABEL = "Screen mode"
const SEARCH_LABEL = "Search"

// --- Phosphor icon paths (256x256 viewBox, MIT) -------------------------------
// Source: https://github.com/phosphor-icons/core (assets/regular + assets/fill)
// License: MIT — https://github.com/phosphor-icons/core/blob/main/LICENSE

// "article" / "article-fill" — Plain mode (the stock reading layout).
const ARTICLE_ICON_PATH =
  "M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40Zm0,160H40V56H216V200ZM184,96a8,8,0,0,1-8,8H80a8,8,0,0,1,0-16h96A8,8,0,0,1,184,96Zm0,32a8,8,0,0,1-8,8H80a8,8,0,0,1,0-16h96A8,8,0,0,1,184,128Zm0,32a8,8,0,0,1-8,8H80a8,8,0,0,1,0-16h96A8,8,0,0,1,184,160Z"
const ARTICLE_FILL_ICON_PATH =
  "M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40ZM176,168H80a8,8,0,0,1,0-16h96a8,8,0,0,1,0,16Zm0-32H80a8,8,0,0,1,0-16h96a8,8,0,0,1,0,16Zm0-32H80a8,8,0,0,1,0-16h96a8,8,0,0,1,0,16Z"

// "book-open" / "book-open-fill" — Reader mode (kept from the retired vendored
// reader-mode plugin's visual language).
const BOOK_OPEN_ICON_PATH =
  "M232,48H160a40,40,0,0,0-32,16A40,40,0,0,0,96,48H24a8,8,0,0,0-8,8V200a8,8,0,0,0,8,8H96a24,24,0,0,1,24,24,8,8,0,0,0,16,0,24,24,0,0,1,24-24h72a8,8,0,0,0,8-8V56A8,8,0,0,0,232,48ZM96,192H32V64H96a24,24,0,0,1,24,24V200A39.81,39.81,0,0,0,96,192Zm128,0H160a39.81,39.81,0,0,0-24,8V88a24,24,0,0,1,24-24h64Z"
const BOOK_OPEN_FILL_ICON_PATH =
  "M240,56V200a8,8,0,0,1-8,8H160a24,24,0,0,0-24,23.94,7.9,7.9,0,0,1-5.12,7.55A8,8,0,0,1,120,232a24,24,0,0,0-24-24H24a8,8,0,0,1-8-8V56a8,8,0,0,1,8-8H88a32,32,0,0,1,32,32v87.73a8.17,8.17,0,0,0,7.47,8.25,8,8,0,0,0,8.53-8V80a32,32,0,0,1,32-32h64A8,8,0,0,1,240,56Z"

// "flower-lotus" / "flower-lotus-fill" — Zen mode (kept from the retired
// zen-mode plugin).
const FLOWER_LOTUS_ICON_PATH =
  "M245.83,121.63a15.53,15.53,0,0,0-9.52-7.33,73.51,73.51,0,0,0-22.17-2.22c4-19.85,1-35.55-2.06-44.86a16.15,16.15,0,0,0-18.79-10.88,85.53,85.53,0,0,0-28.55,12.12,94.58,94.58,0,0,0-27.11-33.25,16.05,16.05,0,0,0-19.26,0A94.48,94.48,0,0,0,91.26,68.46,85.53,85.53,0,0,0,62.71,56.34,16.15,16.15,0,0,0,43.92,67.22c-3,9.31-6,25-2.06,44.86a73.51,73.51,0,0,0-22.17,2.22,15.53,15.53,0,0,0-9.52,7.33,16,16,0,0,0-1.6,12.27c3.39,12.57,13.8,36.48,45.33,55.32S113.13,208,128.05,208s42.67,0,74-18.78c31.53-18.84,41.94-42.75,45.33-55.32A16,16,0,0,0,245.83,121.63ZM59.14,72.14a.2.2,0,0,1,.23-.15A70.43,70.43,0,0,1,85.18,83.66,118.65,118.65,0,0,0,80,119.17c0,18.74,3.77,34,9.11,46.28A123.59,123.59,0,0,1,69.57,140C51.55,108.62,55.3,84,59.14,72.14Zm3,103.35C35.47,159.57,26.82,140.05,24,129.7a59.82,59.82,0,0,1,22.5-1.17,129.08,129.08,0,0,0,9.15,19.41,142.28,142.28,0,0,0,34,39.56A114.92,114.92,0,0,1,62.1,175.49ZM128,190.4c-9.33-6.94-32-28.23-32-71.23C96,76.7,118.38,55.24,128,48c9.62,7.26,32,28.72,32,71.19C160,162.17,137.33,183.46,128,190.4ZM170.82,83.66A70.43,70.43,0,0,1,196.63,72a.2.2,0,0,1,.23.15C200.7,84,204.45,108.62,186.43,140a123.32,123.32,0,0,1-19.54,25.48c5.34-12.26,9.11-27.54,9.11-46.28A118.65,118.65,0,0,0,170.82,83.66ZM232,129.72c-2.77,10.25-11.4,29.81-38.09,45.77a114.92,114.92,0,0,1-27.55,12,142.28,142.28,0,0,0,34-39.56,129.08,129.08,0,0,0,9.15-19.41A59.69,59.69,0,0,1,232,129.71Z"
const FLOWER_LOTUS_FILL_ICON_PATH =
  "M245.83,121.63a15.53,15.53,0,0,0-9.52-7.33,73.55,73.55,0,0,0-22.17-2.22c4-19.85,1-35.55-2-44.86a16.17,16.17,0,0,0-18.8-10.88,85.53,85.53,0,0,0-28.55,12.12,94.58,94.58,0,0,0-27.11-33.25,16.05,16.05,0,0,0-19.26,0A94.58,94.58,0,0,0,91.26,68.46,85.53,85.53,0,0,0,62.71,56.34,16.14,16.14,0,0,0,43.92,67.22c-3,9.31-6,25-2.06,44.86a73.55,73.55,0,0,0-22.17,2.22,15.53,15.53,0,0,0-9.52,7.33,16,16,0,0,0-1.6,12.26c3.39,12.58,13.8,36.49,45.33,55.33S113.13,208,128.05,208s42.67,0,74-18.78c31.53-18.84,41.94-42.75,45.33-55.33A16,16,0,0,0,245.83,121.63ZM62.1,175.49C35.47,159.57,26.82,140.05,24,129.7a59.61,59.61,0,0,1,22.5-1.17,129.08,129.08,0,0,0,9.15,19.41,142.28,142.28,0,0,0,34,39.56A114.92,114.92,0,0,1,62.1,175.49ZM128,190.4c-9.33-6.94-32-28.23-32-71.23C96,76.7,118.38,55.24,128,48c9.62,7.26,32,28.72,32,71.19C160,162.17,137.33,183.46,128,190.4Zm104-60.68c-2.77,10.24-11.4,29.81-38.09,45.77a114.92,114.92,0,0,1-27.55,12,142.28,142.28,0,0,0,34-39.56,129.08,129.08,0,0,0,9.15-19.41A59.69,59.69,0,0,1,232,129.71Z"

// "frame-corners" / "frame-corners-fill" — Normal screen mode (a windowed frame).
const FRAME_CORNERS_ICON_PATH =
  "M200,80v32a8,8,0,0,1-16,0V88H160a8,8,0,0,1,0-16h32A8,8,0,0,1,200,80ZM96,168H72V144a8,8,0,0,0-16,0v32a8,8,0,0,0,8,8H96a8,8,0,0,0,0-16ZM232,56V200a16,16,0,0,1-16,16H40a16,16,0,0,1-16-16V56A16,16,0,0,1,40,40H216A16,16,0,0,1,232,56ZM216,200V56H40V200H216Z"
const FRAME_CORNERS_FILL_ICON_PATH =
  "M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40ZM88,192H56a8,8,0,0,1-8-8V152a8,8,0,0,1,16,0v24H88a8,8,0,0,1,0,16Zm120-88a8,8,0,0,1-16,0V80H168a8,8,0,0,1,0-16h32a8,8,0,0,1,8,8Z"

// "arrows-out-simple" / "arrows-out-simple-fill" — Full screen (two diagonal
// arrows, the pre-refactor fullscreen glyph).
const ARROWS_OUT_SIMPLE_ICON_PATH =
  "M216,48V96a8,8,0,0,1-16,0V67.31l-50.34,50.35a8,8,0,0,1-11.32-11.32L188.69,56H160a8,8,0,0,1,0-16h48A8,8,0,0,1,216,48ZM106.34,138.34,56,188.69V160a8,8,0,0,0-16,0v48a8,8,0,0,0,8,8H96a8,8,0,0,0,0-16H67.31l50.35-50.34a8,8,0,0,0-11.32-11.32Z"
const ARROWS_OUT_SIMPLE_FILL_ICON_PATH =
  "M117.66,138.34a8,8,0,0,1,0,11.32L83.31,184l18.35,18.34A8,8,0,0,1,96,216H48a8,8,0,0,1-8-8V160a8,8,0,0,1,13.66-5.66L72,172.69l34.34-34.35A8,8,0,0,1,117.66,138.34ZM208,40H160a8,8,0,0,0-5.66,13.66L172.69,72l-34.35,34.34a8,8,0,0,0,11.32,11.32L184,83.31l18.34,18.35A8,8,0,0,0,216,96V48A8,8,0,0,0,208,40Z"

// "arrows-out" / "arrows-out-fill" — Canvas full screen (FOUR arrows outward =
// maximal expansion, one step beyond the two-arrow full screen).
const ARROWS_OUT_ICON_PATH =
  "M216,48V96a8,8,0,0,1-16,0V67.31l-42.34,42.35a8,8,0,0,1-11.32-11.32L188.69,56H160a8,8,0,0,1,0-16h48A8,8,0,0,1,216,48ZM98.34,146.34,56,188.69V160a8,8,0,0,0-16,0v48a8,8,0,0,0,8,8H96a8,8,0,0,0,0-16H67.31l42.35-42.34a8,8,0,0,0-11.32-11.32ZM208,152a8,8,0,0,0-8,8v28.69l-42.34-42.35a8,8,0,0,0-11.32,11.32L188.69,200H160a8,8,0,0,0,0,16h48a8,8,0,0,0,8-8V160A8,8,0,0,0,208,152ZM67.31,56H96a8,8,0,0,0,0-16H48a8,8,0,0,0-8,8V96a8,8,0,0,0,16,0V67.31l42.34,42.35a8,8,0,0,0,11.32-11.32Z"
const ARROWS_OUT_FILL_ICON_PATH =
  "M109.66,146.34a8,8,0,0,1,0,11.32L83.31,184l18.35,18.34A8,8,0,0,1,96,216H48a8,8,0,0,1-8-8V160a8,8,0,0,1,13.66-5.66L72,172.69l26.34-26.35A8,8,0,0,1,109.66,146.34ZM83.31,72l18.35-18.34A8,8,0,0,0,96,40H48a8,8,0,0,0-8,8V96a8,8,0,0,0,13.66,5.66L72,83.31l26.34,26.35a8,8,0,0,0,11.32-11.32ZM208,40H160a8,8,0,0,0-5.66,13.66L172.69,72,146.34,98.34a8,8,0,0,0,11.32,11.32L184,83.31l18.34,18.35A8,8,0,0,0,216,96V48A8,8,0,0,0,208,40Zm3.06,112.61a8,8,0,0,0-8.72,1.73L184,172.69l-26.34-26.35a8,8,0,0,0-11.32,11.32L172.69,184l-18.35,18.34A8,8,0,0,0,160,216h48a8,8,0,0,0,8-8V160A8,8,0,0,0,211.06,152.61Z"

// "magnifying-glass" — the search delegate (kept from the retired zen-mode plugin).
const MAGNIFIER_ICON_PATH =
  "M229.66,218.34l-50.07-50.06a88.11,88.11,0,1,0-11.31,11.31l50.06,50.07a8,8,0,0,0,11.32-11.32ZM40,112a72,72,0,1,1,72,72A72.08,72.08,0,0,1,40,112Z"

// --- Mode tables (single source for markup, generated CSS and the script) -----

/**
 * @typedef {object} ModeOption
 * @property {string} value      root-attribute value AND data-value
 * @property {string} label      popover row text (also the accessible name)
 * @property {string} iconPath   outline glyph (default state)
 * @property {string} fillIconPath filled glyph (selected / non-default cue)
 */

/** First entry is the DEFAULT mode of its group (outline glyph on the trigger). */
const READING_MODES = Object.freeze([
  { value: "plain", label: "Plain", iconPath: ARTICLE_ICON_PATH, fillIconPath: ARTICLE_FILL_ICON_PATH },
  { value: "reader", label: "Reader", iconPath: BOOK_OPEN_ICON_PATH, fillIconPath: BOOK_OPEN_FILL_ICON_PATH },
  { value: "zen", label: "Zen", iconPath: FLOWER_LOTUS_ICON_PATH, fillIconPath: FLOWER_LOTUS_FILL_ICON_PATH },
])

const SCREEN_MODES = Object.freeze([
  { value: "normal", label: "Normal", iconPath: FRAME_CORNERS_ICON_PATH, fillIconPath: FRAME_CORNERS_FILL_ICON_PATH },
  { value: "fullscreen", label: "Full screen", iconPath: ARROWS_OUT_SIMPLE_ICON_PATH, fillIconPath: ARROWS_OUT_SIMPLE_FILL_ICON_PATH },
  { value: "fullscreen-canvas", label: "Canvas full screen", iconPath: ARROWS_OUT_ICON_PATH, fillIconPath: ARROWS_OUT_FILL_ICON_PATH },
])

const GROUPS = Object.freeze([
  { group: "reading", attr: READING_MODE_ATTR, label: READING_GROUP_LABEL, modes: READING_MODES },
  { group: "screen", attr: SCREEN_MODE_ATTR, label: SCREEN_GROUP_LABEL, modes: SCREEN_MODES },
])

// --- Rendering -----------------------------------------------------------------

/** 256-viewBox Phosphor glyph; sized/positioned by CSS via its class. */
function glyph({ iconPath, className }) {
  return h(
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg",
      class: className,
      fill: "currentColor",
      viewBox: "0 0 256 256",
      "aria-hidden": "true",
    },
    h("path", { d: iconPath }),
  )
}

/** One radio group: trigger (current-mode glyph) + labeled popover. */
function switcherGroup({ group, label, modes }) {
  const defaultValue = modes[0].value
  return h("div", { class: "mode-switcher", "data-group": group }, [
    h(
      "button",
      {
        class: "mode-switcher-trigger",
        "aria-label": label,
        "aria-haspopup": "menu",
        "aria-expanded": "false",
      },
      // All trigger glyphs render; CSS shows exactly one per root attribute
      // (attribute set pre-paint by beforeDOMLoaded — no glyph flash).
      modes.map((mode) =>
        glyph({
          // Outline for the group's default mode, FILL for any other: the
          // filled trigger is the at-a-glance "a mode is active" cue.
          iconPath: mode.value === defaultValue ? mode.iconPath : mode.fillIconPath,
          className: `trigger-glyph trigger-glyph--${mode.value}`,
        }),
      ),
    ),
    h(
      "div",
      { class: "mode-switcher-popover", role: "menu" },
      modes.map((mode) =>
        h(
          "button",
          {
            class: "mode-switcher-option",
            role: "menuitemradio",
            "data-value": mode.value,
            // Initial truth for the pre-paint attribute defaults; the script
            // re-syncs from the live attributes on every nav.
            "aria-checked": String(mode.value === defaultValue),
          },
          [
            glyph({ iconPath: mode.iconPath, className: "option-glyph option-glyph--outline" }),
            glyph({ iconPath: mode.fillIconPath, className: "option-glyph option-glyph--fill" }),
            h("span", { class: "option-label" }, mode.label),
          ],
        ),
      ),
    ),
  ])
}

/** Quartz component constructor (same shape as the retired ZenMode). */
export function ModeSwitcher() {
  /** @param {{displayClass?: string}} props */
  function ModeSwitcherComponent({ displayClass }) {
    const withDisplayClass = (vnode) => {
      if (displayClass) vnode.props.class = `${vnode.props.class} ${displayClass}`
      return vnode
    }
    return h(Fragment, null, [
      withDisplayClass(
        h(
          "button",
          { class: "mode-search", "aria-label": SEARCH_LABEL },
          glyph({ iconPath: MAGNIFIER_ICON_PATH, className: "mode-search-glyph" }),
        ),
      ),
      ...GROUPS.map((groupSpec) => withDisplayClass(switcherGroup(groupSpec))),
    ])
  }

  ModeSwitcherComponent.css = MODE_SWITCHER_CSS
  ModeSwitcherComponent.beforeDOMLoaded = TOGGLE_SCRIPT
  return ModeSwitcherComponent
}

// --- Generated per-mode CSS (one source of truth: the mode tables) -------------

/** Trigger shows exactly the CURRENT mode's glyph. */
function triggerGlyphRules({ group, attr, modes }) {
  return modes
    .map(
      ({ value }) => `:root[${attr}="${value}"] .mode-switcher[data-group="${group}"] .trigger-glyph--${value} {
  display: block;
}`,
    )
    .join("\n")
}

/** Selected popover row: highlight + fill glyph (radio "checked" rendering). */
function selectedOptionRules({ group, attr, modes }) {
  return modes
    .map(({ value }) => {
      const row = `:root[${attr}="${value}"] .mode-switcher[data-group="${group}"] .mode-switcher-option[data-value="${value}"]`
      return `${row} {
  background-color: var(--highlight);
}
${row} .option-glyph--outline {
  display: none;
}
${row} .option-glyph--fill {
  display: block;
}`
    })
    .join("\n")
}

// --- Static CSS ------------------------------------------------------------------

// Cluster buttons mirror the retired plugins' 20px-icon toolbar pattern.
// Cascade note (inherited from zen-mode): base sidebar rules nest under
// `.page > #quartz-body` (an ID), so every rule fighting them MUST carry
// #quartz-body too, or it loses regardless of class count.
const STRUCTURAL_CSS = `
/* --- Cluster items ---------------------------------------------------------- */
.mode-search,
.mode-switcher-trigger {
  cursor: pointer;
  padding: 0;
  position: relative;
  background: none;
  border: none;
  height: 32px;
  margin: 0;
  text-align: inherit;
  flex-shrink: 0;
}
.mode-search {
  width: 20px;
}
.mode-search svg {
  position: absolute;
  width: 20px;
  height: 20px;
  top: calc(50% - 10px);
  left: 0;
  fill: var(--darkgray);
}
/* The plugin's three items ship in ONE Flex wrapper div (one layout slot per
   plugin). Dissolve it so each becomes its own flex item of the toolbar row:
   the group gap then applies around each item naturally, and the magnifier can
   be flex-ordered independently of the switchers. */
.sidebar.left .flex-component > div:has(> .mode-search) {
  display: contents;
}
/* Search magnifier: ALWAYS visible and the cluster's LEFTMOST icon, in every
   mode — a permanently discoverable way into search. */
.mode-search {
  order: -1;
}

/* --- Trigger: current-mode glyph (uniform 20px icon, same as .mode-search) --- */
.mode-switcher {
  position: relative;
  display: flex;
  align-items: center;
}
.mode-switcher-trigger {
  width: 20px;
  display: flex;
  align-items: center;
}
.mode-switcher-trigger .trigger-glyph {
  display: none;
  width: 20px;
  height: 20px;
  fill: var(--darkgray);
  flex-shrink: 0;
}

/* --- Popover (vertical radio list) ------------------------------------------ */
.mode-switcher-popover {
  display: none;
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 0.4rem;
  padding: 0.25rem;
  flex-direction: column;
  gap: 2px;
  min-width: max-content;
  border: 1px solid var(--lightgray);
  border-radius: 5px;
  background-color: var(--light);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
  /* Above the cluster's aria-label tooltip (z-index 3, engine custom.scss). */
  z-index: 4;
}
.mode-switcher[data-open] .mode-switcher-popover {
  display: flex;
}
.mode-switcher-option {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.35rem 0.6rem;
  background: none;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  color: var(--darkgray);
  font-size: 0.8rem;
  line-height: 1.4;
  white-space: nowrap;
  text-align: left;
}
.mode-switcher-option:hover {
  background-color: var(--lightgray);
}
.mode-switcher-option .option-glyph {
  width: 16px;
  height: 16px;
  fill: currentColor;
  flex-shrink: 0;
}
.mode-switcher-option .option-glyph--fill {
  display: none;
}
`

// Reader mode: sidebar chrome dims (hover-revealed), content column untouched.
// Owned here since the vendored reader-mode plugin is unregistered — the dim
// deliberately targets the sidebars' NON-cluster children so the corner
// cluster (the exit affordance) never fades (ticket 0005's lesson).
const READER_MODE_CSS = `
:root[reading-mode="reader"] .sidebar.left > *:not(.flex-component),
:root[reading-mode="reader"] .sidebar.right {
  opacity: 0;
  transition: opacity 0.2s ease;
}
:root[reading-mode="reader"] .sidebar.left:hover > *:not(.flex-component),
:root[reading-mode="reader"] .sidebar.right:hover {
  opacity: 1;
}
/* The magnifier opens the real search overlay (.search-container.active), a
   DESCENDANT of the dimmed .search root. Force the root opaque while the
   overlay is open — hover-reveal alone cannot be relied on (touch devices
   have no hover), and an opacity-0 ancestor hides the whole overlay. */
:root[reading-mode="reader"] .sidebar.left > .search:has(.search-container.active) {
  opacity: 1;
}
`

// Reading modes hide the darkmode wrapper: minimal chrome while reading. The
// magnifier + both switcher groups stay — they are the exit affordances.
// Hiding by :has() content stays generic — new cluster plugins hide
// automatically. WHY wrappers and not content: emptied wrappers would keep
// their flex-gap slots between the surviving icons.
const CLUSTER_MINIMIZE_CSS = `
:root:is([reading-mode="reader"], [reading-mode="zen"]) #quartz-body .sidebar.left .flex-component > div:not(:has(.mode-search)):not(:has(.mode-switcher)) {
  display: none;
}
`

// Zen mode: the width reclaim, ported verbatim from the retired zen-mode
// plugin (selector attribute renamed zen-mode="on" -> reading-mode="zen").
// The single grid override (no media query) beats base's desktop/tablet/
// mobile variants because base's media queries add no specificity.
const ZEN_MODE_CSS = `
/* Collapse the grid: single column, no sidebar areas
   (pattern: base.scss .page[data-frame="full-width"]). */
:root[reading-mode="zen"] .page > #quartz-body {
  grid-template-columns: auto;
  grid-template-rows: auto auto auto;
  grid-template-areas: "grid-header" "grid-center" "grid-footer";
  /* Base's 5px row-gap x the two empty trailing rows = 10px of dead scroll
     at the page bottom (breaks the canvas viewport fill in pageBody.js). */
  row-gap: 0;
}
/* Right sidebar (graph/backlinks/TOC): gone entirely. Also removes its
   grid-area reference, which would otherwise resurrect implicit columns. */
:root[reading-mode="zen"] #quartz-body .sidebar.right {
  display: none;
}
/* Left sidebar: everything hidden (page title, explorer) EXCEPT the
   mode-toggle cluster — the exit affordances — and the search ROOT (next
   rule). The cluster renders as a generic .flex-component div (Flex.tsx adds
   no group-name class) — the only stable selector for it; it is the sidebar's
   ONLY group (ref.ap.0zwhQQya81CGNQ9pmqKkM.E).
   WHY-NOT display:none on .sidebar.left itself: it would hide the cluster
   (fixed-position descendants of display:none ancestors don't render). */
:root[reading-mode="zen"] #quartz-body .sidebar.left > *:not(.flex-component):not(.search) {
  display: none;
}
/* The search ROOT stays renderable in zen so its fixed full-viewport overlay
   (.search-container.active) can still appear — the .mode-search magnifier in
   the corner cluster (and Ctrl/Cmd+K) opens it. Only the inline full-width
   button is hidden; with it hidden and the overlay out of flow, .search
   collapses to a zero-size box. */
:root[reading-mode="zen"] #quartz-body .sidebar.left > .search > .search-button {
  display: none;
}
/* Reclaim the .page cap too — zen means full available width. */
:root[reading-mode="zen"] .page {
  max-width: 100%;
}
/* Frugal vertical space: base's .page-header carries margin-top $topSpacing
   (6rem) to clear the sticky sidebars — both are gone in zen, so pull the
   first heading up. 2rem matches the pinned toggle cluster's top offset
   (ref.ap.0zwhQQya81CGNQ9pmqKkM.E). Desktop/tablet only: base already zeroes
   this margin on mobile (<800px), which this rule would otherwise override. */
@media (min-width: 800px) {
  :root[reading-mode="zen"] #quartz-body .page-header {
    margin-top: 2rem;
  }
}
/* Zen reads as pure content: drop the article/footer divider and the
   breadcrumbs trail too. */
:root[reading-mode="zen"] .center > hr,
:root[reading-mode="zen"] .center .breadcrumb-container {
  display: none;
}
/* Take the left sidebar OUT of the collapsed grid (its grid-area would
   otherwise resurrect an implicit column). The visible corner position of the
   cluster comes from the ALWAYS-ON cluster pin in the engine's custom.scss
   (unlayered, so it wins — ref.ap.0zwhQQya81CGNQ9pmqKkM.E); the fixed
   top-right placement here keeps this rule self-sufficient regardless. */
:root[reading-mode="zen"] #quartz-body .sidebar.left {
  position: fixed;
  top: 0;
  right: 0;
  left: auto;
  height: auto;
  width: auto;
  padding: 1rem;
  z-index: 2;
  /* Reading modes are a strict radio (reader's dim can never stack with zen),
     but the pinned exit affordance staying opaque is a hard invariant — keep
     it self-evident here rather than implied by the radio. */
  opacity: 1;
}
/* Full-bleed, not glued to the viewport edge (mobile keeps base's 1rem). */
@media (min-width: 800px) {
  :root[reading-mode="zen"] .page > #quartz-body {
    padding: 0 2rem;
  }
}
`

// Canvas full screen: the canvas-plugin expands the mount over the viewport
// at z-index 1 (fixed; see canvas-plugin/src/pageBody.js). base.scss makes
// .sidebar.left sticky — a stacking context of its own — so the corner
// cluster's z-index 2 is TRAPPED inside it and would paint UNDER the mount.
// Lift the sidebar's whole context above the mount and hide the sidebar
// chrome that would otherwise float over the canvas (same shape as the zen
// rules below: cluster + search root survive, search overlay stays openable).
// Scoped to real canvas pages via :has(.canvas-page) — on a note page with
// the fullscreen-canvas intent there is no expanded mount, so the normal
// fullscreen chrome stays untouched.
const CANVAS_FULL_SCREEN_CSS = `
:root[screen-mode="fullscreen-canvas"] #quartz-body:has(.canvas-page) .sidebar.left {
  z-index: 2;
}
:root[screen-mode="fullscreen-canvas"] #quartz-body:has(.canvas-page) .sidebar.left > *:not(.flex-component):not(.search) {
  display: none;
}
:root[screen-mode="fullscreen-canvas"] #quartz-body:has(.canvas-page) .sidebar.left > .search > .search-button {
  display: none;
}
`

const MODE_SWITCHER_CSS = [
  STRUCTURAL_CSS,
  ...GROUPS.map((groupSpec) => `${triggerGlyphRules(groupSpec)}\n${selectedOptionRules(groupSpec)}`),
  READER_MODE_CSS,
  CLUSTER_MINIMIZE_CSS,
  CANVAS_FULL_SCREEN_CSS,
  ZEN_MODE_CSS,
].join("\n")

// --- Client script ---------------------------------------------------------------

// Persistence: reading-mode mirrors darkmode (localStorage read in
// beforeDOMLoaded -> attribute set before first paint, no flash). screen-mode
// deliberately has NO storage: browsers refuse requestFullscreen without a
// user gesture, so a stored "fullscreen" could never be restored on load — a
// stored value would be a lie. The browser's fullscreen state IS the ground
// truth, synced to the attribute on "fullscreenchange" so Esc/F11 stay
// truthful. <html> is never swapped by the SPA router, so both attributes
// (and html-level fullscreen itself) survive every navigation.
const READING_MODE_VALUES = READING_MODES.map(({ value }) => value)
const TOGGLE_SCRIPT = `
const READING_VALUES = ${JSON.stringify(READING_MODE_VALUES)}
const savedReadingMode = localStorage.getItem("${READING_MODE_ATTR}")
document.documentElement.setAttribute(
  "${READING_MODE_ATTR}",
  READING_VALUES.includes(savedReadingMode) ? savedReadingMode : "${READING_MODES[0].value}",
)
document.documentElement.setAttribute("${SCREEN_MODE_ATTR}", "${SCREEN_MODES[0].value}")

const syncOptionState = () => {
  for (const option of document.querySelectorAll(".mode-switcher-option")) {
    const group = option.closest(".mode-switcher").getAttribute("data-group")
    const attr = group === "reading" ? "${READING_MODE_ATTR}" : "${SCREEN_MODE_ATTR}"
    const selected = document.documentElement.getAttribute(attr) === option.getAttribute("data-value")
    option.setAttribute("aria-checked", String(selected))
  }
}

const setMode = (attr, value, eventName) => {
  if (document.documentElement.getAttribute(attr) === value) return
  document.documentElement.setAttribute(attr, value)
  document.dispatchEvent(new CustomEvent(eventName, { detail: { mode: value } }))
  syncOptionState()
}

const applyScreenMode = (value) => {
  setMode("${SCREEN_MODE_ATTR}", value, "screenmodechange")
  if (value === "${SCREEN_MODES[0].value}") {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
  } else if (!document.documentElement.matches(":fullscreen")) {
    // Both fullscreen modes are html-level; "fullscreen-canvas" additionally
    // expands the canvas mount via pure CSS (canvas-plugin owns that rule), so
    // switching between them while fullscreen is attribute-only.
    document.documentElement.requestFullscreen().catch(() => {})
  }
}

// Search Enter-nav shim (docs-internal/tickets/0007-*.md): the vendored
// search plugin's Enter handler calls hideSearch() — which DETACHES the
// focused result anchor — before synthetically clicking it. A detached
// anchor's click cannot bubble to the SPA router's window listener, so the
// browser performs a FULL page load, destroying html-level fullscreen and
// resetting screen-mode (the state contract above). Re-route Enter to a click
// on the still-ATTACHED card: it then takes the exact same path as a mouse
// click (the search plugin stores the term + hides itself in its results
// click handler, the SPA router navigates). Capture phase on document fires
// before the plugin's target-phase listener on the search bar.
document.addEventListener(
  "keydown",
  (event) => {
    if (event.key !== "Enter" || event.isComposing) return
    if (!(event.target instanceof Element) || event.target.closest(".search-container.active") === null) return
    // The tag-autocomplete dropdown owns Enter while open — defer to the plugin.
    const tagDropdown = document.querySelector(".search-container.active .tag-suggestions")
    if (tagDropdown !== null && tagDropdown.style.display !== "none") return
    const focused = document.querySelector(".search-container.active .result-card.focus:not(.no-match)")
    if (!(focused instanceof HTMLAnchorElement)) return
    event.preventDefault()
    event.stopImmediatePropagation() // the plugin's own handler would re-click the (by then detached) anchor
    focused.click()
  },
  true,
)

// Browser fullscreen is ground truth: Esc/F11 exits must reset the intent.
// The check is <html>.matches(":fullscreen") — the one fullscreen level we use.
document.addEventListener("fullscreenchange", () => {
  if (
    !document.documentElement.matches(":fullscreen") &&
    document.documentElement.getAttribute("${SCREEN_MODE_ATTR}") !== "${SCREEN_MODES[0].value}"
  ) {
    setMode("${SCREEN_MODE_ATTR}", "${SCREEN_MODES[0].value}", "screenmodechange")
  }
})

const closePopovers = () => {
  for (const switcher of document.querySelectorAll(".mode-switcher[data-open]")) {
    switcher.removeAttribute("data-open")
    switcher.querySelector(".mode-switcher-trigger").setAttribute("aria-expanded", "false")
  }
}

const setupModeSwitcher = () => {
  for (const switcher of document.querySelectorAll(".mode-switcher")) {
    const trigger = switcher.querySelector(".mode-switcher-trigger")
    const onTrigger = () => {
      const wasOpen = switcher.hasAttribute("data-open")
      closePopovers() // radio groups: at most one popover open
      if (!wasOpen) {
        switcher.setAttribute("data-open", "")
        trigger.setAttribute("aria-expanded", "true")
      }
    }
    trigger.addEventListener("click", onTrigger)
    window.addCleanup(() => trigger.removeEventListener("click", onTrigger))

    for (const option of switcher.querySelectorAll(".mode-switcher-option")) {
      const onSelect = () => {
        const value = option.getAttribute("data-value")
        if (switcher.getAttribute("data-group") === "reading") {
          setMode("${READING_MODE_ATTR}", value, "readingmodechange")
          localStorage.setItem("${READING_MODE_ATTR}", value)
        } else {
          applyScreenMode(value)
        }
        closePopovers()
      }
      option.addEventListener("click", onSelect)
      window.addCleanup(() => option.removeEventListener("click", onSelect))
    }
  }

  const onDocumentClick = (event) => {
    if (!(event.target instanceof Element) || event.target.closest(".mode-switcher") === null) {
      closePopovers()
    }
  }
  const onKeydown = (event) => {
    if (event.key === "Escape") closePopovers()
  }
  document.addEventListener("click", onDocumentClick)
  document.addEventListener("keydown", onKeydown)
  window.addCleanup(() => {
    document.removeEventListener("click", onDocumentClick)
    document.removeEventListener("keydown", onKeydown)
  })

  // Mode-search icon: delegate to the REAL search button (hidden in zen, see
  // ZEN_MODE_CSS) so open/focus/Esc/Ctrl+K logic stays single-source in the
  // search plugin's script — no second search implementation.
  const openSearch = () => document.querySelector(".search > .search-button")?.click()
  for (const button of document.getElementsByClassName("mode-search")) {
    button.addEventListener("click", openSearch)
    window.addCleanup(() => button.removeEventListener("click", openSearch))
  }

  syncOptionState()
}
document.addEventListener("nav", setupModeSwitcher)
document.addEventListener("render", setupModeSwitcher)
`
