/**
 * Package-owned invariant companion for `@monotykamary/dsh-tool-subagent`.
 * @module @monotykamary/dsh-tool-subagent/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@monotykamary/cordis'
import type { InvariantInstaller } from '@monotykamary/dsh-invariants'

const PACKAGE_NAME = '@monotykamary/dsh-tool-subagent'

/** Cordis companion plugin name. */
export const name = 'tool-subagent-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: these model and command adapters have no independent lifecycle stream; tool,
 * command, and child execution relations are owned by the registries and capability service they call.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
