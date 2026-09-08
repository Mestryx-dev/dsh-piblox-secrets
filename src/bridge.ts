/**
 * Phase-2 jumelage stub — piblox-cli backend not enabled in v1.
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { SecretsStore, SecretMeta } from './store/index.js'

const execFileAsync = promisify(execFile)

export class PibloxCliBackendNotReadyError extends Error {
  constructor(message = 'storeBackend=piblox-cli is reserved for phase 2 jumelage') {
    super(message)
    this.name = 'PibloxCliBackendNotReadyError'
  }
}

/** Documented phase-2 adapter shape (throws until implemented). */
export function createPibloxCliStore(_cliPath: string, _timeoutMs: number): SecretsStore {
  throw new PibloxCliBackendNotReadyError()
}

/**
 * One-shot import helper (phase 2): list names from an external CLI.
 * Safe to call for dry-run discovery; does not write into the embedded store.
 */
export async function listExternalCliNames(
  cliPath: string,
  timeoutMs = 5000,
): Promise<string[]> {
  const { stdout } = await execFileAsync(cliPath, ['list-names'], {
    timeout: timeoutMs,
    maxBuffer: 2 * 1024 * 1024,
    env: process.env,
  })
  return stdout
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
}

export type { SecretMeta }
