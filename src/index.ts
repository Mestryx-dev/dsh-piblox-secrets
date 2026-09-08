import { createHash } from 'node:crypto'
import type { PluginConfig } from './config.js'
import { mergeConfig, SETTINGS_NS, loadSettingsSchema } from './config.js'
import { PibloxCliBackendNotReadyError } from './bridge.js'
import { registerHttpRoutes } from './http.js'
import { registerBundledSkill } from './register-skill.js'
import { buildCapabilitiesResult, buildDiscoverResult } from './store/discover.js'
import { exportDotenv } from './store/export-dotenv.js'
import { createStore, resolveDataDir, type SecretsStore } from './store/index.js'

export const name = 'dsh-piblox-secrets'

/** Soft deps — public web installs may lack Core tools/observability at apply time. */
export const inject: string[] = []

function sha256Hex(s: string): string {
  return createHash('sha256').update(String(s)).digest('hex')
}

export interface SecretsService {
  /** Admin/operator — raw vault key names (not model-facing). */
  listNames(): Promise<{ ok: boolean; code?: string; names: string[]; message?: string }>
  /** Admin/operator discover (credential names). Used by HTTP UI. */
  discoverAdmin(): Promise<{ ok: boolean; code?: string; data?: unknown; message?: string }>
  /** Model-facing capabilities (no env var names). */
  capabilities(): Promise<{ ok: boolean; code?: string; data?: unknown; message?: string }>
  /** @deprecated alias of capabilities for older callers expecting discover(). */
  discover(): Promise<{ ok: boolean; code?: string; data?: unknown; message?: string }>
  hasKey(name: string): boolean
  /** Credential-plane: return value for authorized consumers. Never a model tool. */
  resolve(ref: string): { ok: boolean; code?: string; value?: string; message?: string }
  /**
   * Credential-plane: copy keys into an explicit env object.
   * Refuses target === process.env unless allowProcessEnvMaterialize.
   */
  materialize(
    keys: string[],
    target: Record<string, string | undefined>,
  ): { ok: boolean; code?: string; message?: string; applied: string[] }
  /**
   * Break-glass only. Never writes process.env. Model tool gated by exposeSecretsGetTool.
   */
  secretsGet(
    key: string,
    reason: string,
    opts?: { returnValue?: boolean },
  ): Promise<Record<string, unknown>>
  isDegraded(): boolean
  hashes(): string[]
  /** Snapshot of secret values currently in the vault map (tests only). */
  vaultValuesForTest(): string[]
  store: SecretsStore
  boot(): Promise<void>
}

