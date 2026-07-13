import fs from "node:fs"

/**
 * The per-site settings object ("site.json") — the ONLY customization surface
 * end users get (plan/main.md §3 "config inversion"). Deliberately minimal:
 * every field here is something we commit to supporting forever.
 *
 * Schema (all validation errors reference these paths):
 *   title          string, required. Site title shown in header/tab.
 *   baseUrl        string, required. Host (+ optional path) WITHOUT protocol or
 *                  trailing slash, e.g. "notes.example.com" or "example.com/vault".
 *                  Used by Quartz for sitemap/RSS/canonical URLs.
 *   locale         string, optional (default "en-US"). BCP-47 tag.
 *   theme          object, optional. See ThemeSettings.
 *   publishFilter  object, optional. See PublishFilterRules and engine/README.md
 *                  "Publish filter semantics" for the exact precedence rules.
 */
export interface SiteConfig {
  title: string
  baseUrl: string
  locale: string
  theme: ThemeSettings
  publishFilter: PublishFilterRules
}

/**
 * Minimal theme surface: font names and named color overrides.
 * Anything unset falls back to stock Quartz defaults.
 */
export interface ThemeSettings {
  typography?: ThemeTypography
  colors?: ThemeColorModes
}

/** Font family names (resolved via Google Fonts by the generated Quartz config). */
export interface ThemeTypography {
  header?: string
  body?: string
  code?: string
}

export interface ThemeColorModes {
  lightMode?: ThemeColorOverrides
  darkMode?: ThemeColorOverrides
}

/** The named Quartz theme colors a site may override (per mode). */
export const THEME_COLOR_KEYS = [
  "light",
  "lightgray",
  "gray",
  "darkgray",
  "dark",
  "secondary",
  "tertiary",
  "highlight",
  "textHighlight",
] as const
export type ThemeColorKey = (typeof THEME_COLOR_KEYS)[number]
export type ThemeColorOverrides = Partial<Record<ThemeColorKey, string>>

/**
 * Publish filter rules. Folder paths are vault-relative, "/"-separated,
 * no leading/trailing slash (e.g. "notes" or "blog/public").
 * Exact decision precedence is documented in engine/README.md and
 * implemented by PublishFilter.
 */
export interface PublishFilterRules {
  /** Markdown under these folders is published by default (frontmatter `publish: false` still wins). */
  includeFolders: string[]
  /** Nothing under these folders is EVER published (wins over everything, incl. `publish: true`). */
  excludeFolders: string[]
  /**
   * Explicit whole-vault opt-in: markdown and canvas publish WITHOUT listing
   * includeFolders. The always-exclude rules (hidden segments, "private"
   * paths, excludeFolders) and frontmatter `publish: false` still win.
   * Absent/false keeps the fail-closed default-deny.
   */
  publishAll?: boolean
}

export const DEFAULT_LOCALE = "en-US"

/** Thrown when site.json does not match the schema. Message lists every problem found. */
export class SiteConfigError extends Error {
  constructor(problems: string[]) {
    super(`Invalid site config:\n  - ${problems.join("\n  - ")}`)
    this.name = "SiteConfigError"
  }
}

/**
 * Boundary validator for site.json. Fails fast with ALL problems listed
 * (unknown keys are rejected so typos never silently no-op).
 */
export class SiteConfigParser {
  /** Parse and validate a site.json file from disk. */
  static parseFile(filePath: string): SiteConfig {
    if (!fs.existsSync(filePath)) {
      throw new SiteConfigError([`config file not found: ${filePath}`])
    }
    let raw: unknown
    try {
      raw = JSON.parse(fs.readFileSync(filePath, "utf-8"))
    } catch (error) {
      throw new SiteConfigError([`config file is not valid JSON (${filePath}): ${(error as Error).message}`])
    }
    return SiteConfigParser.parse(raw)
  }

  /** Validate an already-parsed JSON value. */
  static parse(raw: unknown): SiteConfig {
    const problems: string[] = []
    const obj = asObject(raw, "(root)", problems)
    if (obj === undefined) throw new SiteConfigError(problems)

    rejectUnknownKeys(obj, "(root)", ["title", "baseUrl", "locale", "theme", "publishFilter"], problems)

    const title = requireString(obj, "title", problems)
    const baseUrl = requireString(obj, "baseUrl", problems)
    if (baseUrl !== undefined) validateBaseUrl(baseUrl, problems)
    const locale = optionalString(obj, "locale", problems) ?? DEFAULT_LOCALE
    const theme = parseTheme(obj["theme"], problems)
    const publishFilter = parsePublishFilter(obj["publishFilter"], problems)

    if (problems.length > 0) throw new SiteConfigError(problems)
    return { title: title as string, baseUrl: baseUrl as string, locale, theme, publishFilter }
  }
}

function validateBaseUrl(baseUrl: string, problems: string[]): void {
  if (/^[a-z]+:\/\//i.test(baseUrl)) {
    problems.push(`baseUrl must not include a protocol (got "${baseUrl}", expected e.g. "notes.example.com")`)
  }
  if (baseUrl.endsWith("/")) {
    problems.push(`baseUrl must not end with "/" (got "${baseUrl}")`)
  }
}

