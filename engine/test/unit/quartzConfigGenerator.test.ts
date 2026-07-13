import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
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
    const doc = QuartzConfigGenerator.generateConfigObject(siteConfig(), {
      canvasPluginDir: "/abs/path/canvas-plugin",
    }) as ConfigDoc
    const local = doc.plugins.find((p) => p.source === "/abs/path/canvas-plugin")
    assert.deepEqual({ enabled: local?.enabled }, { enabled: true })
  })

  test("GIVEN any site WHEN generating THEN stock explorer is disabled (replaced by vintrin-explorer)", () => {
    assert.equal(pluginEntry(generate(), "explorer")?.enabled, false)
  })

  test("GIVEN an explorer plugin dir WHEN generating THEN it is an enabled LEFT-sidebar local source", () => {
    const doc = QuartzConfigGenerator.generateConfigObject(siteConfig(), {
      explorerPluginDir: "/abs/path/vintrin-explorer",
    }) as ConfigDoc
    const local = doc.plugins.find((p) => p.source === "/abs/path/vintrin-explorer") as
      | { enabled: boolean; layout?: { position: string; priority: number } }
      | undefined
    assert.deepEqual(
      { enabled: local?.enabled, layout: local?.layout },
      { enabled: true, layout: { position: "left", priority: 50 } },
    )
  })

  test("GIVEN any site WHEN generating THEN stock breadcrumbs is disabled (replaced by vintrin-breadcrumbs)", () => {
    assert.equal(pluginEntry(generate(), "breadcrumbs")?.enabled, false)
  })

  test("GIVEN a breadcrumbs plugin dir WHEN generating THEN it is an enabled beforeBody local source excluded on the home page", () => {
    const doc = QuartzConfigGenerator.generateConfigObject(siteConfig(), {
      breadcrumbsPluginDir: "/abs/path/vintrin-breadcrumbs",
    }) as ConfigDoc
    const local = doc.plugins.find((p) => p.source === "/abs/path/vintrin-breadcrumbs") as
      | { enabled: boolean; layout?: Record<string, unknown> }
      | undefined
    assert.deepEqual(
      { enabled: local?.enabled, layout: local?.layout },
      {
        enabled: true,
        layout: { position: "beforeBody", priority: 5, condition: "not-index" },
      },
    )
  })

  test("GIVEN any site WHEN generating THEN folder-page is disabled (no folder URLs, collapse-only folders)", () => {
    assert.equal(pluginEntry(generate(), "folder-page")?.enabled, false)
  })

  test("GIVEN any site WHEN generating THEN the layout has NO folder pageType entry", () => {
    assert.equal(generate().layout.byPageType.folder, undefined)
  })

  test("GIVEN any site WHEN generating THEN the layout declares the canvas pageType", () => {
    assert.notEqual(generate().layout.byPageType.canvas, undefined)
  })

  test("GIVEN any site WHEN generating THEN canvas pages keep reader-mode (book icon toggles graph sidebar)", () => {
    const canvasExclude: string[] = generate().layout.byPageType.canvas.exclude ?? []
    assert.equal(canvasExclude.includes("reader-mode"), false)
  })

  test("GIVEN any site WHEN generating THEN canvas pages exclude content-meta (canvases have no dates, only reading-time would show)", () => {
    const canvasExclude: string[] = generate().layout.byPageType.canvas.exclude ?? []
    assert.equal(canvasExclude.includes("content-meta"), true)
  })

  test("GIVEN any site WHEN generating THEN remove-draft is disabled (PublishFilter is the only filter surface)", () => {
    assert.equal(pluginEntry(generate(), "remove-draft")?.enabled, false)
  })

  test("GIVEN any site WHEN generating THEN search stands alone in the left sidebar (full width, no toolbar group)", () => {
    // The mode toggles live in the top-right corner cluster instead
    // (ref.ap.0zwhQQya81CGNQ9pmqKkM.E) — search must NOT share a row with them.
    const entry = pluginEntry(generate(), "search") as { layout?: Record<string, unknown> }
    assert.deepEqual(entry?.layout, { position: "left", priority: 20 })
  })

  test("GIVEN any site WHEN generating THEN darkmode and reader-mode form the corner mode-toggle cluster", () => {
    const doc = generate()
    const groupOf = (name: string) =>
      (pluginEntry(doc, name) as { layout?: { group?: string } })?.layout?.group
    assert.deepEqual(
      { darkmode: groupOf("darkmode"), readerMode: groupOf("reader-mode") },
      { darkmode: "toolbar", readerMode: "toolbar" },
    )
  })

  test("GIVEN any site WHEN generating THEN core markdown pipeline plugins are enabled", () => {
    const doc = generate()
    const enabledCore = ["obsidian-flavored-markdown", "crawl-links", "content-page", "search", "graph"]
      .map((name) => pluginEntry(doc, name)?.enabled)
    assert.deepEqual(enabledCore, [true, true, true, true, true])
  })
})

