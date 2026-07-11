import path from "node:path"
import { fileURLToPath } from "node:url"
import { stringify as stringifyYaml } from "yaml"
import type { SiteConfig, ThemeColorOverrides, ThemeTypography } from "./siteConfig.ts"

/**
 * Generates the `quartz.config.yaml` Quartz consumes, from a SiteConfig.
 *
 * This is the "config inversion" boundary (plan/main.md §3): users only ever
 * edit site.json; Quartz config is a build artifact regenerated every build.
 * The plugin list is our curated default set — see PLUGIN_ENTRIES for the
 * deliberate deviations from stock Quartz and why.
 */
/**
 * Absolute dirs of OUR local Quartz plugins, registered as local plugin
 * sources (the config is a per-build artifact — machine-specific paths are
 * fine and unambiguous). Defaults resolve relative to this repo.
 */
export interface LocalPluginDirs {
  /** Canvas pageType+emitter plugin (ADR 0001). */
  canvasPluginDir: string
  /** Folder-shaped Explorer component (plan/folder-nav-over-id-urls.md §4.2). */
  explorerPluginDir: string
  /** Folder-shaped Breadcrumbs component (plan/folder-nav-over-id-urls.md §4.3). */
  breadcrumbsPluginDir: string
  /** Zen-mode toolbar toggle (plan/zen-mode.md). */
  zenModePluginDir: string
}

export class QuartzConfigGenerator {
  /** YAML text ready to be written as `quartz.config.yaml` in the Quartz root. */
  static generateYaml(site: SiteConfig, localPlugins: Partial<LocalPluginDirs> = {}): string {
    return stringifyYaml(QuartzConfigGenerator.generateConfigObject(site, localPlugins))
  }

  /** The config as a plain object (exposed for unit tests). */
  static generateConfigObject(
    site: SiteConfig,
    localPlugins: Partial<LocalPluginDirs> = {},
  ): Record<string, unknown> {
    const canvasPluginDir = localPlugins.canvasPluginDir ?? defaultLocalPluginDir("canvas-plugin")
    const zenModePluginDir = localPlugins.zenModePluginDir ?? defaultLocalPluginDir("zen-mode")
    const explorerPluginDir =
      localPlugins.explorerPluginDir ?? defaultLocalPluginDir("vintrin-explorer")
    const breadcrumbsPluginDir =
      localPlugins.breadcrumbsPluginDir ?? defaultLocalPluginDir("vintrin-breadcrumbs")
    return {
      configuration: {
        pageTitle: site.title,
        pageTitleSuffix: "",
        enableSPA: true,
        enablePopovers: true,
        // Never inject third-party analytics into customer sites.
        analytics: null,
        locale: site.locale,
        baseUrl: site.baseUrl,
        // Staging already contains ONLY publishable files (VaultStager), so
        // Quartz-side ignore patterns stay empty: one filter surface, ours.
        ignorePatterns: [],
        theme: {
          fontOrigin: "googleFonts",
          cdnCaching: true,
          typography: mergeTypography(site.theme.typography),
          colors: {
            lightMode: mergeColors(DEFAULT_LIGHT_MODE_COLORS, site.theme.colors?.lightMode),
            darkMode: mergeColors(DEFAULT_DARK_MODE_COLORS, site.theme.colors?.darkMode),
          },
        },
      },
      plugins: [
        ...PLUGIN_ENTRIES.map(({ source, enabled, options, order, layout }) => ({
          source: `github:quartz-community/${source}`,
          enabled,
          ...(options !== undefined ? { options } : {}),
          ...(order !== undefined ? { order } : {}),
          ...(layout !== undefined ? { layout } : {}),
        })),
        // Our canvas pageType+emitter plugin (ADR 0001). Local sources are
        // symlinked by Quartz's loader — no publishing, no build step.
        { source: canvasPluginDir, enabled: true, order: 55 },
        // Our zen-mode toolbar toggle (plan/zen-mode.md): hides sidebar chrome
        // AND collapses the grid so content reclaims the sidebar width.
        // Priority 40 = immediately after reader-mode (35) in the toolbar row.
        {
          source: zenModePluginDir,
          enabled: true,
          layout: { position: "left", priority: 40, group: "toolbar" },
        },
        // Folder-shaped Explorer over stable-id URLs; replaces the stock
        // explorer disabled above (plan/folder-nav-over-id-urls.md, spike C).
        {
          source: explorerPluginDir,
          enabled: true,
          layout: { position: "left", priority: 50 },
        },
        // Folder-shaped breadcrumbs; replaces the stock breadcrumbs disabled
        // above (plan/folder-nav-over-id-urls.md §4.3).
        {
          source: breadcrumbsPluginDir,
          enabled: true,
          layout: { position: "beforeBody", priority: 5, condition: "not-index" },
        },
      ],
      layout: LAYOUT,
    }
  }
}

