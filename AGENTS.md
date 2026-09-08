# AGENTS.md — dsh-piblox-secrets

Agent guide for this package. Product narrative for humans: [README.md](README.md). Release flow: [docs/runbooks/release.md](docs/runbooks/release.md).

## What this is

Public Cordis / DeepSeek Harness plugin: embedded AES-256-GCM SQLite vault, **Secrets Boundary v1.1**, operator Settings → Secrets UI, bundled skill.

| Plane | Model / agent may see | Surfaces |
|-------|----------------------|----------|
| Agent | Capability ids / hosts only | `secrets_capabilities`, `secrets_discover` |
| Credential | Values | `ctx.secrets.resolve` / `materialize(keys, explicitEnv)` |
| Admin | Values | Settings UI, CLI, HTTP `/api/piblox-secrets/*` |

**Never** expose secret values, `DSH_SECRET_*` handles, or credential env var names to the model by default. `secrets_get` / `secrets_list_names` are **not** in the model catalog unless `exposeSecretsGetTool: true` (break-glass).

## Tool registration (hard requirement)

Cookbook / cleverer shape — anything else silently fails to enter the agent catalog:

```ts
export const inject = ['tools']
ctx.effect(() => ctx.tools.register({ name, description, parameters, output, execute }))
```

One-arg `register(definition)` only. Do not use two-arg `register(name, def)`.

## Git / npm (model B)

```text
feature/* → PR + CI → dev → @next (vX.Y.Z-next.N)
                         → PR → master → @latest (vX.Y.Z)
```

Rules:

1. No direct commits on `dev` / `master` (short `fix/*` PRs OK).
2. `feature/*` → `dev` via PR + green CI.
3. After stable cut, fast-forward `dev` onto `master` immediately.

Default branch name is **`master`** (not `main`).

## Commands

```bash
npm ci
npm test          # build + node:test (Node ≥ 22)
npm run smoke
```

CI installs `devDependency` `@deepseek-ai/schemastery` so `tsc` can resolve the optional settings schema import.

## Lab wire (Mestryx)

- Checkout: `~/dsh-lab/plugins/dsh-piblox-secrets/`
- DSH web profile often uses `file:` — after build, rsync `dist/` into the pnpm store copy if tools/UI look stale; restart `dsh web` on `:3080`.
- New agent **session** required to see newly registered Cordis tools.
- Secrets UI hitting **404** on `/api/piblox-secrets/*` while the Settings page loads = host HTTP routes not registered (soft-inject `webServer` must wait; not a missing SQLite file). CLI still works: `npx dsh-piblox-secrets set KEY value` with `DSH_HOME` / `PIBLOX_SECRETS_DATA_DIR`.

## Do not

- Write secrets into `process.env` for the agent process (`allowProcessEnvMaterialize: false`).
- Treat bash as a secrets tool (`secrets_capabilities` is Cordis, not a shell binary).
- Open `~/.hermes/state.db` or jumelage `~/piblox` in v1 (phase 2).
- Commit tokens, `.env`, or vault keys.

## ADRs

- [0001-embedded-vault.md](docs/adr/0001-embedded-vault.md)
- [0002-secrets-boundary.md](docs/adr/0002-secrets-boundary.md)
