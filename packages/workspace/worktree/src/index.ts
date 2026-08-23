/** Provider registry for first-class repository worktrees. */
import { randomUUID } from 'node:crypto'
import { Context, Service } from '@monotykamary/cordis'
import z from '@monotykamary/schemastery'
import type Schema from '@monotykamary/schemastery'
import type {
  ResolvedWorktreeRequest,
  WorktreeCheckout,
  WorktreeCheckoutId as WorktreeCheckoutIdBrand,
  WorktreeCreateRequest,
  WorktreeListRequest,
  WorktreeLocateRequest,
  WorktreeProvider,
  WorktreeProviderRequest,
  WorktreeRemoveRequest,
  WorktreeRepository,
  WorktreeRepositoryId as WorktreeRepositoryIdBrand,
  WorktreeSweepRequest,
  WorktreeSweepResult,
} from './types.ts'

export type * from './types.ts'

/**
 * Brand a provider-owned repository identity.
 * @param value - Stable provider-chosen string.
 * @returns nominal repository identity.
 */
export function WorktreeRepositoryId(value: string): WorktreeRepositoryIdBrand {
  return value as WorktreeRepositoryIdBrand
}

/**
 * Brand a checkout identity.
 * @param value - Stable provider-chosen string.
 * @returns nominal checkout identity.
 */
export function WorktreeCheckoutId(value: string): WorktreeCheckoutIdBrand {
  return value as WorktreeCheckoutIdBrand
}

/** Worktree provider selection. */
export interface Config {
  /** Provider used when a request omits `provider`. */
  readonly provider: string
}

/** Required provider selection; deployments choose the implementation explicitly. */
export const Config: Schema<Config> = z.object({ provider: z.string().required() })

declare module '@monotykamary/cordis' {
  interface Context {
    worktrees: WorktreeRegistry
  }

  interface Events {
    /**
     * One provider registration was committed or removed.
     * @param change - provider name and whether it is now present.
     * @mode emit
     */
    'worktrees/provider-change'(change: { readonly provider: string; readonly present: boolean }): void
  }
}

/** Registry and dispatcher for repository worktree providers. */
export class WorktreeRegistry extends Service {
  private readonly providers = new Map<string, WorktreeProvider>()
  private readonly defaultProvider: string

  constructor(ctx: Context, config: Config) {
    super(ctx, 'worktrees')
    this.defaultProvider = config.provider
  }

  /**
   * Register one provider until the calling fiber is disposed.
   * @param provider - Exact implementation and unique provider name.
   * @returns disposer for this registration.
   */
  registerProvider(provider: WorktreeProvider): () => void {
    // oxlint-disable-next-line typescript/no-misused-promises -- cleanup is synchronous; preserve the exact effect disposer identity
    return this.ctx.effect(() => {
      if (this.providers.has(provider.name)) {
        throw new Error(`a worktree provider named "${provider.name}" is already registered`)
      }
      this.providers.set(provider.name, provider)
      this.ctx.emit('worktrees/provider-change', { provider: provider.name, present: true })
      return () => {
        if (this.providers.get(provider.name) !== provider) return
        this.providers.delete(provider.name)
        this.ctx.emit('worktrees/provider-change', { provider: provider.name, present: false })
      }
    }, 'worktrees.registerProvider()')
  }

  /**
   * Return provider names in registration order.
   * @returns fresh ordered provider-name list.
   */
  listProviders(): readonly string[] {
    return [...this.providers.keys()]
  }

  /**
   * Resolve a request's provider without performing work.
   * @param request - Provider-optional operation request.
   * @returns detached request carrying the selected provider.
   */
  resolve<T extends WorktreeProviderRequest>(request: T): ResolvedWorktreeRequest<T> {
    return { ...request, provider: request.provider ?? this.defaultProvider }
  }

  /**
   * Resolve the repository containing a directory.
   * @param request - Directory and optional provider selection.
   * @returns repository facts, or `undefined` outside a repository.
   */
  locate(request: WorktreeLocateRequest): Promise<WorktreeRepository | undefined> {
    const resolved = this.resolve(request)
    return this.provider(resolved.provider).locate(resolved)
  }

  /**
   * List repository checkouts.
   * @param request - Directory inside the target repository.
   * @returns provider-neutral primary and linked checkout facts.
   */
  list(request: WorktreeListRequest): Promise<readonly WorktreeCheckout[]> {
    const resolved = this.resolve(request)
    return this.provider(resolved.provider).list(resolved)
  }

  /**
   * Create one managed linked checkout.
   * @param request - Repository, label, base, and optional caller identity.
   * @returns created checkout facts after provider setup completes.
   */
  create(request: WorktreeCreateRequest): Promise<WorktreeCheckout> {
    const resolved = this.resolve({
      ...request,
      checkoutId: request.checkoutId ?? WorktreeCheckoutId(randomUUID()),
    })
    return this.provider(resolved.provider).create(resolved)
  }

  /**
   * Remove one managed linked checkout without forcing dirty state.
   * @param request - Repository and exact checkout path.
   * @returns removed checkout facts retained for audit output.
   */
  remove(request: WorktreeRemoveRequest): Promise<WorktreeCheckout> {
    const resolved = this.resolve(request)
    return this.provider(resolved.provider).remove(resolved)
  }

  /**
   * Sweep bounded stale managed linked checkouts.
   * @param request - Repository, age threshold, and removal limit.
   * @returns checkouts safely removed by the provider.
   */
  sweep(request: WorktreeSweepRequest): Promise<WorktreeSweepResult> {
    const resolved = this.resolve(request)
    return this.provider(resolved.provider).sweep(resolved)
  }

  private provider(name: string): WorktreeProvider {
    const provider = this.providers.get(name)
    if (provider === undefined) {
      throw new Error(`worktree provider "${name}" is not registered`)
    }
    return provider
  }
}

export default WorktreeRegistry
