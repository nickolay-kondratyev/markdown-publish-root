/**
 * React Flow custom node components for the five canvas card kinds.
 *
 * Interaction model (Obsidian-Publish parity, plan/main.md §2.2): the first
 * click on a card only SELECTS it — a transparent click-guard sits above the
 * content until the node is selected, so links/scroll/media controls become
 * usable on the second click. React Flow's node wrapper handles the selection
 * itself; the guard just stops the first click from reaching the content.
 *
 * All HTML injected here is trusted build output (prebaked by the rewriter) —
 * never user-of-the-site input.
 */
import { Handle, Position } from "@xyflow/react"
import { useEffect, useState } from "react"
import { MediaKind } from "../src/canvasSchema.js"

const HANDLE_SIDES = Object.freeze({
  top: Position.Top,
  right: Position.Right,
  bottom: Position.Bottom,
  left: Position.Left,
})

/** Invisible connection anchors on all four sides (edge routing targets). */
function NodeHandles() {
  return Object.entries(HANDLE_SIDES).flatMap(([side, position]) => [
    <Handle key={`s-${side}`} id={side} type="source" position={position} className="canvas-flow-handle" isConnectable={false} />,
    <Handle key={`t-${side}`} id={side} type="target" position={position} className="canvas-flow-handle" isConnectable={false} />,
  ])
}

/**
 * Shared card chrome: color accent, handles, scrollable content, click-guard.
 * `nowheel`/`nopan` (React Flow marker classes) activate only while selected,
 * so an unselected card still pans/zooms the canvas under the pointer.
 */
function CardShell({ selected, colorValue, className, children }) {
  return (
    <div
      className={`canvas-flow-card ${className}${selected ? " is-selected" : ""}`}
      style={colorValue ? { "--canvas-node-color": colorValue } : undefined}
    >
      <NodeHandles />
      <div className={`canvas-node-content${selected ? " nowheel nopan" : ""}`}>{children}</div>
      {!selected && <div className="canvas-node-click-guard" data-testid="click-guard" />}
    </div>
  )
}

/** Prebaked-HTML cards: markdown text cards AND rewritten cards (canvas/pdf/placeholder). */
export function CanvasTextNode({ data, selected }) {
  return (
    <CardShell selected={selected} colorValue={data.colorValue} className="canvas-text-node">
      <div className="canvas-node-html" dangerouslySetInnerHTML={{ __html: data.html }} />
    </CardShell>
  )
}

const FETCH_FAILED_TEXT = "Failed to load content."

/** @returns {{status: "loading"|"ok"|"error", text?: string}} fetched body of a note fragment / plaintext file */
function useFetchedText(url) {
  const [state, setState] = useState({ status: "loading" })
  useEffect(() => {
    if (url === undefined) {
      setState({ status: "error" })
      return undefined
    }
    let cancelled = false
    fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.text()
      })
      .then((text) => !cancelled && setState({ status: "ok", text }))
      .catch(() => !cancelled && setState({ status: "error" }))
    return () => {
      cancelled = true
    }
  }, [url])
  return state
}

/**
 * Note card: sticky header with the open-note affordance (the header link is
 * what navigates — whole-card navigation would prevent reading long cards)
 * above the prerendered fragment body fetched from the attachments-remapped URL.
 */
export function CanvasNoteNode({ data, selected }) {
  const { noteLink } = data
  const body = useFetchedText(data.fragmentUrl)
  return (
    <CardShell selected={selected} colorValue={data.colorValue} className="canvas-note-node">
      <div className="canvas-note-header">
        <a className="internal canvas-note-open" href={noteLink.href}>
          {noteLink.subpathLabel ? `${noteLink.title} > ${noteLink.subpathLabel}` : noteLink.title}
        </a>
      </div>
      {body.status === "ok" ? (
        // Prerendered fragment — trusted build output.
        <div className="canvas-note-body" dangerouslySetInnerHTML={{ __html: body.text }} />
      ) : (
        <div className="canvas-note-body">{body.status === "error" ? FETCH_FAILED_TEXT : ""}</div>
      )}
    </CardShell>
  )
}

/** Media card: image/audio/video element, or plain fetched text (.txt/.mdx/.markdown). */
export function CanvasMediaNode({ data, selected }) {
  return (
    <CardShell selected={selected} colorValue={data.colorValue} className="canvas-media-node">
      <MediaContent data={data} />
    </CardShell>
  )
}

function MediaContent({ data }) {
  switch (data.mediaKind) {
    case MediaKind.IMAGE:
      return <img className="canvas-media-image" src={data.url} alt={data.fileName} draggable={false} />
    case MediaKind.AUDIO:
      return <audio className="canvas-media-audio" src={data.url} controls />
    case MediaKind.VIDEO:
      return <video className="canvas-media-video" src={data.url} controls />
    default:
      return <PlaintextContent url={data.url} />
  }
}

function PlaintextContent({ url }) {
  const body = useFetchedText(url)
  return (
    <div className="canvas-media-plaintext">
      {body.status === "ok" ? body.text : body.status === "error" ? FETCH_FAILED_TEXT : ""}
    </div>
  )
}

/** Link card: the external URL in a header + the page embedded in a sandboxed iframe. */
export function CanvasLinkNode({ data, selected }) {
  return (
    <CardShell selected={selected} colorValue={data.colorValue} className="canvas-link-node">
      <div className="canvas-link-header">
        <a className="canvas-link-url" href={data.url} target="_blank" rel="noopener noreferrer">
          {data.url}
        </a>
      </div>
      <iframe
        className="canvas-link-frame"
        src={data.url}
        title={data.url}
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
        loading="lazy"
      />
    </CardShell>
  )
}

/** Group: translucent tinted region with a floating label chip; never selectable. */
export function CanvasGroupNode({ data }) {
  return (
    <div
      className="canvas-group-node"
      style={data.colorValue ? { "--canvas-node-color": data.colorValue } : undefined}
    >
      <NodeHandles />
      {data.label !== undefined && data.label !== "" && (
        <div className="canvas-group-label">{data.label}</div>
      )}
    </div>
  )
}
