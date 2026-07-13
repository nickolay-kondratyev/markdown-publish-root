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
 * above the prerendered fragment body fetched from this node's own fragment URL.
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

/**
 * Link node: the external URL in a header, then either a whitelisted-provider
 * embed iframe or a rich link card (the DEFAULT — arbitrary origins refuse
 * framing, so a raw iframe shows a browser error page on the published site).
 * The embed-vs-card decision is prebaked by the rewriter
 * (ref CanvasRewriter.rewriteLinkNode); no provider logic runs client-side.
 */
export function CanvasLinkNode({ data, selected }) {
  const { url, link } = data
  return (
    <CardShell selected={selected} colorValue={data.colorValue} className="canvas-link-node">
      <div className="canvas-link-header">
        <a className="canvas-link-url" href={url} target="_blank" rel="noopener noreferrer">
          {url}
        </a>
      </div>
      {link.mode === "embed" ? <LinkEmbed embedUrl={link.embedUrl} /> : <LinkCard url={url} meta={link.meta} />}
    </CardShell>
  )
}

function LinkEmbed({ embedUrl }) {
  return (
    <iframe
      className="canvas-link-frame"
      src={embedUrl}
      title={embedUrl}
      sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
      allow="autoplay; encrypted-media; picture-in-picture; fullscreen; clipboard-write"
      allowFullScreen
      loading="lazy"
    />
  )
}

/**
 * Rich link card: publish-time OpenGraph metadata (title/description/domain)
 * with an optional HOTLINKED thumbnail. A failed image load hides the
 * thumbnail (remote images rot / block hotlinking) — the card degrades to
 * text-only, never a broken-image icon.
 */
function LinkCard({ url, meta }) {
  const [imageFailed, setImageFailed] = useState(false)
  const title = meta.title ?? meta.domain ?? url
  return (
    <a className="canvas-link-card" href={url} target="_blank" rel="noopener noreferrer">
      {meta.image !== undefined && !imageFailed && (
        <img
          className="canvas-link-card-image"
          src={meta.image}
          alt=""
          loading="lazy"
          draggable={false}
          onError={() => setImageFailed(true)}
        />
      )}
      <div className="canvas-link-card-text">
        <div className="canvas-link-card-title">{title}</div>
        {meta.description !== undefined && (
          <div className="canvas-link-card-description">{meta.description}</div>
        )}
        <div className="canvas-link-card-domain">{meta.siteName ?? meta.domain ?? ""}</div>
      </div>
    </a>
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
