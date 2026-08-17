/**
 * The identity provider that trusts a proxy-set header. Covers every external
 * identity-aware proxy and self-hosted forward-auth with no in-app login flow:
 * the proxy authenticates and forwards the user; dsh reads it.
 *
 * The header is only honored when the request's source IP is inside
 * `trustedProxy` (default `"loopback"` — the common single-box deployment
 * where the proxy runs on the same host as the server, so only loopback can
 * reach it AND forge the header). A request from the proxy with no header
 * resolves to the operator tier (no identity asserted): that is the operator
 * from loopback and the host's own automation, which keep full access — the
 * admin parity a shared gateway needs. So `denyUnauthenticated` is false: a
 * trusted-proxy request with no header is the operator, not a rejection.
 * @module @monotykamary/dsh-web-identity/header-provider
 */

import type { IncomingMessage } from 'node:http'
import {
  IDENTITY_HEADER_DEFAULT,
  IDENTITY_PROXY_DEFAULT,
  IDENTITY_USER_MAX_LENGTH,
} from './constants.ts'
import { createProxyAllowlist, type ProxyAllowlist } from './proxy-allowlist.ts'
import type { HeaderIdentityConfig, Identity, IdentityProvider } from './types.ts'

/**
 * Build the header identity provider.
 * @param config - the validated header configuration.
 * @returns the provider; `routes` is undefined — the proxy owns the login.
 */
export function createHeaderIdentityProvider(config: HeaderIdentityConfig): IdentityProvider {
  const header = config.header?.trim() || IDENTITY_HEADER_DEFAULT
  const allowlist: ProxyAllowlist = createProxyAllowlist(
    config.trustedProxy?.trim() || IDENTITY_PROXY_DEFAULT,
  )
  return {
    kind: 'header',
    denyUnauthenticated: false,
    operatorToken: null,
    identify: (req: IncomingMessage, sourceIp?: string | null): Identity | null => {
      const raw = req.headers[header]
      if (typeof raw !== 'string') return null
      if (sourceIp === null || sourceIp === undefined || !allowlist.contains(sourceIp)) return null
      const user = raw.trim().slice(0, IDENTITY_USER_MAX_LENGTH)
      return user ? { user } : null
    },
  }
}
