import type { BoundActions } from '@monotykamary/dsh-client-ui-slots'
import type { ILayout } from '@monotykamary/dsh-client-ui-layout/client'
import type { WorkbenchSurfaceId } from './contract.ts'
import type { createWorkbenchStore } from './store.ts'
import type { WorkbenchSurfaceDirectory } from './surface-directory.ts'

/** Bound actions of the currently rendered session workbench. */
type WorkbenchActions = BoundActions<ReturnType<typeof createWorkbenchStore>>

/** Cross-plugin workbench navigation face. */
export interface IWorkbench {
  /**
   * Open and activate one registered surface, then reveal the Details region.
   * @param id - registered workbench surface id.
   */
  open(id: WorkbenchSurfaceId): void
  /** Hide the workbench while retaining its per-session tab set. */
  close(): void
}

/** Workbench controller backed by the current session's store and layout panel. */
export class WorkbenchController implements IWorkbench {
  private actions: WorkbenchActions | undefined

  /**
   * @param layout - layout panel controller.
   * @param surfaces - live surface directory used for fail-loud navigation.
   */
  constructor(
    private readonly layout: ILayout,
    private readonly surfaces: WorkbenchSurfaceDirectory,
  ) {}

  /**
   * Attach the current session workbench actions during slot injection.
   * @param actions - bound per-session tab actions.
   */
  attach(actions: WorkbenchActions): void {
    this.actions = actions
  }

  /**
   * Open one registered workbench surface.
   * @param id - registered surface id.
   */
  open(id: WorkbenchSurfaceId): void {
    if (!this.surfaces.has(id)) throw new Error(`workbench surface is not registered: ${String(id)}`)
    this.requireActions().openSurface(id)
    this.layout.openDetails()
  }

  /** Hide the workbench without discarding its tabs. */
  close(): void {
    this.layout.closeDetails()
  }

  private requireActions(): WorkbenchActions {
    if (this.actions === undefined) throw new Error('workbench: surface actions not wired (Details entry not mounted)')
    return this.actions
  }
}
