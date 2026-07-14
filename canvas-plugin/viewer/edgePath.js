/**
 * Obsidian-style edge geometry: a cubic bezier whose control points extend
 * PERPENDICULAR out of each endpoint's card side, scaled by the distance
 * between the endpoints.
 *
 * WHY not React Flow's built-in bezier: its control-point offset is computed
 * along the handle axis only, so an edge that travels parallel to its handle's
 * side (e.g. left side -> left side of a card straight below) collapses to a
 * near-straight line hugging the cards — visibly wrong vs Obsidian, which
 * always bows edges out of the side they leave.
 *
 * NO React and NO DOM here — unit-testable in plain Node.
 */

/** Control-point reach as a fraction of the endpoint distance (matches the
 * pleasant "half the gap" sweep of a plain forward bezier). */
const CONTROL_OFFSET_RATIO = 0.5
/** Floor: even near-touching cards get a visible perpendicular exit. */
const CONTROL_OFFSET_MIN = 32
/** Cap: very long edges stay a gentle sweep instead of a giant balloon. */
const CONTROL_OFFSET_MAX = 320

/** Outward unit normal of each card side ("top"/"right"/"bottom"/"left"). */
const SIDE_NORMALS = Object.freeze({
  top: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
})

/**
 * @param {object} p endpoint geometry (React Flow custom-edge props subset;
 *   sourcePosition/targetPosition are the Position enum's plain string values)
 * @param {number} p.sourceX
 * @param {number} p.sourceY
 * @param {"top"|"right"|"bottom"|"left"} p.sourcePosition
 * @param {number} p.targetX
 * @param {number} p.targetY
 * @param {"top"|"right"|"bottom"|"left"} p.targetPosition
 * @returns {{path: string, labelX: number, labelY: number}} SVG path + label anchor (bezier midpoint)
 */
export function obsidianEdgePath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition }) {
  const distance = Math.hypot(targetX - sourceX, targetY - sourceY)
  const offset = Math.min(Math.max(distance * CONTROL_OFFSET_RATIO, CONTROL_OFFSET_MIN), CONTROL_OFFSET_MAX)
  const sourceNormal = SIDE_NORMALS[sourcePosition] ?? SIDE_NORMALS.right
  const targetNormal = SIDE_NORMALS[targetPosition] ?? SIDE_NORMALS.left
  const c1x = sourceX + sourceNormal.x * offset
  const c1y = sourceY + sourceNormal.y * offset
  const c2x = targetX + targetNormal.x * offset
  const c2y = targetY + targetNormal.y * offset
  return {
    path: `M${sourceX},${sourceY} C${c1x},${c1y} ${c2x},${c2y} ${targetX},${targetY}`,
    // Cubic bezier evaluated at t=0.5: (P0 + 3*C1 + 3*C2 + P1) / 8.
    labelX: (sourceX + 3 * c1x + 3 * c2x + targetX) / 8,
    labelY: (sourceY + 3 * c1y + 3 * c2y + targetY) / 8,
  }
}
