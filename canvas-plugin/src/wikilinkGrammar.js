/**
 * The ONE Obsidian wikilink grammar shared by the canvas markdown renderer
 * and the engine's staging-time wikilink rewriter (plan/id-based-publishing.md
 * §4.6 DRY). Equivalent to Quartz ofm's parser:
 *
 *   (!?)              optional embed marker
 *   ([^\[\]|#\\]+)    target (required; bare "[[#h]]" self-references are out of scope)
 *   (#[^\[\]|\\]*)?   optional "#anchor" (heading text or ^block-id), leading "#" included
 *   (?:\|([^\[\]]*))? optional "|alias"
 *
 * Match groups: [full, embedMarker, target, rawAnchor, alias].
 * Stateful (global) regex — reset `lastIndex` or use `matchAll`.
 */
export const WIKILINK_REGEX = /(!?)\[\[([^\[\]|#\\]+)(#[^\[\]|\\]*)?(?:\|([^\[\]]*))?\]\]/g
