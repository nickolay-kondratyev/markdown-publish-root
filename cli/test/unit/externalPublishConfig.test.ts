import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, test } from "node:test"
import {
  ExternalPublishConfigLoader,
  VAULT_CONFIG_FILE_NAME,
} from "../../src/externalPublishConfig.ts"

const VALID_SITE_CONFIG = { title: "T", baseUrl: "example.com" }

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "extconfig-test-"))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

function writeConfig(dir: string, config: unknown, fileName = VAULT_CONFIG_FILE_NAME): string {
  const filePath = path.join(dir, fileName)
  fs.writeFileSync(filePath, JSON.stringify(config))
  return filePath
}

describe("ExternalPublishConfigLoader.resolveConfigPath", () => {
  test("GIVEN an explicit --config path WHEN resolving THEN it wins over the in-vault file", () => {
    const explicit = writeConfig(tmpDir, VALID_SITE_CONFIG, "site.json")
    writeConfig(tmpDir, VALID_SITE_CONFIG)
    assert.equal(ExternalPublishConfigLoader.resolveConfigPath(tmpDir, explicit), explicit)
  })

  test("GIVEN no --config and an in-vault config WHEN resolving THEN the in-vault file is discovered", () => {
    const inVault = writeConfig(tmpDir, VALID_SITE_CONFIG)
    assert.equal(ExternalPublishConfigLoader.resolveConfigPath(tmpDir, undefined), inVault)
  })

  test("GIVEN no --config and no in-vault config WHEN resolving THEN the error names both options", () => {
    assert.throws(
      () => ExternalPublishConfigLoader.resolveConfigPath(tmpDir, undefined),
      new RegExp(`${VAULT_CONFIG_FILE_NAME}|--config`),
    )
  })
})

describe("ExternalPublishConfigLoader.load — site config passthrough", () => {
  test("GIVEN a valid config WHEN loading THEN the site config is parsed", () => {
    const configPath = writeConfig(tmpDir, VALID_SITE_CONFIG)
    const loaded = ExternalPublishConfigLoader.load(configPath)
    assert.equal(loaded.siteConfig.title, "T")
  })

  test("GIVEN publishAll in publishFilter WHEN loading THEN it is carried through", () => {
    const configPath = writeConfig(tmpDir, {
      ...VALID_SITE_CONFIG,
      publishFilter: { publishAll: true },
    })
    const loaded = ExternalPublishConfigLoader.load(configPath)
    assert.equal(loaded.siteConfig.publishFilter.publishAll, true)
  })

  test("GIVEN an invalid site field WHEN loading THEN the engine validation error surfaces", () => {
    const configPath = writeConfig(tmpDir, { title: "T" })
    assert.throws(() => ExternalPublishConfigLoader.load(configPath), /baseUrl: required/)
  })

  test("GIVEN a missing file WHEN loading THEN a clear error is raised", () => {
    assert.throws(
      () => ExternalPublishConfigLoader.load(path.join(tmpDir, "nope.json")),
      /not found/,
    )
  })

  test("GIVEN invalid JSON WHEN loading THEN a clear error is raised", () => {
    const filePath = path.join(tmpDir, VAULT_CONFIG_FILE_NAME)
    fs.writeFileSync(filePath, "{not json")
    assert.throws(() => ExternalPublishConfigLoader.load(filePath), /not valid JSON/)
  })
})

describe("ExternalPublishConfigLoader.load — output_dir", () => {
  test("GIVEN no output_dir WHEN loading THEN outputDir is undefined", () => {
    const configPath = writeConfig(tmpDir, VALID_SITE_CONFIG)
    assert.equal(ExternalPublishConfigLoader.load(configPath).outputDir, undefined)
  })

  test("GIVEN a relative output_dir WHEN loading THEN it resolves against the config file's directory", () => {
    const configPath = writeConfig(tmpDir, { ...VALID_SITE_CONFIG, output_dir: ".publish_out/site" })
    assert.equal(
      ExternalPublishConfigLoader.load(configPath).outputDir,
      path.join(tmpDir, ".publish_out", "site"),
    )
  })

  test("GIVEN a parent-relative output_dir WHEN loading THEN it resolves outside the vault", () => {
    const vaultDir = path.join(tmpDir, "vault")
    fs.mkdirSync(vaultDir)
    const configPath = writeConfig(vaultDir, { ...VALID_SITE_CONFIG, output_dir: "../public" })
    assert.equal(
      ExternalPublishConfigLoader.load(configPath).outputDir,
      path.join(tmpDir, "public"),
    )
  })

  test("GIVEN an absolute output_dir WHEN loading THEN it is used as-is", () => {
    const absolute = path.join(tmpDir, "elsewhere")
    const configPath = writeConfig(tmpDir, { ...VALID_SITE_CONFIG, output_dir: absolute })
    assert.equal(ExternalPublishConfigLoader.load(configPath).outputDir, absolute)
  })

  test("GIVEN a non-string output_dir WHEN loading THEN it is rejected", () => {
    const configPath = writeConfig(tmpDir, { ...VALID_SITE_CONFIG, output_dir: 42 })
    assert.throws(
      () => ExternalPublishConfigLoader.load(configPath),
      /output_dir: expected a non-empty string/,
    )
  })

  test("GIVEN an empty output_dir WHEN loading THEN it is rejected", () => {
    const configPath = writeConfig(tmpDir, { ...VALID_SITE_CONFIG, output_dir: "" })
    assert.throws(
      () => ExternalPublishConfigLoader.load(configPath),
      /output_dir: expected a non-empty string/,
    )
  })
})
