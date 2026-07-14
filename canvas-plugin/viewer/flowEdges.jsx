/**
 * React Flow custom edge for canvas connections: Obsidian-style bezier
 * (perpendicular exit from the card side — geometry in edgePath.js).
 * Registered as the type of every edge canvasToFlow emits (ref FlowEdgeType).
 */
import { BaseEdge } from "@xyflow/react"
import { obsidianEdgePath } from "./edgePath.js"

export function CanvasEdge({
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
  label,
  style,
  markerStart,
  markerEnd,
}) {
  const { path, labelX, labelY } = obsidianEdgePath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })
  return (
    <BaseEdge
      path={path}
      labelX={labelX}
      labelY={labelY}
      label={label}
      style={style}
      markerStart={markerStart}
      markerEnd={markerEnd}
    />
  )
}
