/**
 * Shared browser platform modules. Seeding, bundling externals, and Vite
 * aliases consume this list so their module identities cannot drift.
 * @module @monotykamary/dsh-client-web/src/platform
 */

/** The module specifiers the shell shares into the frozen module table. */
export const PLATFORM_MODULES = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@monotykamary/cordis',
  '@monotykamary/dsh-client-ui-slots',
  '@monotykamary/dsh-client-web-react',
  '@monotykamary/dsh-client-ui-primitives',
  '@monotykamary/dsh-client-ui-attachment',
  '@monotykamary/dsh-client-schema-form',
] as const

/** One platform module specifier (a seed-table key). */
export type PlatformModule = (typeof PLATFORM_MODULES)[number]
