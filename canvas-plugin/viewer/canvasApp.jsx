/**
 * The React Flow canvas application: read-only graph + minimap + controls
 * (zoom, fit, fullscreen). One instance per canvas page mount.
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

/**
 * @param {object} props
 * @param {{nodes: any[], edges: any[]}} props.flow    converted React Flow graph
 * @param {"light" | "dark"} props.theme
 * @param {HTMLElement} props.fullscreenTarget          the page mount div (stays valid across renders)
 * @param {boolean} props.restoreFullscreen             re-enter fullscreen dropped by the SPA DOM swap
 */
export function CanvasApp({ flow, theme, fullscreenTarget, restoreFullscreen }) {
  // Mistouch prevention (parity with the previous viewer): the wheel only
  // zooms the canvas after the user deliberately clicked/tapped it once —
  // until then, scrolling over the canvas keeps scrolling the page.
  const [interacted, setInteracted] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(document.fullscreenElement !== null)
    document.addEventListener("fullscreenchange", onFullscreenChange)
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange)
  }, [])

  useEffect(() => {
    if (restoreFullscreen) {
      // Relies on the transient user activation of the click that triggered
      // the navigation still being valid; degrade gracefully if rejected.
      fullscreenTarget.requestFullscreen().catch(() => {})
    }
  }, [restoreFullscreen, fullscreenTarget])

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement !== null) {
      document.exitFullscreen().catch(() => {})
    } else {
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
      >
        <Background gap={24} />
        {/* Same options as the initial fit: re-fit must honor the 1:1 cap too
            (React Flow's default would zoom a sparse canvas up to maxZoom). */}
        <Controls showInteractive={false} fitViewOptions={FIT_VIEW_OPTIONS}>
          <ControlButton
            className="canvas-flow-fullscreen"
            onClick={toggleFullscreen}
            title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          >
            {isFullscreen ? "🡼" : "⛶"}
          </ControlButton>
        </Controls>
        <MiniMap
          className="canvas-flow-minimap"
          pannable
          zoomable
          nodeColor={(node) => node.data?.colorValue ?? MINIMAP_FALLBACK_NODE_COLOR}
        />
      </ReactFlow>
    </div>
  )
}
