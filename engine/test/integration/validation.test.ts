import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { after, before, describe, test } from "node:test"
import { SiteBuilder } from "../../src/siteBuilder.ts"
import { SiteConfigParser, type SiteConfig } from "../../src/siteConfig.ts"
import {
  BrokenInternalLinksError,
  PrivateContentLeakError,
} from "../../src/validation/siteValidator.ts"
import type { BuildSiteResult } from "../../src/siteBuilder.ts"

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..")
const VAULT_DIR = path.join(REPO_ROOT, "test-vault")
const OUT_DIR = path.join(REPO_ROOT, ".build", "integration-validation-out")

function fullSiteConfig(): SiteConfig {
  return SiteConfigParser.parse({
    title: "Validation Integration Test Site",
    baseUrl: "validation-it.example.com",
    publishFilter: { includeFolders: ["canvases"] },
  })
}

describe("Validation pass integration — full test-vault build", () => {
  let result: BuildSiteResult

  // GIVEN the fixture vault WHEN building with canvases included (default link policy)
  before(async () => {
    fs.rmSync(OUT_DIR, { recursive: true, force: true })
    result = await new SiteBuilder().buildSite({
      vaultDir: VAULT_DIR,
      siteConfig: fullSiteConfig(),
      outDir: OUT_DIR,
    })
  })

  after(() => fs.rmSync(OUT_DIR, { recursive: true, force: true }))

  test("THEN the leak check finds nothing (the build would have failed otherwise)", () => {
    assert.deepEqual(result.validation.leaks, [])
  })

  test("THEN the ONLY broken link is index's deliberate wikilink to the private note", () => {
    // KNOWN dead link, by fixture design (plan §5 definition of done includes a
    // reference to one private note): index.md wikilinks [[private-secret]],
    // which is publish:false. Markdown wikilinks to unpublished notes degrade
    // to a dead href (only canvas CARDS get privacy placeholders, plan §4.4) —
    // exactly what this report exists to surface to the site owner.
    assert.deepEqual(result.validation.brokenLinks, {
      totalBroken: 1,
      brokenBySourcePage: {
        index: [
          { target: "./private-secret", resolvedSitePath: "private-secret", kind: "page-link" },
        ],
      },
    })
  })
})

describe("Validation pass integration — strictLinks escalates the known dead link", () => {
  const STRICT_OUT_DIR = `${OUT_DIR}-strict`
  after(() => fs.rmSync(STRICT_OUT_DIR, { recursive: true, force: true }))

  test("GIVEN strictLinks WHEN building the fixture (has one dead link) THEN the build FAILS", async () => {
    await assert.rejects(
      new SiteBuilder().buildSite({
        vaultDir: VAULT_DIR,
        siteConfig: fullSiteConfig(),
        outDir: STRICT_OUT_DIR,
        strictLinks: true,
      }),
      (error: Error) =>
        error instanceof BrokenInternalLinksError && /private-secret/.test(error.message),
    )
  })
})

describe("Validation pass integration — seeded private-content leak FAILS the build", () => {
  let workDir: string
  let leakyVaultDir: string
  let sentinelLine: string

  // GIVEN a COPY of the fixture vault (test-vault stays untouched) where a
  // canvas text card quotes the private note's content verbatim — bypassing
  // staging exclusion exactly the way the §4.4 backstop must catch.
  before(() => {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), "leak-integration-test-"))
    leakyVaultDir = path.join(workDir, "vault")
    fs.cpSync(VAULT_DIR, leakyVaultDir, { recursive: true })

    const privateNote = fs.readFileSync(path.join(leakyVaultDir, "notes/private-secret.md"), "utf-8")
    const foundLine = privateNote.split("\n").find((line) => line.includes("LEAK-SENTINEL"))
    assert.notEqual(foundLine, undefined, "fixture invariant: private note carries the sentinel")
    sentinelLine = foundLine as string

    const canvasPath = path.join(leakyVaultDir, "canvases/main.canvas")
    const canvas = JSON.parse(fs.readFileSync(canvasPath, "utf-8"))
    canvas.nodes.push({
      id: "leaky-quote-card",
      type: "text",
      text: `Quoting the private note:\n\n${sentinelLine}`,
      x: 1200,
      y: 1200,
      width: 460,
      height: 220,
    })
    fs.writeFileSync(canvasPath, JSON.stringify(canvas, null, 2))
  })

  after(() => fs.rmSync(workDir, { recursive: true, force: true }))

  test("WHEN building THEN PrivateContentLeakError names the private file", async () => {
    await assert.rejects(
      new SiteBuilder().buildSite({
        vaultDir: leakyVaultDir,
        siteConfig: fullSiteConfig(),
        outDir: path.join(workDir, "out"),
      }),
      (error: Error) =>
        error instanceof PrivateContentLeakError &&
        error.message.includes("notes/private-secret.md") &&
        // and points at at least one emitted file carrying the content
        error.leaks.every((leak) => leak.emittedSitePath.length > 0),
    )
  })
})
