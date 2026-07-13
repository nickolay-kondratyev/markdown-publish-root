# Publish config (external users)

- `publish build <vault>` needs no flags when `<vault>/.external_publish_config.json`
  exists: engine site.json schema + CLI-level `output_dir` (resolved relative to the
  config file; `--out` overrides). Format doc: `docs/config-format.md`.
  Loader: `cli/src/externalPublishConfig.ts` (strips `output_dir` before the engine).
- `publishFilter.publishAll: true` = explicit whole-vault opt-in (md + canvas).
  Default stays fail-closed; hidden/`private`/excludeFolders/`publish: false` still win.
- Regression guard for the zero-flag flow: `cli/test/integration/buildDiscovery.test.ts`
  (builds the REAL `test-vault/.external_publish_config.json`).
