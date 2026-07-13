#!/usr/bin/env node
/**
 * Stamps a stable docid into every `.md` and `.canvas` file of a vault
 * (plan/id-based-publishing.md §5). Idempotent:
 *   - valid existing id  -> skip (file untouched)
 *   - malformed id       -> error, NEVER overwrite
 *   - missing id         -> stamp a fresh crypto-random docid
 *
 * Placement: md frontmatter `id:`; canvas top-level `metadata.frontmatter.id`
 * (Obsidian preserves top-level canvas `metadata` across re-saves — Spike S1).
 *
 * Error atomicity: ALL files are analyzed first; any error means NOTHING is
 * written, and every offending file is listed.
 *
 * Usage: node scripts/add-doc-ids.mjs <vaultDir> [--dry-run]
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { parse as parseYaml } from "yaml"
import { DocId } from "../engine/src/docId.ts"
import { extractFrontmatterBlock } from "../engine/src/frontmatter.ts"

/**
 * @typedef {(
 *   {action: "skip"} |
 *   {action: "stamp", content: string, warning?: string} |
 *   {action: "error", reason: string}
 * )} StampOutcome
 */

/** Stamps `id:` into markdown frontmatter, byte-preserving everything else. */
export class MarkdownIdStamper {
  /**
   * @param {string} content raw markdown
   * @param {string} docId id to stamp when missing
   * @returns {StampOutcome}
   */
  static stamp(content, docId) {
    const block = extractFrontmatterBlock(content)
    const eol = detectEol(content)
    if (block === undefined) {
      return { action: "stamp", content: `---${eol}id: ${docId}${eol}---${eol}` + content }
    }
    let data
    try {
      data = parseYaml(block)
    } catch {
      return { action: "error", reason: "malformed frontmatter (unparseable YAML) — fix manually" }
    }
    const existing = data !== null && typeof data === "object" ? data.id : undefined
    if (existing !== undefined) {
      // Foreign (non-DocId-grammar) ids are publishable too — the engine derives
      // a URL segment via UrlSegment. Never overwritten; only unusable ids error.
      if (typeof existing === "string" && existing.length > 0) return { action: "skip" }
      return { action: "error", reason: `invalid id [${existing}] (must be a non-empty string) — never overwritten, fix manually` }
    }
    // Insert `id:` as the first line of the existing block (after the opening ---).
    const opener = content.match(/^---[^\S\r\n]*\r?\n/)
    if (opener === null) {
      // extractFrontmatterBlock found a block, so the opener must match.
      return { action: "error", reason: "frontmatter opener not found (inconsistent parse)" }
    }
    const insertAt = opener[0].length
    return {
      action: "stamp",
      content: content.slice(0, insertAt) + `id: ${docId}${eol}` + content.slice(insertAt),
    }
  }
}

/** Stamps `metadata.frontmatter.id` into canvas JSON. */
export class CanvasIdStamper {
  /**
   * @param {string} content raw canvas JSON
   * @param {string} docId id to stamp when missing
   * @returns {StampOutcome}
   */
  static stamp(content, docId) {
    let parsed
    try {
      parsed = JSON.parse(content)
    } catch (error) {
      return { action: "error", reason: `not valid JSON: ${/** @type {Error} */ (error).message}` }
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return { action: "error", reason: "canvas top level must be a JSON object" }
    }
    const existing = parsed.metadata?.frontmatter?.id
    if (existing !== undefined) {
      // Same acceptance as MarkdownIdStamper: foreign ids are publishable, keep them.
      if (typeof existing === "string" && existing.length > 0) return { action: "skip" }
      return { action: "error", reason: `invalid id [${existing}] (must be a non-empty string) — never overwritten, fix manually` }
    }
    if (parsed.metadata === undefined) {
      return CanvasIdStamper.spliceFreshMetadata(content, docId)
    }
    if (typeof parsed.metadata !== "object" || parsed.metadata === null) {
      return { action: "error", reason: "canvas `metadata` is not an object — fix manually" }
    }
    if (parsed.metadata.frontmatter !== undefined && typeof parsed.metadata.frontmatter !== "object") {
      return { action: "error", reason: "canvas `metadata.frontmatter` is not an object — fix manually" }
    }
    // Existing metadata: safe key-set requires re-serialization (tabs, matching
    // Obsidian's canvas indentation; Obsidian re-normalizes on next save anyway).
    parsed.metadata.frontmatter = { ...(parsed.metadata.frontmatter ?? {}), id: docId }
    const trailingNewline = content.endsWith("\n") ? "\n" : ""
    return {
      action: "stamp",
      content: JSON.stringify(parsed, null, "\t") + trailingNewline,
      warning: "existing `metadata` key — file re-serialized (formatting normalized)",
    }
  }

