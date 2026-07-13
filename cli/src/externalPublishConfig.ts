import fs from "node:fs"
import path from "node:path"
import { SiteConfigError, SiteConfigParser, type SiteConfig } from "../../engine/src/index.ts"

/**
 * In-vault publish config file, discovered at the vault root when `publish
 * build` is invoked without --config. The leading "." keeps it out of the
 * published output (hidden-segment rule in the engine's PublishFilter).
 * Format: docs/config-format.md.
 */
export const VAULT_CONFIG_FILE_NAME = ".external_publish_config.json"

/** The `output_dir` key is CLI-level (like --out) — stripped before the engine sees the config. */
const OUTPUT_DIR_KEY = "output_dir"

/** A loaded publish config: the engine's site settings plus CLI-level extras. */
export interface LoadedPublishConfig {
  siteConfig: SiteConfig
  /**
   * Absolute output directory from `output_dir`, resolved against the config
   * file's directory (undefined when the key is absent). --out overrides it.
   */
  outputDir?: string
}

/**
 * CLI boundary for `.external_publish_config.json` / --config files: the file
 * is the engine's site.json schema PLUS the CLI-level `output_dir` key. The
 * engine stays outDir-agnostic (its config surface never grows for CLI
 * concerns) — this loader strips `output_dir` before delegating validation
 * to the engine's SiteConfigParser.
 */
export class ExternalPublishConfigLoader {
  /**
   * Picks the config file: an explicit --config path wins; otherwise the
   * in-vault VAULT_CONFIG_FILE_NAME is discovered. Throws (SiteConfigError)
   * when neither exists.
   */
  static resolveConfigPath(vaultDir: string, explicitConfigPath: string | undefined): string {
    if (explicitConfigPath !== undefined) return explicitConfigPath
    const inVaultPath = path.join(vaultDir, VAULT_CONFIG_FILE_NAME)
    if (!fs.existsSync(inVaultPath)) {
      throw new SiteConfigError([
        `no config found: pass --config <site.json> or create ${inVaultPath}`,
      ])
    }
    return inVaultPath
  }

  /** Reads, validates, and splits the config file. Throws SiteConfigError on any problem. */
  static load(configPath: string): LoadedPublishConfig {
    if (!fs.existsSync(configPath)) {
      throw new SiteConfigError([`config file not found: ${configPath}`])
    }
    let raw: unknown
    try {
      raw = JSON.parse(fs.readFileSync(configPath, "utf-8"))
    } catch (error) {
      throw new SiteConfigError([
        `config file is not valid JSON (${configPath}): ${(error as Error).message}`,
      ])
    }
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      throw new SiteConfigError(["(root): expected a JSON object"])
    }

    const { [OUTPUT_DIR_KEY]: outputDirRaw, ...siteConfigRaw } = raw as Record<string, unknown>
    const outputDir = parseOutputDir(outputDirRaw, configPath)
    const siteConfig = SiteConfigParser.parse(siteConfigRaw)
    return outputDir === undefined ? { siteConfig } : { siteConfig, outputDir }
  }
}

function parseOutputDir(raw: unknown, configPath: string): string | undefined {
  if (raw === undefined) return undefined
  if (typeof raw !== "string" || raw === "") {
    throw new SiteConfigError([
      `${OUTPUT_DIR_KEY}: expected a non-empty string (path relative to the config file, or absolute)`,
    ])
  }
  return path.resolve(path.dirname(configPath), raw)
}
