// @vitest-environment jsdom
/**
 * TextShimmer renders its wash band only when motion is active.
 *
 * The band is decorative (aria-hidden) and colour-only; running state for
 * assistive technology lives in the row's visually hidden label, so this spec
 * pins the render contract (band present, absent on reduced motion) but never
 * the animation itself.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { TextShimmer } from '../src/TextShimmer.tsx'

let reducedMotion = false

vi.mock('motion/react', async () => {
  const React = await import('react')
  return {
    motion: {
      span: (props: Record<string, unknown>) => React.createElement('span', props),
    },
    useReducedMotion: () => reducedMotion,
  }
})

afterEach(() => {
  cleanup()
  reducedMotion = false
})

describe('TextShimmer', () => {
  it('renders an aria-hidden wash band by default', () => {
    const view = render(<TextShimmer />)
    const band = view.container.querySelector('span')
    expect(band).not.toBeNull()
    expect(band?.getAttribute('aria-hidden')).toBe('true')
  })

  it('honors the reduced-motion preference with no element', () => {
    reducedMotion = true
    const { container } = render(<TextShimmer />)
    expect(container.querySelector('span')).toBeNull()
  })

  it('supports a non-positive duration as a no-op', () => {
    const { container } = render(<TextShimmer duration={0} />)
    expect(container.querySelector('span')).toBeNull()
  })

  it('applies the requested band color as a CSS custom property', () => {
    const view = render(<TextShimmer color="#123456" />)
    const band = view.container.querySelector('span')
    expect(band?.getAttribute('style')).toContain('--dsw-text-shimmer-color: #123456')
  })
})
