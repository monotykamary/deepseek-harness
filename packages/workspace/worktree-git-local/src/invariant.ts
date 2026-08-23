/** Invariant companion for the local Git worktree provider. */
import type { Context } from '@monotykamary/cordis'
import type { InvariantInstaller } from '@monotykamary/dsh-invariants'

/** Cordis companion plugin name. */
export const name = 'worktree-git-local-invariant'
/** Required invariant registry service. */
export const inject = ['invariants']

const PACKAGE_NAME = '@monotykamary/dsh-worktree-git-local'

// No runtime invariant: the package owns no companion mutable projection;
// registration consistency belongs to @monotykamary/dsh-worktree.
const install: InvariantInstaller = () => {}

/**
 * Register the package-specific empty invariant.
 * @param ctx - Cordis context carrying the invariant registry.
 * @returns exact invariant registration disposer.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