function createSecretsService(
  ctx: { logger?: { info?: (m: string) => void; warn?: (m: string) => void; error?: (m: string) => void } },
  cfg: PluginConfig,
  store: SecretsStore,
  observability?: { emit?: (event: string, payload: unknown, meta?: unknown) => void },
): SecretsService {
  const vault = new Map<string, string>()
  const valueHashes = new Set<string>()
  let degraded = false
  let namesCache = { at: 0, names: [] as string[] }
  let capabilitiesCache = { at: 0, data: null as unknown }
  let adminDiscoverCache = { at: 0, data: null as unknown }
  let resolveCount = { window: Date.now(), n: 0 }

  async function boot(): Promise<void> {
    if (cfg.degradedMode === 'fallback-credentials-yaml') {
      throw new Error('dsh-piblox-secrets: fallback-credentials-yaml rejected at boot')
    }
    try {
      const lines = await exportDotenv(store)
      for (const line of lines) {
        const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
        if (!m) continue
        const key = m[1]!
        let val = m[2]!
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1)
        }
        if (!cfg.bootHosts.includes(key) && !cfg.bootHosts.includes('*')) continue
        // In-memory credential map only — never process.env (Boundary v1.1).
        vault.set(key, val)
        valueHashes.add(sha256Hex(val))
      }
      degraded = false
    } catch (err) {
      degraded = true
      const msg = err instanceof Error ? err.message : String(err)
      ctx.logger?.warn?.(`dsh-piblox-secrets: boot degraded — ${msg}`)
    }
  }

  async function listNames() {
    if (degraded) return { ok: false, code: 'E_TOOL_FAILURE_SECRETS_STORE', names: [] as string[] }
    const now = Date.now()
    if (now - namesCache.at < cfg.cacheTtlSec * 1000 && namesCache.names.length) {
      return { ok: true, names: namesCache.names }
    }
    try {
      const names = await store.listNames()
      namesCache = { at: now, names: [...names].sort() }
      return { ok: true, names: namesCache.names }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return {
        ok: false,
        code: 'E_TOOL_FAILURE_SECRETS_STORE',
        message,
        names: [...vault.keys()],
      }
    }
  }

  async function capabilities() {
    if (degraded) return { ok: false, code: 'E_TOOL_FAILURE_SECRETS_STORE' }
    const now = Date.now()
    if (now - capabilitiesCache.at < cfg.cacheTtlSec * 1000 && capabilitiesCache.data) {
      return { ok: true, data: capabilitiesCache.data }
    }
    try {
      const data = await buildCapabilitiesResult(store, cfg.serviceRegistry)
      capabilitiesCache = { at: now, data }
      return { ok: true, data }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { ok: false, code: 'E_TOOL_FAILURE_SECRETS_STORE', message }
    }
  }

  async function discoverAdmin() {
    if (degraded) return { ok: false, code: 'E_TOOL_FAILURE_SECRETS_STORE' }
    const now = Date.now()
    if (now - adminDiscoverCache.at < cfg.cacheTtlSec * 1000 && adminDiscoverCache.data) {
      return { ok: true, data: adminDiscoverCache.data }
    }
    try {
      const data = await buildDiscoverResult(store, cfg.serviceRegistry)
      adminDiscoverCache = { at: now, data }
      return { ok: true, data }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { ok: false, code: 'E_TOOL_FAILURE_SECRETS_STORE', message }
    }
  }

  function hasKey(n: string): boolean {
    return vault.has(n) || namesCache.names.includes(n)
  }

  function resolve(ref: string) {
    const now = Date.now()
    if (now - resolveCount.window > 60_000) {
      resolveCount = { window: now, n: 0 }
    }
    resolveCount.n += 1
    if (resolveCount.n > cfg.resolvePerMinute) {
      return { ok: false, code: 'E_TOOL_FAILURE_SECRETS_STORE', message: 'resolve rate limit' }
    }
    if (!vault.has(ref)) return { ok: false, code: 'E_NOT_FOUND_SECRET' }
    observability?.emit?.('tool.called', { key_name: ref, via: 'secrets.resolve' }, { source: 'secrets' })
    return { ok: true, value: vault.get(ref) }
  }

  function materialize(
    keys: string[],
    target: Record<string, string | undefined>,
  ): { ok: boolean; code?: string; message?: string; applied: string[] } {
    if (target === process.env && !cfg.allowProcessEnvMaterialize) {
      return {
        ok: false,
        code: 'E_POLICY_DENIED_PROCESS_ENV_MATERIALIZE',
        message:
          'Refusing to write secrets into process.env (agent shell inheritance). Pass an explicit env object.',
        applied: [],
      }
    }
    const applied: string[] = []
    for (const key of keys) {
      const val = vault.get(key)
      if (val == null) continue
      target[key] = val
      applied.push(key)
    }
    return { ok: true, applied }
  }

  async function secretsGet(key: string, reason: string, opts: { returnValue?: boolean } = {}) {
    if (!reason) {
      return { ok: false, code: 'E_POLICY_DENIED_SECRETS_GET_NO_REASON', message: 'reason required' }
    }
    // Boundary v1.1: never mint DSH_SECRET_* into process.env or return env handles.
    if (!opts.returnValue) {
      return {
        ok: false,
        code: 'E_POLICY_DENIED_SECRETS_GET_ENV_REF',
        message:
          'Env-ref get is removed (Secrets Boundary v1.1). Use credential-plane resolve/materialize or semantic tools.',
      }
    }
    if (!cfg.allowBreakGlassPlaintext) {
      return {
        ok: false,
        code: 'E_POLICY_DENIED_SECRETS_GET_PLAINTEXT',
        message: 'Plaintext get disabled. Enable allowBreakGlassPlaintext only for admin break-glass.',
      }
    }
    let val = vault.get(key)
    if (val == null) {
      val = (await store.getSecretValue(key)) ?? undefined
      if (val != null) {
        vault.set(key, val)
        valueHashes.add(sha256Hex(val))
      }
    }
    if (val == null) return { ok: false, code: 'E_NOT_FOUND_SECRET' }
    observability?.emit?.(
      'tool.called',
      { key_name: key, via: 'secrets.get.breakglass', reason },
      { source: 'secrets' },
    )
    return { ok: true, value: val, key, value_returned: true }
  }

  return {
    boot,
    listNames,
    discoverAdmin,
    capabilities,
    discover: capabilities,
    hasKey,
    resolve,
    materialize,
    secretsGet,
    isDegraded: () => degraded,
    hashes: () => [...valueHashes],
    vaultValuesForTest: () => [...vault.values()],
    store,
  }
}

