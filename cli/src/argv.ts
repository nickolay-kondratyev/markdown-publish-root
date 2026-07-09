/** Tiny argv helpers shared by the CLI's command parsers. */

/** Returns argv[index] as the value of `option`, or throws a usage error. */
export function requireValue(argv: string[], index: number, option: string): string {
  const value = argv[index]
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${option} requires a value`)
  }
  return value
}
