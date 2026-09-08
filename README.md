# dsh-piblox-secrets

Public [Cordis](https://github.com/shigma/cordis) / [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin: encrypted secrets vault, model tools (names / discover / gated get), and an operator **Secrets** settings card.

## Install

```bash
dsh plugin --profile <name> add dsh-piblox-secrets
# or from a checkout:
dsh plugin --profile <name> add ./dsh-piblox-secrets
```

Requires Node ≥ 22 (built-in `node:sqlite`). Headless profiles work without the web client half.

## Vault location

| Path | Role |
|------|------|
| `$DSH_HOME/secrets/piblox-secrets.db` | SQLite store |
| `$DSH_HOME/secrets/.secrets-key` | AES-256-GCM key (`0600`) |

Overrides: `PIBLOX_SECRETS_DATA_DIR`, `PIBLOX_SECRETS_KEY` (hex).

## CLI

```bash
npx dsh-piblox-secrets set OPENROUTER_API_KEY 'sk-…'
npx dsh-piblox-secrets list-names
npx dsh-piblox-secrets export --dotenv   # Hermes secrets.command parity
npx dsh-piblox-secrets discover --json
```

## Cordis

- Service: `ctx.provide('secrets', api)` — `resolve`, `listNames`, `discover`, `hasKey`, `secretsGet`
- Tools: `secrets_list_names`, `secrets_discover`, `secrets_get` (env ref by default: `DSH_SECRET_<KEY>`)
- No model write tool
- Config (patch): `storeBackend: embedded`, `bootHosts`, `uiEnabled`, …

## Operator UI

Settings → Plugins → **Secrets** (`settings.plugin.item` key `piblox-secrets`).

HTTP (same-origin):

- `GET /api/piblox-secrets/names`
- `GET /api/piblox-secrets/status`
- `GET /api/piblox-secrets/discover`
- `POST /api/piblox-secrets` `{ name, value }`
- `GET|DELETE /api/piblox-secrets/:name`

## Security

- Never log secret values
- Key file mode `0600`
- Do not put secrets in `cordis.patch.yml`
- Client builds must match the host harness client-modules table (see DeepSeek Harness cookbook *adding a settings card*)

## Phase 2 (not in v1)

`storeBackend: piblox-cli` — jumelage with an external Piblox seat CLI / DB. See [docs/adr/0001-embedded-vault.md](docs/adr/0001-embedded-vault.md).

## Develop

```bash
npm install
npm test
npm run smoke
```

## License

MIT
