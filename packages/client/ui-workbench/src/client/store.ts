import { defineStore, type EngineStoreHandle } from '@monotykamary/dsh-client-runtime/client'
import type { WorkbenchSurfaceId } from './contract.ts'

/** Per-session open-tab and active-tab state. */
export interface WorkbenchState {
  openIds: WorkbenchSurfaceId[]
  activeId: WorkbenchSurfaceId | null
}

type WorkbenchActions = {
  openSurface: (draft: WorkbenchState, id: WorkbenchSurfaceId) => void
  closeSurface: (draft: WorkbenchState, id: WorkbenchSurfaceId) => void
  reconcile: (draft: WorkbenchState, available: readonly WorkbenchSurfaceId[]) => void
}

/**
 * Create the transient per-session workbench store.
 * @returns workbench store handle with the complete tab mutation set.
 */
export function createWorkbenchStore(): EngineStoreHandle<WorkbenchState, WorkbenchActions> {
  return defineStore({
    init: (): WorkbenchState => ({ openIds: [], activeId: null }),
    actions: {
      openSurface: (draft, id: WorkbenchSurfaceId) => {
        if (!draft.openIds.includes(id)) draft.openIds.push(id)
        draft.activeId = id
      },
      closeSurface: (draft, id: WorkbenchSurfaceId) => {
        const index = draft.openIds.indexOf(id)
        if (index === -1) return
        draft.openIds.splice(index, 1)
        if (draft.activeId !== id) return
        draft.activeId = draft.openIds[Math.min(index, draft.openIds.length - 1)] ?? null
      },
      reconcile: (draft, available: readonly WorkbenchSurfaceId[]) => {
        const allowed = new Set(available)
        draft.openIds = draft.openIds.filter(id => allowed.has(id))
        if (draft.activeId !== null && !allowed.has(draft.activeId)) {
          draft.activeId = draft.openIds.at(-1) ?? null
        }
      },
    },
  })
}
