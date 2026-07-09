import assert from "node:assert/strict"
import { describe, test } from "node:test"
import {
  PreviewPathResolver,
  contentTypeFor,
  type SiteFileLookup,
} from "../../src/preview/previewPathResolver.ts"

/** In-memory SiteFileLookup: directories are inferred from file paths. */
function siteWithFiles(...files: string[]): SiteFileLookup {
  const fileSet = new Set(files)
  const directorySet = new Set<string>()
  for (const file of files) {
    const segments = file.split("/")
    for (let i = 1; i < segments.length; i++) {
      directorySet.add(segments.slice(0, i).join("/"))
    }
  }
  return {
    isFile: (relativePath) => fileSet.has(relativePath),
    isDirectory: (relativePath) => directorySet.has(relativePath),
  }
}

/** Typical `publish build` output shape (verified against the real e2e build). */
const SITE = siteWithFiles(
  "index.html",
  "404.html",
  "notes/index.html",
  "notes/architecture.html",
  "notes/some note.html",
  "canvases/main.canvas.html",
  "canvases/main.canvas.fragments/file-note-full.html",
  "attachments/diagram.png",
  "static/canvas-viewer.js",
)

describe("PreviewPathResolver — decision table (THE hosting contract, docs/hosting.md)", () => {
  test("GIVEN an exact file URL THEN it is served as-is", () => {
    assert.deepEqual(PreviewPathResolver.resolve("/notes/architecture.html", SITE), {
      kind: "serve",
      siteRelativeFilePath: "notes/architecture.html",
    })
  })

  test("GIVEN an exact non-HTML asset URL THEN it is served as-is", () => {
    assert.deepEqual(PreviewPathResolver.resolve("/attachments/diagram.png", SITE), {
      kind: "serve",
      siteRelativeFilePath: "attachments/diagram.png",
    })
  })

  test("GIVEN the site root '/' THEN index.html is served", () => {
    assert.deepEqual(PreviewPathResolver.resolve("/", SITE), {
      kind: "serve",
      siteRelativeFilePath: "index.html",
    })
  })

  test("GIVEN a directory URL WITH trailing slash THEN its index.html is served", () => {
    assert.deepEqual(PreviewPathResolver.resolve("/notes/", SITE), {
      kind: "serve",
      siteRelativeFilePath: "notes/index.html",
    })
  })

  test("GIVEN a directory URL WITHOUT trailing slash THEN it redirects to the slashed URL (relative links must resolve against the directory)", () => {
    assert.deepEqual(PreviewPathResolver.resolve("/notes", SITE), {
      kind: "redirect",
      location: "/notes/",
    })
  })

  test("GIVEN an extensionless page URL THEN the .html sibling is served", () => {
    assert.deepEqual(PreviewPathResolver.resolve("/notes/architecture", SITE), {
      kind: "serve",
      siteRelativeFilePath: "notes/architecture.html",
    })
  })

  test("GIVEN a canvas URL (X.canvas, emitted as X.canvas.html) THEN the .html sibling is served", () => {
    assert.deepEqual(PreviewPathResolver.resolve("/canvases/main.canvas", SITE), {
      kind: "serve",
      siteRelativeFilePath: "canvases/main.canvas.html",
    })
  })

  test("GIVEN a percent-encoded URL THEN it is decoded before lookup", () => {
    assert.deepEqual(PreviewPathResolver.resolve("/notes/some%20note", SITE), {
      kind: "serve",
      siteRelativeFilePath: "notes/some note.html",
    })
  })

  test("GIVEN a query string THEN it does not affect resolution", () => {
    assert.deepEqual(PreviewPathResolver.resolve("/notes/architecture?theme=dark", SITE), {
      kind: "serve",
      siteRelativeFilePath: "notes/architecture.html",
    })
  })

  test("GIVEN a missing URL with a non-html extension THEN it does NOT get the .html fallback", () => {
    // Even with a would-match .html sibling present: extensions other than
    // .canvas never fall back (a missing image must 404, not serve a page).
    const site = siteWithFiles("attachments/missing.png.html", "404.html")
    assert.equal(PreviewPathResolver.resolve("/attachments/missing.png", site).kind, "not-found")
  })

  test("GIVEN a missing URL AND the site has 404.html THEN not-found carries the themed page", () => {
    assert.deepEqual(PreviewPathResolver.resolve("/nope/definitely-not-here", SITE), {
      kind: "not-found",
      notFoundPageFilePath: "404.html",
    })
  })

  test("GIVEN a missing URL AND NO 404.html THEN not-found carries no page", () => {
    const site = siteWithFiles("index.html")
    assert.deepEqual(PreviewPathResolver.resolve("/nope", site), {
      kind: "not-found",
      notFoundPageFilePath: undefined,
    })
  })

  test("GIVEN a file URL with a trailing slash THEN it is NOT served as that file", () => {
    assert.equal(PreviewPathResolver.resolve("/notes/architecture.html/", SITE).kind, "not-found")
  })
})

