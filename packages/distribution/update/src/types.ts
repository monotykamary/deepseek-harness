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
}

/** Result of handing an update to a detached installer. */
export interface DistributionUpdateLaunch {
  readonly started: boolean
  readonly message: string
  readonly statusPath: string | null
}
