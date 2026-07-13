import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { after, describe, test } from "node:test"
import { ViewerBundleGuard } from "../../src/viewerBundleGuard.js"

// Repo-local temp dir (project convention: .tmp/, never /tmp).
const repoTmpDir = fileURLToPath(new URL("../../../.tmp", import.meta.url))
fs.mkdirSync(repoTmpDir, { recursive: true })
const tmpRoot = fs.mkdtempSync(path.join(repoTmpDir, "viewer-bundle-guard-"))
after(() => fs.rmSync(tmpRoot, { recursive: true, force: true }))

const BUNDLE_MTIME = new Date("2026-01-02T00:00:00Z")
const OLDER_THAN_BUNDLE = new Date("2026-01-01T00:00:00Z")
const NEWER_THAN_BUNDLE = new Date("2026-01-03T00:00:00Z")

interface Fixture {
  bundlePath: string
  viewerSrcDir: string
}

/** GIVEN helper: a dist bundle + viewer source files with controlled mtimes. */
function givenBundleAndSources(name: string, sourceMtimes: Record<string, Date>, opts?: { bundleExists?: boolean }): Fixture {
  const dir = path.join(tmpRoot, name)
  const viewerSrcDir = path.join(dir, "viewer")
  fs.mkdirSync(viewerSrcDir, { recursive: true })
  const bundlePath = path.join(dir, "dist", "canvas-viewer.js")
  if (opts?.bundleExists !== false) {
    fs.mkdirSync(path.dirname(bundlePath), { recursive: true })
    fs.writeFileSync(bundlePath, "// bundle")
    fs.utimesSync(bundlePath, BUNDLE_MTIME, BUNDLE_MTIME)
  }
  for (const [fileName, mtime] of Object.entries(sourceMtimes)) {
    const filePath = path.join(viewerSrcDir, fileName)
    fs.writeFileSync(filePath, "// source")
    fs.utimesSync(filePath, mtime, mtime)
  }
  return { bundlePath, viewerSrcDir }
}

describe("ViewerBundleGuard.assertFresh", () => {
  test("GIVEN bundle newer than every viewer source WHEN asserting THEN it passes", () => {
    const fixture = givenBundleAndSources("fresh", {
      "flowNodes.jsx": OLDER_THAN_BUNDLE,
      "viewer.css": OLDER_THAN_BUNDLE,
    })
    assert.doesNotThrow(() => ViewerBundleGuard.assertFresh(fixture))
  })

  test("GIVEN a viewer source newer than the bundle WHEN asserting THEN it throws a stale error naming the source", () => {
    const fixture = givenBundleAndSources("stale", {
      "flowNodes.jsx": NEWER_THAN_BUNDLE,
      "viewer.css": OLDER_THAN_BUNDLE,
    })
    assert.throws(() => ViewerBundleGuard.assertFresh(fixture), /stale.*flowNodes\.jsx/s)
  })

  test("GIVEN a stale bundle WHEN asserting THEN the error tells how to rebuild", () => {
    const fixture = givenBundleAndSources("stale-fix-hint", { "flowNodes.jsx": NEWER_THAN_BUNDLE })
    assert.throws(() => ViewerBundleGuard.assertFresh(fixture), /npm run bundle:viewer/)
  })

  test("GIVEN a missing bundle WHEN asserting THEN it throws a missing error with the rebuild command", () => {
    const fixture = givenBundleAndSources("missing", { "flowNodes.jsx": OLDER_THAN_BUNDLE }, { bundleExists: false })
    assert.throws(() => ViewerBundleGuard.assertFresh(fixture), /missing.*npm run bundle:viewer/s)
  })

  test("GIVEN no viewer source dir (installed plugin without sources) WHEN asserting THEN only bundle existence is required", () => {
    const fixture = givenBundleAndSources("no-sources", {})
    const withoutSources = { bundlePath: fixture.bundlePath, viewerSrcDir: path.join(tmpRoot, "does-not-exist") }
    assert.doesNotThrow(() => ViewerBundleGuard.assertFresh(withoutSources))
  })
})
