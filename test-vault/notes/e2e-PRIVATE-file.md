---
id: docid_privfilee2e0000000001_e
title: E2E Private File
publish: true
---

# E2E Private File

LEAK-SENTINEL-PRIVFILE-7b2e This note declares publish true on purpose: the
file NAME containing "PRIVATE" (case-insensitive) must exclude it anyway, even
though no ancestor folder is private (docs/publish-exclusion.md). The build
must fail if this sentinel appears anywhere in emitted output.
