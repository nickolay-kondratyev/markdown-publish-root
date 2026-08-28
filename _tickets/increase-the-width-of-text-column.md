---
closed_iso: 2026-08-28T18:33:06Z
session_ids: [{"a": "claude", "type": "execution", "id": "fea02293-487c-43a3-b969-f06fc7034705"}, {"a": "claude", "type": "review", "id": "f27cc7fa-561f-41d6-a233-04f3b21d0040"}]
working_dir: nickolay-kondratyev_markdown-publish-root
id: nid_2l4x6as325r6xiruc7h0p5dx8_e
title: "Increase the width of text column"
status: closed
deps: []
links: []
created_iso: 2026-08-28T17:58:52Z
status_updated_iso: 2026-08-28T18:33:06Z
type: task
priority: 3
assignee: nickolaykondratyev
tags: []
---

Let's increase the width of text column in our published site by 40%.

The text column is the middle column, Where the Markdown text is rendered on Markdown pages.

## Resolution

The text column width is the markdown "reading measure" applied to the
default-frame center track. It is a single SCSS variable, `$readingMeasure`,
defined in the engine source of truth `engine/src/siteChromeStyles.ts`
(`SITE_CHROME_SCSS`). `SiteBuilder` writes `SiteChromeStyles.scss()` out as the
vendored `quartz/styles/custom.scss` on every build (`siteBuilder.ts:112` ->
`quartzRunner.writeCustomStyles`), so the vendored copy under `vendor/quartz/`
is a gitignored generated artifact — editing the TS constant is sufficient and
the copy regenerates on the next build.

Change: `$readingMeasure` `70ch` -> `98ch` (70 × 1.4 = 98, i.e. +40%). Because
the measure is expressed in `ch`, only this one value needed changing; the
center column caps at `max-width: $readingMeasure` and stays centered within
its track (canvas pages are unaffected — they reclaim the full track via the
`:has(.canvas-page)` rule).

Also updated the corresponding unit assertion in
`engine/test/unit/siteChromeStyles.test.ts` to expect `98ch`.

Verified: `npm run typecheck` passes; the full `siteChromeStyles.test.ts` suite
passes (16/16).

