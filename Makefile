# Dev convenience targets (glue only — real logic lives in cli/). See docs/current/usage.md.
SHELL := /bin/bash

# Quartz requires Node >= 22 (see docs/current/dev.md);
NODE_ENV := source ~/.nvm/nvm.sh && nvm use 25 >/dev/null

TEST_VAULT   := test-vault
SITE_CONFIG  := docs/current/config/minimal-site.json
OUT_DIR      := out/public
PREVIEW_PORT := 8080

.PHONY: test-vault-build test-vault-run-locally

test-vault-build:
	$(NODE_ENV) && node cli/bin/publish.mjs build $(TEST_VAULT) --config $(SITE_CONFIG) --out $(OUT_DIR)

# Rebuilds first (build is ~2s), then serves with production URL routing on 127.0.0.1.
test-vault-run-locally: test-vault-build
	$(NODE_ENV) && node cli/bin/publish.mjs preview $(OUT_DIR) --port $(PREVIEW_PORT)
