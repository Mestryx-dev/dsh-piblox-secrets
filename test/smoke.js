import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSecretsForTest } from '../dist/index.js'

const dir = mkdtempSync(join(tmpdir(), 'dsh-piblox-smoke-'))
const api = createSecretsForTest({ dataDir: dir, bootHosts: ['*'] })
await api.store.setSecret('OPENROUTER_API_KEY', 'smoke-value')
await api.boot()
assert.equal(api.isDegraded(), false)
const disc = await api.discover()
assert.equal(disc.ok, true)
const names = await api.listNames()
assert.equal(names.ok, true)
assert.ok(names.names.includes('OPENROUTER_API_KEY'))
api.store.close()
rmSync(dir, { recursive: true, force: true })
console.log('smoke-secrets: ok', { names: names.names.length })
