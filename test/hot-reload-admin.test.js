import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { createHttpHandlers } from '../dist/http.js'
import { createSecretsForTest } from '../dist/index.js'

function tmpDir() {
  return mkdtempSync(join(tmpdir(), 'dsh-piblox-secrets-hot-'))
}

function mockRes() {
  const chunks = []
  let statusCode = 0
  let headers = {}
  return {
    chunks,
    get statusCode() {
      return statusCode
    },
    writeHead(code, h) {
      statusCode = code
      headers = h || {}
    },
    end(body) {
      if (body) chunks.push(body)
    },
    headers() {
      return headers
    },
    json() {
      return JSON.parse(chunks.join('') || 'null')
    },
  }
}

const allowAdmin = { requestRejection: () => undefined }
const denyAdmin = { requestRejection: () => 401 }

test('set → resolve immediately (hot-reload create)', async () => {
  const dir = tmpDir()
  const api = createSecretsForTest({ dataDir: dir, bootHosts: ['*'] })
  try {
    await api.boot()
    const missing = api.resolve('DISCORD_LAB_BOT_TOKEN')
    assert.equal(missing.ok, false)
    assert.equal(missing.code, 'E_NOT_FOUND_SECRET')

    const set = await api.set('DISCORD_LAB_BOT_TOKEN', 'lab-token-v1')
    assert.equal(set.ok, true)

    const got = api.resolve('DISCORD_LAB_BOT_TOKEN')
    assert.equal(got.ok, true)
    assert.equal(got.value, 'lab-token-v1')
    assert.notEqual(process.env.DISCORD_LAB_BOT_TOKEN, 'lab-token-v1')
  } finally {
    api.store.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('set rotation → resolve returns new value immediately', async () => {
  const dir = tmpDir()
  const api = createSecretsForTest({ dataDir: dir, bootHosts: ['*'] })
  try {
    await api.boot()
    await api.set('DISCORD_LAB_BOT_TOKEN', 'old-token')
    assert.equal(api.resolve('DISCORD_LAB_BOT_TOKEN').value, 'old-token')

    await api.set('DISCORD_LAB_BOT_TOKEN', 'new-token')
    assert.equal(api.resolve('DISCORD_LAB_BOT_TOKEN').value, 'new-token')
    assert.notEqual(process.env.DISCORD_LAB_BOT_TOKEN, 'new-token')
  } finally {
    api.store.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('delete → resolve not-found immediately', async () => {
  const dir = tmpDir()
  const api = createSecretsForTest({ dataDir: dir, bootHosts: ['*'] })
  try {
    await api.boot()
    await api.set('DISCORD_LAB_BOT_TOKEN', 'temp')
    assert.equal(api.resolve('DISCORD_LAB_BOT_TOKEN').ok, true)

    const del = await api.delete('DISCORD_LAB_BOT_TOKEN')
    assert.equal(del.ok, true)
    assert.equal(del.deleted, true)

    const after = api.resolve('DISCORD_LAB_BOT_TOKEN')
    assert.equal(after.ok, false)
    assert.equal(after.code, 'E_NOT_FOUND_SECRET')
  } finally {
    api.store.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('HTTP POST uses secrets.set (resolve hot) + admin allow', async () => {
  const dir = tmpDir()
  const api = createSecretsForTest({ dataDir: dir, bootHosts: ['*'] })
  await api.boot()
  const routes = createHttpHandlers({
    secrets: api,
    registry: [],
    uiEnabled: true,
    adminAuth: allowAdmin,
  })
  const router = routes[0]

  const res = mockRes()
  await router.handler(
    {
      method: 'POST',
      headers: { host: '127.0.0.1:3080' },
      url: '/api/piblox-secrets',
      on(ev, fn) {
        if (ev === 'data') fn(Buffer.from(JSON.stringify({ name: 'DISCORD_LAB_BOT_TOKEN', value: 'via-http' })))
        if (ev === 'end') fn()
      },
    },
    res,
  )
  assert.equal(res.statusCode, 201)
  assert.equal(api.resolve('DISCORD_LAB_BOT_TOKEN').value, 'via-http')

  api.store.close()
  rmSync(dir, { recursive: true, force: true })
})

test('HTTP mutation unauthorized without admin session', async () => {
  const dir = tmpDir()
  const api = createSecretsForTest({ dataDir: dir, bootHosts: ['*'] })
  await api.boot()
  const routes = createHttpHandlers({
    secrets: api,
    registry: [],
    uiEnabled: true,
    adminAuth: denyAdmin,
  })
  const router = routes[0]
  const res = mockRes()
  await router.handler(
    {
      method: 'POST',
      headers: { host: '127.0.0.1:3080' },
      url: '/api/piblox-secrets',
      on(ev, fn) {
        if (ev === 'data') fn(Buffer.from(JSON.stringify({ name: 'X', value: 'y' })))
        if (ev === 'end') fn()
      },
    },
    res,
  )
  assert.equal(res.statusCode, 401)
  assert.equal(api.resolve('X').ok, false)

  api.store.close()
  rmSync(dir, { recursive: true, force: true })
})

test('HTTP mutation fails closed when adminAuth missing', async () => {
  const dir = tmpDir()
  const api = createSecretsForTest({ dataDir: dir, bootHosts: ['*'] })
  await api.boot()
  const routes = createHttpHandlers({
    secrets: api,
    registry: [],
    uiEnabled: true,
  })
  const router = routes[0]
  const res = mockRes()
  await router.handler(
    {
      method: 'POST',
      headers: { host: '127.0.0.1:3080' },
      url: '/api/piblox-secrets',
      on(ev, fn) {
        if (ev === 'data') fn(Buffer.from(JSON.stringify({ name: 'X', value: 'y' })))
        if (ev === 'end') fn()
      },
    },
    res,
  )
  assert.equal(res.statusCode, 503)

  api.store.close()
  rmSync(dir, { recursive: true, force: true })
})

test('HTTP cross-origin mutation denied', async () => {
  const dir = tmpDir()
  const api = createSecretsForTest({ dataDir: dir, bootHosts: ['*'] })
  await api.boot()
  const routes = createHttpHandlers({
    secrets: api,
    registry: [],
    uiEnabled: true,
    adminAuth: allowAdmin,
  })
  const router = routes[0]
  const res = mockRes()
  await router.handler(
    {
      method: 'POST',
      headers: { host: '127.0.0.1:3080', origin: 'https://evil.example' },
      url: '/api/piblox-secrets',
      on(ev, fn) {
        if (ev === 'data') fn(Buffer.from(JSON.stringify({ name: 'X', value: 'y' })))
        if (ev === 'end') fn()
      },
    },
    res,
  )
  assert.equal(res.statusCode, 403)

  api.store.close()
  rmSync(dir, { recursive: true, force: true })
})

test('authorized HTTP DELETE clears resolve immediately', async () => {
  const dir = tmpDir()
  const api = createSecretsForTest({ dataDir: dir, bootHosts: ['*'] })
  await api.boot()
  await api.set('DISCORD_LAB_BOT_TOKEN', 'to-delete')
  const routes = createHttpHandlers({
    secrets: api,
    registry: [],
    uiEnabled: true,
    adminAuth: allowAdmin,
  })
  const router = routes[0]
  const res = mockRes()
  await router.handler(
    {
      method: 'DELETE',
      headers: { host: '127.0.0.1:3080' },
      url: '/api/piblox-secrets/DISCORD_LAB_BOT_TOKEN',
    },
    res,
  )
  assert.equal(res.statusCode, 204)
  assert.equal(api.resolve('DISCORD_LAB_BOT_TOKEN').ok, false)

  api.store.close()
  rmSync(dir, { recursive: true, force: true })
})
