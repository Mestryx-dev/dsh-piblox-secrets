import type { ServiceDefinition } from './store/service-registry.js'
import { DEFAULT_SERVICE_REGISTRY } from './store/service-registry.js'

/** storeBackend: embedded (v1) | piblox-cli (phase 2 jumelage) */
export type StoreBackend = 'embedded' | 'piblox-cli'

export interface PluginConfig {
  storeBackend: StoreBackend
  dataDir?: string
  /** Absolute path to piblox-secrets CLI when storeBackend=piblox-cli (phase 2). */
  cliPath?: string
  cliTimeoutMs: number
  bootHosts: string[]
  getReturnsEnvRef: true | boolean
  cacheTtlSec: number
  resolvePerMinute: number
  degradedMode: 'tools-error' | 'fallback-credentials-yaml'
  exposeTools: boolean
  uiEnabled: boolean
  serviceRegistry: ServiceDefinition[]
  envRefPrefix: string
}

export const DEFAULT_CONFIG: PluginConfig = {
  storeBackend: 'embedded',
  cliTimeoutMs: 5000,
  bootHosts: ['*'],
  getReturnsEnvRef: true,
  cacheTtlSec: 300,
  resolvePerMinute: 30,
  degradedMode: 'tools-error',
  exposeTools: true,
  uiEnabled: true,
  serviceRegistry: [...DEFAULT_SERVICE_REGISTRY],
  envRefPrefix: 'DSH_SECRET_',
}

export function mergeConfig(partial: Partial<PluginConfig> = {}): PluginConfig {
  return {
    ...DEFAULT_CONFIG,
    ...partial,
    serviceRegistry: partial.serviceRegistry ?? DEFAULT_CONFIG.serviceRegistry,
    bootHosts: partial.bootHosts ?? DEFAULT_CONFIG.bootHosts,
  }
}

/** Minimal schemastery-compatible shape for installSection when available. */
export function buildConfigSchema(): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      storeBackend: { type: 'string', default: 'embedded' },
      dataDir: { type: 'string' },
      cliPath: { type: 'string' },
      bootHosts: { type: 'array', items: { type: 'string' }, default: ['*'] },
      getReturnsEnvRef: { type: 'boolean', default: true },
      exposeTools: { type: 'boolean', default: true },
      uiEnabled: { type: 'boolean', default: true },
      degradedMode: { type: 'string', default: 'tools-error' },
    },
  }
}

export const SETTINGS_NS = 'piblox-secrets'
