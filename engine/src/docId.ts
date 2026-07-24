import crypto from "node:crypto"

/**
 * Stable document id grammar (plan/id-based-publishing.md §2).
 *
 * A docid is the published identity of a doc page: every note/canvas is served
 * at `/notes/<docid>` regardless of its vault path, so renames never change URLs.
 * Shared by the id-addition script (scripts/add-doc-ids.mjs) and the engine's
 * staging validation — the ONE definition of what a valid id is.
 *
 * WHY all-lowercase (deviation approved 2026-07-10): Quartz slugifies every
 * URL segment to lowercase and stays unpatched by design, so a lowercase-only
 * grammar keeps frontmatter id == URL segment byte-for-byte. Base36 at 21
 * chars is ~108 bits of entropy — ample for global uniqueness.
 *
 * This grammar governs ids WE GENERATE. Publishing also accepts foreign ids
 * (stamped by other tooling) — see UrlSegment for how those are transformed
 * into URL-safe segments with `lc_`/`ue_` marker prefixes.
 */
export class DocId {
  /** Full-match grammar: `docid_<21 chars base36 lowercase>_e`. */
  static readonly REGEX = /^docid_[0-9a-z]{21}_e$/

  static isValid(value: unknown): value is string {
    return typeof value === "string" && DocId.REGEX.test(value)
  }

  /** Crypto-random docid (uniform base36 via rejection sampling). */
  static generate(): string {
    const chars: string[] = []
    while (chars.length < RANDOM_CHAR_COUNT) {
      for (const byte of crypto.randomBytes(RANDOM_CHAR_COUNT)) {
        // Reject bytes >= 252 (= 7*36): the remainder would bias 0..251 % 36.
        if (byte >= BASE36_REJECTION_BOUND) continue
        chars.push(BASE36_ALPHABET[byte % BASE36_ALPHABET.length] as string)
        if (chars.length === RANDOM_CHAR_COUNT) break
      }
    }
    return `docid_${chars.join("")}_e`
  }
}

const BASE36_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz"
const RANDOM_CHAR_COUNT = 21
const BASE36_REJECTION_BOUND = 252 // largest multiple of 36 that fits in a byte
