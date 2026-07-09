import assert from "node:assert/strict"
import { describe, test } from "node:test"
import type { DeployConfig } from "../../src/deploy/deployConfig.ts"
import {
  DeployPlanner,
  LONG_LIVED_ASSET_CACHE_CONTROL,
  MUTABLE_DOCUMENT_CACHE_CONTROL,
  SITE_CODE_CACHE_CONTROL,
  formatCommandLine,
  type AwsCliCommand,
} from "../../src/deploy/deployPlanner.ts"

const SITE_DIR = "/tmp/site"

function config(overrides: Partial<DeployConfig> = {}): DeployConfig {
  return {
    bucket: "my-bucket",
    region: "eu-central-1",
    prefix: "",
    distributionId: undefined,
    profile: undefined,
    deleteStale: false,
    ...overrides,
  }
}

/** The --cache-control value of a sync command. */
function cacheControlOf(command: AwsCliCommand): string {
  const index = command.args.indexOf("--cache-control")
  assert.notEqual(index, -1, `no --cache-control in: ${command.args.join(" ")}`)
  return command.args[index + 1] as string
}

describe("DeployPlanner", () => {
  test("GIVEN no distributionId THEN the plan is exactly three sync passes", () => {
    const plan = DeployPlanner.plan(SITE_DIR, config())
    assert.deepEqual(
      plan.commands.map((c) => c.args.slice(0, 2)),
      [
        ["s3", "sync"],
        ["s3", "sync"],
        ["s3", "sync"],
      ],
    )
  })

  test("THEN each sync pass carries its class's Cache-Control (long assets, site code, mutable docs)", () => {
    const plan = DeployPlanner.plan(SITE_DIR, config())
    assert.deepEqual(plan.commands.map(cacheControlOf), [
      LONG_LIVED_ASSET_CACHE_CONTROL,
      SITE_CODE_CACHE_CONTROL,
      MUTABLE_DOCUMENT_CACHE_CONTROL,
    ])
  })

  test("THEN the long-asset pass EXCLUDES what the other passes own (every file matches exactly one pass)", () => {
    const longAssets = DeployPlanner.plan(SITE_DIR, config()).commands[0] as AwsCliCommand
    const excluded = longAssets.args
      .map((arg, i) => (arg === "--exclude" ? longAssets.args[i + 1] : undefined))
      .filter((v) => v !== undefined)
    assert.deepEqual(excluded.sort(), [
      "*.css",
      "*.htm",
      "*.html",
      "*.js",
      "*.json",
      "*.mjs",
      "*.txt",
      "*.xml",
    ])
  })

  test("THEN the mutable-documents pass only INCLUDES its extensions", () => {
    const docs = DeployPlanner.plan(SITE_DIR, config()).commands[2] as AwsCliCommand
    const excludeAll = docs.args.indexOf("--exclude")
    assert.equal(docs.args[excludeAll + 1], "*")
    const included = docs.args
      .map((arg, i) => (arg === "--include" ? docs.args[i + 1] : undefined))
      .filter((v) => v !== undefined)
    assert.deepEqual(included.sort(), ["*.htm", "*.html", "*.json", "*.txt", "*.xml"])
  })

  test("GIVEN a prefix THEN the s3 target URL includes it", () => {
    const plan = DeployPlanner.plan(SITE_DIR, config({ prefix: "sites/me" }))
    assert.equal(plan.s3TargetUrl, "s3://my-bucket/sites/me")
  })

  test("GIVEN no prefix THEN the s3 target URL is the bare bucket", () => {
    assert.equal(DeployPlanner.plan(SITE_DIR, config()).s3TargetUrl, "s3://my-bucket")
  })

  test("THEN every sync pass targets siteDir -> s3 URL with the configured region", () => {
    const plan = DeployPlanner.plan(SITE_DIR, config({ prefix: "p" }))
    for (const command of plan.commands) {
      assert.deepEqual(command.args.slice(2, 6), [SITE_DIR, "s3://my-bucket/p", "--region", "eu-central-1"])
    }
  })

  test("GIVEN deleteStale false THEN no sync pass carries --delete (destructive is opt-in)", () => {
    const plan = DeployPlanner.plan(SITE_DIR, config())
    assert.deepEqual(plan.commands.filter((c) => c.args.includes("--delete")), [])
  })

  test("GIVEN deleteStale true THEN every sync pass carries --delete", () => {
    const plan = DeployPlanner.plan(SITE_DIR, config({ deleteStale: true }))
    assert.deepEqual(plan.commands.map((c) => c.args.includes("--delete")), [true, true, true])
  })

  test("GIVEN a distributionId THEN a CloudFront invalidation of /* is the LAST command", () => {
    const plan = DeployPlanner.plan(SITE_DIR, config({ distributionId: "E123ABC" }))
    const last = plan.commands[plan.commands.length - 1] as AwsCliCommand
    assert.deepEqual(last.args, [
      "cloudfront",
      "create-invalidation",
      "--distribution-id",
      "E123ABC",
      "--paths",
      "/*",
    ])
  })

  test("GIVEN a profile THEN every command carries --profile", () => {
    const plan = DeployPlanner.plan(SITE_DIR, config({ profile: "personal", distributionId: "E1" }))
    assert.deepEqual(
      plan.commands.map((c) => c.args.slice(-2)),
      plan.commands.map(() => ["--profile", "personal"]),
    )
  })

  test("THEN planning is PURE: no fs/network side effects for a nonexistent dir", () => {
    // If plan() ever touches the filesystem this throws or misbehaves.
    const plan = DeployPlanner.plan("/definitely/does/not/exist", config())
    assert.equal(plan.commands.length, 3)
  })
})

describe("formatCommandLine", () => {
  test("GIVEN args with spaces THEN they are quoted for display", () => {
    const line = formatCommandLine({
      description: "x",
      args: ["s3", "sync", "--cache-control", "public, max-age=300"],
    })
    assert.equal(line, `aws s3 sync --cache-control 'public, max-age=300'`)
  })
})
