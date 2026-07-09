import assert from "node:assert/strict"
import fs from "node:fs"
import http from "node:http"
import os from "node:os"
import path from "node:path"
import { after, before, describe, test } from "node:test"
import { FsSiteFileLookup, PreviewServer } from "../../src/preview/previewServer.ts"

/**
 * Raw HTTP GET that sends the path VERBATIM. fetch()/WHATWG URL normalize
 * `..` and `%2e%2e` dot-segments client-side, which would hide traversal
 * attempts from the server — exactly what these tests must exercise.
 */
function rawGet(port: number, rawPath: string): Promise<{ status: number; body: string; location?: string }> {
  return new Promise((resolve, reject) => {
    const request = http.request(
      { host: "127.0.0.1", port, path: rawPath, method: "GET" },
      (response) => {
        let body = ""
        response.on("data", (chunk) => (body += chunk))
        response.on("end", () =>
          resolve({
            status: response.statusCode as number,
            body,
            location: response.headers.location,
          }),
        )
      },
    )
    request.on("error", reject)
    request.end()
  })
}

describe("PreviewServer (loopback, temp fixture site)", () => {
  let siteDir: string
  let port: number
  let server: PreviewServer

  // GIVEN a minimal built-site shape on disk
  before(async () => {
    siteDir = fs.mkdtempSync(path.join(os.tmpdir(), "preview-server-test-"))
    fs.mkdirSync(path.join(siteDir, "notes"), { recursive: true })
    fs.writeFileSync(path.join(siteDir, "index.html"), "<h1>home</h1>")
    fs.writeFileSync(path.join(siteDir, "404.html"), "<h1>themed 404</h1>")
    fs.writeFileSync(path.join(siteDir, "notes", "architecture.html"), "<h1>arch</h1>")
    fs.writeFileSync(path.join(siteDir, "notes", "index.html"), "<h1>notes folder</h1>")
    server = new PreviewServer(siteDir)
    port = (await server.start(0)).port
  })

  after(async () => {
    await server.stop()
    fs.rmSync(siteDir, { recursive: true, force: true })
  })

  test("WHEN requesting an extensionless page THEN 200 with text/html body from the .html file", async () => {
    const response = await rawGet(port, "/notes/architecture")
    assert.deepEqual({ status: response.status, body: response.body }, { status: 200, body: "<h1>arch</h1>" })
  })

  test("WHEN requesting a directory without slash THEN 302 to the slashed URL", async () => {
    const response = await rawGet(port, "/notes")
    assert.deepEqual(
      { status: response.status, location: response.location },
      { status: 302, location: "/notes/" },
    )
  })

  test("WHEN requesting a missing page THEN status 404 with the site's themed 404 page", async () => {
    const response = await rawGet(port, "/missing")
    assert.deepEqual(
      { status: response.status, body: response.body },
      { status: 404, body: "<h1>themed 404</h1>" },
    )
  })

  test("WHEN requesting a raw ../ traversal THEN 400 and the target file is NOT served", async () => {
    const response = await rawGet(port, "/../secret-outside.txt")
    assert.equal(response.status, 400)
  })
})

describe("FsSiteFileLookup containment (defense in depth behind the resolver)", () => {
  test("GIVEN a relative path escaping the root THEN it reports nonexistent", () => {
    const lookup = new FsSiteFileLookup(os.tmpdir())
    // package.json certainly exists ABOVE tmpdir-like roots; containment must hide it.
    assert.equal(lookup.isFile("../../etc/hostname"), false)
  })

  test("GIVEN a path resolving to a SIBLING dir sharing the root's name prefix THEN it is outside", () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "lookup-test-"))
    fs.mkdirSync(path.join(workDir, "site"))
    fs.writeFileSync(path.join(workDir, "site-secrets.txt"), "outside")
    const lookup = new FsSiteFileLookup(path.join(workDir, "site"))
    const escaped = lookup.isFile("../site-secrets.txt")
    fs.rmSync(workDir, { recursive: true, force: true })
    assert.equal(escaped, false)
  })
})
