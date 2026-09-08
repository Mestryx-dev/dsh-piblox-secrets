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

export const SETTINGS_NS = 'piblox-secrets'

/**
 * Build Schemastery Config for settings.installSection when the host has
 * @deepseek-ai/schemastery; otherwise return null (skip section — UI card needs it).
 */
export async function loadSettingsSchema(): Promise<{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Config: any
} | null> {
  try {
    // Dynamic import — optional peer; installed as dependency for lab/web.
    const mod = (await import('@deepseek-ai/schemastery')) as {
      default: {
        object: (shape: Record<string, unknown>) => unknown
        string: () => { default: (v: string) => unknown }
        boolean: () => { default: (v: boolean) => unknown }
        array: (inner: unknown) => { default: (v: unknown[]) => unknown }
        union: (vals: string[]) => { default: (v: string) => unknown }
      }
    }
    const z = mod.default
    const Config = z.object({
      storeBackend: z.union(['embedded', 'piblox-cli']).default('embedded'),
      dataDir: z.string().default(''),
      bootHosts: z.array(z.string()).default(['*']),
      getReturnsEnvRef: z.boolean().default(true),
      exposeTools: z.boolean().default(true),
      uiEnabled: z.boolean().default(true),
      degradedMode: z.union(['tools-error', 'fallback-credentials-yaml']).default('tools-error'),
    })
    return { Config }
  } catch {
    return null
  }
}
