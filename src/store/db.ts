/**
 * SQLite secrets table (better-sqlite3, no Drizzle — KISS for public plugin).
 */
import BetterSqlite3 from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

export interface SecretRow {
  id: number
  name: string
  encrypted_value: string
  created_at: number
  updated_at: number
}

export type SecretsDatabase = BetterSqlite3.Database

export function openDb(dbPath: string): SecretsDatabase {
  if (dbPath !== ':memory:') {
    mkdirSync(path.dirname(dbPath), { recursive: true })
  }
  const sqlite = new BetterSqlite3(dbPath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS secrets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      encrypted_value TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `)
  return sqlite
}
