/** Package-owned invariant companion. @module @monotykamary/dsh-client-ui-settings-updates/invariant */
import type { Context } from '@monotykamary/cordis'
import type { InvariantInstaller } from '@monotykamary/dsh-invariants'
const PACKAGE_NAME = '@monotykamary/dsh-client-ui-settings-updates'
export const name = 'ui-settings-updates-invariant'
export const inject = ['invariants']
/** No runtime invariant: slot registration is verified by the Client composition. */
const install: InvariantInstaller = () => {}
/** Register this package's invariant companion. */
export const apply = (ctx: Context): Promise<() => void> => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
