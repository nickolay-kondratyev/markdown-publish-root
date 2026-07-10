import assert from "node:assert/strict"
import { describe, test } from "node:test"
import {
  FlowNodeType,
  PRESET_COLORS,
  canvasToFlow,
  resolveCanvasColor,
} from "../../viewer/canvasToFlow.js"

/** Minimal rewritten-payload builder (the shape the page embeds — pageBody.js). */
function payload({
  nodes = [] as any[],
  edges = [] as any[],
  attachments = {} as Record<string, string>,
  noteLinks = {} as Record<string, { href: string; title: string; subpathLabel?: string }>,
} = {}) {
  return { canvas: { nodes, edges }, attachments, noteLinks }
}

function textNode(overrides: object = {}) {
  return { id: "t1", type: "text", x: 0, y: 0, width: 100, height: 80, text: "<p>hi</p>", ...overrides }
}

describe("resolveCanvasColor", () => {
  test("GIVEN preset '1'..'6' WHEN resolving THEN each maps to its palette hex", () => {
    for (const preset of ["1", "2", "3", "4", "5", "6"]) {
      assert.equal(resolveCanvasColor(preset), PRESET_COLORS[preset as unknown as keyof typeof PRESET_COLORS])
    }
  })

  test("GIVEN a hex color WHEN resolving THEN it passes through unchanged", () => {
    assert.equal(resolveCanvasColor("#8a2be2"), "#8a2be2")
  })

  test("GIVEN no color WHEN resolving THEN undefined", () => {
    assert.equal(resolveCanvasColor(undefined), undefined)
  })

  test("GIVEN an unknown non-hex value WHEN resolving THEN undefined (never emit garbage into styles)", () => {
    assert.equal(resolveCanvasColor("9"), undefined)
  })
})

