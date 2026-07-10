/**
 * Pure conversion: rewritten JSON Canvas payload -> React Flow graph.
 *
 * JSON Canvas 1.0 (https://jsoncanvas.org/spec/1.0/) semantics honored here:
 *   - node x/y are top-left coordinates (React Flow's default node origin).
 *   - z-order = array order (mapped to zIndex).
 *   - colors: presets "1".."6" or hex — resolved to concrete hex so SVG edge
 *     strokes/markers work (CSS vars are unreliable in SVG marker attributes).
 *   - edge fromSide/toSide -> source/target handle ids; missing sides are
 *     inferred from node geometry (dominant axis between centers — what
 *     Obsidian does visually).
 *   - edge endpoints: toEnd defaults to "arrow", fromEnd defaults to "none"
 *     (both honored — the previous hesprs renderer ignored them).
 *
 * NO React and NO DOM here — unit-testable in plain Node.
 */
import { MediaKind, classifyMediaKind } from "../src/canvasSchema.js"

/** Flow node type names. Namespaced: "group" is a reserved React Flow built-in. */
export const FlowNodeType = Object.freeze({
  TEXT: "canvasText",
  NOTE: "canvasNote",
  MEDIA: "canvasMedia",
  LINK: "canvasLink",
  GROUP: "canvasGroup",
})

/**
 * The six JSON Canvas preset colors (Obsidian palette). Same values serve both
 * themes — Obsidian keeps canvas hues stable across light/dark.
 */
export const PRESET_COLORS = Object.freeze({
  1: "#fb464c", // red
  2: "#e9973f", // orange
  3: "#e0de71", // yellow
  4: "#44cf6e", // green
  5: "#53dfdd", // cyan
  6: "#a882ff", // purple
})

/**
 * @param {string | undefined} color JSON Canvas color: preset "1".."6" or "#rrggbb"
 * @returns {string | undefined} concrete hex, or undefined for absent/unknown values
 */
export function resolveCanvasColor(color) {
  if (color === undefined || color === null || color === "") return undefined
  const preset = PRESET_COLORS[color]
  if (preset !== undefined) return preset
  return String(color).startsWith("#") ? String(color) : undefined
}

/**
 * @typedef {object} CanvasViewPayload
 * @property {{nodes: any[], edges: any[]}} canvas rewritten JSON Canvas (text cards are prebaked HTML)
 * @property {Record<string, string>} attachments media node.file -> page-relative URL
 * @property {Record<string, {href: string, title: string, fragmentUrl: string, subpathLabel?: string}>} noteLinks
 *   per note-card node id (fragments are per NODE — same note, different subpaths)
 */

/**
 * @param {CanvasViewPayload} payload
 * @returns {{nodes: any[], edges: any[]}} React Flow nodes + edges
 */
export function canvasToFlow(payload) {
  const canvasNodes = payload.canvas?.nodes ?? []
  const canvasEdges = payload.canvas?.edges ?? []
  const attachments = payload.attachments ?? {}
  const noteLinks = payload.noteLinks ?? {}

  const nodes = canvasNodes.map((node, index) => toFlowNode(node, index, attachments, noteLinks))
  const nodeById = new Map(canvasNodes.map((node) => [node.id, node]))
  const edges = canvasEdges.map((edge) => toFlowEdge(edge, nodeById))
  return { nodes, edges }
}

function toFlowNode(node, index, attachments, noteLinks) {
  const colorValue = resolveCanvasColor(node.color)
  return {
    id: node.id,
    type: flowNodeTypeOf(node, noteLinks),
    position: { x: node.x, y: node.y },
    width: node.width,
    height: node.height,
    // JSON Canvas z-order = array order. Groups come first in practice, so
    // they naturally render behind their members.
    zIndex: index,
    draggable: false,
    connectable: false,
    selectable: node.type !== "group",
    data: nodeData(node, attachments, noteLinks, colorValue),
  }
}

