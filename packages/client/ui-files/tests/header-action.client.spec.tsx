// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeTranslate } from '@monotykamary/dsh-client-test-runtime'
import { FilesHeaderAction } from '../src/client/FilesHeaderAction.tsx'
import { en } from '../src/client/locales.ts'
import type { FilesHeaderActionProps } from '../src/client/contract.ts'

afterEach(cleanup)

describe('FilesHeaderAction', () => {
  it('opens Files through its accessible session-header control', () => {
    const openFiles = vi.fn()
    render(<FilesHeaderAction {...({ openFiles, t: makeTranslate(en) } as FilesHeaderActionProps)} />)
    fireEvent.click(screen.getByRole('button', { name: en.open }))
    expect(openFiles).toHaveBeenCalledOnce()
    expect(screen.getByText(en.tab)).toBeTruthy()
  })
})
