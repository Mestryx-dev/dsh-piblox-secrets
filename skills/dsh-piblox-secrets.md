---
name: dsh-piblox-secrets
description: >-
  Use when a DSH/Cordis agent needs API keys or credentials from the
  dsh-piblox-secrets vault — list/discover names, gated get, env injection.
  Never ask the operator to paste secrets in chat.
whenToUse: >-
  Credential or API key needed; 401/unauthorized from an external host;
  secrets_list_names / secrets_discover / secrets_get tools; operator asks
  where keys are stored or how to add one.
---

# dsh-piblox-secrets — agent usage

Encrypted vault shipped with the **dsh-piblox-secrets** plugin.
Values stay out of model context unless break-glass is explicitly approved.

## Hard rules

1. **Never** ask the operator to paste a secret into chat.
2. **Never** log, echo, retain, or quote secret **values**.
3. Prefer **names + env refs** over plaintext `secrets_get` with `returnValue: true`.
4. If a key is missing → tell the operator to add it in **Settings → Secrets** (or CLI). Do not invent values.

## Tool order

| Step | Tool / action | Returns |
|------|---------------|---------|
| 1 | `secrets_list_names` | Key names only |
| 2 | `secrets_discover` | Host → credential name map (no values) |
| 3 | `secrets_get` | Env ref by default (`DSH_SECRET_<KEY>`). Plaintext only if policy APPROVAL + `returnValue: true` + clear reason |

There is **no** model write/delete tool. CRUD of values is operator-only (UI or CLI).

## When a key is missing

1. Run `secrets_list_names` / `secrets_discover` to confirm.
2. Tell the operator the exact **UPPER_SNAKE_CASE** name to create.
3. Point them to **Settings → Secrets** (sidebar), or:

```bash
npx dsh-piblox-secrets set KEY_NAME '…'
```

4. After they confirm, retry the host call — do not stall asking for paste.

## Vault location (operator)

| Path | Role |
|------|------|
| `$DSH_HOME/secrets/piblox-secrets.db` | SQLite store |
| `$DSH_HOME/secrets/.secrets-key` | AES-256-GCM key (`0600`) |

CLI: `list-names`, `discover --json`, `export --dotenv` (Hermes `secrets.command` parity), `get` (break-glass).

## Anti-patterns

- ❌ Treating this vault as Mestryx `~/piblox` / `piblox-secrets` CLI on the seat (different store)
- ❌ Putting secrets in `cordis.patch.yml`, prompts, or Hindsight retains
- ❌ Calling `secrets_get` with `returnValue: true` “just to check”
- ❌ Retrying an API 5× with a missing key instead of stopping at discover
