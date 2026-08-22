import { useState } from 'react'
import {
  Button,
  DiffBlock,
  DisclosureRow,
  ChevronDown,
  SquareMinus,
  SquarePlus,
} from '@monotykamary/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@monotykamary/dsh-client-ui-slots'
import { EMPTY_DELIVERABLES_SNAPSHOT } from './deliverables-view.ts'
import { changedFiles, totalChangeStats } from './changed-files.ts'
import type { NS } from './locales.ts'
import css from './ChangesPanel.module.css'

/** Full workbench Changes-surface props. */
export type ChangesPanelProps = PropsRuntime<'workbench.surface'> & PropsLocale<typeof NS>

interface CollapsedChangesState {
  readonly sessionId: ChangesPanelProps['sessionId']
  readonly keys: ReadonlySet<string>
}

/**
 * Render applied mutation diffs from the loaded Session window.
 * @param props - Session snapshot and deliverables locale seats.
 * @returns workbench Changes content with an empty or grouped-diff accordion.
 */
export function ChangesPanel({ sessionId, useSession, t }: ChangesPanelProps) {
  const snapshot = useSession(state => state.views.get('deliverables') ?? EMPTY_DELIVERABLES_SNAPSHOT)
  const [collapsed, setCollapsed] = useState<CollapsedChangesState>(() => ({
    sessionId,
    keys: new Set(),
  }))
  const collapsedKeys = collapsed.sessionId === sessionId ? collapsed.keys : new Set<string>()
  const files = changedFiles(snapshot.changes)
  const keys = files.map(file => file.path)
  const allCollapsed = keys.length > 0 && keys.every(key => collapsedKeys.has(key))
  const fileCount = files.length
  const total = totalChangeStats(files)

  const toggleChange = (key: string) => {
    setCollapsed((current) => {
      const keys = new Set(current.sessionId === sessionId ? current.keys : [])
      if (keys.has(key)) keys.delete(key)
      else keys.add(key)
      return { sessionId, keys }
    })
  }

  const toggleAll = () => {
    setCollapsed({ sessionId, keys: allCollapsed ? new Set() : new Set(keys) })
  }

  return (
    <div className={css.root} data-workbench-changes="">
      <div className={css.header}>
        <span className={css.title}>{t('changes.title')}</span>
        {snapshot.changes.length > 0 && (
          <div className={css.headerActions}>
            <span className={css.summary}>{t(fileCount === 1 ? 'changes.summaryOne' : 'changes.summary', {
              files: String(fileCount),
              additions: String(total.additions),
              deletions: String(total.deletions),
            })}</span>
            <Button
              variant="ghost"
              size="sm"
              className={css.toggleAll}
              aria-label={t(allCollapsed ? 'changes.expandAll' : 'changes.collapseAll')}
              onClick={toggleAll}
              icon={allCollapsed ? <SquarePlus size={14} /> : <SquareMinus size={14} />}
            />
          </div>
        )}
      </div>
      <div className={css.body}>
        {snapshot.changes.length === 0
          ? <div className={css.empty}>{t('changes.empty')}</div>
          : files.map((file) => {
            const open = !collapsedKeys.has(file.path)
            const { additions, deletions } = file
            return (
              <DisclosureRow
                key={file.path}
                className={css.change}
                rowClassName={css.changeRow}
                titleClassName={css.changeTitle}
                chevronClassName={css.changeChevron}
                icon={<ChevronDown size={14} className={css.changeChevron} />}
                title={file.path}
                open={open}
                expandable
                expandOnRowClick
                previewChevron={false}
                keepContentWhenOpen
                onToggle={() => { toggleChange(file.path) }}
                collapsedContent={(
                  <span className={css.changeStats}>
                    <span className={css.additions}>+{additions}</span>
                    <span className={css.deletions}>−{deletions}</span>
                  </span>
                )}
              >
                <div className={css.diffWrap}>
                  <DiffBlock
                    diffs={[...file.diffs]}
                    appearance="file"
                    labels={{
                      copy: t('changes.copy'),
                      copied: t('changes.copied'),
                      collapseAria: t('changes.collapseDiff'),
                      expandAria: count => t('changes.expandDiff', { count: String(count) }),
                      collapse: t('changes.collapse'),
                      expand: count => t('changes.showDiff', { count: String(count) }),
                      file: t('changes.file'),
                      files: t('changes.files'),
                    }}
                  />
                </div>
              </DisclosureRow>
            )
          })}
      </div>
    </div>
  )
}
