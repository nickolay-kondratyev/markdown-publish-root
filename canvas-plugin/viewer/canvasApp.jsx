/**
 * The React Flow canvas application: read-only graph + minimap + controls
 * (zoom, fit, canvas fullscreen). One instance per canvas page mount.
 *
 * Fullscreen has TWO LEVELS (docs/tickets/full-screen-mode.md):
 * - OUTER: the site-wide toolbar toggle (full-screen-mode plugin) fullscreens
 *   <html> — whole page chrome, survives SPA navigation.
 * - INNER (this control): fullscreens the canvas MOUNT — just the canvas fills
 *   the screen. The Fullscreen API stacks: entering the inner level while the
 *   outer is on nests it, and exiting pops back to the outer level.
 * Each level keys on ITS OWN element (mount here, <html> in the plugin), never
 * on "anything is fullscreen" — that is what keeps the two glyphs truthful.
 */
import { Background, ControlButton, Controls, MiniMap, ReactFlow } from "@xyflow/react"
import { useCallback, useEffect, useState } from "react"
import {
  CanvasGroupNode,
  CanvasLinkNode,
  CanvasMediaNode,
  CanvasNoteNode,
  CanvasTextNode,
} from "./flowNodes.jsx"
import { FlowNodeType } from "./canvasToFlow.js"
import { MinimapPreference } from "./minimapPreference.js"

const NODE_TYPES = Object.freeze({
  [FlowNodeType.TEXT]: CanvasTextNode,
  [FlowNodeType.NOTE]: CanvasNoteNode,
  [FlowNodeType.MEDIA]: CanvasMediaNode,
  [FlowNodeType.LINK]: CanvasLinkNode,
  [FlowNodeType.GROUP]: CanvasGroupNode,
})

// Obsidian-like zoom range (parity with the previous viewer's 0.05x-20x clamp).
const MIN_ZOOM = 0.05
const MAX_ZOOM = 20
// Initial fit never zooms IN past 1:1 — a one-card canvas should not fill the screen.
const FIT_VIEW_OPTIONS = Object.freeze({ padding: 0.08, maxZoom: 1 })
const MINIMAP_FALLBACK_NODE_COLOR = "#d4d4d4"
// Frozen module-level constant so ReactFlow gets a stable reference across renders.
const PRO_OPTIONS = Object.freeze({ hideAttribution: true })

// One global preference shared by every canvas page (survives SPA navigation).
const minimapPreference = new MinimapPreference(window.localStorage)

// Phosphor Icons "arrows-out-simple" / "arrows-in-simple" (regular), 256x256
// viewBox — ref.ap.rv8cIwZWjlbPzjNjY1Dy4.E: the SAME glyph pair as the site-wide
// toolbar toggle (full-screen-mode/src/fullScreenMode.js), so the two fullscreen
// levels share one visual language. Keep the copies in sync (separate Quartz
// plugin packages — no shared module to import from).
// License: MIT — https://github.com/phosphor-icons/core/blob/main/LICENSE
const ARROWS_OUT_ICON_PATH =
  "M216,48V96a8,8,0,0,1-16,0V67.31l-50.34,50.35a8,8,0,0,1-11.32-11.32L188.69,56H160a8,8,0,0,1,0-16h48A8,8,0,0,1,216,48ZM106.34,138.34,56,188.69V160a8,8,0,0,0-16,0v48a8,8,0,0,0,8,8H96a8,8,0,0,0,0-16H67.31l50.35-50.34a8,8,0,0,0-11.32-11.32Z"
const ARROWS_IN_ICON_PATH =
  "M213.66,53.66,163.31,104H192a8,8,0,0,1,0,16H144a8,8,0,0,1-8-8V64a8,8,0,0,1,16,0V92.69l50.34-50.35a8,8,0,0,1,11.32,11.32ZM112,136H64a8,8,0,0,0,0,16H92.69L42.34,202.34a8,8,0,0,0,11.32,11.32L104,163.31V192a8,8,0,0,0,16,0V144A8,8,0,0,0,112,136Z"

/** Enter/exit fullscreen glyph (sized by React Flow's controls-button CSS). */
function FullscreenGlyph({ iconPath }) {
  return (
    <svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
      <path d={iconPath} />
    </svg>
  )
}

/** Minimap pictogram (outer map + viewport dot) — stable across both toggle states. */
function MinimapToggleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="1.5" y="2.5" width="13" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <rect x="8" y="7.5" width="4.5" height="3.5" rx="1" fill="currentColor" />
    </svg>
  )
}

