/**
 * Session-title preference. It owns the live automatic-title opt-in and
 * routes user choices to the host `session-title-llm` section; the Host-side
 * provider mounts from the same namespace, so a toggle here is the opt-in.
 */
import {
  createSnapshotStore, type SettingsScope, type SnapshotStore,
} from '@monotykamary/dsh-client-runtime/client'

/** The one field this row owns in the host `session-title-llm` section. */
export const ENABLED_FIELD = 'enabled'

/** Durable session-title section read by the row (partial view of the host section). */
export interface SessionTitleSettings {
  /** Automatic LLM title generation opt-in. */
  enabled: boolean
}

/** Owner of the row's reactive preference over the bound settings scope. */
export class SessionTitlePreference {
  /** Reactive preference source for the Settings row. */
  readonly enabled: SnapshotStore<boolean> = createSnapshotStore(false)
  private readonly host: SettingsScope<SessionTitleSettings> | undefined

  /**
   * @param host - durable preference scope owned by the providing plugin;
   * absent compositions stay process-local. The adoption subscription shares
   * the scope's plugin lifetime.
   */
  constructor(host?: SettingsScope<SessionTitleSettings>) {
    this.host = host
    if (host !== undefined) {
      host.subscribe(() => { this.adopt(host) })
      this.adopt(host)
    }
  }

  /**
   * Change the persisted automatic-title opt-in; the live value publishes
   * before the durable write starts.
   * @param enabled - the next opt-in state.
   */
  setEnabled(enabled: boolean): void {
    if (this.enabled.getSnapshot() === enabled) return
    this.enabled.set(enabled)
    void this.host?.set(ENABLED_FIELD, enabled)
  }

  /**
   * Adopt the scope's accepted durable value without writing it back.
   * @param host - the constructor-narrowed scope driving this adoption.
   */
  private adopt(host: SettingsScope<SessionTitleSettings>): void {
    const section = host.getSnapshot().value
    if (section === undefined || this.enabled.getSnapshot() === section.enabled) return
    this.enabled.set(section.enabled)
  }
}
