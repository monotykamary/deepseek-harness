/**
 * Package-owned invariant companion for `@monotykamary/dsh-client-ui-terminal`.
 * @module @monotykamary/dsh-client-ui-terminal/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@monotykamary/cordis'
import type { InvariantInstaller } from '@monotykamary/dsh-invariants'

const PACKAGE_NAME = '@monotykamary/dsh-client-ui-terminal'

/** Cordis companion plugin name. */
export const name = 'client-ui-terminal-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/** No runtime invariant: terminal identity and status are validated by each Host attachment. */
const install: InvariantInstaller = () => {}

/** Register this package's invariant companion. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
