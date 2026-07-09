import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, test } from "node:test"
import { DeployCommand } from "../../src/deploy/deployCommand.ts"

const USAGE = "usage-text"

describe("DeployCommand (dry-run — no aws CLI, no side effects)", () => {
  let workDir: string
  let siteDir: string
  let configPath: string
  let logged: string[]
  const originalLog = console.log
  const originalWarn = console.warn
  const originalError = console.error

  // GIVEN a fake built site + a valid deploy.json; console captured
  beforeEach(() => {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), "deploy-cmd-test-"))
    siteDir = path.join(workDir, "site")
    fs.mkdirSync(siteDir, { recursive: true })
    fs.writeFileSync(path.join(siteDir, "index.html"), "<html></html>")
    configPath = path.join(workDir, "deploy.json")
    fs.writeFileSync(
      configPath,
      JSON.stringify({ bucket: "b", region: "us-east-1", distributionId: "E1" }),
    )
    logged = []
    console.log = console.warn = console.error = (message?: unknown) => {
      logged.push(String(message))
    }
  })

  afterEach(() => {
    console.log = originalLog
    console.warn = originalWarn
    console.error = originalError
    fs.rmSync(workDir, { recursive: true, force: true })
  })

  test("GIVEN --dry-run THEN it exits 0 and prints the sync + invalidation plan without executing", () => {
    const code = DeployCommand.run([siteDir, "--deploy-config", configPath, "--dry-run"], USAGE)
    const output = logged.join("\n")
    assert.deepEqual(
      {
        code,
        printsSync: output.includes("aws s3 sync"),
        printsInvalidation: output.includes("cloudfront create-invalidation"),
        saysNothingExecuted: output.includes("nothing was executed"),
      },
      { code: 0, printsSync: true, printsInvalidation: true, saysNothingExecuted: true },
    )
  })

  test("GIVEN a site dir without index.html THEN it fails with an actionable message", () => {
    fs.rmSync(path.join(siteDir, "index.html"))
    const code = DeployCommand.run([siteDir, "--deploy-config", configPath, "--dry-run"], USAGE)
    assert.deepEqual(
      { code, mentionsBuild: logged.join("\n").includes("publish build") },
      { code: 1, mentionsBuild: true },
    )
  })

  test("GIVEN an invalid deploy config THEN it fails listing the problems", () => {
    fs.writeFileSync(configPath, JSON.stringify({ region: "us-east-1" }))
    const code = DeployCommand.run([siteDir, "--deploy-config", configPath, "--dry-run"], USAGE)
    assert.deepEqual(
      { code, mentionsBucket: logged.join("\n").includes("bucket: required") },
      { code: 1, mentionsBucket: true },
    )
  })

  test("GIVEN missing --deploy-config THEN it is a usage error (exit 2)", () => {
    const code = DeployCommand.run([siteDir, "--dry-run"], USAGE)
    assert.equal(code, 2)
  })

  test("GIVEN an unknown option THEN it is a usage error (exit 2)", () => {
    const code = DeployCommand.run([siteDir, "--deploy-config", configPath, "--frobnicate"], USAGE)
    assert.equal(code, 2)
  })

  test("GIVEN no distributionId THEN a skip-invalidation warning is printed (still exit 0)", () => {
    fs.writeFileSync(configPath, JSON.stringify({ bucket: "b", region: "us-east-1" }))
    const code = DeployCommand.run([siteDir, "--deploy-config", configPath, "--dry-run"], USAGE)
    assert.deepEqual(
      { code, warns: logged.join("\n").includes("skipping CloudFront invalidation") },
      { code: 0, warns: true },
    )
  })
})
