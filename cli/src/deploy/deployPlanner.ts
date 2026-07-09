import type { DeployConfig } from "./deployConfig.ts"

/**
 * Cache-header classes (documented as a table in cli/README.md).
 *
 * WHY three classes and not the classic "hashed=immutable / html=short" pair:
 * Quartz does NOT content-hash its assets — JS/CSS live at stable URLs
 * (index.css, postscript.js, static/canvas-viewer.js), so marking them
 * `immutable` would strand browsers on year-old site code after an engine or
 * viewer update. Media/binary assets (vault attachments) change rarely and get
 * the long/immutable treatment; when one IS replaced in place, the CloudFront
 * invalidation refreshes the edge and stale BROWSER caches are an accepted
 * MVP tradeoff.
 */
/** Mutable documents: re-published in place under stable URLs on every build. */
export const MUTABLE_DOCUMENT_EXTENSIONS = ["html", "htm", "json", "xml", "txt"] as const
/** Site code: not content-hashed by Quartz (see WHY above). */
export const SITE_CODE_EXTENSIONS = ["js", "mjs", "css"] as const

/** 5 minutes: edits become visible quickly; still absorbs request bursts. */
export const MUTABLE_DOCUMENT_CACHE_CONTROL = "public, max-age=300, must-revalidate"
/** 1 hour: bounds how long browsers may run stale (non-hashed) site code. */
export const SITE_CODE_CACHE_CONTROL = "public, max-age=3600"
/** 1 year + immutable: media/binary assets (everything not matched above). */
export const LONG_LIVED_ASSET_CACHE_CONTROL = "public, max-age=31536000, immutable"

/**
 * Invalidate everything with a single wildcard path: one invalidation path is
 * billed per request regardless of how many objects it covers, and the MVP has
 * no manifest diffing to compute a narrower set.
 */
export const INVALIDATION_PATH = "/*"

/** One `aws <args...>` invocation of the deploy plan. */
export interface AwsCliCommand {
  /** Human-readable purpose, printed before execution / in dry runs. */
  description: string
  /** argv AFTER the `aws` program name. */
  args: string[]
}

/** The full, ordered command plan for one deploy. */
export interface DeployPlan {
  /** `s3://bucket[/prefix]` — where the site is uploaded. */
  s3TargetUrl: string
  commands: AwsCliCommand[]
}

/**
 * Computes the deploy plan: three `aws s3 sync` passes (one per cache class,
 * filters constructed so every file matches EXACTLY one pass) plus an optional
 * CloudFront invalidation. PURE — no filesystem or network access — so the
 * plan is unit-testable and `--dry-run` is trivially side-effect free.
 * Execution lives in DeployExecutor.
 */
export class DeployPlanner {
  static plan(siteDir: string, config: DeployConfig): DeployPlan {
    const s3TargetUrl = `s3://${config.bucket}${config.prefix === "" ? "" : `/${config.prefix}`}`

    const commands: AwsCliCommand[] = [
      {
        description: `sync long-lived assets (media/fonts/binary) — Cache-Control: ${LONG_LIVED_ASSET_CACHE_CONTROL}`,
        args: syncArgs(siteDir, s3TargetUrl, config, LONG_LIVED_ASSET_CACHE_CONTROL, [
          // Catch-all pass: everything NOT owned by the other two classes.
          ...excludeExtensions([...MUTABLE_DOCUMENT_EXTENSIONS, ...SITE_CODE_EXTENSIONS]),
        ]),
      },
      {
        description: `sync site code (js/css) — Cache-Control: ${SITE_CODE_CACHE_CONTROL}`,
        args: syncArgs(siteDir, s3TargetUrl, config, SITE_CODE_CACHE_CONTROL, [
          ...onlyExtensions([...SITE_CODE_EXTENSIONS]),
        ]),
      },
      {
        description: `sync mutable documents (html/json/xml/txt) — Cache-Control: ${MUTABLE_DOCUMENT_CACHE_CONTROL}`,
        args: syncArgs(siteDir, s3TargetUrl, config, MUTABLE_DOCUMENT_CACHE_CONTROL, [
          ...onlyExtensions([...MUTABLE_DOCUMENT_EXTENSIONS]),
        ]),
      },
    ]

    if (config.distributionId !== undefined) {
      commands.push({
        description: `invalidate CloudFront distribution ${config.distributionId} (${INVALIDATION_PATH})`,
        args: withProfile(
          [
            "cloudfront",
            "create-invalidation",
            "--distribution-id",
            config.distributionId,
            "--paths",
            INVALIDATION_PATH,
          ],
          config,
        ),
      })
    }

    return { s3TargetUrl, commands }
  }
}

/** Renders one plan entry as a copy-pasteable shell line (dry runs / logs). */
export function formatCommandLine(command: AwsCliCommand): string {
  return ["aws", ...command.args.map(shellQuote)].join(" ")
}

// --- internals -----------------------------------------------------------------

function syncArgs(
  siteDir: string,
  s3TargetUrl: string,
  config: DeployConfig,
  cacheControl: string,
  filters: string[],
): string[] {
  const args = ["s3", "sync", siteDir, s3TargetUrl, "--region", config.region]
  args.push(...filters)
  args.push("--cache-control", cacheControl)
  if (config.deleteStale) {
    // `aws s3 sync --delete` honors the pass's --exclude/--include filters on
    // the destination too, so each pass only deletes stale files of ITS class.
    args.push("--delete")
  }
  args.push("--no-progress")
  return withProfile(args, config)
}

/** Filters for "every file EXCEPT these extensions" (sync default is include-all). */
function excludeExtensions(extensions: string[]): string[] {
  return extensions.flatMap((ext) => ["--exclude", `*.${ext}`])
}

/** Filters for "ONLY these extensions": exclude everything, then re-include. */
function onlyExtensions(extensions: string[]): string[] {
  return ["--exclude", "*", ...extensions.flatMap((ext) => ["--include", `*.${ext}`])]
}

function withProfile(args: string[], config: DeployConfig): string[] {
  return config.profile === undefined ? args : [...args, "--profile", config.profile]
}

/** Minimal POSIX quoting for display only (execution passes args as an array — never through a shell). */
function shellQuote(arg: string): string {
  return /^[A-Za-z0-9_@%+=:,./*-]+$/.test(arg) ? arg : `'${arg.replaceAll("'", `'\\''`)}'`
}
