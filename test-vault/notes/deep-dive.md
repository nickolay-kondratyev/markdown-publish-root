---
title: Deep Dive
publish: true
---

# Deep Dive

A deliberately long note: several screens of headings, paragraphs, lists,
code, and a table. It exists so zen mode can be judged on real reading
material — TOC on the right, long lines at full width, scroll behavior.

## Why a build engine and not a server

The engine reads a vault directory and writes a static site directory, and
that is the whole contract. Everything else — hosting, domains, credentials,
tenancy — lives outside the sacred boundary. Keeping the core pure means a
build is reproducible on any machine: same vault in, same site out. It also
means the slowest, flakiest parts of publishing (networks, clouds, caches)
can never leak complexity back into the part that has to be correct.

A second consequence is testability. Because the engine is a function from
directories to directories, the integration suite can run hundreds of builds
against fixture vaults without mocking anything. When a bug appears, the
failing vault IS the reproduction. See [[architecture]] for the component
map, and [[getting-started]] for the one-command workflow.

## The staging pass

Publishing is default-deny. A staging pass copies ONLY publishable files into
a temporary directory, and Quartz never sees anything else:

1. Markdown with `publish: true` frontmatter is included.
2. Markdown under an `includeFolders` entry is included.
3. `publish: false` always wins, regardless of folder.
4. Canvases have no frontmatter, so only folder rules apply.
5. Everything not matched is simply absent from staging.

After the build, a validation pass greps the emitted site for content from
excluded files and fails the build on any hit. Filtering twice sounds
redundant until the first time a template change would have leaked a private
note — the backstop exists because the cost of one leak dwarfs the cost of
one grep.

## Configuration inversion

Users edit `site.json`; the Quartz config is a generated artifact:

```js
const yaml = QuartzConfigGenerator.generateYaml(siteConfig)
runner.writeConfig(yaml) // regenerated EVERY build, never edited
```

The generated file pins the curated plugin set, so an upstream Quartz default
changing under us cannot silently change a customer site. When we want a new
plugin, we add it to the generator — one reviewed diff, one place to look.

## Trade-offs considered

| Option              | Build time | Leak risk | Maintenance    |
| ------------------- | ---------- | --------- | -------------- |
| Fork Quartz         | fast       | low       | high (rebases) |
| Wrap vendored Quartz| fast       | low       | low            |
| Custom generator    | slow       | medium    | very high      |

Wrapping won. The vendored checkout stays byte-identical to its pin, and all
customization flows through two extension surfaces: the generated config and
local plugins. The day an upgrade is needed, the pin moves and the extension
surfaces either still hold or fail loudly in CI.

> The best boundary is the one you never have to explain twice: vault in,
> site out, nothing else crosses.

## Reading list

- [[getting-started]] — install, build, preview in three commands.
- [[architecture]] — the component map and the sacred boundary.
- The visual overview lives on [[main.canvas|the main canvas]].

## Closing notes

Long-form pages are where sidebar chrome costs the most: a 320px explorer and
a 320px graph column squeeze prose into a narrow ribbon on laptop screens.
Zen mode exists for exactly this page — toggle it and the text breathes.
Toggle it again and the full workspace returns, layout intact, scroll
position preserved. Nothing about the page itself changed; only the frame
around it did.
