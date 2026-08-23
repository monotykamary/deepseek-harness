/** Runtime invariant for the worktree provider registry. */
import type { Context } from '@monotykamary/cordis'
import type { InvariantFailure, InvariantInstaller } from '@monotykamary/dsh-invariants'
import type {} from './index.ts'

/** Cordis companion plugin name. */
export const name = 'worktree-invariant'
/** Required invariant registry service. */
export const inject = ['invariants']

const PACKAGE_NAME = '@monotykamary/dsh-worktree'

const install: InvariantInstaller = Object.assign((ctx: Context, fail: InvariantFailure) => {
  ctx.on('worktrees/provider-change', ({ provider, present }) => {
    const registered = ctx.worktrees.listProviders().includes(provider)
    if (registered !== present) {
      fail(`worktrees/provider-change for "${provider}" disagrees with the provider registry`)
    }
  })
}, { inject: ['worktrees'] })

/**
 * Register the provider-change companion.
 * @param ctx - Cordis context carrying the invariant registry.
 * @returns exact invariant registration disposer.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
