/**
 * Vintrin zen-mode plugin for Quartz 5 (plan/zen-mode.md).
 *
 * Component-only plugin (package.json `quartz.category: "component"`): Quartz
 * side-effect-imports this main entry, then registers the components declared
 * in the `quartz.components` manifest from ./components/index.js.
 */
export { ZenMode } from "./src/zenMode.js"
