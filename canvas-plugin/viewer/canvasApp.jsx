/**
 * The React Flow canvas application: read-only graph + minimap + controls
 * (zoom, fit). One instance per canvas page mount.
 *
 * Fullscreen note: this app deliberately has NO fullscreen control. The
 * screen-mode radio in the top-right cluster (mode-switcher plugin) owns it —
 * "Canvas full screen" fullscreens <html> and expands the mount via pure CSS
 * (src/pageBody.js, keyed on <html screen-mode="fullscreen-canvas">). React
 * Flow tracks the resize through its own ResizeObserver; nothing to do here.
 */
import { Background, Controls, MiniMap, ReactFlow } from "@xyflow/react"
import { useState } from "react"
import {
  CanvasGroupNode,
  CanvasLinkNode,
  CanvasMediaNode,
  CanvasNoteNode,
  CanvasTextNode,
} from "./flowNodes.jsx"
import { CanvasEdge } from "./flowEdges.jsx"
import { FlowEdgeType, FlowNodeType } from "./canvasToFlow.js"
import { MinimapPreference } from "./minimapPreference.js"

const NODE_TYPES = Object.freeze({
  [FlowNodeType.TEXT]: CanvasTextNode,
  [FlowNodeType.NOTE]: CanvasNoteNode,
  [FlowNodeType.MEDIA]: CanvasMediaNode,
  [FlowNodeType.LINK]: CanvasLinkNode,
  [FlowNodeType.GROUP]: CanvasGroupNode,
})

const EDGE_TYPES = Object.freeze({
  [FlowEdgeType.CANVAS]: CanvasEdge,
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
 */
export function CanvasApp({ flow, theme }) {
  // Mistouch prevention (parity with the previous viewer): the wheel only
  // zooms the canvas after the user deliberately clicked/tapped it once —
  // until then, scrolling over the canvas keeps scrolling the page.
  const [interacted, setInteracted] = useState(false)
  const [minimapCollapsed, setMinimapCollapsed] = useState(() => minimapPreference.isCollapsed())

  const toggleMinimap = () => {
    setMinimapCollapsed((collapsed) => {
      const next = !collapsed
      minimapPreference.setCollapsed(next)
      return next
    })
  }

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
        edgeTypes={EDGE_TYPES}
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
        <Controls showInteractive={false} fitViewOptions={FIT_VIEW_OPTIONS} />
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
