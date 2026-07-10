import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { after, before, describe, test } from "node:test"
import { SiteBuilder } from "../../src/siteBuilder.ts"
import { SiteConfigParser, type SiteConfig } from "../../src/siteConfig.ts"

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..")
const VAULT_DIR = path.join(REPO_ROOT, "test-vault")

/**
 * THE point of id-based publishing (plan/id-based-publishing.md §1): renaming
 * a doc in the vault never changes its published URL or any resolved link.
 *
 * Simulates an Obsidian rename of notes/getting-started.md -> notes/setup-guide.md:
 * the file moves and every [[getting-started]] wikilink / canvas file-node path
 * is updated to the new name (as Obsidian does), while the docid stays put.
 */
describe("Rename stability integration — renaming a note changes NO published URL", () => {
  let workDir: string
  let originalSnapshot: SiteSnapshot
  let renamedSnapshot: SiteSnapshot

  before(async () => {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), "rename-stability-test-"))
    const originalVault = path.join(workDir, "vault-original")
    const renamedVault = path.join(workDir, "vault-renamed")
    fs.cpSync(VAULT_DIR, originalVault, { recursive: true })
    fs.cpSync(VAULT_DIR, renamedVault, { recursive: true })
    simulateObsidianRename(renamedVault)

    originalSnapshot = await buildAndSnapshot(originalVault, path.join(workDir, "out-original"))
    renamedSnapshot = await buildAndSnapshot(renamedVault, path.join(workDir, "out-renamed"))
  })

  after(() => fs.rmSync(workDir, { recursive: true, force: true }))

  test("THEN the emitted file set is identical", () => {
    assert.deepEqual(renamedSnapshot.files, originalSnapshot.files)
  })

  test("THEN every page slug in the content index is identical", () => {
    assert.deepEqual(renamedSnapshot.slugs, originalSnapshot.slugs)
  })

  test("THEN every page's outbound links are identical", () => {
    assert.deepEqual(renamedSnapshot.linksBySlug, originalSnapshot.linksBySlug)
  })
})

interface SiteSnapshot {
  files: string[]
  slugs: string[]
  linksBySlug: Record<string, string[]>
}

async function buildAndSnapshot(vaultDir: string, outDir: string): Promise<SiteSnapshot> {
  await new SiteBuilder().buildSite({ vaultDir, siteConfig: siteConfig(), outDir })
  const contentIndex: Record<string, { links: string[] }> = JSON.parse(
    fs.readFileSync(path.join(outDir, "static/contentIndex.json"), "utf-8"),
  )
  return {
    files: listFiles(outDir).sort(),
    slugs: Object.keys(contentIndex).sort(),
    linksBySlug: Object.fromEntries(
      Object.entries(contentIndex).map(([slug, entry]) => [slug, [...entry.links].sort()]),
    ),
  }
}

function siteConfig(): SiteConfig {
  return SiteConfigParser.parse({
    title: "Rename Stability Test Site",
    baseUrl: "rename-it.example.com",
    publishFilter: { includeFolders: ["canvases"] },
  })
}

function simulateObsidianRename(vaultDir: string): void {
  fs.renameSync(
    path.join(vaultDir, "notes/getting-started.md"),
    path.join(vaultDir, "notes/setup-guide.md"),
  )
  for (const relPath of listFiles(vaultDir)) {
    if (!/\.(md|canvas)$/.test(relPath)) continue
    const absPath = path.join(vaultDir, relPath)
    const updated = fs
      .readFileSync(absPath, "utf-8")
      // wikilinks in notes and canvas text cards
      .replaceAll("[[getting-started", "[[setup-guide")
      // canvas file-node paths
      .replaceAll("notes/getting-started.md", "notes/setup-guide.md")
    fs.writeFileSync(absPath, updated)
  }
}

function listFiles(dir: string): string[] {
  return fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)))
}