function parseTheme(raw: unknown, problems: string[]): ThemeSettings {
  if (raw === undefined) return {}
  const obj = asObject(raw, "theme", problems)
  if (obj === undefined) return {}
  rejectUnknownKeys(obj, "theme", ["typography", "colors"], problems)

  const theme: ThemeSettings = {}
  if (obj["typography"] !== undefined) {
    const typography = asObject(obj["typography"], "theme.typography", problems)
    if (typography !== undefined) {
      rejectUnknownKeys(typography, "theme.typography", ["header", "body", "code"], problems)
      theme.typography = {
        header: optionalString(typography, "theme.typography.header", problems, "header"),
        body: optionalString(typography, "theme.typography.body", problems, "body"),
        code: optionalString(typography, "theme.typography.code", problems, "code"),
      }
    }
  }
  if (obj["colors"] !== undefined) {
    const colors = asObject(obj["colors"], "theme.colors", problems)
    if (colors !== undefined) {
      rejectUnknownKeys(colors, "theme.colors", ["lightMode", "darkMode"], problems)
      theme.colors = {
        lightMode: parseColorOverrides(colors["lightMode"], "theme.colors.lightMode", problems),
        darkMode: parseColorOverrides(colors["darkMode"], "theme.colors.darkMode", problems),
      }
    }
  }
  return theme
}

function parseColorOverrides(
  raw: unknown,
  path: string,
  problems: string[],
): ThemeColorOverrides | undefined {
  if (raw === undefined) return undefined
  const obj = asObject(raw, path, problems)
  if (obj === undefined) return undefined
  const overrides: ThemeColorOverrides = {}
  for (const [key, value] of Object.entries(obj)) {
    if (!(THEME_COLOR_KEYS as readonly string[]).includes(key)) {
      problems.push(`${path}.${key}: unknown color name (allowed: ${THEME_COLOR_KEYS.join(", ")})`)
      continue
    }
    if (typeof value !== "string") {
      problems.push(`${path}.${key}: expected a CSS color string`)
      continue
    }
    overrides[key as ThemeColorKey] = value
  }
  return overrides
}

function parsePublishFilter(raw: unknown, problems: string[]): PublishFilterRules {
  const empty: PublishFilterRules = { includeFolders: [], excludeFolders: [] }
  if (raw === undefined) return empty
  const obj = asObject(raw, "publishFilter", problems)
  if (obj === undefined) return empty
  rejectUnknownKeys(obj, "publishFilter", ["includeFolders", "excludeFolders", "publishAll"], problems)
  const rules: PublishFilterRules = {
    includeFolders: parseFolderList(obj["includeFolders"], "publishFilter.includeFolders", problems),
    excludeFolders: parseFolderList(obj["excludeFolders"], "publishFilter.excludeFolders", problems),
  }
  const publishAll = optionalBoolean(obj, "publishFilter.publishAll", "publishAll", problems)
  if (publishAll !== undefined) rules.publishAll = publishAll
  return rules
}

function parseFolderList(raw: unknown, path: string, problems: string[]): string[] {
  if (raw === undefined) return []
  if (!Array.isArray(raw)) {
    problems.push(`${path}: expected an array of vault-relative folder paths`)
    return []
  }
  const folders: string[] = []
  for (const [index, value] of raw.entries()) {
    if (typeof value !== "string" || value === "") {
      problems.push(`${path}[${index}]: expected a non-empty string`)
      continue
    }
    if (value.startsWith("/") || value.endsWith("/") || value.includes("\\")) {
      problems.push(`${path}[${index}]: use vault-relative "/"-separated paths without leading/trailing slash (got "${value}")`)
      continue
    }
    folders.push(value)
  }
  return folders
}

// --- small validation helpers -------------------------------------------------

function asObject(raw: unknown, path: string, problems: string[]): Record<string, unknown> | undefined {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    problems.push(`${path}: expected a JSON object`)
    return undefined
  }
  return raw as Record<string, unknown>
}

function rejectUnknownKeys(
  obj: Record<string, unknown>,
  path: string,
  allowed: string[],
  problems: string[],
): void {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) {
      problems.push(`${path}.${key}: unknown key (allowed: ${allowed.join(", ")})`)
    }
  }
}

function requireString(obj: Record<string, unknown>, key: string, problems: string[]): string | undefined {
  const value = obj[key]
  if (typeof value !== "string" || value === "") {
    problems.push(`${key}: required non-empty string`)
    return undefined
  }
  return value
}

function optionalBoolean(
  obj: Record<string, unknown>,
  path: string,
  key: string,
  problems: string[],
): boolean | undefined {
  const value = obj[key]
  if (value === undefined) return undefined
  if (typeof value !== "boolean") {
    problems.push(`${path}: expected a boolean`)
    return undefined
  }
  return value
}

function optionalString(
  obj: Record<string, unknown>,
  path: string,
  problems: string[],
  key?: string,
): string | undefined {
  const value = obj[key ?? path]
  if (value === undefined) return undefined
  if (typeof value !== "string") {
    problems.push(`${path}: expected a string`)
    return undefined
  }
  return value
}
