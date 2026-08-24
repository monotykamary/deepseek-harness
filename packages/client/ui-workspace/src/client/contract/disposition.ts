/** Shared browser-local disposition of DSH Sessions. */
import type { ObservableSnapshot, SessionId } from '@monotykamary/dsh-client-runtime/client'

/** Effective Session shelf membership after policy and user overrides. */
export interface SessionDispositionSnapshot {
  /** Sessions parked in the reversible settled-history shelf. */
  settledSessionIds: readonly SessionId[]
  /** Future wake time per Session still hidden in the Snoozed shelf. */
  snoozedUntilBySession: Readonly<Record<SessionId, number>>
  /** Sessions whose snooze elapsed or was interrupted by pending interaction. */
  wokeSessionIds: readonly SessionId[]
}

/** Shared Session-disposition service consumed by the Workspace and Factory applications. */
export interface SessionDispositionContract {
  /** Observable effective membership; snapshot identity changes only with effective disposition. */
  readonly state: ObservableSnapshot<SessionDispositionSnapshot>
  /**
   * Park a Session in settled history and clear its snooze or keep-active override.
   * @param sessionId - Session to settle.
   */
  settleSession(sessionId: SessionId): void
  /**
   * Remove an explicit settle and pin the Session out of automatic settlement.
   * @param sessionId - Session to return to active work.
   */
  unsettleSession(sessionId: SessionId): void
  /**
   * Hide a Session until one exact wake time and clear settlement overrides.
   * @param sessionId - Session to snooze.
   * @param until - Wake time as epoch milliseconds.
   */
  snoozeSession(sessionId: SessionId, until: number): void
  /**
   * Clear a Session's snooze or Woke marker immediately.
   * @param sessionId - Session to wake.
   */
  wakeSession(sessionId: SessionId): void
}
