// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, createEvent, fireEvent, render, screen } from '@testing-library/react'
import type { SessionId, WorkspaceId } from '@monotykamary/dsh-client-runtime/client'
import { makeTranslate } from '@monotykamary/dsh-client-test-runtime'
import { zh as commonZh } from '@monotykamary/dsh-client-locale/src/locales/zh.ts'
import type { RowDragProps } from '../src/client/rows/Rows.tsx'
import { ProjectRowItem, SearchResultItem, SessionNodeItem } from '../src/client/rows/Rows.tsx'
import type { GroupNode, SearchResultNode, SessionNode } from '../src/client/tree.ts'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

// Standard locale seat stub mirroring the real ns → common → key chain (zh default).
const t = makeTranslate(zh, commonZh) as never

const sid = (id: string) => id as SessionId
const wid = (id: string) => id as WorkspaceId

/** Half detection reads the row rect; jsdom rects are all-zero by default. */
function stubRect(row: HTMLElement): void {
  row.getBoundingClientRect = () => ({
    top: 100, bottom: 134, left: 0, right: 200, width: 200, height: 34,
    x: 0, y: 100, toJSON: () => ({}),
  })
}

function dragProps(overrides: Partial<RowDragProps> = {}): RowDragProps {
  return {
    start: vi.fn(), active: false, marker: null,
    hover: vi.fn(), drop: vi.fn(), end: vi.fn(),
    ...overrides,
  }
}

/** Right-click the row: the context menu is the row menu's only trigger now. */
function openRowMenu(row: HTMLElement): void {
  fireEvent.contextMenu(row, { clientX: 10, clientY: 10 })
}

/** Install the async browser clipboard and restore its prior host shape. */
function installClipboard(writeText: (text: string) => Promise<void>): () => void {
  const prior = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  })
  return () => {
    if (prior === undefined) Reflect.deleteProperty(navigator, 'clipboard')
    else Object.defineProperty(navigator, 'clipboard', prior)
  }
}

const dataTransfer = { effectAllowed: '', dropEffect: '', setData: vi.fn() }

/** jsdom lacks DragEvent — the fireEvent fallback drops clientY, so pin it on the built event. */
function fireDrag(row: HTMLElement, kind: 'dragOver' | 'drop', clientY: number): void {
  const event = kind === 'dragOver' ? createEvent.dragOver(row) : createEvent.drop(row)
  Object.defineProperty(event, 'clientY', { value: clientY })
  Object.defineProperty(event, 'dataTransfer', { value: { ...dataTransfer } })
  fireEvent(row, event)
}

