import { describe, expect, it } from 'vitest'
import { diffAgainstBaseline, scanSource } from './verify-ui-layout.ts'

describe('scanSource', () => {
  it('counts margin declarations and z-index sites', () => {
    const debt = scanSource('.a { margin-top: 8px; margin: 0; z-index: 8 }')
    expect(debt).toEqual({ margins: 2, zindexes: 1 })
  })

  it('counts logical margin sides', () => {
    const debt = scanSource('.a { margin-block: 4px; margin-inline-start: 2px }')
    expect(debt.margins).toBe(2)
  })

  it('passes clean flex/gap layouts', () => {
    const debt = scanSource('.a { display: flex; flex-direction: column; gap: 8px; padding: 12px }')
    expect(debt).toEqual({ margins: 0, zindexes: 0 })
  })

  it('ignores mentions inside comments', () => {
    const debt = scanSource('/* sits above the composer (z-index 7) with margin: auto removed */\n.a { display: grid }')
    expect(debt).toEqual({ margins: 0, zindexes: 0 })
  })
})

describe('overlay-tier exemption', () => {
  it('ignores z-index pinned to overlay-layer tokens', () => {
    expect(scanSource('.a { z-index: var(--dsw-layer-overlay) }').zindexes).toBe(0)
  })

  it('still counts token-less numerics right beside an exempt tier', () => {
    expect(scanSource('.a { z-index: var(--dsw-layer-overlay) }\n.b { z-index: 50 }').zindexes).toBe(1)
  })
})

describe('diffAgainstBaseline', () => {
  it('passes when the tree matches the pin', () => {
    expect(diffAgainstBaseline({ 'a.css': { margins: 1, zindexes: 1 } }, { 'a.css': { margins: 1, zindexes: 1 } })).toEqual([])
  })

  it('rejects a clean-looking new file adding violations', () => {
    const failures = diffAgainstBaseline({ 'new.css': { margins: 1, zindexes: 0 } }, {})
    expect(failures).toHaveLength(1)
    expect(failures[0]).toContain('new violations outside the pin')
  })

  it('rejects growing a pinned file', () => {
    const failures = diffAgainstBaseline({ 'a.css': { margins: 3, zindexes: 0 } }, { 'a.css': { margins: 2, zindexes: 0 } })
    expect(failures[0]).toContain('grew 2 -> 3')
  })

  it('flags a shrunk pin entry as stale', () => {
    const failures = diffAgainstBaseline({ 'a.css': { margins: 1, zindexes: 0 } }, { 'a.css': { margins: 2, zindexes: 0 } })
    expect(failures[0]).toContain('verify-ui-layout:baseline')
  })

  it('flags a fully resolved file as stale pin', () => {
    const failures = diffAgainstBaseline({}, { 'a.css': { margins: 2, zindexes: 0 } })
    expect(failures[0]).toContain('fully resolved')
  })
})
