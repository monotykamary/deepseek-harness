/** Compact drawer control styling shared with the desktop/tablet sidebar glyph. */
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(fileURLToPath(new URL('../src/client/AppFrame.module.css', import.meta.url)), 'utf8')
const source = readFileSync(fileURLToPath(new URL('../src/client/AppFrame.tsx', import.meta.url)), 'utf8')
const localIcons = fileURLToPath(new URL('../src/client/icons.tsx', import.meta.url))

/**
 * Declarations of one exact selector, keyed by property.
 * @param selector - Exact selector text.
 * @returns normalized declarations, or undefined when absent.
 */
function declarations(selector: string): Map<string, string> | undefined {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, ' ')
  const found = new Map<string, string>()
  for (const [, selectorList = '', body = ''] of withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!selectorList.split(',').map(value => value.trim()).includes(selector)) continue
    for (const part of body.split(';')) {
      const colon = part.indexOf(':')
      if (colon === -1) continue
      found.set(part.slice(0, colon).trim(), part.slice(colon + 1).trim().replace(/\s+/g, ' '))
    }
  }
  return found.size === 0 ? undefined : found
}

describe('AppFrame compact sidebar action', () => {
  it('uses the shared panel glyph instead of a local hamburger', () => {
    expect(source).toContain('import { PanelLeft, Sheet }')
    expect(source).toContain('<PanelLeft size={18} />')
    expect(source).not.toContain('IconMenuOutline16')
    expect(existsSync(localIcons)).toBe(false)
  })

  it('is a transparent 32px action aligned with the conversation title row', () => {
    const toggle = declarations('.drawerToggle')
    expect(toggle?.get('top')).toBe('calc(env(safe-area-inset-top, 0px) + 10px)')
    expect(toggle?.get('left')).toBe('calc(env(safe-area-inset-left, 0px) + 12px)')
    expect(toggle?.get('width')).toBe('32px')
    expect(toggle?.get('height')).toBe('32px')
    expect(toggle?.get('border')).toBe('none')
    expect(toggle?.get('border-radius')).toBe('8px')
    expect(toggle?.get('background')).toBe('transparent')
  })
})
