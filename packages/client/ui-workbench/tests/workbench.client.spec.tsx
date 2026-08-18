// @vitest-environment jsdom
import { useSyncExternalStore } from 'react'
import type { ReactElement } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ConversationSnapshot, SessionId, SessionListState, WorkspaceListState,
} from '@monotykamary/dsh-client-runtime/client'
import { makeTranslate } from '@monotykamary/dsh-client-test-runtime'
import type { WorkbenchProps, WorkbenchSurface, WorkbenchSurfaceId } from '../src/client/contract.ts'
import { en, zh } from '../src/client/locales.ts'
import { createWorkbenchStore } from '../src/client/store.ts'
import { Workbench } from '../src/client/Workbench.tsx'

const SID = 'session' as SessionId
const id = (value: string) => value as WorkbenchSurfaceId
const surface = (value: string, label: string): WorkbenchSurface => ({ id: id(value), label })
const inputActions: WorkbenchProps['inputActions'] = {
  setDraft: () => {}, addImages: () => true, removeImage: () => {}, pruneImages: () => {}, submit: () => {},
}
const SessionProviderStub: WorkbenchProps['SessionProvider'] = ({ children }) => children(SID)

function hookOf<T>(source: { subscribe: (listener: () => void) => () => void; getSnapshot: () => T }) {
  return function useSelector<S>(selector: (snapshot: T) => S): S {
    return selector(useSyncExternalStore(source.subscribe, source.getSnapshot))
  }
}

function staticHook<T>(value: T) {
  return function useSelector<S>(selector: (snapshot: T) => S): S { return selector(value) }
}

function mountWorkbench(options: {
  surfaces?: readonly WorkbenchSurface[]
  open?: readonly WorkbenchSurfaceId[]
  mode?: 'column' | 'sheet'
} = {}) {
  const instance = createWorkbenchStore().create(String(SID))
  for (const surfaceId of options.open ?? []) instance.actions.openSurface(surfaceId)
  let surfaces = options.surfaces ?? [surface('inspect', 'Inspect'), surface('changes', 'Changes')]
  const closePanel = vi.fn()
  const renderSlot = vi.fn((_key: string, _owner: object, opts?: { only?: string }) => (
    <div data-testid={`surface-${opts?.only ?? 'none'}`}>{opts?.only}</div>
  )) as WorkbenchProps['renderSlot']
  const snapshot = {} as ConversationSnapshot
  const sessions = {
    ids: [SID], byId: { [SID]: { id: SID, displayTitle: 'Session', running: false, blank: false, updatedAt: 1 } },
    current: SID, phase: 'ready', subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined,
  } as SessionListState
  const workspaces: WorkspaceListState = {
    items: [], archivedSessionIds: [], state: 'idle', phase: 'ready', error: null,
    baselinesReady: true, recentWorkspaceId: undefined,
  }
  const element = (): ReactElement => (
    <Workbench
      mode={options.mode ?? 'column'}
      closePanel={closePanel}
      SessionProvider={SessionProviderStub}
      sessionId={SID}
      useSession={staticHook<ConversationSnapshot>(snapshot)}
      useProjection={vi.fn() as never}
      useInput={vi.fn() as never}
      inputActions={inputActions}
      useSessions={staticHook(sessions)}
      useWorkspaces={staticHook(workspaces)}
      useStore={hookOf(instance)}
      actions={instance.actions}
      renderSlot={renderSlot}
      useSurfaces={staticHook(surfaces)}
      t={makeTranslate(zh)}
    />
  )
  const view = render(element())
  return {
    instance, closePanel, renderSlot, view,
    setSurfaces(next: readonly WorkbenchSurface[]) { surfaces = next; view.rerender(element()) },
  }
}

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

describe('Workbench', () => {
  it('switches tabs, launches surfaces, supports keyboard navigation, and closes a tab', () => {
    const mounted = mountWorkbench({ open: [id('inspect')] })
    expect(screen.getByRole('tab', { name: 'Inspect' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByTestId('surface-inspect')).toBeTruthy()

    fireEvent.keyDown(screen.getByRole('tab', { name: 'Inspect' }), { key: 'x' })
    fireEvent.click(screen.getByRole('button', { name: '添加面板' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menuitem', { name: 'Changes' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '添加面板' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Changes' }))
    expect(screen.getByRole('tab', { name: 'Changes' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByTestId('surface-changes')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: 'Inspect' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Changes' }))

    fireEvent.keyDown(screen.getByRole('tab', { name: 'Changes' }), { key: 'ArrowLeft' })
    expect(screen.getByRole('tab', { name: 'Inspect' }).getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Inspect' }), { key: 'End' })
    expect(screen.getByRole('tab', { name: 'Changes' }).getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Changes' }), { key: 'Home' })
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Inspect' }), { key: 'ArrowRight' })

    fireEvent.click(screen.getByRole('button', { name: '关闭Changes' }))
    expect(screen.queryByRole('tab', { name: 'Changes' })).toBeNull()
    expect(screen.getByRole('tab', { name: 'Inspect' }).getAttribute('aria-selected')).toBe('true')
    expect(mounted.closePanel).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '关闭工作台' }))
    expect(mounted.closePanel).toHaveBeenCalledTimes(1)
  })

  it('closes with the last tab and reconciles surfaces removed by plugin disposal', async () => {
    const mounted = mountWorkbench({ open: [id('inspect'), id('changes')] })
    mounted.setSurfaces([surface('inspect', 'Inspect')])
    await waitFor(() => { expect(screen.queryByRole('tab', { name: 'Changes' })).toBeNull() })
    expect(mounted.instance.store.getSnapshot()).toEqual({ openIds: [id('inspect')], activeId: id('inspect') })

    fireEvent.click(screen.getByRole('button', { name: '关闭Inspect' }))
    expect(mounted.closePanel).toHaveBeenCalled()
    expect(mounted.instance.store.getSnapshot()).toEqual({ openIds: [], activeId: null })
  })

  it('renders as a localized right Sheet when layout concession cannot fit the column', () => {
    const instance = createWorkbenchStore().create(String(SID))
    instance.actions.openSurface(id('inspect'))
    const closePanel = vi.fn()
    const snapshot = {} as ConversationSnapshot
    render(
      <Workbench
        mode="sheet"
        closePanel={closePanel}
        SessionProvider={SessionProviderStub}
        sessionId={SID}
        useSession={staticHook(snapshot)}
        useProjection={vi.fn() as never}
        useInput={vi.fn() as never}
        inputActions={inputActions}
        useSessions={staticHook({} as SessionListState)}
        useWorkspaces={staticHook({} as WorkspaceListState)}
        useStore={hookOf(instance)}
        actions={instance.actions}
        renderSlot={((_key, _owner, opts) => <div>{opts?.only}</div>) as WorkbenchProps['renderSlot']}
        useSurfaces={staticHook([surface('inspect', 'Inspect')])}
        t={makeTranslate(en)}
      />,
    )
    expect(screen.getByRole('dialog', { name: 'Workbench' })).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(closePanel).toHaveBeenCalledTimes(1)
  })

  it('closes an empty direct layout opening', () => {
    const mounted = mountWorkbench({ surfaces: [], open: [] })
    expect(screen.getByText('从“添加面板”中选择一个面板')).toBeTruthy()
    expect(mounted.closePanel).toHaveBeenCalledTimes(1)
  })
})
