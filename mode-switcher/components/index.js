/**
 * Component exports for Quartz's componentLoader. This exact path
 * (<plugin dir>/components/index.js) is the loader's no-exports-map fallback
 * (vendor/quartz/quartz/plugins/loader/gitLoader.ts getPluginSubpathEntry);
 * export names must match `quartz.components` keys in package.json.
 */
export { ModeSwitcher } from "../src/modeSwitcher.js"
