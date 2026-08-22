/** Persisted acknowledgement for the official welcome onboarding step. */
import type { IApiClient, SettingsNamespaceView } from '@monotykamary/dsh-api-remotes/client'

const SETTINGS_NAMESPACE = 'ui-onboarding'
const ACK_FIELD = 'welcomeNoticeVersion'
const WELCOME_VERSION = '2026-08-22.1'

function acknowledgementOf(view: SettingsNamespaceView): string | undefined {
  if (typeof view.value !== 'object' || view.value === null) return undefined
  const value = (view.value as Record<string, unknown>)[ACK_FIELD]
  return typeof value === 'string' ? value : undefined
}

/** Coordinates durable loopback acknowledgement and process-local remote acknowledgement. */
export class WelcomeController {
  private memoryAcknowledged = false

  /** @param api - settings wire face. @param persistence - eligible browsers persist through Host settings. */
  constructor(
    private readonly api: Pick<IApiClient, 'settings'>,
    private readonly persistence: 'host' | 'memory',
  ) {}

  /** Read whether this welcome version was already acknowledged.
   * @returns whether this welcome version was already acknowledged.
   */
  async acknowledged(): Promise<boolean> {
    if (this.persistence === 'memory') return this.memoryAcknowledged
    const response = await this.api.settings.describe({})
    if (!response.result.ok) throw new Error(response.result.error.message)
    const view = response.result.value.namespaces.find(candidate => candidate.ns === SETTINGS_NAMESPACE)
    if (view === undefined) throw new Error('welcome acknowledgement settings are unavailable')
    return acknowledgementOf(view) === WELCOME_VERSION
  }

  /** Persist acknowledgement of the current welcome version. */
  async acknowledge(): Promise<void> {
    if (this.persistence === 'memory') {
      this.memoryAcknowledged = true
      return
    }
    const response = await this.api.settings.mutate({
      ns: SETTINGS_NAMESPACE,
      ops: [{ op: 'set', path: [ACK_FIELD], value: WELCOME_VERSION }],
    })
    if (!response.result.ok) throw new Error(response.result.error.message)
  }
}
