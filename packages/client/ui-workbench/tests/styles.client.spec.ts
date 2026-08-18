import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const workbenchCss = readFileSync(fileURLToPath(new URL('../src/client/Workbench.module.css', import.meta.url)), 'utf8')
const themeCss = readFileSync(fileURLToPath(new URL('../../ui-theme/src/styles/design-platform.css', import.meta.url)), 'utf8')

const roles = [
  'canvas', 'tab-bar', 'divider', 'tab-hover', 'tab-active', 'control-hover',
]

describe('T3-adapted workbench styles', () => {
  it('declares both-theme semantic roles and consumes every role', () => {
    for (const role of roles) {
      const token = `--dsw-specific-workbench-${role}`
      expect(themeCss.match(new RegExp(token, 'g'))?.length).toBe(2)
      expect(workbenchCss).toContain(`var(${token})`)
    }
  })

  it('uses a 40px tab bar, compact tabs, parent gaps, and no feature literal colors', () => {
    expect(workbenchCss).toMatch(/\.tabBar\s*\{[^}]*height:\s*40px/su)
    expect(workbenchCss).toMatch(/\.tabCell\s*\{[^}]*height:\s*28px/su)
    expect(workbenchCss).toContain('gap: 4px')
    expect(workbenchCss).toMatch(/\.sheet\[data-side='right'\]\s*\{[^}]*width:\s*min\(420px, 92vw\)/su)
    expect(workbenchCss).not.toMatch(/#[0-9a-f]{3,8}|rgba?\(/iu)
  })
})
