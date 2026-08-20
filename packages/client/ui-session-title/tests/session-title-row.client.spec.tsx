// @vitest-environment jsdom
/**
 * The automatic-title row: title, description, and a toggle whose pressed
 * state follows the persisted opt-in and whose gesture writes it back.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { bindSnapshotSelector } from '@monotykamary/dsh-client-web-react'
import { createSnapshotStore, type SessionListState, type WorkspaceListState } from '@monotykamary/dsh-client-runtime/client'
import { makeTranslate } from '@monotykamary/dsh-client-test-runtime'
import { SessionTitleRow } from '../src/client/SessionTitleRow.tsx'
import type { SessionTitleRowProps } from '../src/client/SessionTitleRow.tsx'
import { en } from '../src/client/locales.ts'

afterEach(() => {
  cleanup()
})

function emptySessions() {
  return bindSnapshotSelector(createSnapshotStore<SessionListState>({
    ids: [], byId: {}, current: undefined, phase: 'ready', subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined,
  }))
}

function emptyWorkspaces() {
  return bindSnapshotSelector(createSnapshotStore<WorkspaceListState>({
    items: [], archivedSessionIds: [], state: 'idle', phase: 'ready', error: null,
    baselinesReady: true, recentWorkspaceId: undefined,
  }))
}

function mount(enabled = false) {
  const store = createSnapshotStore(enabled)
  const setEnabled = vi.fn((next: boolean) => { store.set(next) })
  const props: SessionTitleRowProps = {
    useSessions: emptySessions(),
    useWorkspaces: emptyWorkspaces(),
    useEnabled: bindSnapshotSelector(store),
    setEnabled,
    t: makeTranslate(en),
  }
  render(<SessionTitleRow {...props} />)
  return { setEnabled, store }
}

describe('SessionTitleRow', () => {
  it('explains the opt-in and shows the off state by default', () => {
    mount()
    expect(screen.getByText('Auto-generate session titles')).toBeDefined()
    expect(screen.getByText('When on, new sessions get a one-line title from their current model; when off, they use the truncated default title.')).toBeDefined()
    const toggle = screen.getByRole('button', { name: 'Auto-generate session titles' })
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
  })

  it('toggles on with one gesture and follows later preference changes', () => {
    const b = mount()
    fireEvent.click(screen.getByRole('button', { name: 'Auto-generate session titles' }))
    expect(b.setEnabled).toHaveBeenCalledWith(true)

    b.store.set(true)
    expect(screen.getByRole('button', { name: 'Auto-generate session titles' }).getAttribute('aria-pressed')).toBe('true')
  })
})