describe("PreviewPathResolver — security boundary (traversal/dotfiles rejected before any lookup)", () => {
  /** Lookup that fails the test if the resolver consults it at all. */
  const NEVER_TOUCHED: SiteFileLookup = {
    isFile: (relativePath) => assert.fail(`lookup touched for: ${relativePath}`),
    isDirectory: (relativePath) => assert.fail(`lookup touched for: ${relativePath}`),
  }

  test("GIVEN a plain ../ traversal THEN it is rejected without touching files", () => {
    assert.equal(PreviewPathResolver.resolve("/../package.json", NEVER_TOUCHED).kind, "rejected")
  })

  test("GIVEN a nested ../ traversal THEN it is rejected", () => {
    assert.equal(
      PreviewPathResolver.resolve("/notes/../../etc/passwd", NEVER_TOUCHED).kind,
      "rejected",
    )
  })

  test("GIVEN a percent-ENCODED traversal (%2e%2e) THEN it is rejected after decoding", () => {
    assert.equal(
      PreviewPathResolver.resolve("/%2e%2e/package.json", NEVER_TOUCHED).kind,
      "rejected",
    )
  })

  test("GIVEN a single-dot segment THEN it is rejected", () => {
    assert.equal(PreviewPathResolver.resolve("/notes/./index.html", NEVER_TOUCHED).kind, "rejected")
  })

  test("GIVEN a dotfile URL THEN it is rejected (hidden files are never site content)", () => {
    assert.equal(PreviewPathResolver.resolve("/.git/config", NEVER_TOUCHED).kind, "rejected")
  })

  test("GIVEN a backslash in a segment THEN it is rejected", () => {
    assert.equal(
      PreviewPathResolver.resolve("/notes/..%5C..%5Cpackage.json", NEVER_TOUCHED).kind,
      "rejected",
    )
  })

  test("GIVEN an encoded NUL byte THEN it is rejected", () => {
    assert.equal(PreviewPathResolver.resolve("/notes/a%00.html", NEVER_TOUCHED).kind, "rejected")
  })

  test("GIVEN malformed percent-encoding THEN it is rejected", () => {
    assert.equal(PreviewPathResolver.resolve("/notes/%zz", NEVER_TOUCHED).kind, "rejected")
  })
})

describe("contentTypeFor", () => {
  test("GIVEN an .html path THEN text/html with charset", () => {
    assert.equal(contentTypeFor("notes/architecture.html"), "text/html; charset=utf-8")
  })

  test("GIVEN a .canvas.html path THEN the LAST extension wins", () => {
    assert.equal(contentTypeFor("canvases/main.canvas.html"), "text/html; charset=utf-8")
  })

  test("GIVEN an uppercase extension THEN it still matches", () => {
    assert.equal(contentTypeFor("attachments/PHOTO.JPG"), "image/jpeg")
  })

  test("GIVEN a woff2 font THEN font/woff2", () => {
    assert.equal(contentTypeFor("static/fonts/inter.woff2"), "font/woff2")
  })

  test("GIVEN an unknown extension THEN application/octet-stream", () => {
    assert.equal(contentTypeFor("data/blob.weird"), "application/octet-stream")
  })

  test("GIVEN no extension THEN application/octet-stream", () => {
    assert.equal(contentTypeFor("LICENSE"), "application/octet-stream")
  })
})
