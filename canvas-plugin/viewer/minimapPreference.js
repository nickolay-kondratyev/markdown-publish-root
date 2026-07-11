/**
 * Persists the user's minimap collapsed/expanded choice so it follows them
 * across canvases: one GLOBAL preference (not per-canvas), read at every
 * canvas mount (canvasApp.jsx).
 *
 * Persistence mirrors zen-mode: a plain localStorage key. Storage is
 * injected so the class stays unit-testable without a browser.
 */
const STORAGE_KEY = "canvas-minimap"
const COLLAPSED = "collapsed"
const EXPANDED = "expanded"

export class MinimapPreference {
  #storage

  /** @param {{getItem(key: string): string | null, setItem(key: string, value: string): void}} storage */
  constructor(storage) {
    this.#storage = storage
  }

  /** @returns {boolean} true if the user chose to collapse the minimap (default: expanded) */
  isCollapsed() {
    return this.#storage.getItem(STORAGE_KEY) === COLLAPSED
  }

  /** @param {boolean} collapsed */
  setCollapsed(collapsed) {
    this.#storage.setItem(STORAGE_KEY, collapsed ? COLLAPSED : EXPANDED)
  }
}