/**
 * @param {object} props
 * @param {{nodes: any[], edges: any[]}} props.flow    converted React Flow graph
 * @param {"light" | "dark"} props.theme
 * @param {HTMLElement} props.fullscreenTarget          the page mount div (stays valid across renders)
 * @param {boolean} props.restoreFullscreen             re-enter canvas fullscreen dropped by the SPA DOM swap
 */
export function CanvasApp({ flow, theme, fullscreenTarget, restoreFullscreen }) {
  // Mistouch prevention (parity with the previous viewer): the wheel only
  // zooms the canvas after the user deliberately clicked/tapped it once —
  // until then, scrolling over the canvas keeps scrolling the page.
  const [interacted, setInteracted] = useState(false)
  const [isCanvasFullscreen, setIsCanvasFullscreen] = useState(false)
  const [minimapCollapsed, setMinimapCollapsed] = useState(() => minimapPreference.isCollapsed())

  const toggleMinimap = useCallback(() => {
    setMinimapCollapsed((collapsed) => {
      const next = !collapsed
      minimapPreference.setCollapsed(next)
      return next
    })
  }, [])

  useEffect(() => {
    // The MOUNT specifically — site-wide fullscreen (<html>) must not flip
    // this glyph to "exit": the canvas level is still available on top of it.
    const onFullscreenChange = () =>
      setIsCanvasFullscreen(document.fullscreenElement === fullscreenTarget)
    document.addEventListener("fullscreenchange", onFullscreenChange)
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange)
  }, [fullscreenTarget])

  useEffect(() => {
    if (restoreFullscreen) {
      // Relies on the transient user activation of the click that triggered
      // the navigation still being valid; degrade gracefully if rejected.
      fullscreenTarget.requestFullscreen().catch(() => {})
    }
  }, [restoreFullscreen, fullscreenTarget])

  const toggleCanvasFullscreen = useCallback(() => {
    if (document.fullscreenElement === fullscreenTarget) {
      // Pops ONE level: nested under site-wide fullscreen this lands back on
      // the fullscreen <html>, not on a windowed page.
      document.exitFullscreen().catch(() => {})
    } else {
      // Stacks on top of site-wide fullscreen when that is active.
      fullscreenTarget.requestFullscreen().catch(() => {})
    }
  }, [fullscreenTarget])

  return (
    <div
      className="canvas-flow-viewer"
      data-canvas-theme={theme}
      onPointerDownCapture={() => setInteracted(true)}
    >
      {/* Uncontrolled (defaultNodes/defaultEdges): the graph is static, and React
          Flow must own state internally for click-selection changes to apply. */}
      <ReactFlow
        defaultNodes={flow.nodes}
        defaultEdges={flow.edges}
        nodeTypes={NODE_TYPES}
        colorMode={theme}
        fitView
        fitViewOptions={FIT_VIEW_OPTIONS}
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        nodesDraggable={false}
        nodesConnectable={false}
        nodesFocusable={false}
        edgesFocusable={false}
        elementsSelectable
        zoomOnScroll={interacted}
        preventScrolling={interacted}
        // Official API to hide the "React Flow" attribution (MIT license permits it).
        proOptions={PRO_OPTIONS}
      >
        <Background gap={24} />
        {/* Same options as the initial fit: re-fit must honor the 1:1 cap too
            (React Flow's default would zoom a sparse canvas up to maxZoom). */}
        <Controls showInteractive={false} fitViewOptions={FIT_VIEW_OPTIONS}>
          <ControlButton
            className="canvas-flow-fullscreen"
            onClick={toggleCanvasFullscreen}
            title={isCanvasFullscreen ? "Exit canvas fullscreen" : "Enter canvas fullscreen"}
          >
            <FullscreenGlyph iconPath={isCanvasFullscreen ? ARROWS_IN_ICON_PATH : ARROWS_OUT_ICON_PATH} />
          </ControlButton>
        </Controls>
        {!minimapCollapsed && (
          <MiniMap
            className="canvas-flow-minimap"
            pannable
            zoomable
            nodeColor={(node) => node.data?.colorValue ?? MINIMAP_FALLBACK_NODE_COLOR}
          />
        )}
      </ReactFlow>
      {/* Pinned to the minimap's corner so it stays put as the expand
          affordance when the minimap is collapsed (mirrors the zen-mode
          "exit icon stays visible" pattern). */}
      <button
        type="button"
        className="canvas-flow-minimap-toggle"
        onClick={toggleMinimap}
        aria-pressed={!minimapCollapsed}
        title={minimapCollapsed ? "Show minimap" : "Hide minimap"}
        aria-label={minimapCollapsed ? "Show minimap" : "Hide minimap"}
      >
        <MinimapToggleIcon />
      </button>
    </div>
  )
}
