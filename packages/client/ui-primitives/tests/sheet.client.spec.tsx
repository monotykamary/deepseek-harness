// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Sheet } from '@monotykamary/dsh-client-ui-primitives'

afterEach(() => {
  cleanup()
  document.body.style.overflow = ''
})

describe('Sheet', () => {
  it('renders nothing while closed', () => {
    render(<Sheet open={false} onClose={() => {}} title="Nav">x</Sheet>)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('portals the dialog to the end of body with a dimmed mask', () => {
    render(<Sheet open onClose={() => {}} title="Nav" side="left"><div data-testid="inside" /></Sheet>)
    const dialog = screen.getByRole('dialog', { name: 'Nav' })
    expect(screen.getByTestId('inside')).toBeTruthy()
    expect(dialog.getAttribute('data-side')).toBe('left')
    // Paint order inside the portal tier: the panel follows the mask in DOM
    // so it needs no z-index above it.
    expect(dialog.previousElementSibling).not.toBeNull()
  })

  it('dismisses on Escape and mask click', () => {
    const onClose = vi.fn()
    render(<Sheet open onClose={onClose} title="Nav" side="right">x</Sheet>)
    const dialog = screen.getByRole('dialog', { name: 'Nav' })
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.click(dialog.previousElementSibling!)
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('locks page scroll while open and restores it on unmount', () => {
    const { unmount } = render(<Sheet open onClose={() => {}} title="Nav">x</Sheet>)
    expect(document.body.style.overflow).toBe('hidden')
    act(() => { unmount() })
    expect(document.body.style.overflow).toBe('')
  })
})