/** Local plugin dirs live at the repo root (engine/src/ -> repo root -> <dirName>). */
function defaultLocalPluginDir(dirName: string): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", dirName)
}

/** Stock Quartz typography — the fallback when site.json overrides nothing. */
export const DEFAULT_TYPOGRAPHY: Required<ThemeTypography> = {
  header: "Schibsted Grotesk",
  body: "Source Sans Pro",
  code: "IBM Plex Mono",
}

/** Stock Quartz light-mode palette. */
export const DEFAULT_LIGHT_MODE_COLORS: Required<ThemeColorOverrides> = {
  light: "#faf8f8",
  lightgray: "#e5e5e5",
  gray: "#b8b8b8",
  darkgray: "#4e4e4e",
  dark: "#2b2b2b",
  secondary: "#284b63",
  tertiary: "#84a59d",
  highlight: "rgba(143, 159, 169, 0.15)",
  textHighlight: "#fff23688",
}

/** Stock Quartz dark-mode palette. */
export const DEFAULT_DARK_MODE_COLORS: Required<ThemeColorOverrides> = {
  light: "#161618",
  lightgray: "#393639",
  gray: "#646464",
  darkgray: "#d4d4d4",
  dark: "#ebebec",
  secondary: "#7b97aa",
  tertiary: "#84a59d",
  highlight: "rgba(143, 159, 169, 0.15)",
  textHighlight: "#b3aa0288",
}

function mergeTypography(overrides: ThemeTypography | undefined): Required<ThemeTypography> {
  return { ...DEFAULT_TYPOGRAPHY, ...definedEntries(overrides) }
}

function mergeColors(
  defaults: Required<ThemeColorOverrides>,
  overrides: ThemeColorOverrides | undefined,
): Required<ThemeColorOverrides> {
  return { ...defaults, ...definedEntries(overrides) }
}

/** Spread-safe copy without `undefined` values (they would clobber defaults). */
function definedEntries<T extends object>(obj: T | undefined): Partial<T> {
  if (obj === undefined) return {}
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>
}

interface PluginEntry {
  source: string
  enabled: boolean
  options?: Record<string, unknown>
  order?: number
  layout?: Record<string, unknown>
}

/**
 * Curated plugin set. Baseline = Quartz 5 default config
 * (quartz.config.default.yaml at the pinned commit), with these deviations:
 *
 *   canvas-page       DISABLED  replaced by OUR canvas plugin (ADR 0001) — two
 *                               claimants for `.canvas` would be ambiguous.
 *   favicon, og-image DISABLED  sharp's postinstall is blocked in our build sandbox
 *                               (Phase 0 gotcha G9); revisit for production hosts.
 *   cname             DISABLED  hosting (domains/CNAME) is outside the engine's
 *                               sacred boundary (plan/main.md §3).
 *   remove-draft      DISABLED  our PublishFilter is the ONLY publish surface;
 *                               a second frontmatter flag (`draft`) would surprise.
 *   analytics         null      see configuration above.
 *   bases-page        DISABLED  .base files are out of MVP scope.
 *   footer            DISABLED  only renders "Created with Quartz vX (c) YEAR"
 *                               branding (we configure no links) — unwanted.
 *   explorer          DISABLED  slug-trie tree = flat /n/ listing; replaced by
 *                               OUR vintrin-explorer (folder-nav plan §3.1).
 *   breadcrumbs       DISABLED  slug-trie crumbs; replaced by OUR
 *                               vintrin-breadcrumbs (folder-nav plan §4.3).
 *   folder-page       DISABLED  collapse-only folders have no URLs; its only
 *                               output was a flat listing at /n/.
 *
 * Plugins that are disabled in stock Quartz (citations, hard-line-breaks,
 * ox-hugo, roam, comments, recent-notes, stacked-pages, tag-list) plus
 * encrypted-pages are OMITTED entirely: a plugin absent from this list is
 * simply never loaded, and a smaller generated config is easier to audit.
 */
