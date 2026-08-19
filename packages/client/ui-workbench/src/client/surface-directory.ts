import { resolveSlotLabel } from '@monotykamary/dsh-client-ui-slots'
import type { SlotRegistry } from '@monotykamary/dsh-client-runtime/client'
import type {
  WorkbenchSurface, WorkbenchSurfaceId, WorkbenchSurfacePresentation,
} from './contract.ts'

interface LocaleSource {
  subscribe(listener: () => void): () => void
}

function sameSurfaces(left: readonly WorkbenchSurface[], right: readonly WorkbenchSurface[]): boolean {
  return left.length === right.length
    && left.every((surface, index) => {
      const other = right[index]
      return other !== undefined
        && surface.id === other.id
        && surface.label === other.label
        && surface.icon === other.icon
        && surface.description === other.description
        && surface.immersive === other.immersive
        && surface.repeatable === other.repeatable
    })
}

/** Live, reference-stable projection of registered workbench surfaces. */
export class WorkbenchSurfaceDirectory {
  private snapshot: readonly WorkbenchSurface[] = []
  private readonly listeners = new Set<() => void>()
  private readonly presentations = new Map<WorkbenchSurfaceId, WorkbenchSurfacePresentation>()

  /**
   * @param slots - slot registry that owns surface registrations.
   * @param locale - locale source whose revisions can change label thunks.
   */
  constructor(
    private readonly slots: Pick<SlotRegistry, 'entries' | 'subscribe'>,
    private readonly locale: LocaleSource,
  ) {
    this.snapshot = this.read()
  }

  /**
   * Read the current ordered surface projection.
   * @returns reference-stable surfaces until registration or label changes.
   */
  getSnapshot = (): readonly WorkbenchSurface[] => this.snapshot

  /**
   * Subscribe to projected surface changes.
   * @param listener - callback invoked after the snapshot changes.
   * @returns unsubscribe callback.
   */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /**
   * Start slot and locale observation.
   * @returns disposer for both upstream subscriptions.
   */
  start(): () => void {
    const offSlots = this.slots.subscribe('workbench.surface', this.refresh)
    const offLocale = this.locale.subscribe(this.refresh)
    this.refresh()
    return () => {
      offLocale()
      offSlots()
    }
  }

  /**
   * Register plugin-owned icon and launcher copy for one surface id.
   * @param id - stable workbench surface id.
   * @param presentation - icon kind and locale-aware launcher description.
   * @returns disposer that retracts this exact presentation.
   */
  registerPresentation(id: WorkbenchSurfaceId, presentation: WorkbenchSurfacePresentation): () => void {
    if (this.presentations.has(id)) {
      throw new Error(`workbench surface presentation already registered: ${String(id)}`)
    }
    this.presentations.set(id, presentation)
    this.refresh()
    return () => {
      if (this.presentations.get(id) !== presentation) return
      this.presentations.delete(id)
      this.refresh()
    }
  }

  /**
   * Test current registration of one surface id.
   * @param id - surface id to test.
   * @returns whether the surface is registered now.
   */
  has(id: WorkbenchSurfaceId): boolean {
    return this.get(id) !== undefined
  }

  /**
   * Resolve one registered surface.
   * @param id - surface id to resolve.
   * @returns current surface metadata, or undefined when unregistered.
   */
  get(id: WorkbenchSurfaceId): WorkbenchSurface | undefined {
    return this.snapshot.find(surface => surface.id === id)
  }

  private readonly refresh = (): void => {
    const next = this.read()
    if (sameSurfaces(this.snapshot, next)) return
    this.snapshot = next
    for (const listener of [...this.listeners]) {
      try {
        listener()
      } catch (error) {
        console.error('workbench surface listener failed:', error)
      }
    }
  }

  private read(): readonly WorkbenchSurface[] {
    const surfaces: WorkbenchSurface[] = []
    for (const entry of this.slots.entries('workbench.surface')) {
      /* v8 ignore next -- list registration requires an id at load. */
      if (entry.options.id === undefined) continue
      const id = entry.options.id as WorkbenchSurfaceId
      const presentation = this.presentations.get(id)
      surfaces.push({
        id,
        label: resolveSlotLabel(entry.options.label) ?? entry.options.id,
        icon: presentation?.icon ?? 'generic',
        description: presentation === undefined
          ? ''
          : typeof presentation.description === 'function'
            ? presentation.description()
            : presentation.description,
        immersive: presentation?.immersive ?? false,
        repeatable: presentation?.repeatable ?? false,
      })
    }
    return surfaces
  }
}
