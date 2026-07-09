import fs from "node:fs"
import path from "node:path"

/** Site-relative "/"-separated paths of every regular file under dir. Sorted for determinism. */
export function listFilesRecursively(dir: string): string[] {
  return fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) =>
      path
        .relative(dir, path.join(entry.parentPath, entry.name))
        .split(path.sep)
        .join("/"),
    )
    .sort()
}
