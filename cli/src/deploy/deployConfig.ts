import fs from "node:fs"

/**
 * Deploy settings ("deploy.json") — a SEPARATE schema from site.json on
 * purpose: hosting/AWS concerns live entirely OUTSIDE the engine (sacred
 * boundary, plan/main.md §3). The engine never sees this object.
 *
 * Schema (all validation errors reference these paths):
 *   bucket          string, required. S3 bucket name (no "s3://", no "/").
 *   region          string, required. AWS region of the bucket, e.g. "us-east-1".
 *   prefix          string, optional (default ""). Key prefix inside the bucket,
 *                   "/"-separated, no leading/trailing slash (per-site prefixes
 *                   are the MVP multi-site story, plan §1).
 *   distributionId  string, optional. CloudFront distribution to invalidate
 *                   after upload. Omitted => no invalidation (a warning is printed).
 *   profile         string, optional. AWS CLI named profile for credentials.
 *   deleteStale     boolean, optional (default false). Pass --delete to
 *                   `aws s3 sync` so files removed from the site are removed
 *                   from the bucket. Opt-in because it is destructive.
 */
export interface DeployConfig {
  bucket: string
  region: string
  prefix: string
  distributionId?: string
  profile?: string
  deleteStale: boolean
}

/** Thrown when deploy.json does not match the schema. Message lists every problem found. */
export class DeployConfigError extends Error {
  constructor(problems: string[]) {
    super(`Invalid deploy config:\n  - ${problems.join("\n  - ")}`)
    this.name = "DeployConfigError"
  }
}

/**
 * Boundary validator for deploy.json — same strictness contract as the
 * engine's SiteConfigParser: unknown keys rejected, ALL problems listed.
 */
export class DeployConfigParser {
  /** Parse and validate a deploy.json file from disk. */
  static parseFile(filePath: string): DeployConfig {
    if (!fs.existsSync(filePath)) {
      throw new DeployConfigError([`config file not found: ${filePath}`])
    }
    let raw: unknown
    try {
      raw = JSON.parse(fs.readFileSync(filePath, "utf-8"))
    } catch (error) {
      throw new DeployConfigError([
        `config file is not valid JSON (${filePath}): ${(error as Error).message}`,
      ])
    }
    return DeployConfigParser.parse(raw)
  }

  /** Validate an already-parsed JSON value. */
  static parse(raw: unknown): DeployConfig {
    const problems: string[] = []
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      throw new DeployConfigError(["(root): expected a JSON object"])
    }
    const obj = raw as Record<string, unknown>

    const allowed = ["bucket", "region", "prefix", "distributionId", "profile", "deleteStale"]
    for (const key of Object.keys(obj)) {
      if (!allowed.includes(key)) {
        problems.push(`${key}: unknown key (allowed: ${allowed.join(", ")})`)
      }
    }

    const bucket = requireString(obj, "bucket", problems)
    if (bucket !== undefined && (bucket.includes("/") || bucket.startsWith("s3:"))) {
      problems.push(`bucket: expected a bare bucket name, not a path or URL (got "${bucket}")`)
    }
    const region = requireString(obj, "region", problems)
    const prefix = optionalString(obj, "prefix", problems) ?? ""
    if (prefix.startsWith("/") || prefix.endsWith("/")) {
      problems.push(`prefix: no leading/trailing slash (got "${prefix}")`)
    }
    const distributionId = optionalString(obj, "distributionId", problems)
    const profile = optionalString(obj, "profile", problems)
    const deleteStale = optionalBoolean(obj, "deleteStale", problems) ?? false

    if (problems.length > 0) throw new DeployConfigError(problems)
    return {
      bucket: bucket as string,
      region: region as string,
      prefix,
      distributionId,
      profile,
      deleteStale,
    }
  }
}

function requireString(
  obj: Record<string, unknown>,
  key: string,
  problems: string[],
): string | undefined {
  const value = obj[key]
  if (typeof value !== "string" || value === "") {
    problems.push(`${key}: required non-empty string`)
    return undefined
  }
  return value
}

function optionalString(
  obj: Record<string, unknown>,
  key: string,
  problems: string[],
): string | undefined {
  const value = obj[key]
  if (value === undefined) return undefined
  if (typeof value !== "string" || value === "") {
    problems.push(`${key}: expected a non-empty string`)
    return undefined
  }
  return value
}

function optionalBoolean(
  obj: Record<string, unknown>,
  key: string,
  problems: string[],
): boolean | undefined {
  const value = obj[key]
  if (value === undefined) return undefined
  if (typeof value !== "boolean") {
    problems.push(`${key}: expected true or false`)
    return undefined
  }
  return value
}