describe("canvasToFlow nodes", () => {
  test("GIVEN a text node WHEN converting THEN geometry maps 1:1 (id, top-left position, size)", () => {
    const { nodes } = canvasToFlow(payload({ nodes: [textNode({ x: -480, y: -380, width: 440, height: 280 })] }))
    assert.deepEqual(
      { id: nodes[0].id, position: nodes[0].position, width: nodes[0].width, height: nodes[0].height },
      { id: "t1", position: { x: -480, y: -380 }, width: 440, height: 280 },
    )
  })

  test("GIVEN a text node WHEN converting THEN it becomes a canvasText node carrying the prebaked HTML", () => {
    const { nodes } = canvasToFlow(payload({ nodes: [textNode({ text: "<p>prebaked</p>" })] }))
    assert.deepEqual(
      { type: nodes[0].type, html: nodes[0].data.html },
      { type: FlowNodeType.TEXT, html: "<p>prebaked</p>" },
    )
  })

  test("GIVEN node array order WHEN converting THEN zIndex preserves JSON Canvas z-order", () => {
    const { nodes } = canvasToFlow(
      payload({ nodes: [textNode({ id: "a" }), textNode({ id: "b" }), textNode({ id: "c" })] }),
    )
    assert.deepEqual(nodes.map((n: any) => n.zIndex), [0, 1, 2])
  })

  test("GIVEN any node WHEN converting THEN the graph is read-only (not draggable/connectable)", () => {
    const { nodes } = canvasToFlow(payload({ nodes: [textNode()] }))
    assert.deepEqual(
      { draggable: nodes[0].draggable, connectable: nodes[0].connectable },
      { draggable: false, connectable: false },
    )
  })

  test("GIVEN a preset color WHEN converting THEN data.colorValue is the resolved hex", () => {
    const { nodes } = canvasToFlow(payload({ nodes: [textNode({ color: "6" })] }))
    assert.equal(nodes[0].data.colorValue, PRESET_COLORS[6])
  })

  test("GIVEN a hex color WHEN converting THEN data.colorValue passes through", () => {
    const { nodes } = canvasToFlow(payload({ nodes: [textNode({ color: "#8a2be2" })] }))
    assert.equal(nodes[0].data.colorValue, "#8a2be2")
  })

  test("GIVEN a file node WITH a noteLinks entry WHEN converting THEN it is a note card wired to its fragment", () => {
    const noteLink = { href: "../notes/architecture", title: "Architecture" }
    const { nodes } = canvasToFlow(
      payload({
        nodes: [{ id: "n1", type: "file", x: 0, y: 0, width: 10, height: 10, file: "notes/architecture.md" }],
        attachments: { "notes/architecture.md": "main.canvas.fragments/n1.html" },
        noteLinks: { n1: noteLink },
      }),
    )
    assert.deepEqual(
      { type: nodes[0].type, fragmentUrl: nodes[0].data.fragmentUrl, noteLink: nodes[0].data.noteLink },
      { type: FlowNodeType.NOTE, fragmentUrl: "main.canvas.fragments/n1.html", noteLink },
    )
  })

  test("GIVEN an image file node WITHOUT a noteLinks entry WHEN converting THEN it is an image media card", () => {
    const { nodes } = canvasToFlow(
      payload({
        nodes: [{ id: "m1", type: "file", x: 0, y: 0, width: 10, height: 10, file: "attachments/diagram.png" }],
        attachments: { "attachments/diagram.png": "../attachments/diagram.png" },
      }),
    )
    assert.deepEqual(
      { type: nodes[0].type, mediaKind: nodes[0].data.mediaKind, url: nodes[0].data.url },
      { type: FlowNodeType.MEDIA, mediaKind: "image", url: "../attachments/diagram.png" },
    )
  })

  test("GIVEN audio/video/txt file nodes WHEN converting THEN each gets its media kind", () => {
    const fileNode = (id: string, file: string) => ({ id, type: "file", x: 0, y: 0, width: 10, height: 10, file })
    const { nodes } = canvasToFlow(
      payload({
        nodes: [fileNode("a", "x/song.mp3"), fileNode("v", "x/clip.webm"), fileNode("p", "x/readme.txt")],
        attachments: { "x/song.mp3": "u1", "x/clip.webm": "u2", "x/readme.txt": "u3" },
      }),
    )
    assert.deepEqual(nodes.map((n: any) => n.data.mediaKind), ["audio", "video", "plaintext"])
  })

  test("GIVEN a link node WHEN converting THEN it is a canvasLink carrying the URL", () => {
    const { nodes } = canvasToFlow(
      payload({ nodes: [{ id: "l1", type: "link", x: 0, y: 0, width: 10, height: 10, url: "https://jsoncanvas.org/" }] }),
    )
    assert.deepEqual(
      { type: nodes[0].type, url: nodes[0].data.url },
      { type: FlowNodeType.LINK, url: "https://jsoncanvas.org/" },
    )
  })

  test("GIVEN a group node WHEN converting THEN it is a non-selectable canvasGroup with its label", () => {
    const { nodes } = canvasToFlow(
      payload({ nodes: [{ id: "g1", type: "group", x: 0, y: 0, width: 10, height: 10, label: "Intro Group" }] }),
    )
    assert.deepEqual(
      { type: nodes[0].type, label: nodes[0].data.label, selectable: nodes[0].selectable },
      { type: FlowNodeType.GROUP, label: "Intro Group", selectable: false },
    )
  })

  test("GIVEN a card node WHEN converting THEN it stays selectable (two-click interaction model)", () => {
    const { nodes } = canvasToFlow(payload({ nodes: [textNode()] }))
    assert.equal(nodes[0].selectable, true)
  })

  test("GIVEN an unknown future node type WHEN converting THEN it degrades to an inert text card", () => {
    const { nodes } = canvasToFlow(
      payload({ nodes: [{ id: "u1", type: "hologram", x: 0, y: 0, width: 10, height: 10 }] }),
    )
    assert.deepEqual({ type: nodes[0].type, html: nodes[0].data.html }, { type: FlowNodeType.TEXT, html: "" })
  })
})

