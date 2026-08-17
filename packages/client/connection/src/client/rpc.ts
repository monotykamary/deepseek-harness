/** Browser caller for generic Connection unary RPC channels. */

import {
  RpcId,
  serverResponseSchema,
  type ClientRequest,
} from '@monotykamary/dsh-host-apiproxy/api'
import type { ClientConnectionRpc } from '../rpc.ts'
import { randomUuid } from './random-uuid.ts'

const INTERNAL_BASE = 'http://dsh.internal'
const CHANNEL_PATTERN = /^\/[A-Za-z0-9._~-]+$/
const ENDPOINT_SEGMENT_PATTERN = /^[A-Za-z0-9_$.-]+$/
// Operator bearer token the passkey login page stores: presenting it as
// Authorization admits the operator tier (full access, no session cookie) —
// the browser's equivalent of the CLI sending the token. The literal matches
// OPERATOR_TOKEN_STORAGE_KEY in @monotykamary/dsh-web-identity (a host-only
// package this browser half cannot import).
const OPERATOR_TOKEN_STORAGE_KEY = 'dsh.operatorToken'
// The identity gate's login page: on HTTP 401 the browser navigates there so
// a deny-mode deployment shows the passkey flow instead of a stuck shell.
// 401 only ever means "unauthenticated" — the gate produces no other status.
const AUTH_LOGIN_PATH = '/auth/passkey/login'

/** Browser-local operator token, when the login page stored one. */
function storedOperatorToken(): string | null {
  const storage = (globalThis as { localStorage?: { getItem(key: string): string | null } }).localStorage
  if (storage === undefined) return null
  try {
    const token = storage.getItem(OPERATOR_TOKEN_STORAGE_KEY)
    return token === null || token === '' ? null : token
  } catch {
    // Storage unavailable (privacy mode): no token to attach.
    return null
  }
}

/** Redirect the browser to the identity login page. */
function redirectToLogin(): void {
  const location = (globalThis as { location?: { replace(url: string): void } }).location
  if (location === undefined) return
  location.replace(AUTH_LOGIN_PATH)
}

/**
 * Create the browser-backed generic RPC caller.
 * @returns caller that owns request correlation and response-envelope validation.
 */
export function createWebConnectionRpc(): ClientConnectionRpc {
  return {
    async call(channel, endpoint, payload, signal) {
      assertTarget(channel, endpoint)
      const rpcId = RpcId(randomUuid())
      const message: ClientRequest = {
        type: 'client-request',
        rpcId,
        method: endpoint,
        payload,
      }
      const token = storedOperatorToken()
      const response = await globalThis.fetch(
        new URL(`${channel}/${endpoint}`, resolveBase()),
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...token === null ? {} : { authorization: `Bearer ${token}` },
          },
          body: JSON.stringify(message),
          ...signal === undefined ? {} : { signal },
        },
      )
      if (!response.ok) {
        if (response.status === 401) redirectToLogin()
        throw new Error(`transport failure for ${channel}/${endpoint}: HTTP ${response.status}`)
      }
      const full = serverResponseSchema.parse(await response.json())
      if (full.rpcId !== rpcId) {
        throw new Error(`rpcId mismatch for ${endpoint}: sent ${rpcId}, got ${full.rpcId}`)
      }
      return full.result
    },
  }
}

function resolveBase(): string {
  const location = (globalThis as { location?: { origin?: string } }).location
  return location?.origin !== undefined && location.origin !== 'null' ? location.origin : INTERNAL_BASE
}

function assertTarget(channel: string, endpoint: string): void {
  const segments = endpoint.split('/')
  if (!CHANNEL_PATTERN.test(channel)
    || segments.some(segment =>
      segment === '' || segment === '.' || segment === '..' || !ENDPOINT_SEGMENT_PATTERN.test(segment))) {
    throw new Error(`connection: invalid RPC target ${JSON.stringify(`${channel}/${endpoint}`)}`)
  }
}
