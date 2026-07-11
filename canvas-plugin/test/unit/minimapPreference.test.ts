import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { MinimapPreference } from "../../viewer/minimapPreference.js"

describe("MinimapPreference", () => {
  /** In-memory stand-in for window.localStorage. */
  function fakeStorage(initial: Record<string, string> = {}) {
    const data = new Map(Object.entries(initial))
    return {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => void data.set(key, value),
    }
  }

  test("GIVEN a first-time user (nothing stored) WHEN a canvas mounts THEN the minimap is expanded", () => {
    assert.equal(new MinimapPreference(fakeStorage()).isCollapsed(), false)
  })

  test("GIVEN the user collapsed the minimap WHEN reading the preference THEN it is collapsed", () => {
    const pref = new MinimapPreference(fakeStorage())
    pref.setCollapsed(true)
    assert.equal(pref.isCollapsed(), true)
  })

  test("GIVEN a collapsed preference WHEN a DIFFERENT canvas mounts (fresh read, same storage) THEN it sticks", () => {
    const storage = fakeStorage()
    new MinimapPreference(storage).setCollapsed(true)
    assert.equal(new MinimapPreference(storage).isCollapsed(), true)
  })

  test("GIVEN a collapsed minimap WHEN the user expands it THEN the preference returns to expanded", () => {
    const storage = fakeStorage()
    const pref = new MinimapPreference(storage)
    pref.setCollapsed(true)
    pref.setCollapsed(false)
    assert.equal(new MinimapPreference(storage).isCollapsed(), false)
  })

  test("GIVEN an unrelated/corrupt stored value WHEN reading THEN it safely defaults to expanded", () => {
    assert.equal(new MinimapPreference(fakeStorage({ "canvas-minimap": "garbage" })).isCollapsed(), false)
  })
})
