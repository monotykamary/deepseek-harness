/**
 * Package-owned invariant companion for `@monotykamary/dsh-client-ui-command-palette`.
 * @module @monotykamary/dsh-client-ui-command-palette/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@monotykamary/cordis'
import type { InvariantInstaller } from '@monotykamary/dsh-invariants'

const PACKAGE_NAME = '@monotykamary/dsh-client-ui-command-palette'

/** Cordis companion plugin name. */
export const name = 'client-ui-command-palette-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: this pure-consumer plugin derives palette rows from
 * standard Session and Workspace hooks and invokes existing domain methods;
 * it emits no events and owns no cross-plugin mutable relationship.
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
