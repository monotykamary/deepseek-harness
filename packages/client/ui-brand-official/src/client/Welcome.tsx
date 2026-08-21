import type { ComponentType } from 'react'
import type { PropsLocale, PropsRuntime } from '@monotykamary/dsh-client-ui-slots'
import {
  IconBranchOutline16, IconCodeOutline16, IconCordisPluginOutline14, IconFolderOpenOutline16,
} from '@monotykamary/dsh-client-ui-primitives'
import css from './Welcome.module.css'

type WelcomeProps = PropsRuntime<'conversation.hero.welcome'> & PropsLocale<'officialBrand'>

const FEATURES = [
  { key: 'navigation', icon: IconBranchOutline16 },
  { key: 'workbench', icon: IconFolderOpenOutline16 },
  { key: 'fovea', icon: IconCodeOutline16 },
  { key: 'fabric', icon: IconCordisPluginOutline14 },
] as const satisfies readonly { key: 'navigation' | 'workbench' | 'fovea' | 'fabric'; icon: ComponentType<{ size?: number; className?: string }> }[]

/** Official no-session introduction to the capabilities layered over the upstream shell. */
export function Welcome({ landing, t }: WelcomeProps) {
  if (!landing) return null
  return (
    <section className={css.root} aria-labelledby="official-welcome-title">
      <div className={css.intro}>
        <span className={css.eyebrow}>{t('eyebrow')}</span>
        <h1 id="official-welcome-title" className={css.title}>{t('title')}</h1>
        <p className={css.lead}>{t('lead')}</p>
      </div>
      <div className={css.grid}>
        {FEATURES.map(({ key, icon: Icon }) => (
          <article key={key} className={css.card}>
            <span className={css.icon}><Icon size={16} /></span>
            <div className={css.cardCopy}>
              <h2 className={css.cardTitle}>{t(`${key}Title`)}</h2>
              <p className={css.cardBody}>{t(`${key}Body`)}</p>
            </div>
          </article>
        ))}
      </div>
      <p className={css.footer}>{t('footer')}</p>
    </section>
  )
}
