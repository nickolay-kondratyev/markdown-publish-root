import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { IdMap } from "../../src/idMap.ts"
import { StagingLinkIndex } from "../../src/stagingLinkIndex.ts"

/**
 * StagingLinkIndex resolves ORIGINAL wikilink targets to their id-based staged
 * targets. The folder-note cases guard the bug where a file whose basename
 * equals its parent folder (Obsidian "folder note") is slugged by Quartz to
 * ".../index", which used to make `[[FolderName]]` resolve to nothing.
 */
describe("StagingLinkIndex", () => {
  const FOLDER_NOTE = "p/Alan-Watts/Alan-Watts.md"
  const FOLDER_NOTE_ID = "e33wd60mupdafm8n2p9v4as"
  const SOURCE = "notes/ref.md"
  const SOURCE_ID = "refnote0000000000000000"
  const PLAIN_NOTE = "notes/plain.md"
  const PLAIN_NOTE_ID = "plainnote000000000000000"

  const idMap = IdMap.build([
    { vaultPath: FOLDER_NOTE, idValue: FOLDER_NOTE_ID },
    { vaultPath: SOURCE, idValue: SOURCE_ID },
    { vaultPath: PLAIN_NOTE, idValue: PLAIN_NOTE_ID },
  ])
  const allStaged = [FOLDER_NOTE, SOURCE, PLAIN_NOTE]
  const resolve = new StagingLinkIndex(idMap, allStaged).resolverFor(SOURCE)

  test("WHEN a bare wikilink targets a folder note by its folder name THEN it resolves to the folder note's id", () => {
    assert.equal(resolve("Alan-Watts"), FOLDER_NOTE_ID)
  })

  test("WHEN a folder-note wikilink carries an anchor THEN it still resolves to the id", () => {
    assert.equal(resolve("Alan-Watts#some-heading"), FOLDER_NOTE_ID)
  })

  test("WHEN a plain note is linked by name THEN it resolves to its id (unchanged behavior)", () => {
    assert.equal(resolve("plain"), PLAIN_NOTE_ID)
  })

  test("WHEN a target does not resolve THEN undefined is returned (conservative)", () => {
    assert.equal(resolve("no-such-note"), undefined)
  })
})
