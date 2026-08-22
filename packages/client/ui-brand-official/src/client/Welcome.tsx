/** Official product welcome rendered as the first persisted onboarding modal. */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { PropsLocale, PropsRuntime } from '@monotykamary/dsh-client-ui-slots'
import {
  Button, CodeXml, FolderOpen, GitBranch, Modal, Plug,
} from '@monotykamary/dsh-client-ui-primitives'
import type { WelcomeController } from './welcome-controller.ts'
import css from './Welcome.module.css'

/** Registrant-owned welcome persistence. */
export interface WelcomeInjected {
  controller: WelcomeController
}

type WelcomeProps = PropsRuntime<'settings.onboarding'> & PropsLocale<'officialBrand'> & WelcomeInjected

const FEATURES = ['navigation', 'workbench', 'fovea', 'fabric'] as const
type FeatureKey = typeof FEATURES[number]

function featureIcon(key: FeatureKey): ReactNode {
  switch (key) {
    case 'navigation': return <GitBranch size={16} />
    case 'workbench': return <FolderOpen size={16} />
    case 'fovea': return <CodeXml size={16} />
    case 'fabric': return <Plug size={16} />
  }
}

const ignoreImplicitDismiss = (): void => {}

/** Render the official introduction until its current version is acknowledged. */
export function Welcome({ complete, controller, t }: WelcomeProps): ReactNode {
  const [status, setStatus] = useState<'loading' | 'ready' | 'saving' | 'error'>('loading')
  const [error, setError] = useState(false)
  const finished = useRef(false)
  const titleRef = useRef<HTMLHeadingElement | null>(null)
  const finish = useCallback(() => {
    if (finished.current) return
    finished.current = true
    complete()
  }, [complete])

  useEffect(() => {
    let current = true
    void controller.acknowledged().then((acknowledged) => {
      if (!current) return
      if (acknowledged) finish()
      else setStatus('ready')
    }, () => {
      if (!current) return
      setError(true)
      setStatus('error')
    })
    return () => { current = false }
  }, [controller, finish])

  useEffect(() => {
    if (status === 'loading') return
    const appRoot = document.getElementById('root')
    titleRef.current?.focus()
    if (appRoot === null) return
    const previous = appRoot.inert
    appRoot.inert = true
    return () => { appRoot.inert = previous }
  }, [status])

  if (status === 'loading') return null

  const acknowledge = async (): Promise<void> => {
    setStatus('saving')
    setError(false)
    try {
      await controller.acknowledge()
      finish()
    } catch {
      setError(true)
      setStatus('error')
    }
  }

  return (
    <Modal open title={t('title')} onClose={ignoreImplicitDismiss} headless className={css.dialog as string}>
      <section className={css.root} aria-labelledby="official-welcome-title">
        <div className={css.intro}>
          <span className={css.eyebrow}>{t('eyebrow')}</span>
          <h1 ref={titleRef} tabIndex={-1} id="official-welcome-title" className={css.title}>{t('title')}</h1>
          <p className={css.lead}>{t('lead')}</p>
        </div>
        <div className={css.grid}>
          {FEATURES.map(key => (
            <article key={key} className={css.card}>
              <span className={css.icon}>{featureIcon(key)}</span>
              <div className={css.cardCopy}>
                <h2 className={css.cardTitle}>{t(`${key}Title`)}</h2>
                <p className={css.cardBody}>{t(`${key}Body`)}</p>
              </div>
            </article>
          ))}
        </div>
        <p className={css.footerCopy}>{t('footer')}</p>
        {error ? <p className={css.error} role="alert">{t('error')}</p> : null}
        <div className={css.actions}>
          <Button variant="primary" disabled={status === 'saving'} onClick={() => { void acknowledge() }}>
            {t('continue')}
          </Button>
        </div>
      </section>
    </Modal>
  )
}
