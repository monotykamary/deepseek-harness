import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const componentCss = readFileSync(fileURLToPath(new URL('../src/client/CommandPalette.module.css', import.meta.url)), 'utf8')
const themeCss = readFileSync(fileURLToPath(new URL('../../ui-theme/src/styles/design-platform.css', import.meta.url)), 'utf8')
const component = readFileSync(fileURLToPath(new URL('../src/client/CommandPalette.tsx', import.meta.url)), 'utf8')

const roles = [
  '--dsw-specific-command-palette',
  '--dsw-specific-command-palette-footer',
  '--dsw-specific-command-palette-key',
  '--dsw-specific-command-palette-mask',
  '--dsw-specific-command-palette-row',
]

describe('command-palette styles', () => {
  it('declares every T3-derived semantic role in both theme palettes and consumes it locally', () => {
    for (const role of roles) {
      expect(themeCss.match(new RegExp(`${role}:`, 'g'))).toHaveLength(2)
      expect(componentCss).toContain(`var(${role})`)
    }
    expect(themeCss).toContain("Command roles adapt T3 Code's")
    expect(component).toContain('a4cc1367b03ee0c1dc2b50fceac81ef5e63212e2')
  })

  it('uses the shared overlay tier, reduced motion, and parent-owned spacing', () => {
    expect(componentCss).toContain('z-index: var(--dsw-layer-overlay)')
    expect(componentCss).toContain('@media (prefers-reduced-motion: reduce)')
    expect(componentCss).not.toMatch(/\bmargin(?:-|\s*:)/u)
    expect(componentCss).not.toMatch(/#[\da-f]{3,8}\b/iu)
  })
})
