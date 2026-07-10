---
id: docid_4we0he3ljgl9ste90pl2m_e
title: Architecture
publish: true
---

# Architecture

The system is a pure build engine wrapped by a thin CLI.

The engine reads a vault directory and writes a static site directory. ^engine-def

It never talks to AWS, auth, or tenancy — that is the sacred boundary.

Related: [[getting-started]], and the visual overview on [[second.canvas]].
