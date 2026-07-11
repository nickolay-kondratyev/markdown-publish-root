/**
 * Vintrin full-screen-mode plugin for Quartz 5 (docs/tickets/full-screen-mode.md).
 *
 * Component-only plugin (package.json `quartz.category: "component"`): Quartz
 * side-effect-imports this main entry, then registers the components declared
 * in the `quartz.components` manifest from ./components/index.js.
 */
export { FullScreenMode } from "./src/fullScreenMode.js"
