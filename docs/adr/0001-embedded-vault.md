# Embedded vault as SSOT for public DSH installs

- Status: accepted
- Date: 2026-09-08
- Deciders: Florian / Mestryx

## Context

The lab MVP of `dsh-piblox-secrets` wrapped an external `piblox-secrets` CLI over a Mestryx seat DB (`~/piblox/data`). That works for Vega but cannot ship as a public Cordis / DeepSeek Harness plugin.

## Decision

v1 uses an **embedded** SQLite + AES-256-GCM vault under `$DSH_HOME/secrets/` (override: `PIBLOX_SECRETS_DATA_DIR`). The plugin owns crypto, CLI, Cordis `secrets` service, operator HTTP API, and Settings UI.

`storeBackend: piblox-cli` is reserved for a later **jumelage** with an existing Piblox seat; it throws until implemented.

## Consequences

- Public users need no Piblox product install.
- Mestryx dual-store sync is explicit phase 2 (import / CLI adapter), not silent.
- Model tools never write; operator CRUD is UI/CLI only.
