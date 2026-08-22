/** Persisted acknowledgement for the official welcome onboarding step. */
import type { SettingsScope, SettingsScopeSnapshot } from '@monotykamary/dsh-client-runtime/client'

const ACK_FIELD = 'welcomeNoticeVersion'
const WELCOME_VERSION = '2026-08-22.1'

interface WelcomeSettings {
  welcomeNoticeVersion?: string
}

async function resolvedSnapshot(scope: SettingsScope<WelcomeSettings>): Promise<SettingsScopeSnapshot<WelcomeSettings>> {
  const initial = scope.getSnapshot()
  if (initial.status !== 'loading') return initial
  return await new Promise((resolve) => {
    let dispose = (): void => {}
    dispose = scope.subscribe(() => {
      const snapshot = scope.getSnapshot()
      if (snapshot.status === 'loading') return
      dispose()
      resolve(snapshot)
    })
  })
}

/** Coordinates durable eligible acknowledgement and process-local ineligible acknowledgement. */
export class WelcomeController {
  private memoryAcknowledged = false

  /** @param scope - namespace-specific settings transport and eligibility state. */
  constructor(private readonly scope: SettingsScope<WelcomeSettings>) {}

  /** Read whether this welcome version was already acknowledged.
   * @returns whether this welcome version was already acknowledged.
   */
  async acknowledged(): Promise<boolean> {
    const snapshot = await resolvedSnapshot(this.scope)
    if (snapshot.status === 'unavailable') return this.memoryAcknowledged
    return snapshot.value?.welcomeNoticeVersion === WELCOME_VERSION
  }

  /** Persist acknowledgement of the current welcome version. */
  async acknowledge(): Promise<void> {
    const snapshot = await resolvedSnapshot(this.scope)
    if (snapshot.status === 'unavailable') {
      this.memoryAcknowledged = true
      return
    }
    await this.scope.set(ACK_FIELD, WELCOME_VERSION)
    if (this.scope.getSnapshot().value?.welcomeNoticeVersion !== WELCOME_VERSION) {
      throw new Error('welcome acknowledgement did not persist')
    }
  }
}
