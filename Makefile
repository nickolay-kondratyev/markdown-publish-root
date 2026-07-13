# Dev convenience targets (glue only — real logic lives in cli/). See docs/current/usage.md.
SHELL := /bin/bash

# Quartz requires Node >= 22 (see docs/current/dev.md); version pinned in .nvmrc.
# Missing nvm/Node? Run: scripts/setup-dev-env.sh
NODE_ENV := source ~/.nvm/nvm.sh && nvm use >/dev/null

TEST_VAULT   := test-vault
SITE_CONFIG  := docs-internal/current/config/minimal-site.json
OUT_DIR      := out/public
PREVIEW_PORT := 8080
# Vault targeted by vault-add-ids (override: make vault-add-ids VAULT=/path/to/vault).
VAULT        := $(TEST_VAULT)

# Self-hosted React Flow viewer bundle: gitignored artifact rebuilt from
# canvas-plugin/viewer/* — must be fresh before any site build (the canvas
# plugin's emitter fails the build on a stale bundle).
CANVAS_VIEWER_BUNDLE := canvas-plugin/dist/canvas-viewer.js
CANVAS_VIEWER_SOURCES := $(wildcard canvas-plugin/viewer/*) scripts/build-canvas-viewer.mjs

.PHONY: test-vault-build test-vault-run-locally vault-add-ids test-vault-add-ids setup test

# Stamps a stable docid into every .md/.canvas of $(VAULT) (idempotent).
vault-add-ids:
	$(NODE_ENV) && node scripts/add-doc-ids.mjs $(VAULT)

test-vault-add-ids:
	$(MAKE) vault-add-ids VAULT=$(TEST_VAULT)

$(CANVAS_VIEWER_BUNDLE): $(CANVAS_VIEWER_SOURCES)
	$(NODE_ENV) && npm run bundle:viewer

test-vault-build: $(CANVAS_VIEWER_BUNDLE)
	$(NODE_ENV) && node cli/bin/publish.mjs build $(TEST_VAULT) --config $(SITE_CONFIG) --out $(OUT_DIR)

# Rebuilds first (build is ~2s), then serves with production URL routing on 127.0.0.1.
test-vault-run-locally: test-vault-build
	$(NODE_ENV) && node cli/bin/publish.mjs preview $(OUT_DIR) --port $(PREVIEW_PORT)

setup:
	$(NODE_ENV) && npm install && npm run setup

test:
	npm run test