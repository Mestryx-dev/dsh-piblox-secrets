---
name: dsh-piblox-secrets
description: >-
  Use when a DSH agent needs to know whether an integration capability
  (openrouter, github, …) is available. Never fetch secret values or env handles
  into model context. Secrets Boundary v1.1.
whenToUse: >-
  Checking if an API integration is configured; 401 from a host; operator asks
  how secrets work. Not for retrieving keys.
---

# dsh-piblox-secrets — agent usage (Secrets Boundary v1.1)

Contract:

```text
LLM → semantic tool → policy → credential worker → API
```

The model plane must never see secret **values**, `DSH_SECRET_*` handles, or
credential **variable names** (`OPENROUTER_API_KEY`).

## Hard rules

1. **Never** ask the operator to paste a secret into chat.
2. **Never** call `secrets_get` (removed from normal catalog; break-glass only if host enables it).
3. **Never** instruct shell/`printenv`/Node to read credentials — agent process has none.
4. Prefer **semantic tools** (e.g. future `openrouter.chat`) that bind credentials off-model.
5. If a capability is missing → tell the operator to add it in **Settings → Secrets** (or CLI). Do not invent values.

## Model tools (allowed)

| Tool | Returns |
|------|---------|
| `secrets_capabilities` | Capability ids + availability (`openrouter`, `github`, …) |
| `secrets_discover` | Same capability → host map (no env var names) |

## Forbidden / not for agents

| Surface | Why |
|---------|-----|
| `secrets_get` / env refs | Leaks handles into the transcript |
| `secrets_list_names` | Env var names are reusable handles |
| `process.env` / `printenv` | Agent plane starts without secrets |
| CLI `export --dotenv` / `get` | Admin plane only |

## When a capability is missing

1. Call `secrets_capabilities` / `secrets_discover`.
2. Tell the operator the **capability id** (e.g. `openrouter`), not a guessed env name.
3. Point them to **Settings → Secrets** or admin CLI `dsh-piblox-secrets set …`.
4. After they confirm, retry the **semantic** tool — do not fetch the key yourself.

## Credential plane (not you)

Providers and the future credential worker use `ctx.secrets.resolve` /
`materialize` into an **explicit** env object. That path is invisible to the model.

## Anti-patterns

- ❌ `secrets_get` “just to wire the API”
- ❌ Asking for `OPENROUTER_API_KEY=` in chat
- ❌ Writing secrets into the agent shell environment
- ❌ Treating this vault as Mestryx `~/piblox` (different store until jumelage)
