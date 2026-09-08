# dsh-piblox-secrets

Public [Cordis](https://github.com/shigma/cordis) / [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin: encrypted secrets vault, **Secrets Boundary v1.1** (agent plane vs credential plane), operator **Secrets** settings UI.

## Install

```bash
dsh plugin --profile <name> add dsh-piblox-secrets
# or from a checkout:
dsh plugin --profile <name> add ./dsh-piblox-secrets
```

Requires Node ≥ 22 (built-in `node:sqlite`). Headless profiles work without the web client half.

## Secrets Boundary v1.1

Target contract (Credential Worker is the next milestone):

```text
LLM → semantic tool → policy → credential worker → API
```

| Plane | Sees values / env names? | Surfaces |
|-------|--------------------------|----------|
| Agent / model | **No** | `secrets_capabilities`, `secrets_discover` |
| Credential | Yes | `ctx.secrets.resolve` / `materialize` (explicit env object) |
| Admin | Yes | Settings UI, CLI, HTTP |

**Exit criterion:** compromising the LLM transcript and its shell must not reveal a secret value, `DSH_SECRET_*` handle, or reusable credential variable name.

Boot loads the vault into an **in-memory map only** — never into the agent `process.env`. See [docs/adr/0002-secrets-boundary.md](docs/adr/0002-secrets-boundary.md).

## Vault location

| Path | Role |
|------|------|
| `$DSH_HOME/secrets/piblox-secrets.db` | SQLite store |
| `$DSH_HOME/secrets/.secrets-key` | AES-256-GCM key (`0600`) |

Overrides: `PIBLOX_SECRETS_DATA_DIR`, `PIBLOX_SECRETS_KEY` (hex).

## CLI (admin plane)

```bash
npx dsh-piblox-secrets set OPENROUTER_API_KEY 'sk-…'
npx dsh-piblox-secrets list-names
npx dsh-piblox-secrets export --dotenv   # operator / Hermes secrets.command — not agent tools
npx dsh-piblox-secrets discover --json
```

## Cordis

- Service: `ctx.provide('secrets', api)` — `resolve`, `materialize`, `capabilities`, `listNames` (admin), …
- **Model tools:** `secrets_capabilities`, `secrets_discover` (capability ids / hosts only)
- Registration follows DSH cookbook: `inject: ['tools']` + `ctx.effect(() => ctx.tools.register({ name, ... }))`
- **Not registered by default:** `secrets_get`, `secrets_list_names`
- Config: `exposeSecretsGetTool: false`, `allowProcessEnvMaterialize: false`, `bootHosts`, …

## Operator UI

**Settings → Secrets** (sidebar section, same level as General / Models / Plugins).
Also mirrored as a card under Plugins → Plugin configuration.

HTTP (same-origin, admin):

- `GET /api/piblox-secrets/names`
- `GET /api/piblox-secrets/status`
- `GET /api/piblox-secrets/discover`
- `POST /api/piblox-secrets` `{ name, value }`
- `GET|DELETE /api/piblox-secrets/:name`

## Bundled agent skill

Shipped as `skills/dsh-piblox-secrets.md`. Registered via `ctx.skills.register` on apply (not copied to `~/.dsh/skills`). Doctrine matches Boundary v1.1.

## Security

- Never log secret values
- Key file mode `0600`
- Do not put secrets in `cordis.patch.yml`
- Never inherit secrets into bash-bearing agent processes
- Client builds must match the host harness client-modules table

## Phase 2 / next milestones

| Milestone | Status |
|-----------|--------|
| Jumelage `storeBackend: piblox-cli` | deferred ([ADR 0001](docs/adr/0001-embedded-vault.md)) |
| Credential Worker v0 (semantic tool + invisible binding) | next after v1.1 |

## Develop

```bash
npm install
npm test
npm run smoke
```

## License

MIT
