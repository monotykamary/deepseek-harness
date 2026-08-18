// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeTranslate } from '@monotykamary/dsh-client-test-runtime'
import type { WorkspaceUnavailableFilePreview } from '@monotykamary/dsh-api-remotes/client'
import { FilePreview } from '../src/client/FilePreview.tsx'
import { en } from '../src/client/locales.ts'
import type { PreviewCell } from '../src/client/store.ts'

const file = { segments: ['src', 'value.ts'] }
const t = makeTranslate(en)

function cell(value: WorkspaceUnavailableFilePreview): PreviewCell {
  return { requestId: 1, phase: 'ready', file, value }
}

afterEach(cleanup)

describe('FilePreview', () => {
  it('renders loading, error, not-file, and non-text states with toolbar actions', () => {
    const onBack = vi.fn()
    const onRefresh = vi.fn()
    const onRetry = vi.fn()
    const view = render(
      <FilePreview file={file} preview={null} t={t} onBack={onBack} onRefresh={onRefresh} onRetry={onRetry} />,
    )
    expect(screen.getByText(en['preview.loading'])).toBeTruthy()
    expect(screen.getByRole('button', { name: en['preview.refresh'] }).hasAttribute('disabled')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: en['preview.back'] }))
    expect(onBack).toHaveBeenCalledOnce()

    view.rerender(
      <FilePreview
        file={file}
        preview={{ requestId: 1, phase: 'error', file, value: null }}
        t={t} onBack={onBack} onRefresh={onRefresh} onRetry={onRetry}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: en['preview.retry'] }))
    expect(onRetry).toHaveBeenCalledOnce()

    view.rerender(
      <FilePreview
        file={file}
        preview={cell({ kind: 'unavailable', file, name: 'value.ts', reason: 'not-file', maxBytes: 10 })}
        t={t} onBack={onBack} onRefresh={onRefresh} onRetry={onRetry}
      />,
    )
    expect(screen.getByText(en['preview.notFile'])).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en['preview.refresh'] }))
    expect(onRefresh).toHaveBeenCalledOnce()

    view.rerender(
      <FilePreview
        file={file}
        preview={cell({ kind: 'unavailable', file, name: 'value.ts', reason: 'not-text', maxBytes: 10 })}
        t={t} onBack={onBack} onRefresh={onRefresh} onRetry={onRetry}
      />,
    )
    expect(screen.getByText(en['preview.notText'])).toBeTruthy()

    view.rerender(
      <FilePreview
        file={file}
        preview={{ requestId: 1, phase: 'ready', file, value: null }}
        t={t} onBack={onBack} onRefresh={onRefresh} onRetry={onRetry}
      />,
    )
    expect(view.container.querySelector('pre')).toBeNull()
  })
})
