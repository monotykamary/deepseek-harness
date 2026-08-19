/** Settings and Cordis configuration for the settled Session shelf. */

/** Settings namespace owned by the Workspace browser. */
export const WORKSPACE_SETTINGS_NAMESPACE = 'ui-workspace'

/** Field enabling inactivity-based Session settlement. */
export const AUTO_SETTLE_INACTIVE_FIELD = 'autoSettleInactive'

/** Field controlling the inactivity threshold. */
export const AUTO_SETTLE_AFTER_DAYS_FIELD = 'autoSettleAfterDays'

/** Process-local fallback for non-loopback browsers whose settings transport is intentionally unavailable. */
export const SHIPPED_WORKSPACE_SETTINGS: WorkspaceSettings = {
  autoSettleInactive: true,
  autoSettleAfterDays: 3,
}

/** Deployment and user preference resolved for the Workspace browser. */
export interface WorkspaceSettings {
  /** Whether inactivity moves eligible Sessions into the shelf. */
  autoSettleInactive: boolean
  /** Whole inactive days before an eligible Session enters the shelf. */
  autoSettleAfterDays: number
}