describe("canvasToFlow edges", () => {
  function twoNodes() {
    // "from" sits LEFT of "to" (dominant horizontal axis for inference tests).
    return [
      textNode({ id: "from", x: 0, y: 0, width: 100, height: 100 }),
      textNode({ id: "to", x: 500, y: 0, width: 100, height: 100 }),
    ]
  }

  function convertEdge(edge: object, nodes: any[] = twoNodes()) {
    const { edges } = canvasToFlow(payload({ nodes, edges: [{ id: "e1", fromNode: "from", toNode: "to", ...edge }] }))
    return edges[0]
  }

  test("GIVEN explicit fromSide/toSide WHEN converting THEN they become source/target handles", () => {
    const edge = convertEdge({ fromSide: "bottom", toSide: "top" })
    assert.deepEqual(
      { source: edge.source, target: edge.target, sourceHandle: edge.sourceHandle, targetHandle: edge.targetHandle },
      { source: "from", target: "to", sourceHandle: "bottom", targetHandle: "top" },
    )
  })

  test("GIVEN no sides WHEN nodes are horizontally apart THEN sides are inferred right->left", () => {
    const edge = convertEdge({})
    assert.deepEqual({ from: edge.sourceHandle, to: edge.targetHandle }, { from: "right", to: "left" })
  })

  test("GIVEN no sides WHEN the target is above THEN sides are inferred top->bottom", () => {
    const nodes = [
      textNode({ id: "from", x: 0, y: 500, width: 100, height: 100 }),
      textNode({ id: "to", x: 0, y: 0, width: 100, height: 100 }),
    ]
    const edge = convertEdge({}, nodes)
    assert.deepEqual({ from: edge.sourceHandle, to: edge.targetHandle }, { from: "top", to: "bottom" })
  })

  test("GIVEN only fromSide WHEN converting THEN the missing toSide is inferred from geometry", () => {
    const edge = convertEdge({ fromSide: "bottom" })
    assert.deepEqual({ from: edge.sourceHandle, to: edge.targetHandle }, { from: "bottom", to: "left" })
  })

  test("GIVEN an edge to a missing node WHEN converting THEN it still converts with fallback sides", () => {
    const { edges } = canvasToFlow(
      payload({ nodes: twoNodes(), edges: [{ id: "e1", fromNode: "from", toNode: "ghost" }] }),
    )
    assert.deepEqual(
      { target: edges[0].target, from: edges[0].sourceHandle, to: edges[0].targetHandle },
      { target: "ghost", from: "right", to: "left" },
    )
  })

  test("GIVEN no end fields WHEN converting THEN spec defaults apply: arrow at destination only", () => {
    const edge = convertEdge({})
    assert.deepEqual(
      { start: edge.markerStart, endType: edge.markerEnd?.type },
      { start: undefined, endType: "arrowclosed" },
    )
  })

  test("GIVEN toEnd 'none' WHEN converting THEN no destination arrow (fidelity the old renderer lacked)", () => {
    const edge = convertEdge({ toEnd: "none" })
    assert.equal(edge.markerEnd, undefined)
  })

  test("GIVEN fromEnd 'arrow' WHEN converting THEN a source arrow is added", () => {
    const edge = convertEdge({ fromEnd: "arrow" })
    assert.equal(edge.markerStart?.type, "arrowclosed")
  })

  test("GIVEN an edge label WHEN converting THEN it is kept as the React Flow label", () => {
    const edge = convertEdge({ label: "go to second canvas" })
    assert.equal(edge.label, "go to second canvas")
  })

  test("GIVEN an edge preset color WHEN converting THEN stroke and arrow use the resolved hex", () => {
    const edge = convertEdge({ color: "5" })
    assert.deepEqual(
      { stroke: edge.style?.stroke, marker: edge.markerEnd?.color },
      { stroke: PRESET_COLORS[5], marker: PRESET_COLORS[5] },
    )
  })

  test("GIVEN no edge color WHEN converting THEN no inline stroke (theme CSS decides)", () => {
    const edge = convertEdge({})
    assert.equal(edge.style, undefined)
  })
})

describe("canvasToFlow on the rewritten test-vault main canvas shape", () => {
  test("GIVEN a mixed canvas WHEN converting THEN every node and edge converts (no drops)", () => {
    const { nodes, edges } = canvasToFlow(
      payload({
        nodes: [
          { id: "g", type: "group", x: -520, y: -420, width: 1040, height: 360, label: "Intro", color: "6" },
          textNode({ id: "t" }),
          { id: "n", type: "file", x: 0, y: 0, width: 10, height: 10, file: "notes/a.md" },
          { id: "m", type: "file", x: 0, y: 0, width: 10, height: 10, file: "img.png" },
          { id: "l", type: "link", x: 0, y: 0, width: 10, height: 10, url: "https://example.com" },
        ],
        edges: [
          { id: "e1", fromNode: "t", toNode: "n", fromSide: "bottom", toSide: "top" },
          { id: "e2", fromNode: "n", toNode: "m" },
        ],
        attachments: { "notes/a.md": "frag.html", "img.png": "../img.png" },
        noteLinks: { n: { href: "../notes/a", title: "A" } },
      }),
    )
    assert.deepEqual(
      { types: nodes.map((n: any) => n.type), edgeIds: edges.map((e: any) => e.id) },
      {
        types: [FlowNodeType.GROUP, FlowNodeType.TEXT, FlowNodeType.NOTE, FlowNodeType.MEDIA, FlowNodeType.LINK],
        edgeIds: ["e1", "e2"],
      },
    )
  })
})
