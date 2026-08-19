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
const surface = (value: string, label: string): WorkbenchSurface => ({
  id: id(value), label, icon: value === 'changes' ? 'changes' : 'inspect', description: `${label} description`, immersive: false, repeatable: false,
})
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
    expect(screen.getByRole('button', { name: '关闭Inspect' }).querySelector('[data-workbench-tab-icon]')).toBeTruthy()

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

  it('renders repeatable terminal instances as outer Workbench panels', () => {
    const terminal = { ...surface('terminal', 'Terminal'), icon: 'terminal' as const, repeatable: true }
    const mounted = mountWorkbench({ surfaces: [terminal], open: [terminal.id] })
    expect(screen.getByRole('tab', { name: 'Terminal 1' })).toBeTruthy()
    expect(mounted.renderSlot).toHaveBeenLastCalledWith(
      'workbench.surface', { workbenchPanelOrdinal: 1 }, { only: terminal.id },
    )

    fireEvent.click(screen.getByRole('button', { name: '添加面板' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Terminal' }))
    expect(screen.getByRole('tab', { name: 'Terminal 2' }).getAttribute('aria-selected')).toBe('true')
    expect(mounted.renderSlot).toHaveBeenLastCalledWith(
      'workbench.surface', { workbenchPanelOrdinal: 2 }, { only: terminal.id },
    )
    const secondBody = mounted.view.container.querySelector('[role="tabpanel"]')
    fireEvent.click(screen.getByRole('tab', { name: 'Terminal 1' }))
    expect(screen.getByRole('tab', { name: 'Terminal 1' }).getAttribute('aria-selected')).toBe('true')
    expect(mounted.view.container.querySelector('[role="tabpanel"]')).not.toBe(secondBody)
    fireEvent.click(screen.getByRole('button', { name: '关闭Terminal 1' }))
    expect(screen.queryByRole('tab', { name: 'Terminal 1' })).toBeNull()
  })

  it('lets a sole immersive surface own the top panel chrome', () => {
    const terminal = { ...surface('terminal', 'Terminal'), immersive: true }
    mountWorkbench({ surfaces: [terminal], open: [terminal.id] })
    expect(screen.queryByRole('tab', { name: 'Terminal' })).toBeNull()
    expect(screen.getByTestId('surface-terminal')).toBeTruthy()
  })

  it('renders every surface icon and the no-registration launcher state', () => {
    const icons = ['files', 'terminal', 'generic'] as const
    const surfaces = icons.map((icon, index) => ({
      id: id(icon), label: icon, icon, description: `surface ${String(index)}`, immersive: false, repeatable: false,
    }))
    const mounted = mountWorkbench({ surfaces, open: surfaces.map(item => item.id) })
    expect(mounted.view.container.querySelectorAll('[data-workbench-tab-icon] svg')).toHaveLength(3)
    mounted.view.unmount()
    mountWorkbench({ surfaces: [], open: [] })
    expect(screen.getByText(zh['empty.unavailable'])).toBeTruthy()
  })

  it('leaves the launcher open after the last tab and reconciles plugin disposal', async () => {
    const mounted = mountWorkbench({ open: [id('inspect'), id('changes')] })
    mounted.setSurfaces([surface('inspect', 'Inspect')])
    await waitFor(() => { expect(screen.queryByRole('tab', { name: 'Changes' })).toBeNull() })
    expect(mounted.instance.store.getSnapshot()).toEqual({
      panels: [{ id: 'inspect:1', surfaceId: id('inspect'), ordinal: 1 }], activePanelId: 'inspect:1',
    })

    fireEvent.click(screen.getByRole('button', { name: '关闭Inspect' }))
    expect(mounted.closePanel).not.toHaveBeenCalled()
    expect(mounted.instance.store.getSnapshot()).toEqual({ panels: [], activePanelId: null })
    expect(screen.getByRole('heading', { name: '打开面板' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Inspect' })).toBeTruthy()
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

  it('keeps an empty direct opening visible and launches a registered surface card', () => {
    const mounted = mountWorkbench({ open: [] })
    expect(screen.getByText('选择要在右侧面板中显示的内容。')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Changes' }))
    expect(mounted.instance.store.getSnapshot()).toEqual({
      panels: [{ id: 'changes:1', surfaceId: id('changes'), ordinal: 1 }], activePanelId: 'changes:1',
    })
    expect(mounted.closePanel).not.toHaveBeenCalled()
  })
})
