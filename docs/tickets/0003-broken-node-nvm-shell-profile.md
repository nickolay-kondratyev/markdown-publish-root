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
  absolute path. NOTE: prepending a newer node to PATH is NOT enough — the
  shell FUNCTION shadows PATH lookup; the functions must be unset.
- Node v26.4.0 was installed manually at
  `/home/node/.nvm/versions/node/v26.4.0/bin` (tarball, no nvm) — matches the
  path `.claude/skills/verify/SKILL.md` documents. The system
  `/usr/local/bin/node` is v20 and cannot type-strip the `.ts` tests
  (needs >= 22.6).
- 2026-07-11: fresh sandbox instance lost that v26 install; Node v22.21.1
  (linux-arm64 tarball) reinstalled at `~/.local/node22/bin`
  (SKILL.md updated to match).

**Better workaround (2026-07-11, survives per shell automatically):** write a
minimal `/home/node/.nvm/nvm.sh` stub that prepends
`$NVM_DIR/versions/node/v26.4.0/bin` to PATH (+ a no-op `nvm()` echoing that
it is a stub). The profile's lazy wrapper `unset -f`s itself and sources that
file, so bare `node`/`npm` then resolve to v26 in EVERY shell — no per-shell
`unset -f` needed. Note: fresh sandboxes wipe `/home/node/.nvm` AND the repo's
`node_modules`/`vendor/quartz`; re-do the tarball install + stub + `npm
install` + `npm run setup` (the tarball must match `uname -m` — the sandbox is
**aarch64**).

- 2026-07-13: another fresh sandbox, this time **x86_64** (arch varies between
  instances — ALWAYS check `uname -m` first). Reinstalled Node v26.4.0
  linux-x64 tarball at `/home/node/.nvm/versions/node/v26.4.0/` + the nvm.sh
  PATH stub. Bare `node`/`npm` work again in every shell.

Proper fix (profile, not this repo): make the wrapper bail out (fall through
to `command node`) when nvm.sh is absent instead of recursing, and/or install
nvm properly in the sandbox image.
