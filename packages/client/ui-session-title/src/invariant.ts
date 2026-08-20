/**
 * Package-owned invariant companion for `@monotykamary/dsh-client-ui-session-title`.
 * @module @monotykamary/dsh-client-ui-session-title/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@monotykamary/cordis'
import type { InvariantInstaller } from '@monotykamary/dsh-invariants'

const PACKAGE_NAME = '@monotykamary/dsh-client-ui-session-title'

/** Cordis companion plugin name. */
export const name = 'client-ui-session-title-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the row is a pure projection of the settings scope,
 * and the host provider's mount/unmount balance lives inside the
 * session-title service registration effect, covered by provider specs.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns The installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
