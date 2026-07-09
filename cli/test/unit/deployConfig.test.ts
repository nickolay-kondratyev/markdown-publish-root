import assert from "node:assert/strict"
import { describe, test } from "node:test"
import {
  DeployConfigError,
  DeployConfigParser,
  type DeployConfig,
} from "../../src/deploy/deployConfig.ts"

const MINIMAL_VALID = { bucket: "my-bucket", region: "us-east-1" }

describe("DeployConfigParser", () => {
  test("GIVEN a minimal valid config THEN defaults are applied", () => {
    const config: DeployConfig = DeployConfigParser.parse(MINIMAL_VALID)
    assert.deepEqual(config, {
      bucket: "my-bucket",
      region: "us-east-1",
      prefix: "",
      distributionId: undefined,
      profile: undefined,
      deleteStale: false,
    })
  })

  test("GIVEN a full config THEN every field is carried over", () => {
    const config = DeployConfigParser.parse({
      ...MINIMAL_VALID,
      prefix: "sites/nickolay",
      distributionId: "E123ABC",
      profile: "personal",
      deleteStale: true,
    })
    assert.deepEqual(config, {
      bucket: "my-bucket",
      region: "us-east-1",
      prefix: "sites/nickolay",
      distributionId: "E123ABC",
      profile: "personal",
      deleteStale: true,
    })
  })

  test("GIVEN a missing bucket THEN it is rejected", () => {
    assert.throws(
      () => DeployConfigParser.parse({ region: "us-east-1" }),
      (error: Error) => error instanceof DeployConfigError && /bucket: required/.test(error.message),
    )
  })

  test("GIVEN an s3:// URL as bucket THEN it is rejected with a clear message", () => {
    assert.throws(
      () => DeployConfigParser.parse({ ...MINIMAL_VALID, bucket: "s3://my-bucket" }),
      /bare bucket name/,
    )
  })

  test("GIVEN an unknown key THEN it is rejected (typo protection)", () => {
    assert.throws(
      () => DeployConfigParser.parse({ ...MINIMAL_VALID, buckett: "oops" }),
      /buckett: unknown key/,
    )
  })

  test("GIVEN multiple problems THEN all are reported at once", () => {
    try {
      DeployConfigParser.parse({ prefix: "/bad/", deleteStale: "yes" })
      assert.fail("expected DeployConfigError")
    } catch (error) {
      const message = (error as Error).message
      assert.deepEqual(
        {
          bucket: /bucket: required/.test(message),
          region: /region: required/.test(message),
          prefix: /prefix: no leading\/trailing slash/.test(message),
          deleteStale: /deleteStale: expected true or false/.test(message),
        },
        { bucket: true, region: true, prefix: true, deleteStale: true },
      )
    }
  })

  test("GIVEN a non-object root THEN it is rejected", () => {
    assert.throws(() => DeployConfigParser.parse([1, 2]), /expected a JSON object/)
  })
})
