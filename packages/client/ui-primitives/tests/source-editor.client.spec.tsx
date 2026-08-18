// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SourceEditor } from '@monotykamary/dsh-client-ui-primitives'

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0)
    return 1
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function EditableHarness({ onSave }: { readonly onSave: () => void }) {
  const [value, setValue] = useState('const answer = 42\n')
  return (
    <SourceEditor
      value={value}
      ariaLabel="Edit src/index.ts"
      lang="ts"
      onChange={setValue}
      onSave={onSave}
    />
  )
}

describe('SourceEditor', () => {
  it('renders highlighted numbered source, edits, inserts Tab, and handles Ctrl/Cmd+S', () => {
    const onSave = vi.fn()
    const view = render(<EditableHarness onSave={onSave} />)
    const input = screen.getByRole('textbox', { name: 'Edit src/index.ts' }) as HTMLTextAreaElement
    expect(input.value).toBe('const answer = 42\n')
    expect(view.container.querySelector('[aria-hidden="true"]')?.textContent).toContain('1const answer = 42')
    expect(view.container.querySelector('[aria-hidden="true"]')?.textContent).toContain('2')

    fireEvent.change(input, { target: { value: 'const answer = 43\n' } })
    expect(input.value).toBe('const answer = 43\n')
    input.setSelectionRange(0, 0)
    fireEvent.keyDown(input, { key: 'Tab' })
    expect(input.value).toBe('\tconst answer = 43\n')

    fireEvent.keyDown(input, { key: 's', ctrlKey: true })
    fireEvent.keyDown(input, { key: 'S', metaKey: true })
    expect(onSave).toHaveBeenCalledTimes(2)
  })

  it('falls back to plain source, syncs both scroll axes, and leaves unsupported shortcuts alone', () => {
    const view = render(
      <SourceEditor
        value={'first\n\nthird'}
        ariaLabel="Read notes.unknown"
        lang="unknown"
        readOnly
        onChange={() => {}}
      />,
    )
    const input = screen.getByRole('textbox', { name: 'Read notes.unknown' }) as HTMLTextAreaElement
    const backdrop = view.container.querySelector('[aria-hidden="true"]') as HTMLDivElement
    input.scrollTop = 20
    input.scrollLeft = 12
    fireEvent.scroll(input)
    expect(backdrop.scrollTop).toBe(20)
    expect(backdrop.scrollLeft).toBe(12)

    fireEvent.keyDown(input, { key: 'Tab' })
    fireEvent.keyDown(input, { key: 'Tab', altKey: true })
    fireEvent.keyDown(input, { key: 's', ctrlKey: true })
    expect(input.value).toBe('first\n\nthird')
    expect(backdrop.textContent).toContain('2')
  })
})