function flowNodeTypeOf(node, noteLinks) {
  switch (node.type) {
    case "text":
      return FlowNodeType.TEXT
    case "file":
      // The rewriter only keeps NOTE and MEDIA targets as file nodes; a
      // noteLinks entry is what distinguishes a note card.
      return noteLinks[node.id] !== undefined ? FlowNodeType.NOTE : FlowNodeType.MEDIA
    case "link":
      return FlowNodeType.LINK
    case "group":
      return FlowNodeType.GROUP
    default:
      // Future node types degrade to an inert text card instead of crashing.
      return FlowNodeType.TEXT
  }
}

function nodeData(node, attachments, noteLinks, colorValue) {
  switch (node.type) {
    case "text":
      return { colorValue, html: node.text ?? "" }
    case "file": {
      const entry = noteLinks[node.id]
      if (entry !== undefined) {
        // fragmentUrl feeds the body fetch; the rest is the open-note affordance.
        const { fragmentUrl, ...noteLink } = entry
        return { colorValue, fragmentUrl, noteLink }
      }
      return {
        colorValue,
        url: attachments[node.file],
        mediaKind: classifyMediaKind(node.file ?? "") ?? MediaKind.PLAINTEXT,
        fileName: (node.file ?? "").split("/").at(-1) ?? "",
      }
    }
    case "link":
      return { colorValue, url: node.url ?? "" }
    case "group":
      return { colorValue, label: node.label }
    default:
      return { colorValue, html: "" }
  }
}

/** Arrowhead spec literal ("arrowclosed" === React Flow's MarkerType.ArrowClosed). */
function arrowMarker(colorValue) {
  return { type: "arrowclosed", width: 18, height: 18, ...(colorValue ? { color: colorValue } : {}) }
}

function toFlowEdge(edge, nodeById) {
  const colorValue = resolveCanvasColor(edge.color)
  const { fromSide, toSide } = edgeSides(edge, nodeById)
  return {
    id: edge.id,
    source: edge.fromNode,
    target: edge.toNode,
    sourceHandle: fromSide,
    targetHandle: toSide,
    ...(edge.label !== undefined && edge.label !== "" ? { label: edge.label } : {}),
    // Spec defaults: fromEnd "none", toEnd "arrow".
    ...(edge.fromEnd === "arrow" ? { markerStart: arrowMarker(colorValue) } : {}),
    ...(edge.toEnd === "none" ? {} : { markerEnd: arrowMarker(colorValue) }),
    ...(colorValue ? { style: { stroke: colorValue } } : {}),
    data: { colorValue },
  }
}

/**
 * Sides for both endpoints, inferring absent ones from geometry: connect along
 * the dominant axis between node centers.
 *
 * Dangling edges (an endpoint id with no matching node) are NOT supported:
 * the fixed "right"->"left" fallback only keeps conversion total (no crash) —
 * React Flow drops edges with unknown endpoints at render time (warning #008).
 * Acceptable: Obsidian itself never saves dangling edges.
 */
function edgeSides(edge, nodeById) {
  const fromNode = nodeById.get(edge.fromNode)
  const toNode = nodeById.get(edge.toNode)
  let inferred
  if (fromNode !== undefined && toNode !== undefined) {
    const dx = centerOf(toNode).x - centerOf(fromNode).x
    const dy = centerOf(toNode).y - centerOf(fromNode).y
    inferred =
      Math.abs(dx) >= Math.abs(dy)
        ? dx >= 0
          ? { from: "right", to: "left" }
          : { from: "left", to: "right" }
        : dy >= 0
          ? { from: "bottom", to: "top" }
          : { from: "top", to: "bottom" }
  } else {
    inferred = { from: "right", to: "left" }
  }
  return { fromSide: edge.fromSide ?? inferred.from, toSide: edge.toSide ?? inferred.to }
}

function centerOf(node) {
  return { x: node.x + node.width / 2, y: node.y + node.height / 2 }
}
