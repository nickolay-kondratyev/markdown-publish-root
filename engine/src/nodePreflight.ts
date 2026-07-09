/** Minimum Node major required by the vendored Quartz 5 (engine-strict). */
export const MIN_NODE_MAJOR = 22

/** Runtime Node version check with an actionable error message. */
export class NodePreflight {
  static assertSupportedNode(): void {
    const major = Number(process.versions.node.split(".")[0])
    if (major < MIN_NODE_MAJOR) {
      throw new Error(
        `Node >= ${MIN_NODE_MAJOR} required (Quartz 5 is engine-strict), found v${process.versions.node}. ` +
          `Switch first, e.g.: source ~/.nvm/nvm.sh && nvm use node`,
      )
    }
  }
}
