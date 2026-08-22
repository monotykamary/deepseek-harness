/** Package manager or source owner of the running DSH installation. */
export type InstallChannel = 'npm-global' | 'npx' | 'nix' | 'source' | 'unknown'

/** One package in the tested DSH distribution. */
export interface DistributionPackageStatus {
  readonly name: string
  readonly installed: string
  readonly latest: string | null
  readonly updateAvailable: boolean
}

/** Current update information for this DSH installation. */
export interface DistributionUpdateSnapshot {
  readonly channel: InstallChannel
  readonly checkedAt: number | null
  readonly checking: boolean
  readonly error: string | null
  readonly updateAvailable: boolean
  readonly packages: readonly DistributionPackageStatus[]
  readonly updateCommand: string | null
  /** Host prerequisites sampled without network access. */
  readonly diagnostics: readonly InstallationDiagnostic[]
}

/** Result of handing an update to a detached installer. */
export interface DistributionUpdateLaunch {
  readonly started: boolean
  readonly message: string
  readonly statusPath: string | null
}

/** Stable installation-readiness check identifiers. */
export type InstallationDiagnosticId = 'dsh-home' | 'shell' | 'sandbox' | 'desktop'

/** One host prerequisite result shared by `dsh doctor`, startup logs, and the Web onboarding UI. */
export interface InstallationDiagnostic {
  readonly id: InstallationDiagnosticId
  readonly severity: 'ok' | 'warning' | 'blocking'
  readonly summary: string
  readonly remediation: string | null
}
