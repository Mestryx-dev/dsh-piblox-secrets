import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { createSecretsForTest } from '../dist/index.js'
import { apply as applyPlugin, name as pluginName } from '../dist/index.js'

function tmpDir() {
  return mkdtempSync(join(tmpdir(), 'dsh-piblox-boundary-'))
}

test('boundary: boot does not leak secrets into process.env', async () => {
  const dir = tmpDir()
  const secret = `boundary-secret-${Date.now()}`
  const api = createSecretsForTest({ dataDir: dir, bootHosts: ['*'] })
  try {
    await api.store.setSecret('OPENROUTER_API_KEY', secret)
    delete process.env.OPENROUTER_API_KEY
    delete process.env.DSH_SECRET_OPENROUTER_API_KEY
    await api.boot()
    assert.equal(api.isDegraded(), false)
    assert.notEqual(process.env.OPENROUTER_API_KEY, secret)
    assert.equal(process.env.DSH_SECRET_OPENROUTER_API_KEY, undefined)
    // Value lives only in vault map
    assert.ok(api.vaultValuesForTest().includes(secret))
    const resolved = api.resolve('OPENROUTER_API_KEY')
    assert.equal(resolved.ok, true)
    assert.equal(resolved.value, secret)
  } finally {
    api.store.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('boundary: materialize refuses process.env by default', async () => {
  const dir = tmpDir()
  const secret = `mat-secret-${Date.now()}`
  const api = createSecretsForTest({ dataDir: dir })
  try {
    await api.store.setSecret('GITHUB_TOKEN', secret)
    await api.boot()
    const denied = api.materialize(['GITHUB_TOKEN'], process.env)
    assert.equal(denied.ok, false)
    assert.equal(denied.code, 'E_POLICY_DENIED_PROCESS_ENV_MATERIALIZE')
    assert.notEqual(process.env.GITHUB_TOKEN, secret)

    const bag = {}
    const ok = api.materialize(['GITHUB_TOKEN'], bag)
    assert.equal(ok.ok, true)
    assert.equal(bag.GITHUB_TOKEN, secret)
  } finally {
    api.store.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('boundary: secretsGet never returns env ref or writes process.env', async () => {
  const dir = tmpDir()
  const secret = `get-secret-${Date.now()}`
  const api = createSecretsForTest({ dataDir: dir })
  try {
    await api.store.setSecret('OPENAI_API_KEY', secret)
    await api.boot()
    const refDenied = await api.secretsGet('OPENAI_API_KEY', 'test')
    assert.equal(refDenied.ok, false)
    assert.equal(refDenied.code, 'E_POLICY_DENIED_SECRETS_GET_ENV_REF')
    assert.equal(process.env.DSH_SECRET_OPENAI_API_KEY, undefined)

    const plainDenied = await api.secretsGet('OPENAI_API_KEY', 'test', { returnValue: true })
    assert.equal(plainDenied.ok, false)
    assert.equal(plainDenied.code, 'E_POLICY_DENIED_SECRETS_GET_PLAINTEXT')
  } finally {
    api.store.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('boundary: model capabilities omit credential env names', async () => {
  const dir = tmpDir()
  const api = createSecretsForTest({ dataDir: dir })
  try {
    await api.store.setSecret('OPENROUTER_API_KEY', 'x')
    await api.boot()
    const cap = await api.capabilities()
    assert.equal(cap.ok, true)
    const blob = JSON.stringify(cap.data)
    assert.ok(!blob.includes('OPENROUTER_API_KEY'))
    assert.ok(!blob.includes('DSH_SECRET_'))
    assert.ok(blob.includes('openrouter'))
    const available = cap.data.capabilities.find((c) => c.id === 'openrouter')
    assert.equal(available.available, true)
  } finally {
    api.store.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('boundary: apply registers capabilities tools, not secrets_get by default', () => {
  const registered = []
  const toolsApi = {
    register(toolName) {
      registered.push(toolName)
    },
  }
  const ctx = {
    logger: { info() {}, warn() {} },
    provide() {},
    get() {
      return undefined
    },
    inject(deps, fn) {
      if (deps.includes('tools')) {
        fn({ tools: toolsApi, effect: (f) => f() })
      }
      if (deps.includes('skills')) {
        // skip
      }
    },
    effect(fn) {
      fn()
    },
  }
  const dir = tmpDir()
  try {
    applyPlugin(ctx, { dataDir: dir, exposeTools: true })
    assert.equal(pluginName, 'dsh-piblox-secrets')
    assert.ok(registered.includes('secrets_capabilities'))
    assert.ok(registered.includes('secrets_discover'))
    assert.ok(!registered.includes('secrets_get'))
    assert.ok(!registered.includes('secrets_list_names'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('boundary: child bash/node cannot see vault secret via inherited env', async () => {
  const dir = tmpDir()
  const secret = `child-leak-${Date.now()}`
  const api = createSecretsForTest({ dataDir: dir })
  try {
    await api.store.setSecret('ANTHROPIC_API_KEY', secret)
    await api.boot()
    // Simulate agent shell inheritance after boot
    const bash = spawnSync('bash', ['-lc', 'printenv | grep -F child-leak || true'], {
      encoding: 'utf8',
      env: { ...process.env },
    })
    assert.equal(bash.status, 0)
    assert.ok(!bash.stdout.includes(secret))

    const node = spawnSync(
      process.execPath,
      ['-e', 'console.log(Object.values(process.env).join("\\n"))'],
      { encoding: 'utf8', env: { ...process.env } },
    )
    assert.equal(node.status, 0)
    assert.ok(!node.stdout.includes(secret))
  } finally {
    api.store.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
