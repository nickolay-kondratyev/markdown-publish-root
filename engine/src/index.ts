/**
 * Publish engine public interface.
 *
 * Entry point: `new SiteBuilder().buildSite({vaultDir, siteConfig, outDir})`,
 * with `SiteConfigParser.parseFile(...)` validating site.json at the boundary.
 * Everything not exported here is an implementation detail.
 */
export { SiteBuilder, type BuildSiteOptions, type BuildSiteResult } from "./siteBuilder.ts"
export {
  SiteConfigParser,
  SiteConfigError,
  type SiteConfig,
  type PublishFilterRules,
  type ThemeSettings,
} from "./siteConfig.ts"
export { PublishFilter, PHASE1_EXCLUDED_EXTENSIONS } from "./publishFilter.ts"
export { QuartzConfigGenerator } from "./quartzConfigGenerator.ts"
export { NodePreflight } from "./nodePreflight.ts"
export type { StagingResult } from "./vaultStager.ts"
