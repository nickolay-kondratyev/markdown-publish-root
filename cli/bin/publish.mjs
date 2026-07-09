#!/usr/bin/env node
// CLI launcher. Plain JS on purpose: it must start (and explain itself) even on
// a Node too old to load the TypeScript sources it dispatches to.

// Quartz 5 is engine-strict (>= 22); running our .ts sources needs Node's
// native type stripping (default since 23.6; flagged on 22.6-23.5).
const MIN_NODE_MAJOR = 22

const major = Number(process.versions.node.split(".")[0])
if (major < MIN_NODE_MAJOR || !process.features.typescript) {
  console.error(
    `publish: Node v${process.versions.node} is not supported.\n` +
      `Need Node >= ${MIN_NODE_MAJOR} with TypeScript type stripping:\n` +
      `  - Node >= 23.6: works out of the box (recommended; tested on v26)\n` +
      `  - Node 22.6-23.5: re-run with --experimental-strip-types\n` +
      `Switch via nvm: source ~/.nvm/nvm.sh && nvm use node`,
  )
  process.exit(1)
}

const { CliMain } = await import("../src/main.ts")
process.exit(await CliMain.run(process.argv.slice(2)))
