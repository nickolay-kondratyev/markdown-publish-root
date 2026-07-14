import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { obsidianEdgePath } from "../../viewer/edgePath.js"

/** Parses "M{x},{y} C{c1x},{c1y} {c2x},{c2y} {x},{y}" back into numbers. */
function parseCubic(path: string) {
  const numbers = path.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? []
  assert.equal(numbers.length, 8, `expected a single cubic path, got: ${path}`)
  const [sourceX, sourceY, c1x, c1y, c2x, c2y, targetX, targetY] = numbers
  return { sourceX, sourceY, c1: { x: c1x, y: c1y }, c2: { x: c2x, y: c2y }, targetX, targetY }
}

describe("obsidianEdgePath", () => {
  test("GIVEN the screenshot bug geometry (left side -> left side, straight down) WHEN pathing THEN both control points bow OUT to the left instead of collapsing to a straight line", () => {
    const { path } = obsidianEdgePath({
      sourceX: 0, sourceY: 0, sourcePosition: "left",
      targetX: 0, targetY: 400, targetPosition: "left",
    })
    const cubic = parseCubic(path)
    assert.ok(
      cubic.c1.x < 0 && cubic.c2.x < 0,
      `control points must extend left of the cards, got ${path}`,
    )
  })

  test("GIVEN a bottom-side exit WHEN pathing THEN the first control point extends downward (perpendicular exit)", () => {
    const { path } = obsidianEdgePath({
      sourceX: 0, sourceY: 0, sourcePosition: "bottom",
      targetX: 300, targetY: 0, targetPosition: "top",
    })
    const cubic = parseCubic(path)
    assert.ok(cubic.c1.y > 0, `expected downward exit, got ${path}`)
  })

  test("GIVEN a plain forward edge (right -> left) WHEN pathing THEN control reach is half the gap (parity with the classic bezier look)", () => {
    const { path } = obsidianEdgePath({
      sourceX: 0, sourceY: 0, sourcePosition: "right",
      targetX: 200, targetY: 0, targetPosition: "left",
    })
    const cubic = parseCubic(path)
    assert.deepEqual([cubic.c1.x, cubic.c2.x], [100, 100])
  })

  test("GIVEN near-touching endpoints WHEN pathing THEN the control reach is floored (still a visible perpendicular exit)", () => {
    const { path } = obsidianEdgePath({
      sourceX: 0, sourceY: 0, sourcePosition: "right",
      targetX: 10, targetY: 0, targetPosition: "left",
    })
    const cubic = parseCubic(path)
    assert.ok(cubic.c1.x >= 32 - 1e-9, `expected floored offset, got ${path}`)
  })

  test("GIVEN far-apart endpoints WHEN pathing THEN the control reach is capped (gentle sweep, no balloon)", () => {
    const { path } = obsidianEdgePath({
      sourceX: 0, sourceY: 0, sourcePosition: "right",
      targetX: 4000, targetY: 0, targetPosition: "left",
    })
    const cubic = parseCubic(path)
    assert.ok(cubic.c1.x <= 320 + 1e-9, `expected capped offset, got ${path}`)
  })

  test("GIVEN a symmetric edge WHEN pathing THEN the label anchors at the curve midpoint", () => {
    const { labelX, labelY } = obsidianEdgePath({
      sourceX: 0, sourceY: 0, sourcePosition: "right",
      targetX: 200, targetY: 0, targetPosition: "left",
    })
    assert.deepEqual({ labelX, labelY }, { labelX: 100, labelY: 0 })
  })
})
