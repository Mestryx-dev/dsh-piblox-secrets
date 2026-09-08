/**
 * Host → credential registry for discover (names only).
 * Defaults are generic; operators extend via config.serviceRegistry.
 */

export type AuthType = 'bearer' | 'x-api-key'

export interface ServiceDefinition {
  name: string
  host: string
  credential: string
  authType: AuthType
  notes?: string
}

/** Sensible public defaults (not Mestryx-only). */
export const DEFAULT_SERVICE_REGISTRY: readonly ServiceDefinition[] = [
  {
    name: 'openrouter',
    host: 'openrouter.ai',
    credential: 'OPENROUTER_API_KEY',
    authType: 'bearer',
  },
  {
    name: 'openai',
    host: 'api.openai.com',
    credential: 'OPENAI_API_KEY',
    authType: 'bearer',
  },
  {
    name: 'anthropic',
    host: 'api.anthropic.com',
    credential: 'ANTHROPIC_API_KEY',
    authType: 'bearer',
  },
  {
    name: 'github',
    host: 'api.github.com',
    credential: 'GITHUB_TOKEN',
    authType: 'bearer',
  },
] as const

export function matchServiceForHost(
  hostname: string,
  registry: readonly ServiceDefinition[] = DEFAULT_SERVICE_REGISTRY,
): ServiceDefinition | undefined {
  const host = hostname.toLowerCase().split(':')[0] ?? ''
  for (const svc of registry) {
    const pattern = svc.host.toLowerCase()
    if (host === pattern || host.endsWith(`.${pattern}`)) return svc
  }
  return undefined
}
