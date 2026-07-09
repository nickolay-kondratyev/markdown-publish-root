#!/usr/bin/env node
// One-command bootstrap of the vendored Quartz build tool (see docs/decisions/0002-*.md).
//
// What it does (idempotent; safe to re-run):
//   1. Clones Quartz into vendor/quartz/ and checks out the commit pinned in
//      vendor/quartz-pin.json (fetches the pin if the clone already exists but drifted).
//   2. `npm ci` inside the checkout.
//   3. `node quartz/bootstrap-cli.mjs plugin install` — required once per checkout:
//      Quartz statically imports the generated .quartz/plugins/index.ts, so a fresh
//      clone cannot build until the community plugins (pinned by quartz.lock.json)
//      are installed. Needs network + git.
//
// Verbose subprocess output goes to .tmp/setup-quartz/*.log to keep the console readable.

import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const PIN_FILE = path.join(REPO_ROOT, "vendor", "quartz-pin.json")
const QUARTZ_DIR = path.join(REPO_ROOT, "vendor", "quartz")
const LOG_DIR = path.join(REPO_ROOT, ".tmp", "setup-quartz")

// Quartz 5 is engine-strict (package.json engines + runtime check in bootstrap-cli.mjs).
const MIN_NODE_MAJOR = 22

function fail(message) {
  console.error(`setup-quartz: ERROR: ${message}`)
  process.exit(1)
}

function log(message) {
  console.log(`setup-quartz: ${message}`)
}

function assertNodeVersion() {
  const major = Number(process.versions.node.split(".")[0])
  if (major < MIN_NODE_MAJOR) {
    fail(
      `Node >= ${MIN_NODE_MAJOR} required by Quartz 5, found v${process.versions.node}. ` +
        `Select a newer Node first, e.g.: source ~/.nvm/nvm.sh && nvm use node`,
    )
  }
}

// npm must match the node running this script (system npm may belong to an older node).
function npmPath() {
  const candidate = path.join(path.dirname(process.execPath), "npm")
  return fs.existsSync(candidate) ? candidate : "npm"
}

function run(logName, command, args, cwd) {
  fs.mkdirSync(LOG_DIR, { recursive: true })
  const logFile = path.join(LOG_DIR, `${logName}.log`)
  log(`running [${[command, ...args].join(" ")}] (log: ${path.relative(REPO_ROOT, logFile)})`)
  const out = fs.openSync(logFile, "w")
  try {
    execFileSync(command, args, { cwd, stdio: ["ignore", out, out] })
  } catch (error) {
    const tail = fs.readFileSync(logFile, "utf-8").split("\n").slice(-30).join("\n")
    fail(`command failed (full log: ${logFile}):\n${tail}\n${error.message}`)
  } finally {
    fs.closeSync(out)
  }
}

// Returns null when the checkout has no commit yet (fresh `git init`).
function currentCommit(cwd) {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }).trim()
  } catch {
    return null
  }
}

function ensureCheckout(pin) {
  if (!fs.existsSync(path.join(QUARTZ_DIR, ".git"))) {
    log(`cloning ${pin.repo} into vendor/quartz`)
    fs.mkdirSync(QUARTZ_DIR, { recursive: true })
    run("git-init", "git", ["init", "--quiet"], QUARTZ_DIR)
    run("git-remote", "git", ["remote", "add", "origin", pin.repo], QUARTZ_DIR)
  }
  if (currentCommit(QUARTZ_DIR) === pin.commit) {
    log(`checkout already at pinned commit ${pin.commit}`)
    return
  }
  // Shallow-fetch exactly the pinned commit: reproducible and fast.
  run("git-fetch", "git", ["fetch", "--depth", "1", "origin", pin.commit], QUARTZ_DIR)
  run("git-checkout", "git", ["checkout", "--force", "--quiet", pin.commit], QUARTZ_DIR)
  log(`checked out pinned commit ${pin.commit}`)
}

function main() {
  assertNodeVersion()
  const pin = JSON.parse(fs.readFileSync(PIN_FILE, "utf-8"))
  ensureCheckout(pin)

  if (fs.existsSync(path.join(QUARTZ_DIR, "node_modules"))) {
    log("node_modules present, skipping npm ci (delete vendor/quartz/node_modules to force)")
  } else {
    run("npm-ci", npmPath(), ["ci"], QUARTZ_DIR)
  }

  // Marker that `plugin install` completed: the generated plugin registry.
  if (fs.existsSync(path.join(QUARTZ_DIR, ".quartz", "plugins", "index.ts"))) {
    log("Quartz community plugins already installed, skipping plugin install")
  } else {
    run("plugin-install", process.execPath, ["./quartz/bootstrap-cli.mjs", "plugin", "install"], QUARTZ_DIR)
  }

  log(`DONE. Vendored Quartz ready at ${path.relative(REPO_ROOT, QUARTZ_DIR)}`)
}

main()
