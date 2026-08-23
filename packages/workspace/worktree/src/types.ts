/** Public vocabulary for repository worktree providers. */
import type { Branded } from '@monotykamary/dsh-brand'
import type { SessionId } from '@monotykamary/dsh-session/types'

/** Stable repository identity chosen by a provider. */
export type WorktreeRepositoryId = Branded<'WorktreeRepositoryId'>

/** Stable identity of one primary or linked checkout. */
export type WorktreeCheckoutId = Branded<'WorktreeCheckoutId'>

/** Starting point requested for a new linked checkout. */
export type WorktreeBaseRef = 'fresh' | 'head' | { readonly ref: string }

/** One repository resolved from any directory inside one of its checkouts. */
export interface WorktreeRepository {
  readonly id: WorktreeRepositoryId
  readonly provider: string
  readonly name: string
  readonly mainPath: string
}

/** Provider-neutral facts about one primary or linked checkout. */
export interface WorktreeCheckout {
  readonly id: WorktreeCheckoutId
  readonly repositoryId: WorktreeRepositoryId
  readonly path: string
  readonly branch: string | null
  readonly head: string | null
  readonly kind: 'main' | 'linked'
  readonly managed: boolean
  readonly current: boolean
  readonly locked: boolean
  readonly prunable: boolean
  readonly activeSessionIds: readonly SessionId[]
  /** Relative ignored files copied while this checkout was created. */
  readonly copiedFiles?: readonly string[]
}

/** Provider selection shared by every worktree request. */
export interface WorktreeProviderRequest {
  readonly provider?: string
}

/** Locate the repository containing `cwd`. */
export interface WorktreeLocateRequest extends WorktreeProviderRequest {
  readonly cwd: string
  readonly signal?: AbortSignal
}

/** List every checkout attached to the repository containing `cwd`. */
export interface WorktreeListRequest extends WorktreeLocateRequest {}

/** Create one managed linked checkout. */
export interface WorktreeCreateRequest extends WorktreeLocateRequest {
  readonly checkoutId?: WorktreeCheckoutId
  readonly label: string
  readonly baseRef: WorktreeBaseRef
}

/** Remove one managed linked checkout without forcing dirty state. */
export interface WorktreeRemoveRequest extends WorktreeLocateRequest {
  readonly path: string
}

/** Sweep bounded stale managed linked checkouts. */
export interface WorktreeSweepRequest extends WorktreeLocateRequest {
  readonly olderThanMs: number
  readonly limit: number
  readonly now?: number
}

/** Complete provider selection passed to an implementation. */
export type ResolvedWorktreeRequest<T extends WorktreeProviderRequest> = Omit<T, 'provider'> & {
  readonly provider: string
}

/** Result of one worktree sweep. */
export interface WorktreeSweepResult {
  readonly removed: readonly WorktreeCheckout[]
}

/** One replaceable worktree implementation. */
export interface WorktreeProvider {
  readonly name: string
  locate(request: ResolvedWorktreeRequest<WorktreeLocateRequest>): Promise<WorktreeRepository | undefined>
  list(request: ResolvedWorktreeRequest<WorktreeListRequest>): Promise<readonly WorktreeCheckout[]>
  create(request: ResolvedWorktreeRequest<WorktreeCreateRequest>): Promise<WorktreeCheckout>
  remove(request: ResolvedWorktreeRequest<WorktreeRemoveRequest>): Promise<WorktreeCheckout>
  sweep(request: ResolvedWorktreeRequest<WorktreeSweepRequest>): Promise<WorktreeSweepResult>
}