export function apply(
  ctx: {
    logger?: { info?: (m: string) => void; warn?: (m: string) => void; error?: (m: string) => void }
    provide: (name: string, api: unknown) => void
    inject?: (deps: string[], fn: (c: unknown) => void) => void
    get?: (name: string) => unknown
    effect?: (fn: () => (() => void) | void, label?: string) => void
  },
  config: Partial<PluginConfig> = {},
): void {
  const cfg = mergeConfig(config)

  if (cfg.storeBackend === 'piblox-cli') {
    throw new PibloxCliBackendNotReadyError(
      'storeBackend=piblox-cli is phase 2; use embedded for v1',
    )
  }

  const get = (key: string) => (typeof ctx.get === 'function' ? ctx.get(key) : undefined)
  const observability = get('observability') as
    | { emit?: (event: string, payload: unknown, meta?: unknown) => void }
    | undefined

  const dataDir = resolveDataDir(cfg.dataDir)
  const store = createStore({ dataDir })
  const api = createSecretsService(ctx, cfg, store, observability)

  void api.boot().then(() => {
    ctx.logger?.info?.(
      `dsh-piblox-secrets: ready degraded=${api.isDegraded()} keys=${api.hashes().length} dataDir=${dataDir}`,
    )
  })

  ctx.provide('secrets', api)

  // Bundled agent skill via registry (not copied to ~/.dsh/skills).
  // Prefer inject so we wait for dsh-skill even if this plugin boots earlier.
  if (typeof ctx.inject === 'function') {
    try {
      ctx.inject(['skills'], (sctx: unknown) => {
        const scoped = sctx as { skills?: unknown }
        registerBundledSkill({
          logger: ctx.logger,
          effect: ctx.effect,
          get: (name) => (name === 'skills' ? scoped.skills : get(name)),
        })
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      ctx.logger?.warn?.(`dsh-piblox-secrets: skill inject ${msg}`)
      registerBundledSkill(ctx)
    }
  } else {
    registerBundledSkill(ctx)
  }

  // Model tools — defer until tools service exists (host apply often runs before
  // @deepseek-ai/dsh-tools). Soft get() at apply time silently skipped registration
  // → agent saw "unknown tool secrets_capabilities" (session-edd48c70).
  if (cfg.exposeTools) {
    const registerModelTools = (toolsCtx: {
      tools?: { register?: (name: string, def: unknown) => void }
      effect?: (fn: () => (() => void) | void, label?: string) => void
      logger?: { info?: (m: string) => void; warn?: (m: string) => void }
    }) => {
      const register = toolsCtx.tools?.register
      if (typeof register !== 'function') {
        ctx.logger?.warn?.('dsh-piblox-secrets: tools.register missing after inject')
        return
      }
      const run = () => {
        try {
          register('secrets_capabilities', {
            description:
              'List available credential capabilities (ids like openrouter, github). No secret values or env var names.',
            parameters: { type: 'object', properties: {} },
            execute: async () => api.capabilities(),
          })
          register('secrets_discover', {
            description:
              'Capability → host map for available integrations. No credential env names or secret handles.',
            parameters: { type: 'object', properties: {} },
            execute: async () => api.capabilities(),
          })
          if (cfg.exposeSecretsGetTool) {
            register('secrets_get', {
              description:
                'BREAK-GLASS admin only. Does not write process.env. Plaintext requires allowBreakGlassPlaintext.',
              parameters: {
                type: 'object',
                properties: {
                  key: { type: 'string' },
                  reason: { type: 'string' },
                  returnValue: { type: 'boolean' },
                },
                required: ['key', 'reason'],
              },
              execute: async ({
                key,
                reason,
                returnValue,
              }: {
                key: string
                reason: string
                returnValue?: boolean
              }) => api.secretsGet(key, reason, { returnValue }),
            })
          }
          ctx.logger?.info?.(
            `dsh-piblox-secrets: model tools registered (get=${cfg.exposeSecretsGetTool})`,
          )
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          ctx.logger?.warn?.(`dsh-piblox-secrets: tool register ${msg}`)
        }
      }
      if (typeof toolsCtx.effect === 'function') {
        toolsCtx.effect(() => run(), 'dsh-piblox-secrets: tools')
      } else {
        run()
      }
    }

    if (typeof ctx.inject === 'function') {
      try {
        ctx.inject(['tools'], (tctx: unknown) => {
          registerModelTools(tctx as Parameters<typeof registerModelTools>[0])
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        ctx.logger?.warn?.(`dsh-piblox-secrets: tools inject ${msg}`)
        const tools = get('tools') as { register?: (name: string, def: unknown) => void } | undefined
        if (tools?.register) registerModelTools({ tools, effect: ctx.effect, logger: ctx.logger })
      }
    } else {
      const tools = get('tools') as { register?: (name: string, def: unknown) => void } | undefined
      if (tools?.register) registerModelTools({ tools, effect: ctx.effect, logger: ctx.logger })
      else ctx.logger?.info?.('dsh-piblox-secrets: tools absent — model tools skipped')
    }
  }

  // Settings section when host provides settings + schemastery
  if (typeof ctx.inject === 'function') {
    void loadSettingsSchema().then((schema) => {
      if (!schema) {
        ctx.logger?.warn?.('dsh-piblox-secrets: schemastery unavailable — Secrets settings card skipped')
        return
      }
      try {
        ctx.inject!(['settings'], (sctx: unknown) => {
          const settingsCtx = sctx as { settings?: { installSection?: Function } }
          settingsCtx.settings?.installSection?.(ctx, SETTINGS_NS, schema.Config, cfg, {
            setSource: () => {},
            onChange: () => {},
          })
          ctx.logger?.info?.('dsh-piblox-secrets: settings section piblox-secrets installed')
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        ctx.logger?.warn?.(`dsh-piblox-secrets: settings install ${msg}`)
      }
    })
  }

  if (cfg.uiEnabled) {
    const webServer = get('webServer') as
      | { register: (route: { kind: string; path: string; handler: Function }) => void }
      | undefined
    registerHttpRoutes(webServer, {
      store,
      registry: cfg.serviceRegistry,
      uiEnabled: cfg.uiEnabled,
    })
  }
}

export function createSecretsForTest(overrides: Partial<PluginConfig> & { dataDir: string }): SecretsService {
  const cfg = mergeConfig(overrides)
  const store = createStore({ dataDir: overrides.dataDir })
  return createSecretsService({ logger: console }, cfg, store, { emit() {} })
}

export { mergeConfig, SETTINGS_NS, DEFAULT_CONFIG } from './config.js'
export { createStore, resolveDataDir, getDefaultStore } from './store/index.js'
export { buildDiscoverResult, buildCapabilitiesResult } from './store/discover.js'
export { exportDotenv } from './store/export-dotenv.js'
export { createHttpHandlers, API_PREFIX } from './http.js'
export { PibloxCliBackendNotReadyError, listExternalCliNames } from './bridge.js'
