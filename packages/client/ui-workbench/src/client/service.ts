import type { SessionId } from '@monotykamary/dsh-client-runtime/client'
import type { BoundActions } from '@monotykamary/dsh-client-ui-slots'
import type { ILayout } from '@monotykamary/dsh-client-ui-layout/client'
import type { WorkbenchSurfaceId, WorkbenchSurfacePresentation } from './contract.ts'
import type { createWorkbenchStore } from './store.ts'
import type { WorkbenchSurfaceDirectory } from './surface-directory.ts'

/** Bound actions of the currently rendered session workbench. */
type WorkbenchActions = BoundActions<ReturnType<typeof createWorkbenchStore>>

interface WorkbenchBinding {
  readonly actions: WorkbenchActions
}

/** Cross-plugin workbench navigation face. */
export interface IWorkbench {
  /** Reveal the Details region without choosing a surface. */
  show(): void
  /**
   * Register one surface's tab icon and launcher copy.
   * @param id - stable surface id shared with its slot registration.
   * @param presentation - shell-owned icon kind and locale-aware description.
   * @returns disposer that retracts the presentation.
   */
  registerPresentation(id: WorkbenchSurfaceId, presentation: WorkbenchSurfacePresentation): () => void
  /**
   * Open and activate one registered surface in its owning Session, then reveal the Details region.
   * @param sessionId - Session whose transient tab set receives the surface.
   * @param id - registered workbench surface id.
   */
  open(sessionId: SessionId, id: WorkbenchSurfaceId): void
  /**
   * Open and activate a new panel instance of a repeatable surface.
   * @param sessionId - Session whose transient tab set receives the new panel.
   * @param id - registered repeatable Workbench surface id.
   */
  openNew(sessionId: SessionId, id: WorkbenchSurfaceId): void
  /**
   * Ensure a repeatable surface has enough panels to represent restored resources.
   * @param sessionId - Session whose transient tab set represents the resources.
   * @param id - registered repeatable Workbench surface id.
   * @param count - required panel count.
   */
  ensureCount(sessionId: SessionId, id: WorkbenchSurfaceId, count: number): void
  /** Hide the workbench while retaining its per-session panel set. */
  close(): void
}

/** Workbench controller routing explicit Session targets to mounted stores and the layout panel. */
export class WorkbenchController implements IWorkbench {
  private readonly actionsBySession = new Map<SessionId, WorkbenchBinding>()

  /**
   * @param layout - layout panel controller.
   * @param surfaces - live surface directory used for fail-loud navigation.
   */
  constructor(
    private readonly layout: ILayout,
    private readonly surfaces: WorkbenchSurfaceDirectory,
  ) {}

  /**
   * Attach one mounted Session workbench for the component lifetime.
   * @param sessionId - Session owning the bound tab actions.
   * @param actions - bound per-session tab actions.
   * @returns disposer that retracts only this exact binding.
   */
  attach(sessionId: SessionId, actions: WorkbenchActions): () => void {
    const binding = { actions }
    this.actionsBySession.set(sessionId, binding)
    return () => {
      if (this.actionsBySession.get(sessionId) === binding) this.actionsBySession.delete(sessionId)
    }
  }

  /** Reveal the Details region without choosing a surface. */
  show(): void {
    this.layout.openDetails()
  }

  /**
   * Register one surface's tab icon and launcher copy.
   * @param id - stable surface id shared with its slot registration.
   * @param presentation - shell-owned icon kind and locale-aware description.
   * @returns disposer that retracts the presentation.
   */
  registerPresentation(id: WorkbenchSurfaceId, presentation: WorkbenchSurfacePresentation): () => void {
    return this.surfaces.registerPresentation(id, presentation)
  }

  /**
   * Open one registered workbench surface for one Session.
   * @param sessionId - Session whose tab store receives or reuses the surface.
   * @param id - registered surface id.
   */
  open(sessionId: SessionId, id: WorkbenchSurfaceId): void {
    this.requireSurface(id)
    this.requireActions(sessionId).openSurface(id)
    this.layout.openDetails()
  }

  /** Open one new panel instance of a repeatable Workbench surface. */
  openNew(sessionId: SessionId, id: WorkbenchSurfaceId): void {
    const surface = this.requireSurface(id)
    if (!surface.repeatable) throw new Error(`workbench surface is not repeatable: ${String(id)}`)
    this.requireActions(sessionId).openNewSurface(id)
    this.layout.openDetails()
  }

  /** Ensure enough panels exist for restored instances of a repeatable surface. */
  ensureCount(sessionId: SessionId, id: WorkbenchSurfaceId, count: number): void {
    const surface = this.requireSurface(id)
    if (!surface.repeatable) throw new Error(`workbench surface is not repeatable: ${String(id)}`)
    this.requireActions(sessionId).ensureSurfaceCount(id, count)
  }

  /** Hide the workbench without discarding its tabs. */
  close(): void {
    this.layout.closeDetails()
  }

  private requireSurface(id: WorkbenchSurfaceId) {
    const surface = this.surfaces.get(id)
    if (surface === undefined) throw new Error(`workbench surface is not registered: ${String(id)}`)
    return surface
  }

  private requireActions(sessionId: SessionId): WorkbenchActions {
    const binding = this.actionsBySession.get(sessionId)
    if (binding === undefined) {
      throw new Error(`workbench: Session actions not wired for ${String(sessionId)} (Details entry not mounted)`)
    }
    return binding.actions
  }
}
