import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { filterOwnErrors } from "../../lib/e2eHarness.mjs"

// Own-origin base ALWAYS carries a port (startPreview binds a free one) — the
// filter must never let the port break own-origin attribution.
const BASE = "http://127.0.0.1:43121"

describe("filterOwnErrors", () => {
  test("GIVEN an error naming an own-origin URL (with port) WHEN filtering THEN it is KEPT", () => {
    const errors = [`Failed to load resource: ${BASE}/static/canvas-viewer.js — 404`]
    assert.equal(filterOwnErrors(errors, BASE).length, 1)
  })

  test("GIVEN a stack trace with :line:col after an own-origin URL WHEN filtering THEN it is KEPT", () => {
    const errors = [`TypeError: x is not a function\n    at ${BASE}/static/canvas-viewer.js:10:5`]
    assert.equal(filterOwnErrors(errors, BASE).length, 1)
  })

  test("GIVEN an error with no URL at all WHEN filtering THEN it is kept (unattributable = ours)", () => {
    assert.equal(filterOwnErrors(["ReferenceError: foo is not defined"], BASE).length, 1)
  })

  test("GIVEN an error whose only URL is a foreign origin WHEN filtering THEN it is dropped", () => {
    assert.equal(filterOwnErrors(["boom at https://third-party.example/x.js:1:1"], BASE).length, 0)
  })

  test("GIVEN a known external-CDN host error WHEN filtering THEN it is dropped", () => {
    assert.equal(filterOwnErrors(["fetch failed https://fonts.googleapis.com/css2"], BASE).length, 0)
  })
})
