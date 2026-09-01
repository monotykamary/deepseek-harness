import { describe, expect, it } from 'vitest'
import {
  inferRunCodeTitle,
  normalizeRunCodeDisplay,
  resolveRunCodeDisplay,
  resolveRunCodeTitle,
} from '@monotykamary/dsh-tools'

describe('Code Mode run titles', () => {
  it('prefers display metadata and retains the legacy flat title for replay', () => {
    expect(resolveRunCodeTitle({
      code: 'return await tools.read({ path: "secret.txt" })',
      display: { name: '  Inspect auth flow  ', description: '  Verify the release path  ' },
      description: 'Legacy title',
    })).toBe('Inspect auth flow')
    expect(resolveRunCodeDisplay({
      code: 'return 1',
      display: { name: 'Ship release', description: '  Validate artifacts before publishing.  ' },
    })).toEqual({ name: 'Ship release', description: 'Validate artifacts before publishing.' })
    expect(resolveRunCodeTitle({ code: 'return 1', description: '  Legacy title  ' })).toBe('Legacy title')
  })

  it('normalizes string shorthand and provider-serialized display objects', () => {
    expect(normalizeRunCodeDisplay('Inspect auth flow')).toEqual({ name: 'Inspect auth flow' })
    expect(normalizeRunCodeDisplay('{"name":"Run tests","description":"Verify the fix"}'))
      .toEqual({ name: 'Run tests', description: 'Verify the fix' })
    expect(normalizeRunCodeDisplay('{malformed')).toEqual({ name: '{malformed' })
    expect(normalizeRunCodeDisplay('["still a shorthand"]')).toEqual({ name: '["still a shorthand"]' })
    expect(normalizeRunCodeDisplay(['not', 'metadata'])).toEqual({})
    expect(normalizeRunCodeDisplay(42)).toEqual({})
  })

  it('uses direct nested-tool descriptions without exposing unrelated string payloads', () => {
    expect(inferRunCodeTitle(`
      const ignored = "tools.write({ description: 'not a call' })"
      // tools.bash({ description: 'also ignored' })
      return await tools.bash({
        command: "cat $SECRET",
        description: "Inspect published package",
      })
    `)).toBe('Inspect published package')
  })

  it('recognizes quoted names, decodes escapes, and groups repeated work', () => {
    expect(inferRunCodeTitle(`
      await tools["read-file"]({ description: "Read\\nmanifest" })
      await tools["read-file"]({ description: "Read\\nmanifest" })
    `)).toBe('Read manifest ×2')
  })

  it('humanizes tools without descriptions and keeps first-occurrence order', () => {
    expect(inferRunCodeTitle(`
      await tools.session_event_search({ query: "needle" })
      await tools.read({ path: "README.md" })
    `)).toBe('Run Session event search + Run Read')
  })

  it('ignores dynamic templates and malformed or commented calls', () => {
    expect(inferRunCodeTitle(`
      /* tools.read({ description: "comment" }) */
      const dynamic = \`tools.write(\${value})\`
      tools.read
    `)).toBeUndefined()
  })

  it('bounds long and multi-operation titles', () => {
    const title = inferRunCodeTitle(`
      await tools.a({ description: "${'word '.repeat(30)}" })
      await tools.b({ description: "Second independent operation with a descriptive label" })
    `)
    expect(title?.length).toBeLessThanOrEqual(80)
    expect(title).toContain('…')
  })



  it('handles malformed source and every literal lexer termination path', () => {
    expect(inferRunCodeTitle("tools.a({ description: 'single\\tquoted' })"))
      .toBe('single quoted')
    expect(inferRunCodeTitle('tools.a({ description: "unknown\\qescape" })'))
      .toBe('unknownqescape')
    expect(inferRunCodeTitle('tools.a({ description: "dangling' + '\\')).toBe('dangling')
    expect(inferRunCodeTitle('tools.a(// unterminated comment')).toBe('Run A')
    expect(inferRunCodeTitle('tools.a(/* unterminated block')).toBe('Run A')
    expect(inferRunCodeTitle('tools.a(')).toBe('Run A')
    expect(inferRunCodeTitle('tools.a())')).toBe('Run A')
    expect(inferRunCodeTitle('tools.a((nested))')).toBe('Run A')
  })

  it('handles blank descriptions, punctuation-only tool names, and unspaced clipping', () => {
    expect(inferRunCodeTitle('tools.a({ description: "   " })')).toBe('Run A')
    expect(inferRunCodeTitle('tools["---"]({})')).toBe('Run tool')
    const title = inferRunCodeTitle(`tools.a({ description: "${'x'.repeat(100)}" })`)
    expect(title).toBe(`${'x'.repeat(63)}…`)
  })

  it('falls back to a neutral title when no call is recognizable', () => {
    expect(resolveRunCodeTitle({ code: 'return 1', description: '   ' })).toBe('Run code')
  })
})
