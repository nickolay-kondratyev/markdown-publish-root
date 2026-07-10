# Fix the sandbox shell profile's node/npm wrappers (infinite recursion when nvm is absent)

Status: OPEN
Origin: id-publishing merge (2026-07-10) — dev-environment issue hit while verifying the merge.

The sandbox shell profile defines `node()` / `npm()` / `npx()` functions of the shape:

```bash
node() { __actual_NVM_source; node "$@"; }
```

When `~/.nvm/nvm.sh` is missing, `__actual_NVM_source` never replaces the
function, so `node "$@"` re-enters the function → **infinite loop** spamming
`[/home/node/.nvm/nvm.sh] NOT found not sourcing NVM_SH` until killed. Any
bare `node`/`npm` invocation hangs.

Current workarounds (fragile, needed in every shell):

- `unset -f node npm npx` before running anything, or call binaries by
  absolute path.
- Node v26.4.0 was installed manually at
  `/home/node/.nvm/versions/node/v26.4.0/bin` (tarball, no nvm) — matches the
  path `.claude/skills/verify/SKILL.md` documents. The system
  `/usr/local/bin/node` is v20 and cannot type-strip the `.ts` tests
  (needs >= 22.6).

Proper fix (profile, not this repo): make the wrapper bail out (fall through
to `command node`) when nvm.sh is absent instead of recursing, and/or install
nvm properly in the sandbox image.
