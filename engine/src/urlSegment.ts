/**
 * Derives the published URL segment for a doc id (`/n/<segment>`).
 *
 * Ids WE generate (DocId grammar) are URL-safe by construction and pass
 * through verbatim. Foreign ids (vaults stamped by other tooling) are accepted
 * too, but transformed into a URL-safe form with a marker prefix that keeps
 * the URL honest about the transformation:
 *
 *   - verbatim            — segment == frontmatter id, no transformation
 *   - `lc_<lowercased>`   — id differed from the URL only by casing
 *   - `ue_<base36 bytes>` — id was not URL-friendly; UTF-8 bytes base36-encoded
 *
 * WHY a fixed-point alphabet instead of percent-encoding: Quartz slugifies
 * every URL segment (whitespace->`-`, `%`->`-percent`, drops `?` `#`,
 * lowercases) and stays unpatched by design, so the segment must already be
 * `[a-z0-9_-]+` to survive into the URL byte-for-byte. Base36 (vs hex) keeps
 * encoded URLs ~25% shorter.
 *
 * Consumed by IdMap, which also fails the build on derived-segment collisions.
 */
export class UrlSegment {
  /** Quartz-slugification fixed point: segments in this alphabet pass through unchanged. */
  static readonly SAFE_SEGMENT_REGEX = /^[a-z0-9_-]+$/

  /** Marks a segment as the lowercased form of a mixed-case id. */
  static readonly LOWERCASED_PREFIX = "lc_"

  /** Marks a segment as the base36 url-encoding of a non-URL-friendly id. */
  static readonly ENCODED_PREFIX = "ue_"

  static deriveFrom(id: string): string {
    const lowered = id.toLowerCase()
    // Marker-prefixed ids are ALWAYS encoded so lc_/ue_ in a URL is always ours;
    // "index"/"_index" would hijack Quartz's /n/ folder-index routing.
    if (!UrlSegment.spoofsMarkerOrIndex(lowered)) {
      if (UrlSegment.SAFE_SEGMENT_REGEX.test(id)) return id
      if (UrlSegment.SAFE_SEGMENT_REGEX.test(lowered)) {
        return `${UrlSegment.LOWERCASED_PREFIX}${lowered}`
      }
    }
    return `${UrlSegment.ENCODED_PREFIX}${UrlSegment.base36OfUtf8Bytes(id)}`
  }

  private static spoofsMarkerOrIndex(loweredId: string): boolean {
    return (
      loweredId.startsWith(UrlSegment.LOWERCASED_PREFIX) ||
      loweredId.startsWith(UrlSegment.ENCODED_PREFIX) ||
      loweredId === "index" ||
      loweredId === "_index"
    )
  }

  /**
   * UTF-8 bytes -> big-endian BigInt -> base36. A 0x01 sentinel byte is
   * prepended so the mapping stays injective for ids with leading NUL bytes.
   */
  private static base36OfUtf8Bytes(id: string): string {
    const hex = Buffer.from(id, "utf8").toString("hex")
    return BigInt(`0x01${hex}`).toString(36)
  }
}
