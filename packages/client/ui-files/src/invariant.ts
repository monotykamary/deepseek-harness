/**
 * Package-owned invariant companion for `@monotykamary/dsh-client-ui-files`.
 * @module @monotykamary/dsh-client-ui-files/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@monotykamary/cordis'
import type { InvariantInstaller } from '@monotykamary/dsh-invariants'

const PACKAGE_NAME = '@monotykamary/dsh-client-ui-files'

/** Cordis companion plugin name. */
export const name = 'client-ui-files-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/** No runtime invariant: remote reads and transient viewing state own no authoritative relation. */
const install: InvariantInstaller = () => {}

/** Register this package's invariant companion. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
