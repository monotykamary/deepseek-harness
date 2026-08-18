// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useMediaQuery } from '@monotykamary/dsh-client-web-react'

/** Controllable matchMedia stub: tests flip matches, then fire a change. */
function stubMatchMedia(initial: boolean) {
  const state = { matches: initial }
  const listeners = new Set<(event: MediaQueryListEvent) => void>()
  window.matchMedia = vi.fn((query: string) => ({
    matches: state.matches,
    media: query,
    onchange: null,
    addEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) => { listeners.add(listener) },
    removeEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) => { listeners.delete(listener) },
    dispatchEvent: () => true,
  })) as unknown as typeof window.matchMedia
  return {
    flip(next: boolean) {
      state.matches = next
      for (const listener of listeners) listener({ matches: next, media: '' } as MediaQueryListEvent)
    },
  }
}

afterEach(() => { vi.restoreAllMocks() })

describe('useMediaQuery', () => {
  it('returns the live match state at mount', () => {
    stubMatchMedia(true)
    const { result } = renderHook(() => useMediaQuery('(pointer: coarse)'))
    expect(result.current).toBe(true)
  })

  it('follows matchMedia change events', () => {
    const media = stubMatchMedia(false)
    const { result } = renderHook(() => useMediaQuery('(max-width: 767px)'))
    expect(result.current).toBe(false)
    act(() => { media.flip(true) })
    expect(result.current).toBe(true)
  })

  it('re-reads the new query when it changes', () => {
    stubMatchMedia(true)
    const { result, rerender } = renderHook(({ query }) => useMediaQuery(query), { initialProps: { query: '(a)' } })
    expect(result.current).toBe(true)
    rerender({ query: '(b)' })
    expect(result.current).toBe(true)
  })
})
