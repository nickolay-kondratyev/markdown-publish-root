import fs from "node:fs"
import path from "node:path"
import { isCanvasPath, isMarkdownPath } from "../publishFilter.ts"
import { listFilesRecursively } from "./outputWalk.ts"

/**
 * Minimum length of a normalized content line to qualify as a leak
 * fingerprint. WHY: short lines ("# Notes", "---", "publish: false", list
 * bullets, ...) legitimately recur in published content and would
 * false-positive; distinctive private prose is comfortably longer.
 */
export const MIN_FINGERPRINT_LENGTH = 20

/**
 * Emitted file extensions that carry text and are scanned for leaks
 * (HTML pages, canvas payload/fragment output, search/content indexes,
 * scripts, sitemaps/feeds).
 */
export const SCANNED_OUTPUT_EXTENSIONS: ReadonlySet<string> = new Set([
  ".html",
  ".htm",
  ".xml",
  ".json",
  ".js",
  ".mjs",
  ".css",
  ".txt",
])

/** One private-content leak: where it came from and where it surfaced. */
export interface LeakFinding {
  /** Vault-relative path of the unpublished file whose content leaked. */
  privateVaultPath: string
  /** Site-relative path of the emitted file containing the content. */
  emittedSitePath: string
  /** The matched fingerprint (a normalized content line of the private file). */
  fingerprint: string
}

/** Input to the leak check. */
export interface LeakCheckInput {
  /** The vault the site was built from (read-only). */
  vaultDir: string
  /** The emitted static site directory. */
  outDir: string
  /** Vault-relative paths the publish filter excluded (StagingResult.excludedFiles). */
  excludedFiles: string[]
}

/**
 * The §4.4 backstop: verifies that content from files the publish filter
 * excluded appears NOWHERE in the emitted text output. The build FAILS on any
 * finding (SiteBuilder throws PrivateContentLeakError).
 *
 * Method: for every excluded text file (.md/.canvas) derive fingerprints —
 * whitespace-normalized content lines of at least MIN_FINGERPRINT_LENGTH —
 * then substring-scan every emitted text file (normalized the same way).
 *
 * Known limitation (documented in engine/README.md): this catches VERBATIM
 * content (quoted lines, embedded payload text, index entries). Lines whose
 * text is transformed by markdown rendering (e.g. inline markup split by HTML
 * tags) may not match. That is acceptable for a backstop — the primary
 * privacy enforcement is staging exclusion (private files are never readable
 * by the build at all); this pass exists to catch mechanism regressions.
 */
export class LeakChecker {
  check(input: LeakCheckInput): LeakFinding[] {
    const fingerprintsByFile = this.collectFingerprints(input.vaultDir, input.excludedFiles)
    if (fingerprintsByFile.size === 0) return []

    const findings: LeakFinding[] = []
    for (const emittedSitePath of listFilesRecursively(input.outDir)) {
      if (!SCANNED_OUTPUT_EXTENSIONS.has(path.extname(emittedSitePath).toLowerCase())) continue
      const emittedText = normalizeWhitespace(
        fs.readFileSync(path.join(input.outDir, emittedSitePath), "utf-8"),
      )
      for (const [privateVaultPath, fingerprints] of fingerprintsByFile) {
        for (const fingerprint of fingerprints) {
          if (emittedText.includes(fingerprint)) {
            // One finding per (private file, emitted file) pair is enough to
            // fail the build and point at both files.
            findings.push({ privateVaultPath, emittedSitePath, fingerprint })
            break
          }
        }
      }
    }
    return findings
  }

  /** Fingerprints for every excluded TEXT file (md/canvas); assets are binary — skipped. */
  private collectFingerprints(vaultDir: string, excludedFiles: string[]): Map<string, string[]> {
    const byFile = new Map<string, string[]>()
    for (const relPath of excludedFiles) {
      if (!isMarkdownPath(relPath) && !isCanvasPath(relPath)) continue
      const absolute = path.join(vaultDir, relPath)
      if (!fs.existsSync(absolute)) continue
      const content = fs.readFileSync(absolute, "utf-8")
      const lines = isCanvasPath(relPath) ? authoredCanvasLines(content) : content.split("\n")
      const fingerprints = deriveFingerprints(lines)
      if (fingerprints.length > 0) byFile.set(relPath, fingerprints)
    }
    return byFile
  }
}

/** Normalized, deduplicated lines long enough to be distinctive. */
function deriveFingerprints(lines: string[]): string[] {
  const fingerprints = new Set<string>()
  for (const line of lines) {
    const normalized = normalizeWhitespace(line).trim()
    if (normalized.length >= MIN_FINGERPRINT_LENGTH) fingerprints.add(normalized)
  }
  return [...fingerprints]
}

/**
 * The AUTHORED strings of a canvas (text-card markdown, edge labels) — the
 * content that could leak. Raw JSON syntax lines would fingerprint structural
 * noise instead. Malformed canvas JSON falls back to raw lines (fail safe:
 * still fingerprinted, never silently skipped).
 */
function authoredCanvasLines(canvasJson: string): string[] {
  let parsed: { nodes?: { text?: unknown }[]; edges?: { label?: unknown }[] }
  try {
    parsed = JSON.parse(canvasJson)
  } catch {
    return canvasJson.split("\n")
  }
  const lines: string[] = []
  for (const node of parsed.nodes ?? []) {
    if (typeof node.text === "string") lines.push(...node.text.split("\n"))
  }
  for (const edge of parsed.edges ?? []) {
    if (typeof edge.label === "string") lines.push(...edge.label.split("\n"))
  }
  return lines
}

/**
 * Collapse all whitespace runs to single spaces so line wrapping / indentation
 * differences between vault source and emitted output never mask a leak.
 */
function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ")
}
