#!/usr/bin/env bash
# One-command dev environment bootstrap (idempotent; safe to re-run).
#
# Root cause this solves: the repo needs Node >= 22 (tests run .ts files natively
# via `node --test`; see package.json engines), but machines often ship an older
# system Node and no nvm. This script:
#   1. Installs nvm into ~/.nvm if missing.
#   2. Installs + activates the Node version pinned in .nvmrc (also sets it as
#      the nvm default so fresh shells pick it up).
#   3. `npm install` at the repo root.
#   4. `npm run setup` (vendored Quartz clone + plugins + canvas viewer bundle;
#      idempotent, needs network + git).
#   5. Verifies by running `npm test` (skip with --no-verify).
#
# After it succeeds, in any NEW shell run tests with:
#   source ~/.nvm/nvm.sh && nvm use && npm test
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${REPO_ROOT}"

# Pinned nvm installer release (bump deliberately).
NVM_INSTALLER_VERSION="v0.40.3"
export NVM_DIR="${NVM_DIR:-${HOME}/.nvm}"

VERIFY=1
[[ "${1:-}" == "--no-verify" ]] && VERIFY=0

log() { echo "setup-dev-env: $*"; }
fail() { echo "setup-dev-env: ERROR: $*" >&2; exit 1; }

# --- 1. Prerequisites -------------------------------------------------------
command -v git >/dev/null || fail "git is required (needed to vendor Quartz)"
command -v curl >/dev/null || fail "curl is required (needed to install nvm)"
[[ -f .nvmrc ]] || fail ".nvmrc not found at repo root (it pins the Node version)"

# --- 2. nvm -----------------------------------------------------------------
if [[ -s "${NVM_DIR}/nvm.sh" ]]; then
  log "nvm already present at NVM_DIR=[${NVM_DIR}]"
else
  log "installing nvm ${NVM_INSTALLER_VERSION} into NVM_DIR=[${NVM_DIR}]"
  curl -fsSL "https://raw.githubusercontent.com/nvm-sh/nvm/${NVM_INSTALLER_VERSION}/install.sh" | bash
fi
# nvm is a shell function, not a binary — must be sourced.
# shellcheck disable=SC1091
source "${NVM_DIR}/nvm.sh"

# --- 3. Node (version from .nvmrc) -----------------------------------------
# `nvm install` / `nvm use` with no argument read .nvmrc from $PWD.
nvm install >/dev/null
nvm use >/dev/null
nvm alias default "$(cat .nvmrc)" >/dev/null
log "node=[$(node --version)] npm=[$(npm --version)]"

NODE_MAJOR="$(node --version | sed -E 's/^v([0-9]+).*/\1/')"
# package.json engines: Node >= 22 (native TS type stripping for `node --test`).
(( NODE_MAJOR >= 22 )) || fail "Node >= 22 required, got $(node --version) — check .nvmrc"

# --- 4. Dependencies + vendored Quartz --------------------------------------
mkdir -p .tmp
log "npm install (log: .tmp/setup-dev-env-npm-install.log)"
npm install > .tmp/setup-dev-env-npm-install.log 2>&1 \
  || fail "npm install failed (see .tmp/setup-dev-env-npm-install.log)"

log "npm run setup — vendored Quartz + canvas viewer (log: .tmp/setup-dev-env-npm-setup.log)"
npm run setup > .tmp/setup-dev-env-npm-setup.log 2>&1 \
  || fail "npm run setup failed (see .tmp/setup-dev-env-npm-setup.log)"

# --- 5. Verify: the tests must actually run ---------------------------------
if (( VERIFY )); then
  log "verifying: npm test (log: .tmp/setup-dev-env-npm-test.log)"
  npm test > .tmp/setup-dev-env-npm-test.log 2>&1 \
    || fail "npm test failed (see .tmp/setup-dev-env-npm-test.log)"
  log "npm test PASSED"
else
  log "verification skipped (--no-verify)"
fi

log "DONE. In new shells: source ~/.nvm/nvm.sh && nvm use && npm test"
