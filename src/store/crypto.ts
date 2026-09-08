/**
 * At-rest encryption for dsh-piblox-secrets.
 * AES-256-GCM, 12-byte IV, 32-byte key. Never log plaintext values.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

export const KEY_LENGTH = 32
const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const SEPARATOR = '.'

export function generateKey(): Buffer {
  return randomBytes(KEY_LENGTH)
}

/** Load the key file, or create it once with 0600 permissions. */
export function loadOrCreateKey(keyFile: string): Buffer {
  if (existsSync(keyFile)) {
    const key = readFileSync(keyFile)
    if (key.length !== KEY_LENGTH) {
      throw new Error(
        `dsh-piblox-secrets: key file ${keyFile} has invalid length ${key.length} (expected ${KEY_LENGTH})`,
      )
    }
    return key
  }
  const key = generateKey()
  mkdirSync(path.dirname(keyFile), { recursive: true })
  writeFileSync(keyFile, key, { mode: 0o600 })
  return key
}

/** Read a hex key from an env var (optional `hex:` prefix). */
export function keyFromEnv(envVar: string): Buffer | null {
  const raw = process.env[envVar]
  if (!raw) return null
  const hex = raw.startsWith('hex:') ? raw.slice('hex:'.length) : raw
  const key = Buffer.from(hex, 'hex')
  if (key.length !== KEY_LENGTH) {
    throw new Error(
      `dsh-piblox-secrets: ${envVar} must be ${KEY_LENGTH * 2} hex characters (got ${hex.length})`,
    )
  }
  return key
}

export function encryptValue(value: string, key: Buffer): string {
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return [iv.toString('base64'), authTag.toString('base64'), ciphertext.toString('base64')].join(
    SEPARATOR,
  )
}

export function decryptValue(payload: string, key: Buffer): string {
  const parts = payload.split(SEPARATOR)
  if (parts.length !== 3) {
    throw new Error('dsh-piblox-secrets: malformed encrypted payload')
  }
  const [ivB64, authTagB64, ciphertextB64] = parts
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(authTagB64, 'base64'))
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, 'base64')),
    decipher.final(),
  ])
  return plaintext.toString('utf8')
}
