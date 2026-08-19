// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installBlankRootRecovery } from '../src/boot.tsx'

const originalVisibility = Object.getOwnPropertyDescriptor(document, 'visibilityState')

afterEach(() => {
  if (originalVisibility === undefined) delete (document as unknown as { visibilityState?: string }).visibilityState
  else Object.defineProperty(document, 'visibilityState', originalVisibility)
})

function visibility(value: 'hidden' | 'visible'): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value })
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('blank root visibility recovery', () => {
  it('reloads only when a visible shell root is empty and stops after disposal', async () => {
    const root = document.createElement('div')
    const reload = vi.fn()
    const dispose = installBlankRootRecovery(root, reload)

    visibility('hidden')
    expect(reload).not.toHaveBeenCalled()
    root.append(document.createElement('div'))
    visibility('visible')
    expect(reload).not.toHaveBeenCalled()
    root.replaceChildren()
    await Promise.resolve()
    expect(reload).toHaveBeenCalledOnce()

    dispose()
    root.append(document.createElement('div'))
    root.replaceChildren()
    visibility('visible')
    await Promise.resolve()
    expect(reload).toHaveBeenCalledOnce()
  })
})
