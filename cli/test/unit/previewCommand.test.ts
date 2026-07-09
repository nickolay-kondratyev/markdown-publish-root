import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, test } from "node:test"
import { PreviewCommand } from "../../src/preview/previewCommand.ts"

const USAGE = "usage-text"

describe("PreviewCommand argument handling (server never started)", () => {
  let workDir: string
  let siteDir: string
  let logged: string[]
  const originalLog = console.log
  const originalError = console.error

  beforeEach(() => {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), "preview-cmd-test-"))
    siteDir = path.join(workDir, "site")
    fs.mkdirSync(siteDir, { recursive: true })
    fs.writeFileSync(path.join(siteDir, "index.html"), "<html></html>")
    logged = []
    console.log = console.error = (message?: unknown) => {
      logged.push(String(message))
    }
  })

  afterEach(() => {
    console.log = originalLog
    console.error = originalError
    fs.rmSync(workDir, { recursive: true, force: true })
  })

  test("GIVEN no <site-dir> THEN it is a usage error (exit 2)", async () => {
    assert.equal(await PreviewCommand.run([], USAGE), 2)
  })

  test("GIVEN an unknown option THEN it is a usage error (exit 2)", async () => {
    assert.equal(await PreviewCommand.run([siteDir, "--frobnicate"], USAGE), 2)
  })

  test("GIVEN a non-numeric --port THEN it is a usage error (exit 2)", async () => {
    assert.equal(await PreviewCommand.run([siteDir, "--port", "banana"], USAGE), 2)
  })

  test("GIVEN an out-of-range --port THEN it is a usage error (exit 2)", async () => {
    assert.equal(await PreviewCommand.run([siteDir, "--port", "70000"], USAGE), 2)
  })

  test("GIVEN a site dir without index.html THEN it fails with an actionable message (exit 1)", async () => {
    fs.rmSync(path.join(siteDir, "index.html"))
    const code = await PreviewCommand.run([siteDir], USAGE)
    assert.deepEqual(
      { code, mentionsBuild: logged.join("\n").includes("publish build") },
      { code: 1, mentionsBuild: true },
    )
  })

  test("GIVEN a valid site dir THEN it serves until SIGINT and exits 0 printing the URL", async () => {
    // Port 0: the OS picks a free port — the test must not depend on 8080 being free.
    const runPromise = PreviewCommand.run([siteDir, "--port", "0"], USAGE)
    // Wait for startup (URL printed), then deliver SIGINT as a user would.
    while (!logged.some((line) => line.includes("previewing"))) {
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    process.emit("SIGINT")
    const code = await runPromise
    assert.deepEqual(
      { code, printsUrl: logged.join("\n").includes("http://127.0.0.1:") },
      { code: 0, printsUrl: true },
    )
  })
})
