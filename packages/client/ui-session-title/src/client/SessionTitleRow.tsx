/**
 * General Settings row for automatic LLM session titles: title, description,
 * and an aria-pressed toggle that writes the host `session-title-llm` section.
 */
import type { InjectFace, PropsLocale, PropsRuntime } from '@monotykamary/dsh-client-ui-slots'
import type { SnapshotStore } from '@monotykamary/dsh-client-runtime/client'
import css from './SessionTitleRow.module.css'

/** Registration-side preference face. */
export interface SessionTitleRowInjected {
  hooks: {
    /** Persisted automatic-title opt-in bound as useEnabled. */
    enabled: SnapshotStore<boolean>
  }
  /** Change the persisted automatic-title opt-in. */
  setEnabled: (enabled: boolean) => void
}

/** Full Settings-row props. */
export type SessionTitleRowProps =
  PropsRuntime<'settings.general.item'>
  & PropsLocale<'settings.sessionTitle'>
  & InjectFace<SessionTitleRowInjected>

/**
 * Render the automatic session-title toggle.
 * @param props - composed Settings slot props.
 * @returns the preference row.
 */
export function SessionTitleRow({ useEnabled, setEnabled, t }: SessionTitleRowProps) {
  const enabled = useEnabled(value => value)
  return (
    <div className={css.row}>
      <div className={css.rowText}>
        <div className={css.title}>{t('title')}</div>
        <div className={css.desc}>{t('description')}</div>
      </div>
      <button
        type="button"
        className={css.toggle}
        aria-label={t('title')}
        aria-pressed={enabled}
        onClick={() => { setEnabled(!enabled) }}
      >
        <span className={css.track} data-on={enabled || undefined} aria-hidden="true">
          <span className={css.thumb} />
        </span>
      </button>
    </div>
  )
}
