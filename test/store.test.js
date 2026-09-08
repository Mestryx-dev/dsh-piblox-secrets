import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { createStore } from '../dist/store/index.js'
import { exportDotenv } from '../dist/store/export-dotenv.js'
import { buildDiscoverResult } from '../dist/store/discover.js'
import { encryptValue, decryptValue, generateKey } from '../dist/store/crypto.js'
import { main as cliMain } from '../dist/cli.js'
import { createHttpHandlers } from '../dist/http.js'
import { createSecretsForTest } from '../dist/index.js'
import { PibloxCliBackendNotReadyError, createPibloxCliStore } from '../dist/bridge.js'

function tmpDir() {
  return mkdtempSync(join(tmpdir(), 'dsh-piblox-secrets-'))
}

test('crypto round-trip', () => {
  const key = generateKey()
  const enc = encryptValue('hello-secret', key)
  assert.equal(decryptValue(enc, key), 'hello-secret')
})

test('store CRUD + names only', async () => {
  const dir = tmpDir()
  const store = createStore({ dataDir: dir })
  try {
    await store.setSecret('OPENROUTER_API_KEY', 'sk-test-1')
    await store.setSecret('GITHUB_TOKEN', 'ghp_test')
    const names = await store.listNames()
    assert.deepEqual(names, ['GITHUB_TOKEN', 'OPENROUTER_API_KEY'])
    assert.equal(await store.getSecretValue('OPENROUTER_API_KEY'), 'sk-test-1')
    assert.equal(await store.deleteSecret('GITHUB_TOKEN'), true)
    assert.deepEqual(await store.listNames(), ['OPENROUTER_API_KEY'])
  } finally {
    store.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('export dotenv', async () => {
  const dir = tmpDir()
  const store = createStore({ dataDir: dir })
  try {
    await store.setSecret('OPENAI_API_KEY', 'sk-abc')
    const lines = await exportDotenv(store)
    assert.equal(lines.length, 1)
    assert.match(lines[0], /^OPENAI_API_KEY=/)
    assert.ok(!lines[0].includes('undefined'))
  } finally {
    store.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('discover maps available credentials (admin)', async () => {
  const dir = tmpDir()
  const store = createStore({ dataDir: dir })
  try {
    await store.setSecret('OPENROUTER_API_KEY', 'x')
    const disc = await buildDiscoverResult(store)
    assert.ok(disc.available_credentials.includes('OPENROUTER_API_KEY'))
    assert.ok(disc.services.some((s) => s.credential === 'OPENROUTER_API_KEY'))
    const { buildCapabilitiesResult } = await import('../dist/store/discover.js')
    const caps = await buildCapabilitiesResult(store)
    assert.ok(caps.capabilities.some((c) => c.id === 'openrouter' && c.available))
    assert.ok(!JSON.stringify(caps).includes('OPENROUTER_API_KEY'))
  } finally {
    store.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('cli list-names / set / get', async () => {
  const dir = tmpDir()
  process.env.PIBLOX_SECRETS_DATA_DIR = dir
  const chunks = []
  const code = await cliMain(['set', 'DOKPLOY_API_KEY', 'tok-1'], {
    stdout: (t) => chunks.push(t),
    stderr: () => {},
  })
  assert.equal(code, 0)
  const out = []
  const store = createStore({ dataDir: dir })
  const code2 = await cliMain(
    ['list-names'],
    { stdout: (t) => out.push(t), stderr: () => {} },
    store,
  )
  assert.equal(code2, 0)
  assert.match(out.join(''), /DOKPLOY_API_KEY/)
  rmSync(dir, { recursive: true, force: true })
  delete process.env.PIBLOX_SECRETS_DATA_DIR
})

test('cordis service boot + capabilities (no env leak)', async () => {
  const dir = tmpDir()
  const api = createSecretsForTest({ dataDir: dir, bootHosts: ['*'] })
  await api.store.setSecret('HASS_TOKEN', 'ha-secret')
  delete process.env.HASS_TOKEN
  delete process.env.DSH_SECRET_HASS_TOKEN
  await api.boot()
  assert.equal(api.isDegraded(), false)
  const names = await api.listNames()
  assert.equal(names.ok, true)
  assert.ok(names.names.includes('HASS_TOKEN'))
  const cap = await api.capabilities()
  assert.equal(cap.ok, true)
  assert.ok(!JSON.stringify(cap.data).includes('HASS_TOKEN'))
  assert.notEqual(process.env.HASS_TOKEN, 'ha-secret')
  assert.equal(process.env.DSH_SECRET_HASS_TOKEN, undefined)
  const got = await api.secretsGet('HASS_TOKEN', 'test')
  assert.equal(got.ok, false)
  api.store.close()
  rmSync(dir, { recursive: true, force: true })
})

test('http handlers names + post (no value in list)', async () => {
  const dir = tmpDir()
  const store = createStore({ dataDir: dir })
  const routes = createHttpHandlers({
    store,
    registry: [],
    uiEnabled: true,
  })
  const router = routes.find((r) => r.path === '/api/piblox-secrets')
  assert.ok(router)

  const resChunks = []
  let statusCode = 0
  const res = {
    writeHead(code) {
      statusCode = code
    },
    end(body) {
      if (body) resChunks.push(body)
    },
  }
  await router.handler(
    { method: 'GET', headers: { host: '127.0.0.1:3080' }, url: '/api/piblox-secrets/names' },
    res,
  )
  assert.equal(statusCode, 200)
  const body = JSON.parse(resChunks.join(''))
  assert.equal(body.ok, true)
  assert.deepEqual(body.items, [])

  store.close()
  rmSync(dir, { recursive: true, force: true })
})

test('phase2 piblox-cli backend throws', () => {
  assert.throws(() => createPibloxCliStore('/bin/false', 1000), PibloxCliBackendNotReadyError)
})
