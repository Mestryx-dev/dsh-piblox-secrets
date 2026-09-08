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
    // Non-loopback (e.g. dsh.lan behind Traefik): require Origin host match when present
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

export function createHttpHandlers(opts: HttpApiOptions): Array<{
  kind: 'exact' | 'prefix'
  path: string
  handler: Handler
}> {
  const { store, registry, uiEnabled } = opts

  const guard = async (req: IncomingMessage, res: ServerResponse, next: () => Promise<void>) => {
    if (!uiEnabled) {
      json(res, 404, { ok: false, error: 'ui disabled' })
      return
    }
    if (!sameOrigin(req)) {
      json(res, 403, { ok: false, error: 'forbidden: cross-origin' })
      return
    }
    await next()
  }

  const namesHandler: Handler = async (req, res) => {
    await guard(req, res, async () => {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { allow: 'GET' })
        res.end('method not allowed')
        return
      }
      const items = await store.listMeta()
      json(res, 200, { ok: true, items })
    })
  }

  const statusHandler: Handler = async (req, res) => {
    await guard(req, res, async () => {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { allow: 'GET' })
        res.end('method not allowed')
        return
      }
      const st = await store.status()
      json(res, 200, { ok: true, ...st })
    })
  }

  const discoverHandler: Handler = async (req, res) => {
    await guard(req, res, async () => {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { allow: 'GET' })
        res.end('method not allowed')
        return
      }
      const data = await buildDiscoverResult(store, registry)
      json(res, 200, { ok: true, data })
    })
  }

  const collectionHandler: Handler = async (req, res) => {
    await guard(req, res, async () => {
      if (req.method === 'POST') {
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
        try {
          const result = await store.setSecret(body.name, body.value)
          json(res, 201, { ok: true, name: result.name })
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'set failed'
          json(res, 400, { ok: false, error: msg })
        }
        return
      }
      res.writeHead(405, { allow: 'POST' })
      res.end('method not allowed')
    })
  }

  const itemHandler: Handler = async (req, res) => {
    await guard(req, res, async () => {
      const url = new URL(req.url || '/', 'http://localhost')
      const name = decodeURIComponent(url.pathname.slice(`${API_PREFIX}/`.length))
      if (!name || name.includes('/')) {
        json(res, 404, { ok: false, error: 'not found' })
        return
      }
      if (req.method === 'GET') {
        const value = await store.getSecretValue(name)
        if (value === null) {
          json(res, 404, { ok: false, error: 'not found' })
          return
        }
        json(res, 200, { ok: true, name, value })
        return
      }
      if (req.method === 'DELETE') {
        const deleted = await store.deleteSecret(name)
        if (!deleted) {
          json(res, 404, { ok: false, error: 'not found' })
          return
        }
        res.writeHead(204)
        res.end()
        return
      }
      res.writeHead(405, { allow: 'GET, DELETE' })
      res.end('method not allowed')
    })
  }

  return [
    { kind: 'exact', path: `${API_PREFIX}/names`, handler: namesHandler },
    { kind: 'exact', path: `${API_PREFIX}/status`, handler: statusHandler },
    { kind: 'exact', path: `${API_PREFIX}/discover`, handler: discoverHandler },
    { kind: 'exact', path: API_PREFIX, handler: collectionHandler },
    { kind: 'prefix', path: `${API_PREFIX}/`, handler: itemHandler },
  ]
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