describe("QuartzConfigGenerator — zen-mode plugin", () => {
  function zenEntry(doc: ConfigDoc) {
    return doc.plugins.find((p) => typeof p.source === "string" && p.source.endsWith("/zen-mode"))
  }

  test("GIVEN a zen-mode plugin dir WHEN generating THEN it is an enabled local source", () => {
    const doc = QuartzConfigGenerator.generateConfigObject(siteConfig(), {
      zenModePluginDir: "/abs/path/zen-mode",
    }) as ConfigDoc
    assert.equal(doc.plugins.find((p) => p.source === "/abs/path/zen-mode")?.enabled, true)
  })

  test("GIVEN any site WHEN generating THEN zen-mode sits in the toolbar right after reader-mode (priority 40)", () => {
    const entry = zenEntry(generate()) as { layout?: Record<string, unknown> } | undefined
    assert.deepEqual(entry?.layout, { position: "left", priority: 40, group: "toolbar" })
  })

  test("GIVEN the default zen-mode dir WHEN inspected THEN it is a component-category quartz plugin", () => {
    const source = zenEntry(generate())?.source as string
    const pkg = JSON.parse(fs.readFileSync(path.join(source, "package.json"), "utf-8"))
    assert.equal(pkg.quartz?.category, "component")
  })
})

describe("QuartzConfigGenerator — full-screen-mode plugin (docs/tickets/full-screen-mode.md)", () => {
  function fullScreenEntry(doc: ConfigDoc) {
    return doc.plugins.find(
      (p) => typeof p.source === "string" && p.source.endsWith("/full-screen-mode"),
    )
  }

  test("GIVEN a full-screen-mode plugin dir WHEN generating THEN it is an enabled local source", () => {
    const doc = QuartzConfigGenerator.generateConfigObject(siteConfig(), {
      fullScreenModePluginDir: "/abs/path/full-screen-mode",
    }) as ConfigDoc
    assert.equal(doc.plugins.find((p) => p.source === "/abs/path/full-screen-mode")?.enabled, true)
  })

  test("GIVEN any site WHEN generating THEN full-screen-mode is the RIGHTMOST toolbar icon (priority 45)", () => {
    const entry = fullScreenEntry(generate()) as { layout?: Record<string, unknown> } | undefined
    assert.deepEqual(entry?.layout, { position: "left", priority: 45, group: "toolbar" })
  })

  test("GIVEN any site WHEN generating THEN canvas pages keep full-screen-mode (the ubiquitous fullscreen affordance)", () => {
    const canvasExclude: string[] = generate().layout.byPageType.canvas.exclude ?? []
    assert.equal(canvasExclude.includes("full-screen-mode"), false)
  })

  test("GIVEN the default full-screen-mode dir WHEN inspected THEN it is a component-category quartz plugin", () => {
    const source = fullScreenEntry(generate())?.source as string
    const pkg = JSON.parse(fs.readFileSync(path.join(source, "package.json"), "utf-8"))
    assert.equal(pkg.quartz?.category, "component")
  })
})

describe("QuartzConfigGenerator — YAML output", () => {
  test("GIVEN a site WHEN generating YAML THEN it round-trips to the same object", () => {
    const yamlText = QuartzConfigGenerator.generateYaml(siteConfig())
    assert.deepEqual(parseYaml(yamlText), QuartzConfigGenerator.generateConfigObject(siteConfig()))
  })
})
