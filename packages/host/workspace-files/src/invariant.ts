/** Package-owned invariant companion. @module @monotykamary/dsh-host-workspace-files/invariant */

/* jscpd:ignore-start */
import type { Context } from '@monotykamary/cordis'
import type { InvariantInstaller } from '@monotykamary/dsh-invariants'

const PACKAGE_NAME = '@monotykamary/dsh-host-workspace-files'

/** Cordis companion plugin name. */
export const name = 'host-workspace-files-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/** No runtime invariant: every response reads the selected Agent filesystem directly. */
const install: InvariantInstaller = () => {}

/** Register this package's invariant companion. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
