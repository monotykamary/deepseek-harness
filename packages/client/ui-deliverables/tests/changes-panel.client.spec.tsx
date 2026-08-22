// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  ConversationSnapshot, SessionId, SessionListState, WorkspaceListState,
} from '@monotykamary/dsh-client-runtime/client'
import { makeTranslate } from '@monotykamary/dsh-client-test-runtime'
import type { ChangesPanelProps } from '../src/client/ChangesPanel.tsx'
import { ChangesPanel } from '../src/client/ChangesPanel.tsx'
import type { DeliverablesSnapshot } from '../src/client/contract.ts'
import { en, zh } from '../src/client/locales.ts'

const SID = 'session' as SessionId
const inputActions: ChangesPanelProps['inputActions'] = {
  setDraft: () => {}, addImages: () => true, removeImage: () => {}, pruneImages: () => {}, submit: () => {},
}

function hook<T>(value: T) {
  return function useSelector<S>(selector: (snapshot: T) => S): S { return selector(value) }
}

function props(
  snapshot: DeliverablesSnapshot | undefined,
  t: ChangesPanelProps['t'] = makeTranslate(zh),
): ChangesPanelProps {
  const conversation = {
    views: { get: ((target: string) => target === 'deliverables' ? snapshot : undefined) as ConversationSnapshot['views']['get'] },
  } as ConversationSnapshot
  return {
    sessionId: SID,
    useSession: hook(conversation),
    useProjection: vi.fn() as never,
    useInput: vi.fn() as never,
    inputActions,
    useSessions: hook({} as SessionListState),
    useWorkspaces: hook({} as WorkspaceListState),
    t,
  }
}

afterEach(cleanup)

describe('ChangesPanel', () => {
  it('renders loaded mutation groups and distinct file counts', () => {
    render(<ChangesPanel {...props({ changes: [{
      seq: 4,
      turn: 1,
      callId: 'write-1',
      title: 'Write src/a.ts',
      diffs: [
        { path: 'src/a.ts', oldText: null, newText: 'export const a = 1' },
        { path: 'src/a.ts', oldText: '1', newText: '2' },
        { path: 'src/b.ts', oldText: null, newText: 'export const b = 2' },
      ],
    }] })} />)
    expect(screen.getByText('已更改文件')).toBeTruthy()
    expect(screen.getByText('2 个已更改文件 · +3 −1')).toBeTruthy()
    const change = screen.getByRole('button', { name: /^src\/a\.ts/u })
    expect(change.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('+2')).toBeTruthy()
    expect(screen.getByText('−1')).toBeTruthy()
    expect(screen.getByText('export const a = 1')).toBeTruthy()

    fireEvent.click(change)
    expect(change.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('export const a = 1')).toBeNull()

    fireEvent.click(change)
    expect(change.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('export const a = 1')).toBeTruthy()
  })

  it('collapses and expands every loaded mutation group', () => {
    render(<ChangesPanel {...props({ changes: [
      {
        seq: 4, turn: 1, callId: 'write-1', title: 'Write a.ts',
        diffs: [{ path: 'a.ts', oldText: null, newText: 'a' }],
      },
      {
        seq: 8, turn: 2, callId: 'write-2', title: 'Write b.ts',
        diffs: [{ path: 'b.ts', oldText: null, newText: 'b' }],
      },
    ] })} />)

    fireEvent.click(screen.getByRole('button', { name: '收起所有更改' }))
    expect(screen.getByRole('button', { name: /^a\.ts/u }).getAttribute('aria-expanded')).toBe('false')
    expect(screen.getByRole('button', { name: /^b\.ts/u }).getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('a')).toBeNull()
    expect(screen.queryByText('b')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '展开所有更改' }))
    expect(screen.getByRole('button', { name: /^a\.ts/u }).getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('button', { name: /^b\.ts/u }).getAttribute('aria-expanded')).toBe('true')
  })

  it('localizes diff controls on an English surface', () => {
    render(<ChangesPanel {...props({ changes: [{
      seq: 1, turn: 1, callId: 'write', title: 'Write a.ts',
      diffs: [{ path: 'a.ts', oldText: null, newText: 'a' }],
    }] }, makeTranslate(en))} />)
    expect(screen.getByRole('button', { name: 'Copy' })).toBeTruthy()
    expect(screen.queryByText('复制')).toBeNull()
  })

  it('renders the loaded-window empty state', () => {
    render(<ChangesPanel {...props(undefined)} />)
    expect(screen.getByText('当前载入的会话窗口中没有文件更改')).toBeTruthy()
  })
})
