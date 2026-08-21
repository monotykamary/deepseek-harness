import { useEffect, useState, type ReactNode } from 'react'
import type { DistributionUpdateLaunch, DistributionUpdateSnapshot } from '@monotykamary/dsh-api-remotes/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@monotykamary/dsh-client-ui-slots'
import css from './UpdateSettings.module.css'

/** Remote operations consumed by the update page and badge. */
export interface UpdateInjected {
  snapshot: () => Promise<DistributionUpdateSnapshot>
  check: () => Promise<DistributionUpdateSnapshot>
  start: () => Promise<DistributionUpdateLaunch>
}

export type UpdateSettingsProps = PropsRuntime<'settings.section'>
  & PropsLocale<'settings.updates'> & InjectFace<UpdateInjected>
export type UpdateBadgeProps = PropsRuntime<'settings.trigger.badge'> & InjectFace<Pick<UpdateInjected, 'check'>>

type ViewState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; snapshot: DistributionUpdateSnapshot; launch?: DistributionUpdateLaunch }

/** Render a dot only when the explicit registry check finds an update. */
export function UpdateBadge({ check }: UpdateBadgeProps): ReactNode {
  const [available, setAvailable] = useState(false)
  useEffect(() => {
    let current = true
    void check().then((snapshot) => { if (current) setAvailable(snapshot.updateAvailable) }, () => {})
    return () => { current = false }
  }, [check])
  return available ? <span className={css.badge} data-update-available aria-hidden="true" /> : null
}

/** Render distribution versions, channel guidance, and the update action. */
export function UpdateSettings({ check, start, t }: UpdateSettingsProps): ReactNode {
  const [request, setRequest] = useState(0)
  const [state, setState] = useState<ViewState>({ status: 'loading' })
  useEffect(() => {
    let current = true
    void check().then(
      (snapshot) => { if (current) setState({ status: 'ready', snapshot }) },
      (error: unknown) => {
        if (current) setState({ status: 'error', message: error instanceof Error ? error.message : String(error) })
      },
    )
    return () => { current = false }
  }, [check, request])

  if (state.status === 'loading') return <p className={css.status}>{t('checking')}</p>
  if (state.status === 'error') {
    return <div className={css.failure}><p role="alert">{t('failed')}: {state.message}</p><button type="button" onClick={() => { setRequest(value => value + 1) }}>{t('retry')}</button></div>
  }
  const { snapshot } = state
  const startUpdate = (): void => {
    void start().then((launch) => { setState({ status: 'ready', snapshot, launch }) })
  }
  return (
    <div className={css.section}>
      <div className={css.heading}>
        <div><h2>{t('title')}</h2><p>{t('channel')}: <strong>{snapshot.channel}</strong></p></div>
        <span className={css.state} data-available={snapshot.updateAvailable}>{t(snapshot.updateAvailable ? 'available' : 'current')}</span>
      </div>
      {snapshot.error !== null ? <p role="alert" className={css.warning}>{snapshot.error}</p> : null}
      <ul className={css.packages}>
        {snapshot.packages.map(pkg => <li key={pkg.name} className={css.package}>
          <strong>{pkg.name}</strong>
          <code>{pkg.installed}{pkg.latest === null ? '' : ` → ${pkg.latest}`}</code>
        </li>)}
      </ul>
      {snapshot.updateCommand !== null ? <code className={css.command}>{snapshot.updateCommand}</code> : null}
      <div className={css.actions}>
        <button type="button" onClick={() => { setRequest(value => value + 1) }}>{t('check')}</button>
        {snapshot.updateAvailable ? <button type="button" onClick={startUpdate}>{t('update')}</button> : null}
      </div>
      {state.launch !== undefined ? <p className={css.notice} role="status">{state.launch.message}</p> : null}
    </div>
  )
}
