// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  SessionId, SessionListState, SessionSummary, WorkspaceId, WorkspaceListState, WorkspaceView,
} from '@monotykamary/dsh-client-runtime/client'
import { makeTranslate } from '@monotykamary/dsh-client-test-runtime'
import { zh as commonZh } from '@monotykamary/dsh-client-locale/src/locales/zh.ts'
import type { CommandPaletteProps } from '../src/client/contract.ts'
import { CommandPalette } from '../src/client/CommandPalette.tsx'
import { zh } from '../src/client/locales.ts'

const sid = (value: string) => value as SessionId
const wid = (value: string) => value as WorkspaceId
const summary = (id: string, updatedAt: number, overrides: Partial<SessionSummary> = {}): SessionSummary => ({
  id: sid(id), displayTitle: id, running: false, blank: false, updatedAt, ...overrides,
})
const sessionState = (rows: readonly SessionSummary[], current?: string): SessionListState => ({
  ids: rows.map(row => row.id), byId: Object.fromEntries(rows.map(row => [row.id, row])),
  current: current === undefined ? undefined : sid(current), phase: 'ready',
  subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined,
})
const workspace = (id: string, sessionIds: string[] = [], title = id): WorkspaceView => ({
  workspaceId: wid(id), path: `/projects/${id}`, title, sessionIds: sessionIds.map(sid),
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
})
const workspaceState = (items: readonly WorkspaceView[], recent?: string): WorkspaceListState => ({
  items, archivedSessionIds: [], state: 'idle', phase: 'ready', error: null, baselinesReady: true,
  recentWorkspaceId: recent === undefined ? undefined : wid(recent),
})
function hook<T>(snapshot: T) {
  return function select<S>(selector: (state: T) => S): S { return selector(snapshot) }
}
const t: CommandPaletteProps['t'] = makeTranslate(zh, commonZh)

function mount(overrides: Partial<CommandPaletteProps> = {}) {
  const props: CommandPaletteProps = {
    useSessions: hook(sessionState([])),
    useWorkspaces: hook(workspaceState([])),
    openSession: vi.fn(),
    startSession: vi.fn(async () => {}),
    searchSessions: vi.fn(async () => ({ items: [], hasMore: false })),
    searchResultLimit: 20,
    t,
    ...overrides,
  }
  const view = render(<CommandPalette {...props} />)
  return { props, view }
}

function openPalette(): HTMLInputElement {
  fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
  return screen.getByRole('combobox') as HTMLInputElement
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})
beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div>'
  const appRoot = document.getElementById('root')
  if (appRoot === null) throw new Error('test root missing')
  appRoot.inert = false
  Object.defineProperty(navigator, 'platform', { configurable: true, value: 'Linux' })
  // jsdom has no layout; install the browser API so highlight scrolling follows the production path.
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() })
})

