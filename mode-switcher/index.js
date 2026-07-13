/**
 * Vintrin mode-switcher plugin for Quartz 5 (docs-internal/tickets/mode-switcher.md).
 *
 * Component-only plugin (package.json `quartz.category: "component"`): Quartz
 * side-effect-imports this main entry, then registers the components declared
 * in the `quartz.components` manifest from ./components/index.js.
 */
export { ModeSwitcher } from "./src/modeSwitcher.js"
