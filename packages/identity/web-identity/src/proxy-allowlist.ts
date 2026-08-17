/**
 * Source-IP allowlist for the header identity provider.
 * @module @monotykamary/dsh-web-identity/proxy-allowlist
 */

import net from 'node:net'

const IPV4_MAPPED_PREFIX = '::ffff:'

// net.BlockList checks family-strict, so a dual-stack listener hands us an
// IPv4-mapped IPv6 address (::ffff:1.2.3.4) that an IPv4 subnet rule would
// miss. Normalize it back to the v4 form so one allowlist rule covers both.
function normalizeIp(ip: string): { address: string; family: 'ipv4' | 'ipv6' } {
  if (ip.startsWith(IPV4_MAPPED_PREFIX)) {
    return { address: ip.slice(IPV4_MAPPED_PREFIX.length), family: 'ipv4' }
  }
  return { address: ip, family: ip.includes(':') ? 'ipv6' : 'ipv4' }
}

function parseCidr(
  cidr: string,
): { address: string; prefix: number; family: 'ipv4' | 'ipv6' } | null {
  const slash = cidr.indexOf('/')
  if (slash === -1) return null
  const address = cidr.slice(0, slash)
  const prefix = Number.parseInt(cidr.slice(slash + 1), 10)
  if (!Number.isInteger(prefix) || prefix < 0) return null
  const family = address.includes(':') ? 'ipv6' : 'ipv4'
  if (prefix > (family === 'ipv4' ? 32 : 128)) return null
  return { address, prefix, family }
}

/** A compiled source-IP allowlist predicate. */
export interface ProxyAllowlist {
  contains(ip: string): boolean
}

/**
 * Build a source-IP allowlist. `spec` is one of the shorthands
 * `"loopback"` (127/8, ::1) or `"private"` (RFC1918, CGNAT, link-local,
 * ULA), a CIDR string (`"10.0.0.0/8"`, `"::1/128"`), or a bare address. The
 * header provider only honors the identity header when the request's source
 * IP is in this range, so a direct caller forging the header from outside the
 * proxy is ignored.
 * @param spec - the allowlist spec, validated by the caller.
 * @returns the compiled predicate.
 */
export function createProxyAllowlist(spec: string): ProxyAllowlist {
  const list = new net.BlockList()
  if (spec === 'loopback') {
    list.addSubnet('127.0.0.0', 8, 'ipv4')
    list.addAddress('::1', 'ipv6')
  } else if (spec === 'private') {
    list.addSubnet('127.0.0.0', 8, 'ipv4')
    list.addSubnet('10.0.0.0', 8, 'ipv4')
    list.addSubnet('172.16.0.0', 12, 'ipv4')
    list.addSubnet('192.168.0.0', 16, 'ipv4')
    list.addSubnet('100.64.0.0', 10, 'ipv4')
    list.addSubnet('169.254.0.0', 16, 'ipv4')
    list.addAddress('::1', 'ipv6')
    list.addSubnet('fc00::', 7, 'ipv6')
    list.addSubnet('fe80::', 10, 'ipv6')
  } else {
    const cidr = parseCidr(spec)
    if (cidr !== null) {
      list.addSubnet(cidr.address, cidr.prefix, cidr.family)
    } else {
      list.addAddress(spec, spec.includes(':') ? 'ipv6' : 'ipv4')
    }
  }
  return {
    contains: (ip: string): boolean => {
      const { address, family } = normalizeIp(ip)
      return list.check(address, family)
    },
  }
}
