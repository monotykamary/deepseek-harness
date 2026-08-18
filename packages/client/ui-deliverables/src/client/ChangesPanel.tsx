import { DiffBlock } from '@monotykamary/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@monotykamary/dsh-client-ui-slots'
import { EMPTY_DELIVERABLES_SNAPSHOT } from './deliverables-view.ts'
import type { NS } from './locales.ts'
import css from './ChangesPanel.module.css'

/** Full workbench Changes-surface props. */
export type ChangesPanelProps = PropsRuntime<'workbench.surface'> & PropsLocale<typeof NS>

/**
 * Render applied mutation diffs from the loaded Session window.
 * @param props - Session snapshot and deliverables locale seats.
 * @returns workbench Changes content with an empty or grouped-diff body.
 */
export function ChangesPanel({ useSession, t }: ChangesPanelProps) {
  const snapshot = useSession(state => state.views.get('deliverables') ?? EMPTY_DELIVERABLES_SNAPSHOT)
  const fileCount = new Set(snapshot.changes.flatMap(change => change.diffs.map(diff => diff.path))).size

  return (
    <div className={css.root} data-workbench-changes="">
      <div className={css.header}>
        <span className={css.title}>{t('changes.title')}</span>
        {snapshot.changes.length > 0 && (
          <span className={css.summary}>{t('changes.summary', {
            changes: String(snapshot.changes.length),
            files: String(fileCount),
          })}</span>
        )}
      </div>
      <div className={css.body}>
        {snapshot.changes.length === 0
          ? <div className={css.empty}>{t('changes.empty')}</div>
          : snapshot.changes.map(change => (
            <section key={`${String(change.turn)}:${change.callId}:${String(change.seq)}`} className={css.change}>
              <div className={css.changeTitle}>{change.title}</div>
              <DiffBlock diffs={[...change.diffs]} />
            </section>
          ))}
      </div>
    </div>
  )
}
