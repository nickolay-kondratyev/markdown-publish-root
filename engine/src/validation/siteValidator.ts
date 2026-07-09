import { LeakChecker, type LeakFinding } from "./leakChecker.ts"
import {
  LinkChecker,
  formatBrokenLinkReport,
  type BrokenLinkReport,
} from "./linkChecker.ts"

/** Input to the validation pass. */
export interface ValidationInput {
  /** The vault the site was built from (read-only). */
  vaultDir: string
  /** The emitted static site directory. */
  outDir: string
  /** Vault-relative paths the publish filter excluded (StagingResult.excludedFiles). */
  excludedFiles: string[]
}

/** Outcome of the validation pass (returned in BuildSiteResult.validation). */
export interface ValidationResult {
  /** Private-content leaks. NON-EMPTY MEANS THE BUILD MUST FAIL (plan §4.4). */
  leaks: LeakFinding[]
  /** Broken internal links — reported; fails the build only under strictLinks. */
  brokenLinks: BrokenLinkReport
}

/**
 * The final build stage (plan §5/§6 Phase 3): privacy leak check (fails the
 * build) + broken-internal-link report. Pure inspection of (vault, output);
 * FAILURE POLICY lives in the caller (SiteBuilder) — this module only reports.
 */
export class SiteValidator {
  private readonly leakChecker = new LeakChecker()
  private readonly linkChecker = new LinkChecker()

  validate(input: ValidationInput): ValidationResult {
    return {
      leaks: this.leakChecker.check(input),
      brokenLinks: this.linkChecker.check(input.outDir),
    }
  }
}

/** How much of a matched fingerprint to quote in error messages (context without dumping private content). */
const FINGERPRINT_PREVIEW_LENGTH = 60

/** Build-failing error: content from an unpublished file surfaced in the output. */
export class PrivateContentLeakError extends Error {
  readonly leaks: LeakFinding[]

  constructor(leaks: LeakFinding[]) {
    const details = leaks.map(
      (leak) =>
        `  - content from unpublished "${leak.privateVaultPath}" found in emitted "${leak.emittedSitePath}"` +
        ` (matched line starts: "${preview(leak.fingerprint)}")`,
    )
    super(
      `Private-content leak detected — build FAILED (plan §4.4 backstop):\n${details.join("\n")}\n` +
        `The publish filter excluded these files, yet their content reached the output. ` +
        `This indicates a bug in the staging/rewriting pipeline (or published content quoting a private note verbatim).`,
    )
    this.name = "PrivateContentLeakError"
    this.leaks = leaks
  }
}

/** Build-failing error under strictLinks: internal links point at missing targets. */
export class BrokenInternalLinksError extends Error {
  readonly report: BrokenLinkReport

  constructor(report: BrokenLinkReport) {
    super(`strict-links: build FAILED.\n${formatBrokenLinkReport(report)}`)
    this.name = "BrokenInternalLinksError"
    this.report = report
  }
}

function preview(fingerprint: string): string {
  return fingerprint.length <= FINGERPRINT_PREVIEW_LENGTH
    ? fingerprint
    : `${fingerprint.slice(0, FINGERPRINT_PREVIEW_LENGTH)}...`
}
