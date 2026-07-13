# UI icon conventions

- Icon set: **Phosphor** (MIT), 256×256 viewBox paths inlined as constants.
- Mode toggles signal selected state by **glyph fill**: outline = off, fill variant = on
  (two glyphs rendered, CSS shows one per root attribute — see `zen-mode/src/zenMode.js`).
  Reader-mode is a vendored (uneditable) plugin: its glyph pair is CSS-masked in
  `engine/src/siteChromeStyles.ts` instead.
- Fullscreen = Phosphor `arrows-out-simple`/`arrows-in-simple`; the path pair is
  duplicated in `full-screen-mode` and the canvas viewer (separate plugin packages,
  ref.ap.rv8cIwZWjlbPzjNjY1Dy4.E) — a unit test in fullScreenMode.test.ts guards the sync.
