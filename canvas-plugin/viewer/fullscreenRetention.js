/**
 * Tracks whether native fullscreen should be re-entered on the next canvas
 * mount, so fullscreen survives canvas -> canvas SPA navigation.
 *
 * WHY: Quartz's SPA router swaps `document.body` on navigation, and removing
 * the fullscreen element from the DOM force-exits the Fullscreen API. Without
 * this, following a link from a fullscreen canvas to another canvas silently
 * drops the user back to windowed mode.
 *
 * Contract (wired up in canvasView.js):
 * - `capture(...)` runs on EVERY Quartz "prenav", overwriting the previous
 *   value — a detour through a non-canvas page clears any stale restore.
 * - `consume()` is one-shot: at most one mount restores per captured nav.
 */
export class FullscreenRetention {
  #pending = false

  /** @param {boolean} isCanvasFullscreen whether a canvas is fullscreen as the nav starts */
  capture(isCanvasFullscreen) {
    this.#pending = isCanvasFullscreen
  }

  /** @returns {boolean} true if the mounting canvas should re-enter fullscreen */
  consume() {
    const pending = this.#pending
    this.#pending = false
    return pending
  }
}
