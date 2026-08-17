import type { IncomingMessage } from 'node:http'
import { describe, expect, it } from 'vitest'
import { createHeaderIdentityProvider } from '../src/header-provider.ts'

function requestWith(headers: Record<string, string>): IncomingMessage {
  return { headers } as IncomingMessage
}

describe('createHeaderIdentityProvider', () => {
  it('reads the default header from a loopback source', () => {
    const provider = createHeaderIdentityProvider({ provider: 'header' })
    expect(provider.denyUnauthenticated).toBe(false)
    expect(provider.operatorToken).toBeNull()
    expect(provider.identify(requestWith({ 'x-forwarded-user': 'alice' }), '127.0.0.1')).toEqual({ user: 'alice' })
  })

  it('ignores the header from a source outside the allowlist', () => {
    const provider = createHeaderIdentityProvider({ provider: 'header' })
    expect(provider.identify(requestWith({ 'x-forwarded-user': 'alice' }), '198.51.100.7')).toBeNull()
  })

  it('ignores a missing header and a missing source IP', () => {
    const provider = createHeaderIdentityProvider({ provider: 'header' })
    expect(provider.identify(requestWith({}), '127.0.0.1')).toBeNull()
    expect(provider.identify(requestWith({ 'x-forwarded-user': 'alice' }), null)).toBeNull()
    expect(provider.identify(requestWith({ 'x-forwarded-user': 'alice' }))).toBeNull()
  })

  it('trims the user and ignores a blank header', () => {
    const provider = createHeaderIdentityProvider({ provider: 'header' })
    expect(provider.identify(requestWith({ 'x-forwarded-user': '  alice  ' }), '127.0.0.1')).toEqual({ user: 'alice' })
    expect(provider.identify(requestWith({ 'x-forwarded-user': '   ' }), '127.0.0.1')).toBeNull()
  })

  it('honors a configured header name and allowlist', () => {
    const provider = createHeaderIdentityProvider({ provider: 'header', header: 'X-Remote-User', trustedProxy: '10.0.0.0/8' })
    expect(provider.identify(requestWith({ 'X-Remote-User': 'bob' }), '10.1.2.3')).toEqual({ user: 'bob' })
    expect(provider.identify(requestWith({ 'x-forwarded-user': 'bob' }), '10.1.2.3')).toBeNull()
    expect(provider.identify(requestWith({ 'X-Remote-User': 'bob' }), '127.0.0.1')).toBeNull()
  })

  it('caps the user length', () => {
    const provider = createHeaderIdentityProvider({ provider: 'header' })
    const long = 'x'.repeat(500)
    const identity = provider.identify(requestWith({ 'x-forwarded-user': long }), '127.0.0.1')
    expect(identity?.user).toHaveLength(256)
  })
})
