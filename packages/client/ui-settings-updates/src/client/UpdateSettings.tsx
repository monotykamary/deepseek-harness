import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { DistributionUpdateLaunch, DistributionUpdateSnapshot } from '@monotykamary/dsh-api-remotes/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@monotykamary/dsh-client-ui-slots'
import { Button, Modal } from '@monotykamary/dsh-client-ui-primitives'
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
export type InstallationReadinessProps = PropsRuntime<'settings.onboarding'>
  & PropsLocale<'settings.updates'> & InjectFace<Pick<UpdateInjected, 'snapshot'>>

type ViewState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; snapshot: DistributionUpdateSnapshot; launch?: DistributionUpdateLaunch }

const ignoreImplicitDismiss = (): void => {}

/** Block first-run interaction until host prerequisites are acknowledged or ready. */
export function InstallationReadiness({ snapshot, complete, t }: InstallationReadinessProps): ReactNode {
  const [state, setState] = useState<{ loading: true } | { loading: false; diagnostics: DistributionUpdateSnapshot['diagnostics'] }>({ loading: true })
  const titleRef = useRef<HTMLHeadingElement | null>(null)
  useEffect(() => {
    let current = true
    void snapshot().then(
      (value) => { if (current) setState({ loading: false, diagnostics: value.diagnostics }) },
      () => { if (current) setState({ loading: false, diagnostics: [] }) },
    )
    return () => { current = false }
  }, [snapshot])
  const blocking = state.loading ? [] : state.diagnostics.filter(item => item.severity === 'blocking')
  useEffect(() => {
    if (!state.loading && blocking.length === 0) complete()
  }, [blocking.length, complete, state.loading])
  useEffect(() => {
    if (blocking.length === 0) return
    const root = document.getElementById('root')
    if (root === null) return
    const previous = root.inert
    root.inert = true
    titleRef.current?.focus()
    return () => { root.inert = previous }
  }, [blocking.length])
  if (state.loading || blocking.length === 0) return null
  return (
    <Modal open title={t('readinessTitle')} onClose={ignoreImplicitDismiss} headless className={css.readinessDialog as string}>
      <div className={css.readinessContent}>
        <h2 ref={titleRef} tabIndex={-1}>{t('readinessTitle')}</h2>
        <p>{t('readinessDescription')}</p>
        <ul className={css.diagnostics}>{blocking.map(item => <li key={item.id}>
          <strong>{item.summary}</strong>
          {item.remediation === null ? null : <p>{item.remediation}</p>}
        </li>)}</ul>
        <Button variant="outline" onClick={complete}>{t('readinessContinue')}</Button>
      </div>
    </Modal>
  )
}

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
    return <div className={css.failure}><p role="alert">{t('failed')}: {state.message}</p><Button variant="outline" onClick={() => { setRequest(value => value + 1) }}>{t('retry')}</Button></div>
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
      <div className={css.health}>
        <h3>{t('readinessChecks')}</h3>
        <ul className={css.diagnostics}>{snapshot.diagnostics.map(item => <li key={item.id} data-severity={item.severity}>
          <strong>{item.summary}</strong>
          {item.remediation === null ? null : <p>{item.remediation}</p>}
        </li>)}</ul>
      </div>
      <ul className={css.packages}>
        {snapshot.packages.map(pkg => <li key={pkg.name} className={css.package}>
          <strong>{pkg.name}</strong>
          <code>{pkg.installed}{pkg.latest === null || !pkg.updateAvailable ? '' : ` → ${pkg.latest}`}</code>
        </li>)}
      </ul>
      {snapshot.updateCommand !== null ? <code className={css.command}>{snapshot.updateCommand}</code> : null}
      <div className={css.actions}>
        <Button variant="outline" onClick={() => { setRequest(value => value + 1) }}>{t('check')}</Button>
        {snapshot.updateAvailable ? <Button variant="primary" onClick={startUpdate}>{t('update')}</Button> : null}
      </div>
      {state.launch !== undefined ? <p className={css.notice} role="status">{state.launch.message}</p> : null}
    </div>
  )
}