const PLUGIN_ENTRIES: PluginEntry[] = [
  {
    source: "created-modified-date",
    enabled: true,
    options: { defaultDateType: "modified", priority: ["frontmatter", "git", "filesystem"] },
    order: 10,
  },
  {
    source: "syntax-highlighting",
    enabled: true,
    options: { theme: { light: "github-light", dark: "github-dark" }, keepBackground: false },
    order: 20,
  },
  {
    source: "obsidian-flavored-markdown",
    enabled: true,
    options: { enableInHtmlEmbed: false, enableCheckbox: true },
    order: 30,
  },
  { source: "github-flavored-markdown", enabled: true, order: 40 },
  {
    source: "table-of-contents",
    enabled: true,
    order: 50,
    layout: { position: "right", priority: 30 },
  },
  {
    source: "crawl-links",
    enabled: true,
    options: { markdownLinkResolution: "shortest" },
    order: 60,
  },
  { source: "description", enabled: true, order: 70 },
  { source: "latex", enabled: true, options: { renderEngine: "katex" }, order: 80 },
  { source: "fonts", enabled: true },
  { source: "remove-draft", enabled: false },
  { source: "explicit-publish", enabled: false },
  { source: "alias-redirects", enabled: true },
  { source: "content-index", enabled: true, options: { enableSiteMap: true, enableRSS: true } },
  { source: "favicon", enabled: false },
  { source: "og-image", enabled: false },
  { source: "cname", enabled: false },
  { source: "canvas-page", enabled: false },
  { source: "content-page", enabled: true },
  // folder-page DISABLED: no folder URLs with collapse-only folders; its only
  // output was a flat meaningless listing at /n/ (folder-nav plan §2).
  { source: "folder-page", enabled: false },
  { source: "tag-page", enabled: true },
  // explorer DISABLED: builds its tree from slugs -> flat n/ listing; replaced
  // by our vintrin-explorer local plugin (plan/folder-nav-over-id-urls.md §3.1).
  { source: "explorer", enabled: false },
  { source: "graph", enabled: true, layout: { position: "right", priority: 10 } },
  {
    source: "search",
    enabled: true,
    // Deliberately NOT in the toolbar group: the mode toggles live in the
    // top-right corner cluster (ref.ap.0zwhQQya81CGNQ9pmqKkM.E), so search
    // stands alone and gets the full sidebar width.
    layout: { position: "left", priority: 20 },
  },
  { source: "backlinks", enabled: true, layout: { position: "right", priority: 50 } },
  { source: "article-title", enabled: true, layout: { position: "beforeBody", priority: 10 } },
  { source: "content-meta", enabled: true, layout: { position: "beforeBody", priority: 20 } },
  { source: "page-title", enabled: true, layout: { position: "left", priority: 10 } },
  {
    source: "darkmode",
    enabled: true,
    layout: { position: "left", priority: 30, group: "toolbar" },
  },
  {
    source: "reader-mode",
    enabled: true,
    layout: { position: "left", priority: 35, group: "toolbar" },
  },
  // breadcrumbs DISABLED: slug-trie crumbs (Home > n > docid); replaced by OUR
  // vintrin-breadcrumbs local plugin (folder-nav plan §3.1, §4.3).
  { source: "breadcrumbs", enabled: false },
  { source: "footer", enabled: false },
  {
    source: "spacer",
    enabled: true,
    options: {},
    order: 25,
    layout: { position: "left", priority: 25, display: "mobile-only" },
  },
  { source: "bases-page", enabled: false },
  {
    source: "note-properties",
    enabled: true,
    options: {
      includeAll: false,
      includedProperties: ["description", "tags", "aliases"],
      excludedProperties: [],
      hidePropertiesView: false,
      delimiters: "---",
      language: "yaml",
    },
    order: 5,
    layout: { position: "beforeBody", priority: 15, display: "all" },
  },
  { source: "unlisted-pages", enabled: true, options: {}, order: 45 },
]

/** Layout groups + per-pageType tweaks (mirrors Quartz defaults, minus bases). */
const LAYOUT: Record<string, unknown> = {
  groups: {
    // The mode-toggle cluster: darkmode + reader-mode + zen-mode, the ONLY
    // group in the left sidebar. SiteChromeStyles pins it to the top-right
    // viewport corner (ref.ap.0zwhQQya81CGNQ9pmqKkM.E).
    toolbar: { priority: 35, direction: "row", gap: "0.5rem" },
  },
  byPageType: {
    "404": { positions: { beforeBody: [], left: [], right: [] } },
    content: {},
    // No `folder` entry: folder-page is disabled (collapse-only folders).
    tag: { exclude: ["reader-mode"], positions: { right: [] } },
    // Our canvas pageType (layout name declared in canvas-plugin/index.js).
    // Keeps default chrome — graph + backlinks on canvas pages is a
    // differentiator (plan §4.1). reader-mode (book icon) stays: it is the
    // toggle for the graph sidebar, so canvas pages need it too.
    canvas: { exclude: ["table-of-contents"] },
  },
}
