import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { parse as parseYaml } from "yaml"
import { QuartzConfigGenerator, DEFAULT_LIGHT_MODE_COLORS } from "../../src/quartzConfigGenerator.ts"
import type { SiteConfig } from "../../src/siteConfig.ts"

function siteConfig(overrides: Partial<SiteConfig> = {}): SiteConfig {
  return {
    title: "Test Site",
    baseUrl: "notes.example.com",
    locale: "en-US",
    theme: {},
    publishFilter: { includeFolders: [], excludeFolders: [] },
    ...overrides,
  }
}

type ConfigDoc = {
  configuration: Record<string, any>
  plugins: Array<{ source: string; enabled: boolean }>
  layout: Record<string, any>
}

function generate(overrides: Partial<SiteConfig> = {}): ConfigDoc {
  return QuartzConfigGenerator.generateConfigObject(siteConfig(overrides)) as ConfigDoc
}

function pluginEntry(doc: ConfigDoc, shortName: string) {
  return doc.plugins.find((p) => p.source === `github:quartz-community/${shortName}`)
}

describe("QuartzConfigGenerator — configuration mapping", () => {
  test("GIVEN a site title WHEN generating THEN pageTitle carries it", () => {
    assert.equal(generate({ title: "My Vault" }).configuration.pageTitle, "My Vault")
  })

  test("GIVEN a baseUrl WHEN generating THEN configuration.baseUrl carries it", () => {
    assert.equal(generate({ baseUrl: "example.com/x" }).configuration.baseUrl, "example.com/x")
  })

  test("GIVEN a locale WHEN generating THEN configuration.locale carries it", () => {
    assert.equal(generate({ locale: "de-DE" }).configuration.locale, "de-DE")
  })

  test("GIVEN any site WHEN generating THEN analytics is null (never track customer sites)", () => {
    assert.equal(generate().configuration.analytics, null)
  })

  test("GIVEN any site WHEN generating THEN ignorePatterns is empty (staging is the only filter)", () => {
    assert.deepEqual(generate().configuration.ignorePatterns, [])
  })
})

describe("QuartzConfigGenerator — theme merging", () => {
  test("GIVEN no theme overrides WHEN generating THEN stock light colors are used", () => {
    const colors = generate().configuration.theme.colors
    assert.deepEqual(colors.lightMode, DEFAULT_LIGHT_MODE_COLORS)
  })

  test("GIVEN a single lightMode color override WHEN generating THEN only that color changes", () => {
    const doc = generate({ theme: { colors: { lightMode: { secondary: "#ff0000" } } } })
    assert.deepEqual(doc.configuration.theme.colors.lightMode, {
      ...DEFAULT_LIGHT_MODE_COLORS,
      secondary: "#ff0000",
    })
  })

  test("GIVEN a body font override WHEN generating THEN header font keeps its default", () => {
    const doc = generate({ theme: { typography: { body: "Inter" } } })
    assert.equal(doc.configuration.theme.typography.header, "Schibsted Grotesk")
  })

  test("GIVEN a body font override WHEN generating THEN body font carries it", () => {
    const doc = generate({ theme: { typography: { body: "Inter" } } })
    assert.equal(doc.configuration.theme.typography.body, "Inter")
  })
})

describe("QuartzConfigGenerator — plugin set", () => {
  test("GIVEN any site WHEN generating THEN official canvas-page plugin is disabled (ADR 0001)", () => {
    assert.equal(pluginEntry(generate(), "canvas-page")?.enabled, false)
  })

  test("GIVEN a canvas plugin dir WHEN generating THEN it is registered as an enabled local plugin source", () => {
    const doc = QuartzConfigGenerator.generateConfigObject(
      siteConfig(),
      "/abs/path/canvas-plugin",
    ) as ConfigDoc
    const local = doc.plugins.find((p) => p.source === "/abs/path/canvas-plugin")
    assert.deepEqual({ enabled: local?.enabled }, { enabled: true })
  })

  test("GIVEN any site WHEN generating THEN the layout declares the canvas pageType", () => {
    assert.notEqual(generate().layout.byPageType.canvas, undefined)
  })

  test("GIVEN any site WHEN generating THEN remove-draft is disabled (PublishFilter is the only filter surface)", () => {
    assert.equal(pluginEntry(generate(), "remove-draft")?.enabled, false)
  })

  test("GIVEN any site WHEN generating THEN core markdown pipeline plugins are enabled", () => {
    const doc = generate()
    const enabledCore = ["obsidian-flavored-markdown", "crawl-links", "content-page", "search", "graph"]
      .map((name) => pluginEntry(doc, name)?.enabled)
    assert.deepEqual(enabledCore, [true, true, true, true, true])
  })
})

describe("QuartzConfigGenerator — YAML output", () => {
  test("GIVEN a site WHEN generating YAML THEN it round-trips to the same object", () => {
    const yamlText = QuartzConfigGenerator.generateYaml(siteConfig())
    assert.deepEqual(parseYaml(yamlText), QuartzConfigGenerator.generateConfigObject(siteConfig()))
  })
})
