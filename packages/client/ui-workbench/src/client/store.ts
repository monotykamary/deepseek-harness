import { defineStore, type EngineStoreHandle } from '@monotykamary/dsh-client-runtime/client'
import type { WorkbenchSurfaceId } from './contract.ts'

/** One open panel instance backed by a registered Workbench surface. */
export interface WorkbenchPanel {
  readonly id: string
  readonly surfaceId: WorkbenchSurfaceId
  readonly ordinal: number
}

/** Per-session open-panel and active-panel state. */
export interface WorkbenchState {
  panels: WorkbenchPanel[]
  activePanelId: string | null
}

type WorkbenchActions = {
  openSurface: (draft: WorkbenchState, id: WorkbenchSurfaceId) => void
  openNewSurface: (draft: WorkbenchState, id: WorkbenchSurfaceId) => void
  ensureSurfaceCount: (draft: WorkbenchState, id: WorkbenchSurfaceId, count: number) => void
  activatePanel: (draft: WorkbenchState, panelId: string) => void
  closePanel: (draft: WorkbenchState, panelId: string) => void
  reconcile: (draft: WorkbenchState, available: readonly WorkbenchSurfaceId[]) => void
}

function nextOrdinal(panels: readonly WorkbenchPanel[], surfaceId: WorkbenchSurfaceId): number {
  const used = new Set(panels.filter(panel => panel.surfaceId === surfaceId).map(panel => panel.ordinal))
  let ordinal = 1
  while (used.has(ordinal)) ordinal += 1
  return ordinal
}

function appendPanel(draft: WorkbenchState, surfaceId: WorkbenchSurfaceId): WorkbenchPanel {
  const ordinal = nextOrdinal(draft.panels, surfaceId)
  const panel = { id: `${String(surfaceId)}:${String(ordinal)}`, surfaceId, ordinal }
  draft.panels.push(panel)
  return panel
}

/**
 * Create the transient per-session Workbench panel store.
 * @returns store handle with singleton opening and repeatable panel mutation actions.
 */
export function createWorkbenchStore(): EngineStoreHandle<WorkbenchState, WorkbenchActions> {
  return defineStore({
    init: (): WorkbenchState => ({ panels: [], activePanelId: null }),
    actions: {
      openSurface: (draft, id: WorkbenchSurfaceId) => {
        const panel = draft.panels.find(item => item.surfaceId === id) ?? appendPanel(draft, id)
        draft.activePanelId = panel.id
      },
      openNewSurface: (draft, id: WorkbenchSurfaceId) => {
        draft.activePanelId = appendPanel(draft, id).id
      },
      ensureSurfaceCount: (draft, id: WorkbenchSurfaceId, count: number) => {
        while (draft.panels.filter(panel => panel.surfaceId === id).length < count) appendPanel(draft, id)
      },
      activatePanel: (draft, panelId: string) => {
        if (draft.panels.some(panel => panel.id === panelId)) draft.activePanelId = panelId
      },
      closePanel: (draft, panelId: string) => {
        const index = draft.panels.findIndex(panel => panel.id === panelId)
        if (index === -1) return
        draft.panels.splice(index, 1)
        if (draft.activePanelId !== panelId) return
        draft.activePanelId = draft.panels[Math.min(index, draft.panels.length - 1)]?.id ?? null
      },
      reconcile: (draft, available: readonly WorkbenchSurfaceId[]) => {
        const allowed = new Set(available)
        draft.panels = draft.panels.filter(panel => allowed.has(panel.surfaceId))
        if (draft.activePanelId !== null && !draft.panels.some(panel => panel.id === draft.activePanelId)) {
          draft.activePanelId = draft.panels.at(-1)?.id ?? null
        }
      },
    },
  })
}
