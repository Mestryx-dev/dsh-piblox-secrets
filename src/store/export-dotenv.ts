import type { SecretsStore } from './index.js'

/** Names that must not be exported into process env at boot. */
export const EXPORT_DENYLIST = ['MISSIONS_ICS_FEED_TOKEN'] as const

const DENYLIST: ReadonlySet<string> = new Set(EXPORT_DENYLIST)

export const INJECTABLE_SECRET_NAME = /^[A-Z][A-Z0-9_]*$/

export function isInjectableSecretName(name: string): boolean {
  return INJECTABLE_SECRET_NAME.test(name) && !DENYLIST.has(name)
}

export function escapeEnvValue(value: string): string {
  if (/[\s#"'$\\]/.test(value)) {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
  }
  return value
}

/** Dotenv lines for injectable secrets. Never logs values. */
export async function exportDotenv(store: SecretsStore): Promise<string[]> {
  const names = await store.listNames()
  const lines: string[] = []
  for (const name of [...names].sort((a, b) => a.localeCompare(b))) {
    if (!isInjectableSecretName(name)) continue
    const value = await store.getSecretValue(name)
    if (value === null) continue
    lines.push(`${name}=${escapeEnvValue(value)}`)
  }
  return lines
}
