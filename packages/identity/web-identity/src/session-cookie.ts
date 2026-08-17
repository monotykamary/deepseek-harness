/**
 * Signed session cookie for the passkey provider: `base64url(payload).
 * base64url(hmac)` with payload `{ sub, exp }` (epoch ms), HMAC-SHA256 over
 * the payload segment with a persisted secret. A tampered token fails the
 * constant-time compare. After a passkey login the browser keeps the cookie,
 * so every new tab and the WS upgrade re-authenticate without a prompt.
 * @module @monotykamary/dsh-web-identity/session-cookie
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  AUTH_COOKIE_MAX_AGE_SECONDS,
  AUTH_COOKIE_NAME,
  AUTH_SECRET_BYTES,
} from './constants.ts'

interface SessionPayload {
  sub: string
  exp: number
}

function sign(secret: string, data: string): string {
  return createHmac('sha256', secret).update(data).digest('base64url')
}

/**
 * Generate a fresh random HMAC secret.
 * @returns the base64url secret.
 */
export function generateAuthSecret(): string {
  return randomBytes(AUTH_SECRET_BYTES).toString('base64url')
}

/**
 * Read the persisted HMAC secret, generating and persisting a fresh one on
 * the first run. Losing the file invalidates every live session (users
 * re-log in), which is the correct failure mode — never silently reuse a
 * weak or absent key.
 * @param filePath - the secret file.
 * @returns the persisted secret.
 */
export function loadOrCreateAuthSecret(filePath: string): string {
  try {
    const existing = readFileSync(filePath, 'utf8').trim()
    if (existing) return existing
  } catch {
    /* no file yet */
  }
  const secret = generateAuthSecret()
  mkdirSync(dirname(filePath), { recursive: true })
  const tmpPath = filePath + '.tmp'
  writeFileSync(tmpPath, secret, { encoding: 'utf8', mode: 0o600 })
  renameSync(tmpPath, filePath)
  return secret
}

/**
 * Sign a fresh session token for a user.
 * @param secret - the HMAC secret.
 * @param user - the identity user the token names.
 * @returns the cookie token.
 */
export function signSessionToken(secret: string, user: string): string {
  const payload: SessionPayload = {
    sub: user,
    exp: Date.now() + AUTH_COOKIE_MAX_AGE_SECONDS * 1000,
  }
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return data + '.' + sign(secret, data)
}

/**
 * Verify a session token.
 * @param secret - the HMAC secret.
 * @param token - the cookie token.
 * @returns the token's user, or null when it is tampered, expired, or malformed.
 */
export function verifySessionToken(secret: string, token: string): string | null {
  const dot = token.lastIndexOf('.')
  if (dot <= 0) return null
  const data = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  const expected = sign(secret, data)
  const sigBytes = Buffer.from(sig)
  const expectedBytes = Buffer.from(expected)
  if (sigBytes.length !== expectedBytes.length || !timingSafeEqual(sigBytes, expectedBytes)) {
    return null
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'))
    if (typeof parsed !== 'object' || parsed === null) return null
    const payload = parsed as Partial<SessionPayload>
    if (typeof payload.sub !== 'string' || typeof payload.exp !== 'number') return null
    if (payload.exp < Date.now()) return null
    return payload.sub
  } catch {
    return null
  }
}

// A cookie is Secure only when the browser's own origin is https — read from
// the Origin header the browser sends on the fetch (most reliable), with the
// request URL and x-forwarded-proto as fallbacks for a TLS-terminating proxy.
// On plain loopback HTTP we omit Secure (the cookie still works; loopback is
// the trusted surface) so the cookie is settable on every dsh surface.
function isSecureRequest(req: IncomingMessage): boolean {
  const origin = req.headers.origin
  if (typeof origin === 'string' && origin.startsWith('https://')) return true
  const forwardedProto = req.headers['x-forwarded-proto']
  return typeof forwardedProto === 'string' && forwardedProto.includes('https')
}

function cookieHeader(req: IncomingMessage, value: string, maxAge: number): string {
  const parts = [
    AUTH_COOKIE_NAME + '=' + value,
    'Path=/',
    'SameSite=Lax',
    'HttpOnly',
    'Max-Age=' + String(maxAge),
  ]
  if (isSecureRequest(req)) parts.push('Secure')
  return parts.join('; ')
}

/**
 * Write the session cookie onto a response.
 * @param req - the request (its headers decide the Secure flag).
 * @param res - the response carrying the Set-Cookie header.
 * @param secret - the HMAC secret.
 * @param user - the user to sign in.
 */
export function setSessionCookie(
  req: IncomingMessage, res: ServerResponse, secret: string, user: string,
): void {
  res.setHeader('set-cookie', cookieHeader(req, signSessionToken(secret, user), AUTH_COOKIE_MAX_AGE_SECONDS))
}

/**
 * Clear the session cookie.
 * @param req - the request (its headers decide the Secure flag).
 * @param res - the response carrying the Set-Cookie header.
 */
export function clearSessionCookie(req: IncomingMessage, res: ServerResponse): void {
  res.setHeader('set-cookie', cookieHeader(req, '', 0))
}

/**
 * Read the named cookie value from a request header.
 * @param req - the node:http request.
 * @param name - the cookie name.
 * @returns the cookie value, or undefined when absent.
 */
export function readCookie(req: IncomingMessage, name: string): string | undefined {
  const header = req.headers.cookie
  if (typeof header !== 'string') return undefined
  for (const part of header.split(';')) {
    const trimmed = part.trim()
    if (!trimmed.startsWith(name + '=')) continue
    return trimmed.slice(name.length + 1)
  }
  return undefined
}

/**
 * Resolve the session identity a request's cookie proves, or null.
 * @param req - the node:http request.
 * @param secret - the HMAC secret.
 * @returns the user, or null when the request carries no valid token.
 */
export function readSessionUser(req: IncomingMessage, secret: string): string | null {
  const token = readCookie(req, AUTH_COOKIE_NAME)
  if (token === undefined) return null
  return verifySessionToken(secret, token)
}
