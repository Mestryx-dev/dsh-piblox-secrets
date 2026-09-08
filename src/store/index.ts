/**
 * Embedded secrets store — AES-256-GCM values in SQLite.
 */
import path from 'node:path'
import { decryptValue, encryptValue, keyFromEnv, loadOrCreateKey } from './crypto.js'
import { openDb, type SecretsDatabase } from './db.js'

export type SecretName = string

export interface SecretMeta {
  name: SecretName
  createdAt: number
  updatedAt: number
}

export interface SecretsStore {
  setSecret(name: SecretName, value: string): Promise<{ name: SecretName }>
  listNames(): Promise<SecretName[]>
  listMeta(): Promise<SecretMeta[]>
  getSecretValue(name: SecretName): Promise<string | null>
  deleteSecret(name: SecretName): Promise<boolean>
  status(): Promise<{ initialized: boolean; count: number; dataDir: string }>
  close(): void
}

export interface CreateStoreOptions {
  dataDir: string
  dbFileName?: string
  keyEnvVar?: string
}

export function createStore(opts: CreateStoreOptions): SecretsStore {
  const dataDir = opts.dataDir
  const dbPath = path.join(dataDir, opts.dbFileName ?? 'piblox-secrets.db')
  const keyEnv = opts.keyEnvVar ?? 'PIBLOX_SECRETS_KEY'
  const key = keyFromEnv(keyEnv) ?? loadOrCreateKey(path.join(dataDir, '.secrets-key'))
  const db: SecretsDatabase = openDb(dbPath)

  const upsert = db.prepare(`
    INSERT INTO secrets (name, encrypted_value, created_at, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET
      encrypted_value = excluded.encrypted_value,
      updated_at = excluded.updated_at
  `)
  const selectNames = db.prepare(`SELECT name FROM secrets ORDER BY name COLLATE NOCASE`)
  const selectMeta = db.prepare(
    `SELECT name, created_at, updated_at FROM secrets ORDER BY name COLLATE NOCASE`,
  )
  const selectOne = db.prepare(`SELECT encrypted_value FROM secrets WHERE name = ? LIMIT 1`)
  const deleteOne = db.prepare(`DELETE FROM secrets WHERE name = ?`)
  const countStmt = db.prepare(`SELECT COUNT(*) AS n FROM secrets`)

  return {
    async setSecret(name, value) {
      if (!/^[A-Z][A-Z0-9_]*$/.test(name)) {
        throw new Error('secret name must match /^[A-Z][A-Z0-9_]*$/')
      }
      const now = Date.now()
      upsert.run(name, encryptValue(value, key), now, now)
      return { name }
    },

    async listNames() {
      const rows = selectNames.all() as Array<{ name: string }>
      return rows.map((r) => r.name)
    },

    async listMeta() {
      const rows = selectMeta.all() as Array<{
        name: string
        created_at: number
        updated_at: number
      }>
      return rows.map((r) => ({
        name: r.name,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }))
    },

    async getSecretValue(name) {
      const row = selectOne.get(name) as { encrypted_value: string } | undefined
      if (!row) return null
      return decryptValue(row.encrypted_value, key)
    },

    async deleteSecret(name) {
      const result = deleteOne.run(name)
      return Number(result.changes ?? 0) > 0
    },

    async status() {
      const row = countStmt.get() as { n: number }
      return { initialized: true, count: Number(row.n), dataDir }
    },

    close() {
      db.close()
    },
  }
}

/** Resolve default data dir: PIBLOX_SECRETS_DATA_DIR > DSH_HOME/secrets > cwd/data/secrets */
export function resolveDataDir(override?: string): string {
  if (override) return override
  if (process.env.PIBLOX_SECRETS_DATA_DIR) return process.env.PIBLOX_SECRETS_DATA_DIR
  if (process.env.DSH_HOME) return path.join(process.env.DSH_HOME, 'secrets')
  return path.resolve(process.cwd(), 'data', 'secrets')
}

export function getDefaultStore(dataDir?: string): SecretsStore {
  return createStore({ dataDir: resolveDataDir(dataDir) })
}
