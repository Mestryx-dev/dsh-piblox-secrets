/**
 * Operator HTTP routes for Secrets UI (webServer).
 * Never log secret values.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { SecretsStore } from './store/index.js'
import { buildDiscoverResult } from './store/discover.js'
import type { ServiceDefinition } from './store/service-registry.js'

export const API_PREFIX = '/api/piblox-secrets'

type Handler = (req: IncomingMessage, res: ServerResponse) => Promise<void>

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(payload)
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

const LOOPBACK = /^(127\.0\.0\.1|\[::1\]|localhost)(:\d+)?$/i

function sameOrigin(req: IncomingMessage): boolean {
  const host = String(req.headers.host || '')
  if (!LOOPBACK.test(host)) {
    const origin = req.headers.origin
    if (!origin) return true
    try {
      const oh = new URL(String(origin)).host
      return oh === host || LOOPBACK.test(oh)
    } catch {
      return false
    }
  }
  const origin = req.headers.origin
  if (!origin) return true
  try {
    return LOOPBACK.test(new URL(String(origin)).host)
  } catch {
    return false
  }
}

export interface HttpApiOptions {
  store: SecretsStore
  registry: readonly ServiceDefinition[]
  uiEnabled: boolean
}

/** Single prefix router — avoids exact/prefix collisions on item paths. */
export function createHttpHandlers(opts: HttpApiOptions): Array<{
  kind: 'exact' | 'prefix'
  path: string
  handler: Handler
}> {
  const { store, registry, uiEnabled } = opts

  const router: Handler = async (req, res) => {
    if (!uiEnabled) {
      json(res, 404, { ok: false, error: 'ui disabled' })
      return
    }
    if (!sameOrigin(req)) {
      json(res, 403, { ok: false, error: 'forbidden: cross-origin' })
      return
    }

    const url = new URL(req.url || '/', 'http://localhost')
    let rest = url.pathname
    if (rest.startsWith(API_PREFIX)) {
      rest = rest.slice(API_PREFIX.length)
    }
    rest = rest.replace(/^\//, '')
    const method = req.method || 'GET'

    try {
      if ((rest === '' || rest === '/') && method === 'POST') {
        const raw = await readBody(req)
        let body: { name?: string; value?: string }
        try {
          body = JSON.parse(raw) as { name?: string; value?: string }
        } catch {
          json(res, 400, { ok: false, error: 'invalid json' })
          return
        }
        if (!body.name || typeof body.value !== 'string' || !body.value) {
          json(res, 400, { ok: false, error: 'name and value required' })
          return
        }
        const result = await store.setSecret(body.name, body.value)
        json(res, 201, { ok: true, name: result.name })
        return
      }

      if (rest === 'names' && (method === 'GET' || method === 'HEAD')) {
        const items = await store.listMeta()
        json(res, 200, { ok: true, items })
        return
      }

      if (rest === 'status' && (method === 'GET' || method === 'HEAD')) {
        const st = await store.status()
        json(res, 200, { ok: true, ...st })
        return
      }

      if (rest === 'discover' && (method === 'GET' || method === 'HEAD')) {
        const data = await buildDiscoverResult(store, registry)
        json(res, 200, { ok: true, data })
        return
      }

      const name = decodeURIComponent(rest.split('/')[0] || '')
      if (name && !name.includes('/')) {
        if (method === 'GET') {
          const value = await store.getSecretValue(name)
          if (value === null) {
            json(res, 404, { ok: false, error: 'not found' })
            return
          }
          json(res, 200, { ok: true, name, value })
          return
        }
        if (method === 'DELETE') {
          const deleted = await store.deleteSecret(name)
          if (!deleted) {
            json(res, 404, { ok: false, error: 'not found' })
            return
          }
          res.writeHead(204)
          res.end()
          return
        }
      }

      json(res, 404, { ok: false, error: 'not found' })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'internal error'
      // Never include secret values in error responses
      json(res, 500, { ok: false, error: msg.includes('malformed') ? 'decrypt failed' : 'internal error' })
    }
  }

  return [{ kind: 'prefix', path: API_PREFIX, handler: router }]
}

/** Register all routes on a Cordis webServer if present. */
export function registerHttpRoutes(
  webServer: { register: (route: { kind: string; path: string; handler: Handler }) => void } | undefined,
  opts: HttpApiOptions,
): void {
  if (!webServer) return
  for (const route of createHttpHandlers(opts)) {
    webServer.register(route)
  }
}
