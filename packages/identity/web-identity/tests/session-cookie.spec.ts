import { createHmac } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { IncomingMessage } from 'node:http'
import { describe, expect, it } from 'vitest'
import {
  clearSessionCookie, generateAuthSecret, loadOrCreateAuthSecret, readCookie,
  readSessionUser, setSessionCookie, signSessionToken, verifySessionToken,
} from '../src/session-cookie.ts'

function requestWith(headers: Record<string, string>): IncomingMessage {
  return { headers } as IncomingMessage
}

function responseWith(): {
  headers: Record<string, unknown>
  setHeader(name: string, value: string): void
} {
  const out: Record<string, unknown> = {}
  return {
    headers: out,
    setHeader(name: string, value: string): void {
      out[name] = value
    },
  }
}

describe('session tokens', () => {
  it('signs and verifies a round trip', () => {
    const secret = generateAuthSecret()
    const token = signSessionToken(secret, 'alice')
    expect(verifySessionToken(secret, token)).toBe('alice')
  })

  it('rejects a tampered signature', () => {
    const secret = generateAuthSecret()
    const token = signSessionToken(secret, 'alice')
    const [data, sig] = token.split('.') as [string, string]
    const flipped = sig[0] === 'A' ? 'B' + sig.slice(1) : 'A' + sig.slice(1)
    expect(verifySessionToken(secret, data + '.' + flipped)).toBeNull()
  })

  it('rejects a token signed with a different secret', () => {
    const token = signSessionToken(generateAuthSecret(), 'alice')
    expect(verifySessionToken(generateAuthSecret(), token)).toBeNull()
  })

  it('rejects malformed and empty tokens', () => {
    const secret = generateAuthSecret()
    expect(verifySessionToken(secret, '')).toBeNull()
    expect(verifySessionToken(secret, 'no-dot')).toBeNull()
    expect(verifySessionToken(secret, '.sig')).toBeNull()
    expect(verifySessionToken(secret, 'not-json.sig')).toBeNull()
  })

  it('rejects an expired token', () => {
    const secret = generateAuthSecret()
    const payload = { sub: 'alice', exp: Date.now() - 1000 }
    const data = Buffer.from(JSON.stringify(payload)).toString('base64url')
    const signature = createHmac('sha256', secret).update(data).digest('base64url')
    expect(verifySessionToken(secret, data + '.' + signature)).toBeNull()
  })

  it('rejects a payload without a string sub', () => {
    const secret = generateAuthSecret()
    const payload = { sub: 7, exp: Date.now() + 60000 }
    const data = Buffer.from(JSON.stringify(payload)).toString('base64url')
    const signature = createHmac('sha256', secret).update(data).digest('base64url')
    expect(verifySessionToken(secret, data + '.' + signature)).toBeNull()
  })
})

describe('loadOrCreateAuthSecret', () => {
  it('persists a fresh secret and returns the same one on the next call', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-identity-secret-'))
    try {
      const file = join(dir, 'auth-secret')
      const first = loadOrCreateAuthSecret(file)
      expect(first.length).toBeGreaterThan(20)
      const second = loadOrCreateAuthSecret(file)
      expect(second).toBe(first)
      expect(readFileSync(file, 'utf8').trim()).toBe(first)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('replaces an empty existing file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-identity-secret-'))
    try {
      const file = join(dir, 'auth-secret')
      writeFileSync(file, '   \n')
      const secret = loadOrCreateAuthSecret(file)
      expect(secret.length).toBeGreaterThan(20)
      expect(readFileSync(file, 'utf8').trim()).toBe(secret)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('cookies', () => {
  it('setSessionCookie writes a httpOnly SameSite=Lax cookie and readSessionUser round-trips', () => {
    const secret = generateAuthSecret()
    const req = requestWith({})
    const res = responseWith()
    setSessionCookie(req, res as never, secret, 'alice')
    const cookie = String(res.headers['set-cookie'])
    expect(cookie).toContain('dsh-identity=')
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
    expect(cookie).toContain('Path=/')
    expect(cookie).not.toContain('Secure')
    const authed = requestWith({ cookie })
    expect(readSessionUser(authed, secret)).toBe('alice')
  })

  it('marks the cookie Secure on an https origin', () => {
    const secret = generateAuthSecret()
    const res = responseWith()
    setSessionCookie(requestWith({ origin: 'https://x.ts.net' }), res as never, secret, 'bob')
    expect(String(res.headers['set-cookie'])).toContain('Secure')
  })

  it('clearSessionCookie expires the cookie', () => {
    const res = responseWith()
    clearSessionCookie(requestWith({}), res as never)
    const cookie = String(res.headers['set-cookie'])
    expect(cookie).toContain('dsh-identity=')
    expect(cookie).toContain('Max-Age=0')
  })

  it('readSessionUser returns null without a cookie or with a garbage cookie', () => {
    const secret = generateAuthSecret()
    expect(readSessionUser(requestWith({}), secret)).toBeNull()
    expect(readSessionUser(requestWith({ cookie: 'dsh-identity=garbage' }), secret)).toBeNull()
  })

  it('readCookie finds the named cookie among others', () => {
    const req = requestWith({ cookie: 'a=1; dsh-identity=token; b=2' })
    expect(readCookie(req, 'dsh-identity')).toBe('token')
    expect(readCookie(req, 'missing')).toBeUndefined()
    expect(readCookie(requestWith({}), 'dsh-identity')).toBeUndefined()
  })
})
