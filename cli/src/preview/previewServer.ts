import fs from "node:fs"
import http from "node:http"
import path from "node:path"
import {
  PREVIEW_BIND_HOST,
  PreviewPathResolver,
  contentTypeFor,
  type PreviewResolution,
  type SiteFileLookup,
} from "./previewPathResolver.ts"

/**
 * fs-backed SiteFileLookup rooted at the site directory. The resolver never
 * emits traversal segments, but containment is re-asserted here as defense in
 * depth: a path outside the root is reported as nonexistent.
 */
export class FsSiteFileLookup implements SiteFileLookup {
  private readonly rootDir: string

  constructor(siteDir: string) {
    this.rootDir = path.resolve(siteDir)
  }

  /** Absolute path for a site-relative one, or undefined if it escapes the root. */
  containedAbsolutePath(siteRelativePath: string): string | undefined {
    const absolute = path.resolve(this.rootDir, siteRelativePath)
    if (absolute !== this.rootDir && !absolute.startsWith(this.rootDir + path.sep)) {
      return undefined
    }
    return absolute
  }

  isFile(siteRelativePath: string): boolean {
    const absolute = this.containedAbsolutePath(siteRelativePath)
    return absolute !== undefined && fs.existsSync(absolute) && fs.statSync(absolute).isFile()
  }

  isDirectory(siteRelativePath: string): boolean {
    const absolute = this.containedAbsolutePath(siteRelativePath)
    return absolute !== undefined && fs.existsSync(absolute) && fs.statSync(absolute).isDirectory()
  }
}

export interface PreviewServerAddress {
  host: string
  port: number
  url: string
}

/**
 * Thin node:http wiring around PreviewPathResolver for `publish preview`.
 * Binds loopback only — a LOCAL preview, not a production server (no TLS, no
 * caching, no concurrency hardening). Production routing recipes live in
 * docs/hosting.md.
 */
export class PreviewServer {
  private readonly lookup: FsSiteFileLookup
  private readonly server: http.Server

  constructor(siteDir: string) {
    this.lookup = new FsSiteFileLookup(siteDir)
    this.server = http.createServer((request, response) => this.handle(request, response))
  }

  /** Starts listening on PREVIEW_BIND_HOST; port 0 picks a free port (tests). */
  start(port: number): Promise<PreviewServerAddress> {
    return new Promise((resolve, reject) => {
      this.server.once("error", reject)
      this.server.listen(port, PREVIEW_BIND_HOST, () => {
        const actualPort = (this.server.address() as { port: number }).port
        resolve({
          host: PREVIEW_BIND_HOST,
          port: actualPort,
          url: `http://${PREVIEW_BIND_HOST}:${actualPort}/`,
        })
      })
    })
  }

  stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.close((error) => (error ? reject(error) : resolve()))
    })
  }

  private handle(request: http.IncomingMessage, response: http.ServerResponse): void {
    const resolution = PreviewPathResolver.resolve(request.url ?? "/", this.lookup)
    this.respond(resolution, response)
  }

  private respond(resolution: PreviewResolution, response: http.ServerResponse): void {
    if (resolution.kind === "serve") {
      this.sendFile(response, 200, resolution.siteRelativeFilePath)
      return
    }
    if (resolution.kind === "redirect") {
      response.writeHead(302, { location: resolution.location })
      response.end()
      return
    }
    if (resolution.kind === "not-found") {
      if (resolution.notFoundPageFilePath !== undefined) {
        this.sendFile(response, 404, resolution.notFoundPageFilePath)
      } else {
        response.writeHead(404, { "content-type": "text/plain; charset=utf-8" })
        response.end("404 Not Found")
      }
      return
    }
    // rejected — refuse without echoing the (attacker-controlled) path back.
    response.writeHead(400, { "content-type": "text/plain; charset=utf-8" })
    response.end("400 Bad Request")
  }

  private sendFile(response: http.ServerResponse, status: number, siteRelativeFilePath: string): void {
    const absolute = this.lookup.containedAbsolutePath(siteRelativeFilePath)
    try {
      // Read fully instead of streaming: preview serves small local files and
      // this keeps the error path (deleted mid-request) trivially correct.
      const body = fs.readFileSync(absolute as string)
      response.writeHead(status, { "content-type": contentTypeFor(siteRelativeFilePath) })
      response.end(body)
    } catch {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" })
      response.end("404 Not Found")
    }
  }
}