describe('CommandPalette', () => {
  it('toggles globally, restores focus, and ignores non-shortcut variants', () => {
    const previous = document.createElement('button')
    document.body.appendChild(previous)
    previous.focus()
    mount()

    fireEvent.keyDown(window, { key: 'k' })
    fireEvent.keyDown(window, { key: 'k', metaKey: true, ctrlKey: true })
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true, altKey: true })
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true, shiftKey: true })
    fireEvent.keyDown(window, { key: 'x', ctrlKey: true })
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true, repeat: true })
    expect(screen.queryByRole('dialog')).toBeNull()

    const input = openPalette()
    expect(document.getElementById('root')?.inert).toBe(true)
    expect(document.activeElement).toBe(input)
    expect(screen.getByRole('dialog', { name: '命令面板' })).toBeTruthy()
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.getElementById('root')?.inert).toBe(false)
    expect(document.activeElement).toBe(previous)

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    previous.remove()
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens without an application root or preceding HTML focus owner', () => {
    document.getElementById('root')?.remove()
    const own = Object.getOwnPropertyDescriptor(document, 'activeElement')
    Object.defineProperty(document, 'activeElement', { configurable: true, value: null })
    try {
      mount()
      fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
      expect(screen.getByRole('dialog')).toBeTruthy()
      fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' })
    } finally {
      if (own === undefined) delete (document as unknown as { activeElement?: Element }).activeElement
      else Object.defineProperty(document, 'activeElement', own)
    }
  })

  it('restores a pre-existing inert application root', () => {
    const root = document.getElementById('root')
    if (root === null) throw new Error('test root missing')
    root.inert = true
    mount()
    openPalette()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(root.inert).toBe(true)
  })

  it('uses Command on Apple platforms and closes from outside the input', () => {
    Object.defineProperty(navigator, 'platform', { configurable: true, value: 'MacIntel' })
    mount()
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    expect(screen.getByRole('dialog')).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens recent Sessions with status and navigates them by keyboard and pointer', () => {
    const alpha = workspace('alpha', ['current', 'running', 'waiting', 'done', 'idle'], 'Alpha')
    const b = mount({
      useSessions: hook(sessionState([
        summary('current', 5),
        summary('running', 4, { running: true }),
        summary('waiting', 3, { pendingInteraction: 'approval' }),
        summary('done', 2, { completed: true }),
        summary('idle', 1),
      ], 'current')),
      useWorkspaces: hook(workspaceState([alpha], 'alpha')),
    })
    const input = openPalette()
    expect(screen.getByText('在“Alpha”中新建会话')).toBeTruthy()
    expect(screen.getByText('最近会话')).toBeTruthy()
    expect(screen.getByText('当前')).toBeTruthy()
    expect(document.querySelector('[data-state="ongoing"]')).toBeTruthy()
    expect(document.querySelector('[data-state="warning"]')).toBeTruthy()
    expect(document.querySelector('[data-state="done"]')).toBeTruthy()
    expect(screen.getByText('进行中')).toBeTruthy()
    expect(screen.getByText('等待操作')).toBeTruthy()
    expect(screen.getByText('已完成')).toBeTruthy()

    fireEvent.keyDown(input, { key: 'End' })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    fireEvent.keyDown(input, { key: 'Home' })
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(b.props.openSession).toHaveBeenCalledWith('idle')
    expect(screen.queryByRole('dialog')).toBeNull()

    openPalette()
    const running = screen.getByRole('option', { name: /running/u })
    fireEvent.mouseEnter(running)
    fireEvent.mouseDown(running)
    fireEvent.click(running)
    expect(b.props.openSession).toHaveBeenLastCalledWith('running')
  })

  it('creates in the contextual Workspace and falls back to the blank New Session view', async () => {
    const alpha = workspace('alpha', [], 'Alpha')
    const contextual = mount({
      useWorkspaces: hook(workspaceState([alpha], 'alpha')),
    })
    openPalette()
    fireEvent.click(screen.getByRole('option', { name: /在“Alpha”中新建会话/u }))
    await waitFor(() => { expect(contextual.props.startSession).toHaveBeenCalledWith(wid('alpha')) })
    expect(screen.queryByRole('dialog')).toBeNull()

    cleanup()
    const empty = mount()
    openPalette()
    fireEvent.click(screen.getByRole('option', { name: /^新会话选择目标工作区/u }))
    await waitFor(() => { expect(empty.props.startSession).toHaveBeenCalledWith(undefined) })
  })

  it('enters the Workspace picker, Tab-completes, and confirms without creating on Tab', async () => {
    const alpha = workspace('alpha', [], 'Alpha')
    const beta = workspace('beta', [], 'Beta')
    const b = mount({ useWorkspaces: hook(workspaceState([alpha, beta], 'alpha')) })
    const input = openPalette()
    fireEvent.click(screen.getByRole('option', { name: /^在工作区中新建会话/u }))
    expect(input.placeholder).toContain('选择新会话')
    expect(screen.getAllByRole('option')).toHaveLength(2)

    fireEvent.change(input, { target: { value: 'bet' } })
    fireEvent.keyDown(input, { key: 'Tab' })
    expect(b.props.startSession).not.toHaveBeenCalled()
    expect(input.value).toBe('Beta')
    expect(screen.getByText('已选择“Beta”')).toBeTruthy()
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => { expect(b.props.startSession).toHaveBeenCalledWith(wid('beta')) })
  })

  it('supports direct Workspace creation, back navigation, focus trapping, and an empty result', async () => {
    const alpha = workspace('alpha', [], 'Alpha')
    const b = mount({ useWorkspaces: hook(workspaceState([alpha], 'alpha')) })
    const input = openPalette()
    fireEvent.click(screen.getByRole('option', { name: /^在工作区中新建会话/u }))
    fireEvent.keyDown(input, { key: 'Tab' })
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.keyDown(input, { key: 'Backspace' })
    expect(screen.getByText('操作')).toBeTruthy()

    fireEvent.click(screen.getByRole('option', { name: /^在工作区中新建会话/u }))
    fireEvent.change(input, { target: { value: 'missing' } })
    expect(screen.getByText('无匹配的工作区。')).toBeTruthy()
    fireEvent.keyDown(input, { key: 'Tab' })
    expect(document.activeElement).toBe(input)
    const back = screen.getByRole('button', { name: '返回' })
    fireEvent.mouseDown(back)
    expect(document.activeElement).toBe(input)
    fireEvent.click(back)

    fireEvent.change(input, { target: { value: 'Alpha' } })
    const workspaceGroup = screen.getByRole('group', { name: '工作区' })
    fireEvent.click(within(workspaceGroup).getByRole('option', { name: /Alpha/u }))
    await waitFor(() => { expect(b.props.startSession).toHaveBeenCalledWith(wid('alpha')) })
  })

  it('filters local metadata, merges debounced content search, and reports pending and bounds', async () => {
    vi.useFakeTimers()
    const alpha = workspace('alpha', ['local', 'remote'], 'Alpha')
    const searchSessions = vi.fn(async () => ({
      items: [{ sessionId: sid('remote'), snippet: 'historical needle' }], hasMore: true,
    }))
    mount({
      useSessions: hook(sessionState([
        summary('local', 2, { displayTitle: 'Needle local' }),
        summary('remote', 1, { displayTitle: 'Remote title' }),
      ])),
      useWorkspaces: hook(workspaceState([alpha], 'alpha')),
      searchSessions,
    })
    const input = openPalette()
    fireEvent.change(input, { target: { value: 'n' } })
    expect(searchSessions).not.toHaveBeenCalled()
    fireEvent.change(input, { target: { value: 'needle' } })
    expect(screen.getByText('正在搜索会话历史…')).toBeTruthy()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250)
      await Promise.resolve()
    })
    expect(searchSessions).toHaveBeenCalledWith('needle', expect.any(AbortSignal))
    expect(screen.getByText('historical needle')).toBeTruthy()
    expect(screen.getByText(/仅显示前 20 条结果/u)).toBeTruthy()
  })

  it('keeps metadata results on content failure and aborts a superseded request', async () => {
    vi.useFakeTimers()
    let resolveFirst!: (value: { items: []; hasMore: false }) => void
    const searchSessions = vi.fn((query: string) => query === 'first'
      ? new Promise<{ items: []; hasMore: false }>((resolve) => { resolveFirst = resolve })
      : Promise.reject(new Error('index unavailable')))
    mount({
      useSessions: hook(sessionState([summary('local', 1, { displayTitle: 'Second local' })])),
      searchSessions,
    })
    const input = openPalette()
    fireEvent.change(input, { target: { value: 'first' } })
    await act(async () => { await vi.advanceTimersByTimeAsync(250) })
    fireEvent.change(input, { target: { value: 'second' } })
    resolveFirst({ items: [], hasMore: false })
    await act(async () => { await vi.advanceTimersByTimeAsync(250) })
    await act(async () => { await Promise.resolve() })
    expect(screen.getByText('Second local')).toBeTruthy()
    expect(screen.getByText(/内容搜索暂不可用/u)).toBeTruthy()
  })

  it('contains a rejected content search after a newer query aborts it', async () => {
    vi.useFakeTimers()
    let rejectFirst!: (error: Error) => void
    const searchSessions = vi.fn((query: string) => query === 'first'
      ? new Promise<never>((_resolve, reject) => { rejectFirst = reject })
      : Promise.resolve({ items: [], hasMore: false }))
    mount({ searchSessions })
    const input = openPalette()
    fireEvent.change(input, { target: { value: 'first' } })
    await act(async () => { await vi.advanceTimersByTimeAsync(250) })
    fireEvent.change(input, { target: { value: 'second' } })
    rejectFirst(new Error('superseded'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250)
      await Promise.resolve()
    })
    expect(screen.queryByText(/内容搜索暂不可用/u)).toBeNull()
  })

  it.each([new Error('create failed'), 'string failure'])('shows a creation error for %s and keeps the dialog open', async (reason) => {
    const alpha = workspace('alpha', [], 'Alpha')
    const startSession = vi.fn(async () => { throw reason })
    mount({ useWorkspaces: hook(workspaceState([alpha], 'alpha')), startSession })
    openPalette()
    fireEvent.click(screen.getByRole('option', { name: /在“Alpha”中新建会话/u }))
    await screen.findByRole('alert')
    expect(screen.getByRole('alert').textContent).toContain(reason instanceof Error ? reason.message : reason)
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('searches Workspaces from the root and renders the no-match state', () => {
    const alpha = workspace('alpha', [], 'Alpha')
    mount({ useWorkspaces: hook(workspaceState([alpha], 'alpha')) })
    const input = openPalette()
    fireEvent.change(input, { target: { value: '/projects/alpha' } })
    expect(screen.getByText('工作区')).toBeTruthy()
    expect(screen.getByRole('option', { name: /Alpha/u })).toBeTruthy()
    fireEvent.change(input, { target: { value: 'z' } })
    expect(screen.getByText('无匹配的命令、工作区或会话。')).toBeTruthy()
    for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', 'Tab', 'Backspace', 'a']) {
      fireEvent.keyDown(input, { key })
    }
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('ignores a second action while Session creation is pending', async () => {
    let resolveStart!: () => void
    const startSession = vi.fn(() => new Promise<void>((resolve) => { resolveStart = resolve }))
    const alpha = workspace('alpha', [], 'Alpha')
    mount({ useWorkspaces: hook(workspaceState([alpha], 'alpha')), startSession })
    openPalette()
    const action = screen.getByRole('option', { name: /在“Alpha”中新建会话/u })
    fireEvent.click(action)
    fireEvent.click(action)
    expect(startSession).toHaveBeenCalledTimes(1)
    await act(async () => { resolveStart(); await Promise.resolve() })
  })
})
