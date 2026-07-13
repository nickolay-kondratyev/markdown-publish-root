# Dev environment (sandbox)

- Tests need Node >= 22 (`.ts` type stripping). System `/usr/local/bin/node` is v20.
  Bare `node`/`npm` hang forever if `/home/node/.nvm/nvm.sh` is missing (recursive shell
  wrapper — ticket `docs-internal/tickets/0003-broken-node-nvm-shell-profile.md`).
- Fix on a fresh sandbox (wipes `/home/node/.nvm`): install the Node v26.4.0 tarball
  **matching `uname -m`** (arch VARIES between sandbox instances: seen aarch64 AND x86_64)
  to `/home/node/.nvm/versions/node/v26.4.0/` and write the minimal
  `/home/node/.nvm/nvm.sh` PATH stub described in ticket 0003. Then bare `node` is v26.
- Test commands: `npm run test:unit`, `npm run test:integration`,
  e2e per-script: `node scripts/e2e-*.mjs` (Chromium at `/usr/bin/chromium`).
- Screenshots -> `.out/` (not source controlled); temp output -> `.tmp/`.
- `canvas-plugin/dist/canvas-viewer.js` is a gitignored build artifact. Site builds
  FAIL LOUDLY on a stale/missing bundle (ViewerBundleGuard in the canvas emitter);
  `make test-vault-build` auto-rebuilds it. Manual fix: `npm run bundle:viewer`.
