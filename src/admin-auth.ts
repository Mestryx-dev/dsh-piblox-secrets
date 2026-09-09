/**
 * Shared admin HTTP fence for operator routes registered directly on webServer.
 *
 * OBSERVED: @deepseek-ai/dsh-host-webserver has NO server-wide auth
 * (README: "No server-wide TLS, authentication, or origin policy").
 * Canonical guard: ctx.connection.requestRejection (Host/Origin + browser cookie).
 *
 * Same-origin alone is CSRF defense only — never sufficient for credential CRUD.
 */

import type { IncomingMessage } from 'node:http'

export type AdminRejection = 401 | 403

export interface AdminAuthHandle {
  /**
   * Apply Connection Host/Origin fence + browser-session cookie.
   * @returns undefined when allowed; 401 unauthorized; 403 forbidden
   */
  requestRejection(request: { headers: IncomingMessage['headers'] }): AdminRejection | undefined
}

const LOOPBACK_HOST = /^(127\.0\.0\.1|\[::1\]|localhost)(:\d+)?$/i

export function sameOrigin(req: IncomingMessage): boolean {
  const host = String(req.headers.host || '')
  if (!LOOPBACK_HOST.test(host)) {
    const origin = req.headers.origin
    if (!origin) return true
    try {
      const oh = new URL(String(origin)).host
      return oh === host || LOOPBACK_HOST.test(oh)
    } catch {
      return false
    }
  }
  const origin = req.headers.origin
  if (!origin) return true
  try {
    return LOOPBACK_HOST.test(new URL(String(origin)).host)
  } catch {
    return false
  }
}

/**
 * Gate an operator admin request.
 * @returns null when allowed; otherwise HTTP status to return
 */
export function rejectAdminRequest(
  req: IncomingMessage,
  adminAuth: AdminAuthHandle | undefined,
): AdminRejection | 503 | null {
  // CSRF: always require same-origin when Origin is present / loopback posture
  if (!sameOrigin(req)) return 403

  if (!adminAuth || typeof adminAuth.requestRejection !== 'function') {
    // Fail closed: plugin routes must not accept credential CRUD without Connection.
    return 503
  }

  const rejection = adminAuth.requestRejection({ headers: req.headers })
  return rejection ?? null
}
