import type { SecretsStore } from './index.js'
import {
  DEFAULT_SERVICE_REGISTRY,
  type ServiceDefinition,
} from './service-registry.js'

/** Model-safe capability (no credential env names, no secret handles). */
export interface CapabilityInfo {
  id: string
  host: string
  available: boolean
}

export interface CapabilitiesResult {
  vault: string
  capabilities: CapabilityInfo[]
}

/**
 * Build model-facing capability catalog.
 * Never includes credential variable names or DSH_SECRET_* handles.
 */
export async function buildCapabilitiesResult(
  store: SecretsStore,
  registry: readonly ServiceDefinition[] = DEFAULT_SERVICE_REGISTRY,
  vault = 'default',
): Promise<CapabilitiesResult> {
  const stored = new Set(await store.listNames())
  const capabilities: CapabilityInfo[] = registry.map((def) => ({
    id: def.name,
    host: def.host,
    available: stored.has(def.credential),
  }))
  return { vault, capabilities }
}

/** Admin/operator discover (HTTP UI) — may include credential names. */
export interface DiscoverService {
  name: string
  host: string
  credential: string
  authType: string
}

export interface DiscoverResult {
  vault: string
  services: DiscoverService[]
  available_credentials: string[]
}

export async function buildDiscoverResult(
  store: SecretsStore,
  registry: readonly ServiceDefinition[] = DEFAULT_SERVICE_REGISTRY,
  vault = 'default',
): Promise<DiscoverResult> {
  const stored = new Set(await store.listNames())
  const available_credentials = [...stored].sort((a, b) => a.localeCompare(b))
  const services: DiscoverService[] = []
  for (const def of registry) {
    if (!stored.has(def.credential)) continue
    services.push({
      name: def.name,
      host: def.host,
      credential: def.credential,
      authType: def.authType,
    })
  }
  return { vault, services, available_credentials }
}