  /**
   * No top-level `metadata` key: textual splice right after the opening `{`,
   * byte-preserving Obsidian's compact node/edge serialization style.
   * @param {string} content
   * @param {string} docId
   * @returns {StampOutcome}
   */
  static spliceFreshMetadata(content, docId) {
    const openBrace = content.indexOf("{")
    const rest = content.slice(openBrace + 1)
    const isEmptyObject = rest.trimStart().startsWith("}")
    const insertion =
      `\n\t"metadata":{"frontmatter":{"id":"${docId}"}}` + (isEmptyObject ? "\n" : ",")
    const stamped = content.slice(0, openBrace + 1) + insertion + rest
    // Self-check: the splice MUST yield JSON carrying the id we just wrote.
    if (JSON.parse(stamped)?.metadata?.frontmatter?.id !== docId) {
      return { action: "error", reason: "internal: metadata splice produced unexpected JSON" }
    }
    return { action: "stamp", content: stamped }
  }
}

/**
 * Walks a vault and stamps ids into all `.md`/`.canvas` files (hidden
 * dot-segments like `.obsidian/` excluded, matching the publish filter).
 */
export class VaultIdStamper {
  /** @param {{generateId?: () => string}} [options] injectable for tests */
  constructor(options = {}) {
    this.generateId = options.generateId ?? (() => DocId.generate())
  }

  /**
   * @param {string} vaultDir
   * @param {{dryRun?: boolean}} [options]
   * @returns {{stamped: string[], skipped: string[], errors: {relPath: string, reason: string}[], warnings: string[]}}
   */
  run(vaultDir, options = {}) {
    /** @type {{relPath: string, absPath: string, outcome: any}[]} */
    const plans = []
    const result = { stamped: [], skipped: [], errors: [], warnings: [] }
    for (const relPath of listVaultDocFiles(vaultDir)) {
      const absPath = path.join(vaultDir, relPath)
      const content = fs.readFileSync(absPath, "utf-8")
      const stamper = relPath.endsWith(".canvas") ? CanvasIdStamper : MarkdownIdStamper
      const outcome = stamper.stamp(content, this.generateId())
      plans.push({ relPath, absPath, outcome })
      if (outcome.action === "error") result.errors.push({ relPath, reason: outcome.reason })
      else if (outcome.action === "skip") result.skipped.push(relPath)
      else {
        result.stamped.push(relPath)
        if (outcome.warning !== undefined) result.warnings.push(`${relPath}: ${outcome.warning}`)
      }
    }
    if (result.errors.length > 0) return result // error atomicity: write NOTHING
    if (options.dryRun !== true) {
      for (const plan of plans) {
        if (plan.outcome.action === "stamp") fs.writeFileSync(plan.absPath, plan.outcome.content)
      }
    }
    return result
  }
}

/** Vault-relative "/"-separated .md/.canvas paths, hidden segments excluded. */
function listVaultDocFiles(vaultDir) {
  /** @type {string[]} */
  const files = []
  const walk = (subDir) => {
    for (const entry of fs.readdirSync(subDir, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue // .obsidian/, .trash/, dotfiles
      const absolute = path.join(subDir, entry.name)
      if (entry.isDirectory()) walk(absolute)
      else if (entry.isFile() && /\.(md|canvas)$/.test(entry.name)) {
        files.push(path.relative(vaultDir, absolute).split(path.sep).join("/"))
      }
    }
  }
  walk(vaultDir)
  return files.sort()
}

function detectEol(content) {
  return content.includes("\r\n") ? "\r\n" : "\n"
}

function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes("--dry-run")
  const positional = args.filter((arg) => !arg.startsWith("--"))
  if (positional.length !== 1) {
    console.error("usage: node scripts/add-doc-ids.mjs <vaultDir> [--dry-run]")
    return 1
  }
  const vaultDir = positional[0]
  if (!fs.existsSync(vaultDir) || !fs.statSync(vaultDir).isDirectory()) {
    console.error(`add-doc-ids: vault directory not found: vaultDir=[${vaultDir}]`)
    return 1
  }
  const result = new VaultIdStamper().run(vaultDir, { dryRun })
  for (const warning of result.warnings) console.warn(`add-doc-ids: WARN ${warning}`)
  if (result.errors.length > 0) {
    console.error("add-doc-ids: ERRORS — nothing was written:")
    for (const error of result.errors) console.error(`  ${error.relPath}: ${error.reason}`)
    return 1
  }
  const verb = dryRun ? "would stamp" : "stamped"
  for (const relPath of result.stamped) console.log(`add-doc-ids: ${verb} ${relPath}`)
  console.log(
    `add-doc-ids: done (${verb}=[${result.stamped.length}] skipped=[${result.skipped.length}])`,
  )
  return 0
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(main())
}
