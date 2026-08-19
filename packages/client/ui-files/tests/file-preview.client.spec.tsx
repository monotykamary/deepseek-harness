// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeTranslate } from '@monotykamary/dsh-client-test-runtime'
import type {
  WorkspaceFileVersion, WorkspaceUnavailableFilePreview,
} from '@monotykamary/dsh-api-remotes/client'
import { FilePreview } from '../src/client/FilePreview.tsx'
import { en } from '../src/client/locales.ts'
import type { PreviewCell } from '../src/client/store.ts'

const file = { segments: ['src', 'value.ts'] }
const t = makeTranslate(en)
const onWrite = vi.fn()
const onCommit = vi.fn()

function cell(value: WorkspaceUnavailableFilePreview): PreviewCell {
  return { requestId: 1, phase: 'ready', file, value }
}

function textCell(content = 'const value = 1\n'): PreviewCell {
  return {
    requestId: 1,
    phase: 'ready',
    file,
    value: {
      kind: 'text', file, name: 'value.ts', content, byteLength: content.length,
      version: 'v1' as WorkspaceFileVersion,
    },
  }
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('FilePreview', () => {
  it('renders loading, error, not-file, and non-text states with toolbar actions', () => {
    const onBack = vi.fn()
    const onRefresh = vi.fn()
    const onRetry = vi.fn()
    const view = render(
      <FilePreview
        file={file} preview={null} t={t} onWrite={onWrite} onCommit={onCommit}
        onBack={onBack} onRefresh={onRefresh} onRetry={onRetry}
      />,
    )
    expect(screen.getByText(en['preview.loading'])).toBeTruthy()
    expect(screen.getByRole('button', { name: en['preview.refresh'] }).hasAttribute('disabled')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: en['preview.back'] }))
    expect(onBack).toHaveBeenCalledOnce()

    view.rerender(
      <FilePreview
        file={file}
        preview={{ requestId: 1, phase: 'error', file, value: null }}
        t={t} onWrite={onWrite} onCommit={onCommit} onBack={onBack} onRefresh={onRefresh} onRetry={onRetry}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: en['preview.retry'] }))
    expect(onRetry).toHaveBeenCalledOnce()

    view.rerender(
      <FilePreview
        file={file}
        preview={cell({ kind: 'unavailable', file, name: 'value.ts', reason: 'not-file', maxBytes: 10 })}
        t={t} onWrite={onWrite} onCommit={onCommit} onBack={onBack} onRefresh={onRefresh} onRetry={onRetry}
      />,
    )
    expect(screen.getByText(en['preview.notFile'])).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en['preview.refresh'] }))
    expect(onRefresh).toHaveBeenCalledOnce()

    view.rerender(
      <FilePreview
        file={file}
        preview={cell({ kind: 'unavailable', file, name: 'value.ts', reason: 'not-text', maxBytes: 10 })}
        t={t} onWrite={onWrite} onCommit={onCommit} onBack={onBack} onRefresh={onRefresh} onRetry={onRetry}
      />,
    )
    expect(screen.getByText(en['preview.notText'])).toBeTruthy()

    view.rerender(
      <FilePreview
        file={file}
        preview={cell({ kind: 'unavailable', file, name: 'value.ts', reason: 'too-large', maxBytes: 10 })}
        t={t} onWrite={onWrite} onCommit={onCommit} onBack={onBack} onRefresh={onRefresh} onRetry={onRetry}
      />,
    )
    expect(screen.getByText('File exceeds the 10 B preview limit')).toBeTruthy()

    view.rerender(
      <FilePreview
        file={file}
        preview={{ requestId: 1, phase: 'ready', file, value: null }}
        t={t} onWrite={onWrite} onCommit={onCommit} onBack={onBack} onRefresh={onRefresh} onRetry={onRetry}
      />,
    )
    expect(view.container.querySelector('pre')).toBeNull()
  })

  it('edits highlighted source and commits the provider-normalized autosave result', async () => {
    vi.useFakeTimers()
    onWrite.mockResolvedValue({
      kind: 'saved', file, content: 'const value = 2\n', byteLength: 16,
      version: 'v2' as WorkspaceFileVersion,
    })
    render(
      <FilePreview
        file={file} preview={textCell()} t={t}
        onWrite={onWrite} onCommit={onCommit}
        onBack={() => {}} onRefresh={() => {}} onRetry={() => {}}
      />,
    )
    const editor = screen.getByRole('textbox', { name: 'Edit src/value.ts' })
    const wrap = screen.getByRole('button', { name: en['editor.wrapOn'] })
    expect(wrap.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(wrap)
    expect(screen.getByRole('button', { name: en['editor.wrapOff'] }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.keyDown(editor, { key: 's', ctrlKey: true })
    expect(editor.getAttribute('wrap')).toBe('soft')
    fireEvent.change(editor, { target: { value: 'const value = 2\n' } })
    expect(screen.getByRole('status').textContent).toBe(en['editor.saving'])
    await act(async () => { await vi.advanceTimersByTimeAsync(500) })
    expect(onWrite).toHaveBeenCalledWith(file, 'const value = 2\n', 'v1')
    expect(onCommit).toHaveBeenCalledWith({
      kind: 'text', file, name: 'value.ts', content: 'const value = 2\n', byteLength: 16, version: 'v2',
    })
    expect(screen.getByRole('status').textContent).toBe(en['editor.saved'])
  })

  it('accepts a provider-normalized saved locator without a final segment', async () => {
    vi.useFakeTimers()
    const root = { segments: [] }
    onWrite.mockResolvedValue({
      kind: 'saved', file: root, content: 'value', byteLength: 5,
      version: 'v2' as WorkspaceFileVersion,
    })
    render(
      <FilePreview
        file={file} preview={textCell()} t={t}
        onWrite={onWrite} onCommit={onCommit}
        onBack={() => {}} onRefresh={() => {}} onRetry={() => {}}
      />,
    )
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'value' } })
    await act(async () => { await vi.advanceTimersByTimeAsync(500) })
    expect(onCommit).toHaveBeenCalledWith(expect.objectContaining({ file: root, name: '' }))
  })

  it.each([
    ['conflict', { kind: 'conflict', file, maxBytes: 10 }, en['editor.conflict']],
    ['too-large', { kind: 'too-large', file, maxBytes: 10, byteLength: 12 }, en['editor.tooLarge']],
    ['not-file', { kind: 'not-file', file, maxBytes: 10 }, en['preview.notFile']],
  ] as const)('shows the %s autosave refusal', async (_kind, result, message) => {
    vi.useFakeTimers()
    onWrite.mockResolvedValue(result)
    render(
      <FilePreview
        file={file} preview={textCell()} t={t}
        onWrite={onWrite} onCommit={onCommit}
        onBack={() => {}} onRefresh={() => {}} onRetry={() => {}}
      />,
    )
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'changed' } })
    await act(async () => { await vi.advanceTimersByTimeAsync(500) })
    expect(screen.getByRole('alert').textContent).toBe(message)
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('shows a transport save error and flushes a pending edit when the editor unmounts', async () => {
    vi.useFakeTimers()
    onWrite.mockRejectedValue(new Error('offline'))
    const view = render(
      <FilePreview
        file={file} preview={textCell()} t={t}
        onWrite={onWrite} onCommit={onCommit}
        onBack={() => {}} onRefresh={() => {}} onRetry={() => {}}
      />,
    )
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'changed' } })
    await act(async () => { await vi.advanceTimersByTimeAsync(500) })
    expect(screen.getByRole('alert').textContent).toBe(en['editor.error'])

    onWrite.mockResolvedValue({
      kind: 'saved', file, content: 'last', byteLength: 4, version: 'v2' as WorkspaceFileVersion,
    })
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'last' } })
    view.unmount()
    await act(async () => { await Promise.resolve() })
    expect(onWrite).toHaveBeenLastCalledWith(file, 'last', 'v1')
  })
})
