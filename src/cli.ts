#!/usr/bin/env node
/**
 * CLI: dsh-piblox-secrets <command>
 */
import { buildDiscoverResult } from './store/discover.js'
import { exportDotenv } from './store/export-dotenv.js'
import { getDefaultStore, type SecretsStore } from './store/index.js'
import { DEFAULT_SERVICE_REGISTRY } from './store/service-registry.js'

export interface CliIo {
  stdout: (text: string) => void
  stderr: (text: string) => void
}

export const USAGE = `Usage: dsh-piblox-secrets <command> [options]

Commands:
  export --dotenv       Print injectable secrets as KEY=VALUE
  list-names            Print stored secret names (one per line)
  get <KEY>             Print a single secret value to stdout
  set <KEY> <VALUE>     Create or rotate a secret
  delete <KEY>          Delete a secret
  discover --json       JSON discover payload (services + credential names)
  status                Vault status (names count, data dir)

Env:
  DSH_HOME                 default data under $DSH_HOME/secrets
  PIBLOX_SECRETS_DATA_DIR  override data directory
  PIBLOX_SECRETS_KEY       optional hex key (else .secrets-key file)

Values are never logged. Empty store -> list-names empty, export fail-open.
`

const DEFAULT_IO: CliIo = {
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
}

export async function main(
  argv: string[] = process.argv.slice(2),
  io: CliIo = DEFAULT_IO,
  store: SecretsStore = getDefaultStore(),
): Promise<number> {
  const [command, ...rest] = argv
  if (!command) {
    io.stderr(USAGE)
    return 1
  }

  try {
    switch (command) {
      case 'export': {
        if (rest[0] !== '--dotenv') {
          io.stderr(USAGE)
          return 1
        }
        const lines = await exportDotenv(store)
        if (lines.length > 0) io.stdout(`${lines.join('\n')}\n`)
        return 0
      }
      case 'list-names': {
        const names = await store.listNames()
        if (names.length > 0) io.stdout(`${names.join('\n')}\n`)
        return 0
      }
      case 'get': {
        const key = rest[0]
        if (!key) {
          io.stderr('get: KEY required\n')
          return 1
        }
        const value = await store.getSecretValue(key)
        if (value === null) {
          io.stderr(`secret not found: ${key}\n`)
          return 1
        }
        io.stdout(value)
        return 0
      }
      case 'set': {
        const key = rest[0]
        const value = rest.slice(1).join(' ')
        if (!key || !value) {
          io.stderr('set: KEY and VALUE required\n')
          return 1
        }
        await store.setSecret(key, value)
        io.stdout(`${key}\n`)
        return 0
      }
      case 'delete': {
        const key = rest[0]
        if (!key) {
          io.stderr('delete: KEY required\n')
          return 1
        }
        const ok = await store.deleteSecret(key)
        if (!ok) {
          io.stderr(`secret not found: ${key}\n`)
          return 1
        }
        return 0
      }
      case 'discover': {
        if (rest[0] !== '--json') {
          io.stderr('discover: use --json\n')
          return 1
        }
        const result = await buildDiscoverResult(store, DEFAULT_SERVICE_REGISTRY)
        io.stdout(`${JSON.stringify(result, null, 2)}\n`)
        return 0
      }
      case 'status': {
        const st = await store.status()
        io.stdout(`${JSON.stringify(st)}\n`)
        return 0
      }
      default:
        io.stderr(USAGE)
        return 1
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    io.stderr(`${msg}\n`)
    return 1
  } finally {
    store.close()
  }
}

const isDirect =
  process.argv[1] &&
  (process.argv[1].endsWith('cli.js') || process.argv[1].endsWith('cli.ts'))

if (isDirect) {
  main().then((code) => process.exit(code))
}
