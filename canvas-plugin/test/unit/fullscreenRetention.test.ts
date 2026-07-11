import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { FullscreenRetention } from "../../viewer/fullscreenRetention.js"

describe("FullscreenRetention", () => {
  function retention(): FullscreenRetention {
    return new FullscreenRetention()
  }

  test("GIVEN a fullscreen canvas at prenav WHEN the next canvas mounts THEN restore is requested", () => {
    const r = retention()
    r.capture(true)
    assert.equal(r.consume(), true)
  })

  test("GIVEN a restore was consumed WHEN consuming again THEN it is one-shot", () => {
    const r = retention()
    r.capture(true)
    r.consume()
    assert.equal(r.consume(), false)
  })

  test("GIVEN no fullscreen at prenav WHEN the next canvas mounts THEN no restore is requested", () => {
    const r = retention()
    r.capture(false)
    assert.equal(r.consume(), false)
  })

  test("GIVEN fullscreen was captured WHEN a later nav happens without fullscreen THEN the stale restore is cleared", () => {
    const r = retention()
    r.capture(true) // fullscreen canvas -> non-canvas page (nothing consumed it)
    r.capture(false) // non-canvas page -> canvas page
    assert.equal(r.consume(), false)
  })

  test("GIVEN nothing captured WHEN a canvas mounts (initial page load) THEN no restore is requested", () => {
    assert.equal(retention().consume(), false)
  })
})
