/**
 * Package-owned invariant companion for `@monotykamary/dsh-client-ui-brand-official`.
 * @module @monotykamary/dsh-client-ui-brand-official/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@monotykamary/cordis'
import type { InvariantInstaller } from '@monotykamary/dsh-invariants'

const PACKAGE_NAME = '@monotykamary/dsh-client-ui-brand-official'

/** Cordis companion plugin name. */
export const name = 'client-ui-brand-official-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the package retains no mutable state, and its welcome
 * and three-mark registrations leave through their declaration-aware effects.
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
