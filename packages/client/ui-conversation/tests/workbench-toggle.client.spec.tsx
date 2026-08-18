// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeTranslate } from '@monotykamary/dsh-client-test-runtime'
import { en } from '../src/client/locales.ts'
import { WorkbenchToggle } from '../src/client/skeleton/WorkbenchToggle.tsx'

afterEach(cleanup)

describe('WorkbenchToggle', () => {
  it('opens and collapses the right panel from the same Session header control', () => {
    const setWorkbenchOpen = vi.fn()
    const props = {
      detailsOpen: false,
      setWorkbenchOpen,
      t: makeTranslate(en),
    } as Parameters<typeof WorkbenchToggle>[0]
    const view = render(<WorkbenchToggle {...props} />)
    const open = screen.getByRole('button', { name: en['workbench.open'] })
    expect(open.getAttribute('aria-expanded')).toBe('false')
    expect(view.container.querySelector('svg')).toBeTruthy()
    fireEvent.click(open)
    expect(setWorkbenchOpen).toHaveBeenLastCalledWith(true)

    view.rerender(<WorkbenchToggle {...props} detailsOpen />)
    const collapse = screen.getByRole('button', { name: en['workbench.close'] })
    expect(collapse.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(collapse)
    expect(setWorkbenchOpen).toHaveBeenLastCalledWith(false)
  })
})
