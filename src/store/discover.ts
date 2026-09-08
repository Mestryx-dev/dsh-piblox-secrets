import type { SecretsStore } from './index.js'
import {
  DEFAULT_SERVICE_REGISTRY,
  type AuthType,
  type ServiceDefinition,
} from './service-registry.js'

export interface DiscoverService {
  name: string
  host: string
  credential: string
  authType: AuthType
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