describe('workspace browser rows', () => {
  it('renders Workspace context and live status in the hierarchy-free card', () => {
    const idle: SessionNode = {
      id: sid('flat'), workspace: 'Project', branch: 'main', title: 'Flat Session',
      running: false, runningSubagentCount: 0, completed: false, updatedAt: 0,
    }
    const view = render(<SessionNodeItem node={idle} currentId={undefined} now={0} onOpen={vi.fn()}
      onRename={vi.fn()} onFork={vi.fn()} onArchive={vi.fn()}
      onSettle={vi.fn()} onUnsettle={vi.fn()} onSnooze={vi.fn()} onWake={vi.fn()} t={t} />)
    const row = screen.getByRole('treeitem')
    expect(row.textContent).toContain('Project')
    expect(row.textContent).toContain('Flat Session')
    expect(row.textContent).toContain('main')
    expect(row.querySelector('[data-state]')).toBeNull()

    view.rerender(<SessionNodeItem node={{ ...idle, running: true }} currentId={undefined} now={0}
      onOpen={vi.fn()} onRename={vi.fn()} onFork={vi.fn()} onArchive={vi.fn()}
      onSettle={vi.fn()} onUnsettle={vi.fn()} onSnooze={vi.fn()} onWake={vi.fn()} t={t} />)
    expect(screen.getByRole('treeitem').querySelector('[data-state="ongoing"]')).toBeTruthy()
    expect(screen.getByText('进行中')).toBeTruthy()
  })

  it('renders a selected content-search row and opens only its session', () => {
    const onOpen = vi.fn()
    const result: SearchResultNode = {
      id: sid('result'),
      title: 'Result title',
      workspace: 'Workspace context',
      running: true,
      runningSubagentCount: 0,
      completed: false,
      snippet: 'matching message excerpt',
    }
    render(<SearchResultItem result={result} currentId={result.id} onOpen={onOpen} t={t} />)
    const row = screen.getByRole('treeitem')
    expect(row.getAttribute('aria-selected')).toBe('true')
    expect(screen.getByText('Workspace context')).toBeTruthy()
    expect(screen.getByText('matching message excerpt')).toBeTruthy()
    expect(row.querySelector('[data-state="ongoing"]')).toBeTruthy()
    expect(screen.getByText('进行中')).toBeTruthy()
    expect(row.hasAttribute('draggable')).toBe(false)
    fireEvent.click(row)
    expect(onOpen).toHaveBeenCalledWith(result.id)
  })

  it.each([
    ['approval', '等待审批'],
    ['plan-review', '计划待审'],
    ['question', '等待回答'],
  ] as const)('shows %s ahead of running in search results', (pendingInteraction, label) => {
    const result: SearchResultNode = {
      id: sid(pendingInteraction), title: 'Needs input', workspace: 'Project',
      pendingInteraction, running: true, runningSubagentCount: 0, completed: false,
    }
    render(<SearchResultItem result={result} currentId={undefined} onOpen={vi.fn()} t={t} />)
    const row = screen.getByRole('treeitem')
    expect(row.querySelector('[data-state="warning"]')).toBeTruthy()
    expect(row.querySelector('[data-state="ongoing"]')).toBeNull()
    expect(screen.getByText(label)).toBeTruthy()
  })

  it('renders an active Workspace and keeps its create action separate from toggling', () => {
    const onToggle = vi.fn()
    const onCreate = vi.fn()
    const group: GroupNode = {
      key: 'project', workspaceId: wid('project'), cwd: '/projects/project', createdAt: 0, label: 'Project',
      sessionCount: 1, expanded: true, containsCurrent: true, sessions: [],
    }
    render(<ProjectRowItem group={group} onToggle={onToggle} onCreate={onCreate} t={t} />)

    expect(screen.getByRole('treeitem').getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: '在“Project”中新建会话' }))
    expect(onCreate).toHaveBeenCalledOnce()
    expect(onToggle).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('Project'))
    expect(onToggle).toHaveBeenCalledOnce()
  })

  it('renders and opens a selected running Session row', () => {
    const node: SessionNode = {
      id: sid('session'), workspace: 'Project', title: 'Session', running: true,
      runningSubagentCount: 0, completed: false, updatedAt: 0,
    }
    const onOpen = vi.fn()
    render(
      <SessionNodeItem node={node} currentId={node.id} now={0} onOpen={onOpen}
        onRename={vi.fn()} onFork={vi.fn()} onArchive={vi.fn()}
        onSettle={vi.fn()} onUnsettle={vi.fn()} onSnooze={vi.fn()} onWake={vi.fn()} t={t} />,
    )

    const row = screen.getByRole('treeitem')
    expect(row.getAttribute('aria-selected')).toBe('true')
    expect(row.hasAttribute('aria-expanded')).toBe(false)
    expect(screen.queryByRole('button', { name: /展开|收起/ })).toBeNull()
    fireEvent.click(row)
    expect(onOpen).toHaveBeenCalledWith(node.id)
  })

  it('shows the green done dot only on a finished, unviewed session (live activity wins the slot)', () => {
    const renderRow = (over: Partial<SessionNode>) => render(
      <SessionNodeItem
        node={{
          id: sid('s1'), workspace: 'Project', title: 'One', running: false,
          runningSubagentCount: 0, completed: false, updatedAt: 0, ...over,
        }}
        currentId={undefined} now={0} onOpen={vi.fn()}
        onRename={vi.fn()} onFork={vi.fn()} onArchive={vi.fn()}
        onSettle={vi.fn()} onUnsettle={vi.fn()} onSnooze={vi.fn()} onWake={vi.fn()} t={t}
      />,
    )
    const stateDot = (view: ReturnType<typeof renderRow>) =>
      view.container.querySelector('[data-state]')
    // No completion reminder, not running: no state dot at all.
    const plain = renderRow({})
    expect(stateDot(plain)).toBeNull()
    plain.unmount()
    // Completed while unviewed: the green done dot.
    const done = renderRow({ completed: true })
    expect(done.container.querySelector('[data-state="done"]')).not.toBeNull()
    done.unmount()
    // Running wins the slot: the animated ongoing dot, no done dot.
    const running = renderRow({ completed: true, running: true })
    expect(running.container.querySelector('[data-state="ongoing"]')).not.toBeNull()
    expect(running.container.querySelector('[data-state="done"]')).toBeNull()
    running.unmount()
    // Descendant activity also wins until the last running descendant stops.
    const delegated = renderRow({ completed: true, runningSubagentCount: 1 })
    expect(delegated.container.querySelector('[data-state="ongoing"]')).not.toBeNull()
    expect(delegated.container.querySelector('[data-state="done"]')).toBeNull()
  })

  it('shows descendant activity without describing an idle parent as running', () => {
    vi.useFakeTimers()
    try {
      const node: SessionNode = {
        id: sid('owner'), workspace: 'Project', title: 'Delegating', running: false,
        runningSubagentCount: 2, completed: false, updatedAt: 0,
      }
      render(<SessionNodeItem node={node} currentId={undefined} now={0} onOpen={vi.fn()}
        onRename={vi.fn()} onFork={vi.fn()} onArchive={vi.fn()}
        onSettle={vi.fn()} onUnsettle={vi.fn()} onSnooze={vi.fn()} onWake={vi.fn()} t={t} />)
      const row = screen.getByRole('treeitem')
      expect(row.querySelector('[data-state="ongoing"]')).not.toBeNull()
      expect(screen.getByText('2 个子代理运行中')).toBeTruthy()
      expect(screen.queryByText('进行中')).toBeNull()

      fireEvent.pointerEnter(row.parentElement as HTMLElement)
      act(() => { vi.advanceTimersByTime(500) })
      expect(screen.getAllByText('2 个子代理运行中')).toHaveLength(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps descendant activity secondary while the parent is running', () => {
    vi.useFakeTimers()
    try {
      const node: SessionNode = {
        id: sid('owner'), workspace: 'Project', title: 'Delegating', running: true,
        runningSubagentCount: 1, completed: false, updatedAt: 0,
      }
      render(<SessionNodeItem node={node} currentId={undefined} now={0} onOpen={vi.fn()}
        onRename={vi.fn()} onFork={vi.fn()} onArchive={vi.fn()}
        onSettle={vi.fn()} onUnsettle={vi.fn()} onSnooze={vi.fn()} onWake={vi.fn()} t={t} />)
      const row = screen.getByRole('treeitem')
      expect(row.querySelectorAll('[data-state="ongoing"]')).toHaveLength(1)
      expect(screen.getByText('进行中')).toBeTruthy()
      expect(screen.getByText('1 个子代理运行中')).toBeTruthy()

      fireEvent.pointerEnter(row.parentElement as HTMLElement)
      act(() => { vi.advanceTimersByTime(500) })
      expect(screen.getAllByText('进行中')).toHaveLength(2)
      expect(screen.getAllByText('1 个子代理运行中')).toHaveLength(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps child activity as a secondary status while user attention is primary', () => {
    const node: SessionNode = {
      id: sid('owner'), workspace: 'Project', title: 'Needs input', pendingInteraction: 'question',
      running: false, runningSubagentCount: 1, completed: false, updatedAt: 0,
    }
    render(<SessionNodeItem node={node} currentId={undefined} now={0} onOpen={vi.fn()}
      onRename={vi.fn()} onFork={vi.fn()} onArchive={vi.fn()}
      onSettle={vi.fn()} onUnsettle={vi.fn()} onSnooze={vi.fn()} onWake={vi.fn()} t={t} />)
    const row = screen.getByRole('treeitem')
    expect(row.querySelector('[data-state="warning"]')).not.toBeNull()
    expect(row.querySelector('[data-state="ongoing"]')).toBeNull()
    expect(screen.getByText('等待回答')).toBeTruthy()
    expect(screen.getByText('1 个子代理运行中')).toBeTruthy()
  })

  it('shows the green done dot on a finished search result row', () => {
    render(<SearchResultItem
      result={{
        id: sid('result'), title: 'Done', workspace: 'Workspace', running: false,
        runningSubagentCount: 0, completed: true,
      }}
      currentId={undefined} onOpen={vi.fn()} t={t}
    />)
    expect(screen.getByRole('treeitem').querySelector('[data-state="done"]')).not.toBeNull()
  })

  it('workspace row menu opens on right-click, renames, and shows the danger delete row', () => {
    const onRename = vi.fn()
    const onDelete = vi.fn()
    const onToggle = vi.fn()
    const group: GroupNode = {
      key: 'project', workspaceId: wid('project'), cwd: '/projects/project', createdAt: 0, label: 'Project',
      sessionCount: 0, expanded: false, containsCurrent: false, sessions: [],
    }
    render(<ProjectRowItem
      group={group} onToggle={onToggle} onCreate={vi.fn()}
      actions={{ rename: onRename, delete: onDelete }} t={t}
    />)
    const row = screen.getByRole('treeitem')
    openRowMenu(row)
    // Opening the menu neither toggles the group nor renames yet.
    expect(onToggle).not.toHaveBeenCalled()
    expect(screen.getByRole('menuitem', { name: '删除工作区' }).className).toMatch(/danger/)
    fireEvent.click(screen.getByRole('menuitem', { name: '重命名' }))
    expect(onRename).toHaveBeenCalledOnce()
    expect(screen.queryByRole('menu')).toBeNull()
    openRowMenu(row)
    fireEvent.click(screen.getByRole('menuitem', { name: '删除工作区' }))
    expect(screen.queryByRole('menu')).toBeNull()
    expect(onRename).toHaveBeenCalledOnce()
    expect(onDelete).toHaveBeenCalledOnce()
    // Escape closes without selecting (Menu onClose path).
    openRowMenu(row)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('workspace hover card shows its details and copies the full directory path', async () => {
    vi.useFakeTimers()
    const writeText = vi.fn(async () => {})
    const restoreClipboard = installClipboard(writeText)
    try {
      const group: GroupNode = {
        key: 'project', workspaceId: wid('project'), cwd: '/projects/project', createdAt: 0, label: 'Project',
        sessionCount: 0, expanded: false, containsCurrent: false, sessions: [],
      }
      render(<ProjectRowItem group={group} onToggle={vi.fn()} onCreate={vi.fn()} t={t} />)
      fireEvent.pointerEnter(screen.getByRole('treeitem').parentElement as HTMLElement)
      act(() => { vi.advanceTimersByTime(500) })
      // Card body: full title + cwd + absolute creation time.
      expect(screen.getAllByText('Project')).toHaveLength(2)
      expect(screen.getByText('/projects/project')).toBeTruthy()
      expect(screen.getByText(/^创建于 \d+年\d+月\d+日 /)).toBeTruthy()
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: '复制: /projects/project' })) })
      expect(writeText).toHaveBeenCalledWith('/projects/project')
      expect(screen.getByRole('status').textContent).toBe('已复制')
    } finally {
      restoreClipboard()
      vi.useRealTimers()
    }
  })

  it('workspace hover card shows a POSIX home descendant as ~ and still copies the full path', async () => {
    vi.useFakeTimers()
    const writeText = vi.fn(async () => {})
    const restoreClipboard = installClipboard(writeText)
    try {
      const group: GroupNode = {
        key: 'project', workspaceId: wid('project'), cwd: '/home/u/Documents/project', createdAt: 0, label: 'Project',
        sessionCount: 0, expanded: false, containsCurrent: false, sessions: [],
      }
      render(<ProjectRowItem group={group} home="/home/u" onToggle={vi.fn()} onCreate={vi.fn()} t={t} />)
      fireEvent.pointerEnter(screen.getByRole('treeitem').parentElement as HTMLElement)
      act(() => { vi.advanceTimersByTime(500) })
      expect(screen.getByText('~/Documents/project')).toBeTruthy()
      expect(screen.queryByText('/home/u/Documents/project')).toBeNull()
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: '复制: /home/u/Documents/project' })) })
      expect(writeText).toHaveBeenCalledWith('/home/u/Documents/project')
    } finally {
      restoreClipboard()
      vi.useRealTimers()
    }
  })

  it('workspace hover card without a directory omits the path and copy action', async () => {
    vi.useFakeTimers()
    try {
      const group: GroupNode = {
        key: 'project', workspaceId: wid('project'), cwd: undefined, createdAt: 0, label: 'Project',
        sessionCount: 0, expanded: false, containsCurrent: false, sessions: [],
      }
      render(<ProjectRowItem group={group} home="/home/u" onToggle={vi.fn()} onCreate={vi.fn()} t={t} />)
      fireEvent.pointerEnter(screen.getByRole('treeitem').parentElement as HTMLElement)
      act(() => { vi.advanceTimersByTime(500) })
      expect(screen.getAllByText('Project')).toHaveLength(2)
      expect(screen.getByText(/^创建于 \d+年\d+月\d+日 /)).toBeTruthy()
      expect(screen.queryByRole('button', { name: /^复制:/ })).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('workspace hover card leaves a Windows path verbatim', async () => {
    vi.useFakeTimers()
    try {
      const group: GroupNode = {
        key: 'project', workspaceId: wid('project'), cwd: 'C:\\Users\\u\\project', createdAt: 0, label: 'Project',
        sessionCount: 0, expanded: false, containsCurrent: false, sessions: [],
      }
      render(<ProjectRowItem group={group} home="C:\\Users\\u" onToggle={vi.fn()} onCreate={vi.fn()} t={t} />)
      fireEvent.pointerEnter(screen.getByRole('treeitem').parentElement as HTMLElement)
      act(() => { vi.advanceTimersByTime(500) })
      expect(screen.getByText('C:\\Users\\u\\project')).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })

  it('ungrouped bucket renders no workspace menu', () => {
    const group: GroupNode = {
      key: '', workspaceId: undefined, cwd: undefined, createdAt: undefined, label: 'Ungrouped',
      sessionCount: 0, expanded: false, containsCurrent: false, sessions: [],
    }
    render(<ProjectRowItem group={group} onToggle={vi.fn()} onCreate={vi.fn()} t={t} />)
    expect(screen.queryByRole('button', { name: /工作区/ })).toBeNull()
  })

  it('session row menu opens without opening the session and dispatches rename, fork, and archive', () => {
    const onOpen = vi.fn()
    const onRename = vi.fn()
    const onFork = vi.fn()
    const onArchive = vi.fn()
    const node: SessionNode = {
      id: sid('s1'), workspace: 'Project', title: 'One', running: false,
      runningSubagentCount: 0, completed: false, updatedAt: 0,
    }
    render(<SessionNodeItem node={node} currentId={undefined} now={0} onOpen={onOpen}
      onRename={onRename} onFork={onFork} onArchive={onArchive}
      onSettle={vi.fn()} onUnsettle={vi.fn()} onSnooze={vi.fn()} onWake={vi.fn()} t={t} />)
    openRowMenu(screen.getByRole('treeitem'))
    expect(onOpen).not.toHaveBeenCalled()
    // Archive is not destructive (log and accounting slot remain): no danger styling.
    expect(screen.getByRole('menuitem', { name: '归档会话' }).className).not.toMatch(/danger/)
    // Rename dispatches with the current display title (dialog prefill).
    fireEvent.click(screen.getByRole('menuitem', { name: '重命名' }))
    expect(screen.queryByRole('menu')).toBeNull()
    expect(onRename).toHaveBeenCalledWith(node.id, 'One')
    expect(onOpen).not.toHaveBeenCalled()
    openRowMenu(screen.getByRole('treeitem'))
    fireEvent.click(screen.getByRole('menuitem', { name: '分叉会话' }))
    expect(onFork).toHaveBeenCalledWith(node.id)
    // Archive dispatches without opening the session.
    openRowMenu(screen.getByRole('treeitem'))
    fireEvent.click(screen.getByRole('menuitem', { name: '归档会话' }))
    expect(onArchive).toHaveBeenCalledWith(node.id)
    expect(onRename).toHaveBeenCalledOnce()
    expect(onOpen).not.toHaveBeenCalled()
    // Escape closes without selecting (Menu onClose path).
    openRowMenu(screen.getByRole('treeitem'))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
  })


  it('shows the hover card after the dwell and suppresses it while the row menu is open', () => {
    vi.useFakeTimers()
    try {
      const node: SessionNode = {
        id: sid('s1'), workspace: 'Project', title: 'Hovered', running: true,
        runningSubagentCount: 0, completed: false, updatedAt: 0,
      }
      render(<SessionNodeItem node={node} currentId={undefined} now={60_000} onOpen={vi.fn()}
        onRename={vi.fn()} onFork={vi.fn()} onArchive={vi.fn()}
        onSettle={vi.fn()} onUnsettle={vi.fn()} onSnooze={vi.fn()} onWake={vi.fn()} t={t} />)
      const wrapper = screen.getByRole('treeitem').parentElement as HTMLElement
      fireEvent.pointerEnter(wrapper)
      act(() => { vi.advanceTimersByTime(500) })
      // Card body: full title + relative time + running status.
      expect(screen.getAllByText('Hovered')).toHaveLength(2)
      expect(screen.getByText('1分钟前')).toBeTruthy()
      expect(screen.getAllByText('进行中')).toHaveLength(2)
      fireEvent.pointerLeave(wrapper)
      // Menu open (disabled=true) suppresses the card for the same hover.
      openRowMenu(screen.getByRole('treeitem'))
      fireEvent.pointerEnter(wrapper)
      act(() => { vi.advanceTimersByTime(1000) })
      expect(screen.queryByText('1分钟前')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it.each([
    ['approval', '等待审批'],
    ['plan-review', '计划待审'],
    ['question', '等待回答'],
  ] as const)('shows %s as warning ahead of the running state', (pendingInteraction, label) => {
    vi.useFakeTimers()
    try {
      const node: SessionNode = {
        id: sid(pendingInteraction), workspace: 'Project', title: 'Needs input',
        pendingInteraction, running: true, runningSubagentCount: 0, completed: false, updatedAt: 0,
      }
      const view = render(<SessionNodeItem node={node} currentId={undefined} now={0} onOpen={vi.fn()}
        onRename={vi.fn()} onFork={vi.fn()} onArchive={vi.fn()}
        onSettle={vi.fn()} onUnsettle={vi.fn()} onSnooze={vi.fn()} onWake={vi.fn()} t={t} />)
      const row = screen.getByRole('treeitem')
      expect(row.querySelector('[data-state="warning"]')).toBeTruthy()
      expect(row.querySelector('[data-state="ongoing"]')).toBeNull()
      expect(screen.getByText(label)).toBeTruthy()

      view.rerender(<SessionNodeItem node={{ ...node, running: false }} currentId={undefined} now={0}
        onOpen={vi.fn()} onRename={vi.fn()} onFork={vi.fn()} onArchive={vi.fn()}
        onSettle={vi.fn()} onUnsettle={vi.fn()} onSnooze={vi.fn()} onWake={vi.fn()} t={t} />)
      expect(screen.getByRole('treeitem').querySelector('[data-state="warning"]')).toBeTruthy()

      fireEvent.pointerEnter(screen.getByRole('treeitem').parentElement as HTMLElement)
      act(() => { vi.advanceTimersByTime(500) })
      expect(screen.getAllByText(label)).toHaveLength(2)
      expect(document.querySelectorAll('[data-state="warning"]')).toHaveLength(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('idle hover card shows the Idle status line', () => {
    vi.useFakeTimers()
    try {
      const node: SessionNode = {
        id: sid('s1'), workspace: 'Project', title: 'Quiet', running: false,
        runningSubagentCount: 0, completed: false, updatedAt: 0,
      }
      render(<SessionNodeItem node={node} currentId={undefined} now={0} onOpen={vi.fn()}
        onRename={vi.fn()} onFork={vi.fn()} onArchive={vi.fn()}
        onSettle={vi.fn()} onUnsettle={vi.fn()} onSnooze={vi.fn()} onWake={vi.fn()} t={t} />)
      fireEvent.pointerEnter(screen.getByRole('treeitem').parentElement as HTMLElement)
      act(() => { vi.advanceTimersByTime(500) })
      expect(screen.getByText('空闲')).toBeTruthy()
      expect(screen.getAllByText('刚刚')).toHaveLength(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('completed hover card shows the Completed status line', () => {
    vi.useFakeTimers()
    try {
      const node: SessionNode = {
        id: sid('s1'), workspace: 'Project', title: 'Done', running: false,
        runningSubagentCount: 0, completed: true, updatedAt: 0,
      }
      render(<SessionNodeItem node={node} currentId={undefined} now={0} onOpen={vi.fn()}
        onRename={vi.fn()} onFork={vi.fn()} onArchive={vi.fn()}
        onSettle={vi.fn()} onUnsettle={vi.fn()} onSnooze={vi.fn()} onWake={vi.fn()} t={t} />)
      fireEvent.pointerEnter(screen.getByRole('treeitem').parentElement as HTMLElement)
      act(() => { vi.advanceTimersByTime(500) })
      // Row's visually-hidden reminder label plus the hover card's status line.
      expect(screen.getAllByText('已完成')).toHaveLength(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('draggable row wires start/end and gates hover/drop on an active same-group drag', () => {
    const node: SessionNode = {
      id: sid('s1'), workspace: 'Project', title: 'Drag me', running: false,
      runningSubagentCount: 0, completed: false, updatedAt: 0,
    }
    const inactive = dragProps()
    const { rerender } = render(
      <SessionNodeItem node={node} currentId={undefined} now={0} onOpen={vi.fn()}
        onRename={vi.fn()} onFork={vi.fn()} onArchive={vi.fn()}
        onSettle={vi.fn()} onUnsettle={vi.fn()} onSnooze={vi.fn()} onWake={vi.fn()} drag={inactive} t={t} />,
    )
    const row = screen.getByRole('treeitem')
    stubRect(row)
    expect(row.getAttribute('draggable')).toBe('true')
    fireEvent.dragStart(row, { dataTransfer })
    expect(inactive.start).toHaveBeenCalledOnce()
    // Inactive drag: hover and drop are rejected.
    fireEvent.dragOver(row, { dataTransfer })
    fireEvent.drop(row, { dataTransfer })
    expect(inactive.hover).not.toHaveBeenCalled()
    expect(inactive.drop).not.toHaveBeenCalled()
    fireEvent.dragEnd(row)
    expect(inactive.end).toHaveBeenCalledOnce()

    const active = dragProps({ active: true, marker: 'before' })
    rerender(
      <SessionNodeItem node={node} currentId={undefined} now={0} onOpen={vi.fn()}
        onRename={vi.fn()} onFork={vi.fn()} onArchive={vi.fn()}
        onSettle={vi.fn()} onUnsettle={vi.fn()} onSnooze={vi.fn()} onWake={vi.fn()} drag={active} t={t} />,
    )
    stubRect(screen.getByRole('treeitem'))
    // Top half hovers/drops 'before'; bottom half 'after' (row mid = 117).
    fireDrag(screen.getByRole('treeitem'), 'dragOver', 105)
    expect(active.hover).toHaveBeenCalledWith('before')
    fireDrag(screen.getByRole('treeitem'), 'dragOver', 130)
    expect(active.hover).toHaveBeenCalledWith('after')
    fireDrag(screen.getByRole('treeitem'), 'drop', 130)
    expect(active.drop).toHaveBeenCalledWith('after')

    const after = dragProps({ active: true, marker: 'after' })
    rerender(
      <SessionNodeItem node={node} currentId={undefined} now={0} onOpen={vi.fn()}
        onRename={vi.fn()} onFork={vi.fn()} onArchive={vi.fn()}
        onSettle={vi.fn()} onUnsettle={vi.fn()} onSnooze={vi.fn()} onWake={vi.fn()} drag={after} t={t} />,
    )
    expect(screen.getByRole('treeitem').className).toMatch(/dropAfter/)
  })
  it('settles from the hover quick action without opening the session', () => {
    const onOpen = vi.fn()
    const onSettle = vi.fn()
    const node: SessionNode = {
      id: sid('s1'), workspace: 'Project', title: 'Park me', running: false,
      runningSubagentCount: 0, completed: false, updatedAt: 0,
    }
    render(<SessionNodeItem node={node} currentId={undefined} now={0} onOpen={onOpen}
      onRename={vi.fn()} onFork={vi.fn()} onArchive={vi.fn()}
      onSettle={onSettle} onUnsettle={vi.fn()} onSnooze={vi.fn()} onWake={vi.fn()} t={t} />)
    fireEvent.click(screen.getByRole('button', { name: '结算会话' }))
    expect(onSettle).toHaveBeenCalledWith(node.id)
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('snoozes from the popover: presets resolve at open time and dispatch the wake time', () => {
    vi.useFakeTimers()
    try {
      const now = new Date(2026, 7, 19, 10, 0, 0, 0).getTime()
      vi.setSystemTime(now)
      const onSnooze = vi.fn()
      const node: SessionNode = {
        id: sid('s1'), workspace: 'Project', title: 'Later', running: false,
        runningSubagentCount: 0, completed: false, updatedAt: 0,
      }
      render(<SessionNodeItem node={node} currentId={undefined} now={now} onOpen={vi.fn()}
        onRename={vi.fn()} onFork={vi.fn()} onArchive={vi.fn()}
        onSettle={vi.fn()} onUnsettle={vi.fn()} onSnooze={onSnooze} onWake={vi.fn()} t={t} />)
      fireEvent.click(screen.getByRole('button', { name: '稍后提醒会话' }))
      // Evening appears only while it is >1h before 18:00.
      expect(screen.getByRole('menuitem', { name: /今晚/ })).toBeTruthy()
      fireEvent.click(screen.getByRole('menuitem', { name: /1 小时后/ }))
      expect(onSnooze).toHaveBeenCalledWith(node.id, now + 3_600_000)
      expect(screen.queryByRole('menu')).toBeNull()
      // Escape closes the reopened popover through the Menu onClose path.
      fireEvent.click(screen.getByRole('button', { name: '稍后提醒会话' }))
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(screen.queryByRole('menu')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('parked rows swap the quick action: un-settle on settled, wake on snoozed', () => {
    const onUnsettle = vi.fn()
    const onWake = vi.fn()
    const base = {
      workspace: 'Project', running: false, runningSubagentCount: 0, completed: false, updatedAt: 0,
    }
    const settledNode: SessionNode = { id: sid('settled'), title: 'Settled', ...base }
    const settled = render(<SessionNodeItem node={settledNode} currentId={undefined} now={0} onOpen={vi.fn()}
      onRename={vi.fn()} onFork={vi.fn()} onArchive={vi.fn()}
      onSettle={vi.fn()} onUnsettle={onUnsettle} onSnooze={vi.fn()} onWake={vi.fn()} settled t={t} />)
    expect(screen.queryByRole('button', { name: '结算会话' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '取消结算会话' }))
    expect(onUnsettle).toHaveBeenCalledWith(settledNode.id)
    settled.unmount()

    const snoozedNode: SessionNode = { id: sid('snoozed'), title: 'Snoozed', ...base }
    const snoozedView = render(<SessionNodeItem node={snoozedNode} currentId={undefined} now={0} onOpen={vi.fn()}
      onRename={vi.fn()} onFork={vi.fn()} onArchive={vi.fn()}
      onSettle={vi.fn()} onUnsettle={vi.fn()} onSnooze={vi.fn()} onWake={onWake}
      snoozedUntil={7_200_000} t={t} />)
    // The trailing seat shows the countdown instead of the status or time.
    expect(screen.getByText('2小时')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '立即唤醒会话' }))
    expect(onWake).toHaveBeenCalledWith(snoozedNode.id)
    snoozedView.unmount()
    // Multi-day wakes count down in days.
    render(<SessionNodeItem node={{ ...snoozedNode, id: sid('long') }} currentId={undefined} now={0} onOpen={vi.fn()}
      onRename={vi.fn()} onFork={vi.fn()} onArchive={vi.fn()}
      onSettle={vi.fn()} onUnsettle={vi.fn()} onSnooze={vi.fn()} onWake={vi.fn()}
      snoozedUntil={3 * 86_400_000} t={t} />)
    expect(screen.getByText('3天')).toBeTruthy()
  })

  it('shows the Woke pill on a woken row; clicking it dismisses and opening acknowledges', () => {
    const onOpen = vi.fn()
    const onWake = vi.fn()
    const node: SessionNode = {
      id: sid('s1'), workspace: 'Project', title: 'Back', running: false,
      runningSubagentCount: 0, completed: false, updatedAt: 0,
    }
    render(<SessionNodeItem node={node} currentId={undefined} now={0} onOpen={onOpen}
      onRename={vi.fn()} onFork={vi.fn()} onArchive={vi.fn()}
      onSettle={vi.fn()} onUnsettle={vi.fn()} onSnooze={vi.fn()} onWake={onWake} woke t={t} />)
    const pill = screen.getByRole('button', { name: '关闭唤醒提示' })
    expect(pill.textContent).toContain('已唤醒')
    fireEvent.click(pill)
    expect(onWake).toHaveBeenCalledWith(node.id)
    expect(onOpen).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('treeitem'))
    expect(onOpen).toHaveBeenCalledWith(node.id)
    // A visit is an acknowledgment: the second wake dispatch clears the pill.
    expect(onWake).toHaveBeenCalledTimes(2)
  })

  it('offers lifecycle items in the context menu per row state and snoozes via the submenu', () => {
    const onSettle = vi.fn()
    const onUnsettle = vi.fn()
    const onWake = vi.fn()
    const onSnooze = vi.fn()
    const base = {
      workspace: 'Project', running: false, runningSubagentCount: 0, completed: false, updatedAt: 0,
    }
    const active: SessionNode = { id: sid('a'), title: 'Active', ...base }
    const activeView = render(<SessionNodeItem node={active} currentId={undefined} now={0} onOpen={vi.fn()}
      onRename={vi.fn()} onFork={vi.fn()} onArchive={vi.fn()}
      onSettle={onSettle} onUnsettle={onUnsettle} onSnooze={onSnooze} onWake={onWake} t={t} />)
    openRowMenu(screen.getByRole('treeitem'))
    // The Snooze entry is a submenu; the presets dispatch like the popover.
    fireEvent.mouseEnter(screen.getByRole('menuitem', { name: '稍后提醒' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /1 小时后/ }))
    expect(onSnooze).toHaveBeenCalledTimes(1)
    expect(onSnooze.mock.calls[0]?.[0]).toBe(active.id)
    activeView.unmount()

    const settled: SessionNode = { id: sid('s'), title: 'Settled', ...base }
    const settledView = render(<SessionNodeItem node={settled} currentId={undefined} now={0} onOpen={vi.fn()}
      onRename={vi.fn()} onFork={vi.fn()} onArchive={vi.fn()}
      onSettle={onSettle} onUnsettle={onUnsettle} onSnooze={onSnooze} onWake={onWake} settled t={t} />)
    openRowMenu(screen.getByRole('treeitem'))
    expect(screen.getByRole('menuitem', { name: '取消结算' })).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: '结算会话' })).toBeNull()
    fireEvent.click(screen.getByRole('menuitem', { name: '取消结算' }))
    expect(onUnsettle).toHaveBeenCalledWith(settled.id)
    settledView.unmount()

    const snoozed: SessionNode = { id: sid('n'), title: 'Snoozed', ...base }
    const snoozedView = render(<SessionNodeItem node={snoozed} currentId={undefined} now={0} onOpen={vi.fn()}
      onRename={vi.fn()} onFork={vi.fn()} onArchive={vi.fn()}
      onSettle={onSettle} onUnsettle={onUnsettle} onSnooze={onSnooze} onWake={onWake}
      snoozedUntil={3_600_000} t={t} />)
    openRowMenu(screen.getByRole('treeitem'))
    fireEvent.click(screen.getByRole('menuitem', { name: '立即唤醒' }))
    expect(onWake).toHaveBeenCalledWith(snoozed.id)
    snoozedView.unmount()

    const activeTwo: SessionNode = { id: sid('a2'), title: 'Active Two', ...base }
    render(<SessionNodeItem node={activeTwo} currentId={undefined} now={0} onOpen={vi.fn()}
      onRename={vi.fn()} onFork={vi.fn()} onArchive={vi.fn()}
      onSettle={onSettle} onUnsettle={onUnsettle} onSnooze={onSnooze} onWake={onWake} t={t} />)
    openRowMenu(screen.getByRole('treeitem'))
    fireEvent.click(screen.getByRole('menuitem', { name: '结算会话' }))
    expect(onSettle).toHaveBeenCalledWith(activeTwo.id)
  })

  it('hides settle and snooze on blocked-on-you rows (pending interaction stays visible)', () => {
    const node: SessionNode = {
      id: sid('s1'), workspace: 'Project', title: 'Blocked', pendingInteraction: 'approval',
      running: false, runningSubagentCount: 0, completed: false, updatedAt: 0,
    }
    render(<SessionNodeItem node={node} currentId={undefined} now={0} onOpen={vi.fn()}
      onRename={vi.fn()} onFork={vi.fn()} onArchive={vi.fn()}
      onSettle={vi.fn()} onUnsettle={vi.fn()} onSnooze={vi.fn()} onWake={vi.fn()} t={t} />)
    expect(screen.queryByRole('button', { name: '结算会话' })).toBeNull()
    expect(screen.queryByRole('button', { name: '稍后提醒会话' })).toBeNull()
    openRowMenu(screen.getByRole('treeitem'))
    expect(screen.queryByRole('menuitem', { name: '结算会话' })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: '稍后提醒' })).toBeNull()
    expect(screen.getByRole('menuitem', { name: '归档会话' })).toBeTruthy()
  })
})
