// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import * as primitives from '@monotykamary/dsh-client-ui-primitives'
import { Archive, Braces, Circle, Diamond, Folder, Send, Target, Triangle } from '@monotykamary/dsh-client-ui-primitives'

afterEach(cleanup)

describe('Lucide icon exports', () => {
  it('renders canonical Lucide SVGs', () => {
    const { container } = render(
      <>
        <Archive size={16} /><Braces size={16} /><Circle size={16} /><Diamond size={16} />
        <Folder size={16} /><Send size={16} /><Target size={16} /><Triangle size={16} />
      </>,
    )
    const icons = container.querySelectorAll('svg')
    expect(icons).toHaveLength(8)
    expect([...icons].every(icon => icon.classList.contains('lucide'))).toBe(true)
    expect(container.innerHTML).toContain('currentColor')
  })

  it('passes Lucide size and class props to the root SVG', () => {
    const { container } = render(<Send size={20} className="x" />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('width')).toBe('20')
    expect(svg.getAttribute('height')).toBe('20')
    expect(svg.classList.contains('x')).toBe(true)
  })

  it('does not export the removed ic_ds component names', () => {
    expect(Object.keys(primitives).some(name => /^Icon[A-Z]/u.test(name))).toBe(false)
  })
})

describe('FishLogo', () => {
  it('renders the fish path in currentColor at the native ratio', () => {
    const { container } = render(<primitives.FishLogo />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('width')).toBe('24')
    expect(Number(svg.getAttribute('height'))).toBeCloseTo(17.66, 1)
    expect(svg.getAttribute('viewBox')).toBe('0 0 23.16 17.04')
    expect(container.querySelectorAll('path')).toHaveLength(1)
    expect(container.innerHTML).toContain('currentColor')
    expect(container.innerHTML).not.toContain('M0 0L23.16')
  })
})

describe('BrandWordmark', () => {
  it('can render the name artwork with or without its leading mark', () => {
    const view = render(<primitives.BrandWordmark />)
    const svg = view.container.querySelector('svg')!
    expect(svg.getAttribute('width')).toBe('182')
    expect(svg.getAttribute('viewBox')).toBe('0 0 182 24')

    view.rerender(<primitives.BrandWordmark includeMark={false} />)
    expect(svg.getAttribute('width')).toBe('156')
    expect(svg.getAttribute('viewBox')).toBe('26 0 156 24')
  })
})
