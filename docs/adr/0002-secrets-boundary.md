# Secrets Boundary v1.1 — agent plane vs credential plane

- Status: accepted
- Date: 2026-09-08
- Deciders: Florian / Mestryx
- Milestone: Secrets Boundary v1.1 (A+B). Credential Worker v0 spike = **C** (next, not parallel).

## Context

v1 exposed model tools `secrets_list_names`, `secrets_discover`, and `secrets_get`. Even when `secrets_get` returned an env ref (`DSH_SECRET_<KEY>`), that **handle** entered the LLM transcript. Writing the value into `process.env` of the agent process also leaked credentials to any bash/Node/Python child (default env inheritance).

Hermes/`secrets.command` injects at boot into a process — correct for deterministic providers — but unsafe when that same process exposes arbitrary shell.

Exit criterion for v1.1:

> Compromising the full LLM context and its shell must not allow reading, naming, or obtaining a reusable handle to a credential.

## Decision Drivers

1. No secret **value**, env ref (`DSH_SECRET_*`), or credential **variable name** in model context.
2. Runtimes that expose bash/arbitrary code start **without** inherited secrets.
3. Operators still CRUD via Settings UI / CLI / HTTP (admin plane).
4. Keep a clear path to Credential Worker (C): semantic tool → policy → worker → API.
5. YAGNI: do not ship the worker in this slice.

## Considered Options

1. Keep `secrets_get` + env refs (status quo) — rejected (transcript + shell leak).
2. Boot-inject all secrets into agent `process.env` (Hermes-like) — rejected for bash-bearing agents.
3. **Secrets Boundary v1.1** — model sees capabilities only; vault resolve/materialize is credential-plane only; no model `get`.
4. Full sidecar proxy now (C) — deferred; needs this boundary first.

## Decision Outcome

Chosen option: **3**.

### Target contract (frozen)

```text
LLM  →  semantic tool  →  policy  →  credential worker  →  API
```

Planes:

| Plane | May see values / env names | Surfaces |
|-------|----------------------------|----------|
| **Agent / model** | No | Tools: capabilities only; skill doctrine |
| **Credential** | Yes | `ctx.secrets.resolve` / `materialize`; future worker; providers |
| **Admin / operator** | Yes (UI gated) | Settings, CLI, HTTP `/api/piblox-secrets` |

### Model-facing tools (v1.1)

| Tool | Returns |
|------|---------|
| `secrets_capabilities` | Capability ids present in vault (`openrouter`, `github`, …) — **not** `OPENROUTER_API_KEY` |
| `secrets_discover` | Capability → host map — **no** `credential` field, no `DSH_SECRET_*` |

**Removed** from model catalog: `secrets_get`, `secrets_list_names` (names were reusable handles).

### Runtime rules

1. Boot loads the vault into an **in-memory credential map** only.
2. **Never** write secret values into the agent process `process.env` (boot or get).
3. `secrets.resolve(name)` / `secrets.materialize(keys, targetEnv)` are **credential-plane** APIs for authorized consumers (providers, future worker). Callers that need a subprocess with secrets must pass an **explicit** env object — not inherit the agent env.
4. CLI `export --dotenv` / `get` remain **admin** surfaces (operator machine), not agent tools.
5. Absolute: any composition exposing bash/code must start without secret inheritance from this plugin.

### Next milestone (not this ADR)

**Credential Worker v0**: one semantic tool (e.g. `openrouter.chat`) with invisible `credential_binding`; worker holds `process.env.OPENROUTER_API_KEY`; model never names the key.

## Consequences

- Breaking change for agents that called `secrets_get` / `secrets_list_names`.
- Skill `dsh-piblox-secrets` rewritten for capabilities-only normal path.
- Regression tests assert agent `process.env` / tool payloads cannot reveal values or env handles.
- Providers that previously relied on `DSH_SECRET_*` in process env must switch to `resolve` / `materialize` or wait for worker (C).
