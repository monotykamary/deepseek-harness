import { describe, expect, it } from 'vitest'
import { createProxyAllowlist } from '../src/proxy-allowlist.ts'

describe('createProxyAllowlist', () => {
  it('loopback accepts 127/8 and ::1 only', () => {
    const list = createProxyAllowlist('loopback')
    expect(list.contains('127.0.0.1')).toBe(true)
    expect(list.contains('127.255.255.254')).toBe(true)
    expect(list.contains('::1')).toBe(true)
    expect(list.contains('::ffff:127.0.0.1')).toBe(true)
    expect(list.contains('192.168.1.5')).toBe(false)
    expect(list.contains('10.0.0.1')).toBe(false)
  })

  it('private accepts RFC1918, CGNAT, link-local, and ULA', () => {
    const list = createProxyAllowlist('private')
    expect(list.contains('127.0.0.1')).toBe(true)
    expect(list.contains('10.1.2.3')).toBe(true)
    expect(list.contains('172.16.0.1')).toBe(true)
    expect(list.contains('172.31.255.255')).toBe(true)
    expect(list.contains('192.168.0.1')).toBe(true)
    expect(list.contains('100.64.0.1')).toBe(true)
    expect(list.contains('169.254.10.10')).toBe(true)
    expect(list.contains('::1')).toBe(true)
    expect(list.contains('fd12:3456::1')).toBe(true)
    expect(list.contains('fe80::1')).toBe(true)
    expect(list.contains('8.8.8.8')).toBe(false)
    expect(list.contains('2001:4860::8888')).toBe(false)
  })

  it('a CIDR matches inside its range and nothing else', () => {
    const list = createProxyAllowlist('10.0.0.0/8')
    expect(list.contains('10.0.0.1')).toBe(true)
    expect(list.contains('10.255.255.255')).toBe(true)
    expect(list.contains('::ffff:10.1.2.3')).toBe(true)
    expect(list.contains('11.0.0.1')).toBe(false)
    expect(list.contains('127.0.0.1')).toBe(false)
  })

  it('an IPv6 CIDR matches its range', () => {
    const list = createProxyAllowlist('fd00::/8')
    expect(list.contains('fd00::1')).toBe(true)
    expect(list.contains('fdff:ffff::1')).toBe(true)
    expect(list.contains('fe80::1')).toBe(false)
  })

  it('a bare address matches only itself (and its v4-mapped form)', () => {
    const list = createProxyAllowlist('192.168.50.10')
    expect(list.contains('192.168.50.10')).toBe(true)
    expect(list.contains('::ffff:192.168.50.10')).toBe(true)
    expect(list.contains('192.168.50.11')).toBe(false)
  })
})
