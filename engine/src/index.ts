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
export { PublishFilter, isCanvasPath, isMarkdownPath } from "./publishFilter.ts"
export { DocId } from "./docId.ts"
export { DocIdValidationError } from "./idMap.ts"
export { QuartzConfigGenerator } from "./quartzConfigGenerator.ts"
export { NodePreflight } from "./nodePreflight.ts"
export type { StagingResult } from "./vaultStager.ts"
export {
  SiteValidator,
  PrivateContentLeakError,
  BrokenInternalLinksError,
  type ValidationInput,
  type ValidationResult,
} from "./validation/siteValidator.ts"
export type { LeakFinding } from "./validation/leakChecker.ts"
export {
  formatBrokenLinkReport,
  type BrokenLink,
  type BrokenLinkReport,
} from "./validation/linkChecker.ts"
