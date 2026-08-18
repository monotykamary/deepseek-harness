// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  ConversationSnapshot, SessionId, SessionListState, WorkspaceListState,
} from '@monotykamary/dsh-client-runtime/client'
import { makeTranslate } from '@monotykamary/dsh-client-test-runtime'
import type { ChangesPanelProps } from '../src/client/ChangesPanel.tsx'
import { ChangesPanel } from '../src/client/ChangesPanel.tsx'
import type { DeliverablesSnapshot } from '../src/client/contract.ts'
import { zh } from '../src/client/locales.ts'

const SID = 'session' as SessionId
const inputActions: ChangesPanelProps['inputActions'] = {
  setDraft: () => {}, addImages: () => true, removeImage: () => {}, pruneImages: () => {}, submit: () => {},
}

function hook<T>(value: T) {
  return function useSelector<S>(selector: (snapshot: T) => S): S { return selector(value) }
}

function props(snapshot: DeliverablesSnapshot | undefined): ChangesPanelProps {
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
    t: makeTranslate(zh),
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
    expect(screen.getByText('已载入的更改')).toBeTruthy()
    expect(screen.getByText('1 次更改 · 2 个文件')).toBeTruthy()
    expect(screen.getByText('Write src/a.ts')).toBeTruthy()
    expect(screen.getByText('export const a = 1')).toBeTruthy()
  })

  it('renders the loaded-window empty state', () => {
    render(<ChangesPanel {...props(undefined)} />)
    expect(screen.getByText('当前载入的会话窗口中没有文件更改')).toBeTruthy()
  })
})
