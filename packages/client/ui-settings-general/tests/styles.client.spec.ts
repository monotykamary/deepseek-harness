import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(fileURLToPath(new URL('../src/client/SettingsRoot.module.css', import.meta.url)), 'utf8')
const mobile = css.slice(css.indexOf('@media (max-width: 767px)'))
const desktop = css.slice(0, css.indexOf('@media (max-width: 767px)'))

describe('SettingsRoot mobile sheet styles', () => {
  it('turns the centered rail panel into a full-bleed sheet below the drawer breakpoint', () => {
    expect(css).toContain('@media (max-width: 767px)')
    // The compact block flips the panel to a viewport-filling sheet: no
    // desktop width caps, no corner radius, safe-area pad on top, and the
    // nav rides the sheet foot through a reversed column direction.
    expect(mobile).toContain('flex-direction: column-reverse')
    expect(mobile).toContain('border-radius: 0')
    expect(mobile).toContain('padding-top: env(safe-area-inset-top, 0px)')
  })

  it('keeps the dialog labelled while the desktop title row leaves the strip flow', () => {
    // The title node stays mounted (aria-labelledby target) but is clipped
    // out of the visual flow like the close seat.
    expect(mobile).toContain('position: absolute;')
    expect(mobile).toContain('clip: rect(0 0 0 0)')
  })

  it('makes the nav a horizontally scrollable, scrollbar-free chip strip', () => {
    expect(mobile).toContain('flex-direction: row')
    expect(mobile).toContain('overflow-x: auto')
    expect(mobile).toContain('scrollbar-width: none')
    expect(mobile).toContain('border-radius: 18px')
  })

  it('shows directional edge gradients only inside the mobile sheet', () => {
    expect(mobile).toContain('.navFadeLeft')
    expect(mobile).toContain('.navFadeRight')
    expect(mobile).toContain('linear-gradient(to right, var(--dsw-alias-bg-layer-2), transparent)')
    expect(mobile).toContain('linear-gradient(to right, transparent, var(--dsw-alias-bg-layer-2))')
    expect(desktop).not.toContain('.navFadeLeft')
    expect(desktop).not.toContain('.navFadeRight')
  })

  it('keeps the desktop two-column modal intact outside the compact query', () => {
    // The centered panel and 188px rail rules must stay outside the mobile
    // query, so wide layouts are untouched by the sheet overrides.
    expect(desktop).toContain('width: 800px')
    expect(desktop).toContain('border-radius: 24px')
    expect(desktop).toContain('width: 188px')
  })
})
