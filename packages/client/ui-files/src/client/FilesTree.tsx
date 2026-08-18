import { useMemo, useRef, type CSSProperties, type KeyboardEvent } from 'react'
import {
  IconCodeOutline16, IconFolderClose16, IconFolderOpen16, IconLoadingOutline16,
  IconRefreshOutline14, IconSearchOutline16, IconTriangleRightFill14, IconWarningOutline16, Tooltip,
} from '@monotykamary/dsh-client-ui-primitives'
import type { WorkspaceFileEntry, WorkspaceFileLocator } from '@monotykamary/dsh-api-remotes/client'
import type { TranslateNS } from '@monotykamary/dsh-client-ui-slots'
import type { DirectoryCell } from './store.ts'
import type { FileRow } from './presentation.ts'
import type { NS } from './locales.ts'
import css from './FilesPanel.module.css'

interface FilesTreeProps {
  readonly rows: readonly FileRow[]
  readonly query: string
  readonly searching: boolean
  readonly rootCell: DirectoryCell | undefined
  readonly directories: Readonly<Record<string, DirectoryCell>>
  readonly expandedKeys: readonly string[]
  readonly selectedKey: string | null
  readonly truncated: boolean
  readonly t: TranslateNS<typeof NS>
  readonly onQuery: (query: string) => void
  readonly onRefresh: () => void
  readonly onActivate: (entry: WorkspaceFileEntry) => void
  readonly onRetryRoot: () => void
}

function rowIcon(row: FileRow, open: boolean) {
  switch (row.entry.kind) {
    case 'directory': return open ? <IconFolderOpen16 size={14} /> : <IconFolderClose16 size={14} />
    case 'file': return <IconCodeOutline16 size={14} />
    case 'other': return <IconWarningOutline16 size={14} />
  }
}

function depthStyle(depth: number): CSSProperties {
  return { '--files-depth': depth } as CSSProperties
}

function parentLocator(entry: WorkspaceFileEntry): WorkspaceFileLocator {
  return { segments: entry.locator.segments.slice(0, -1) }
}

/** T3-adapted compact lazy workspace tree and loaded-entry filter. */
export function FilesTree({
  rows, query, searching, rootCell, directories, expandedKeys, selectedKey, truncated, t,
  onQuery, onRefresh, onActivate, onRetryRoot,
}: FilesTreeProps) {
  const treeRef = useRef<HTMLDivElement>(null)
  const rowByKey = useMemo(() => new Map(rows.map(row => [row.key, row])), [rows])

  const moveFocus = (index: number): void => {
    const items = treeRef.current?.querySelectorAll<HTMLElement>('[role="treeitem"]')
    items?.[Math.max(0, Math.min(index, items.length - 1))]?.focus()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, row: FileRow): void => {
    const index = rows.indexOf(row)
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      moveFocus(index + 1)
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      moveFocus(index - 1)
      return
    }
    if (event.key === 'Home') {
      event.preventDefault()
      moveFocus(0)
      return
    }
    if (event.key === 'End') {
      event.preventDefault()
      moveFocus(rows.length - 1)
      return
    }
    if (searching) return
    const open = row.entry.kind === 'directory' && expandedKeys.includes(row.key)
    if (event.key === 'ArrowRight' && row.entry.kind === 'directory') {
      event.preventDefault()
      if (!open) onActivate(row.entry)
      else if (rows[index + 1]?.depth === row.depth + 1) moveFocus(index + 1)
      return
    }
    if (event.key !== 'ArrowLeft') return
    event.preventDefault()
    if (open) {
      onActivate(row.entry)
      return
    }
    const parent = rowByKey.get(JSON.stringify(parentLocator(row.entry).segments))
    if (parent !== undefined) moveFocus(rows.indexOf(parent))
  }

  const rootPending = rootCell?.phase === 'loading' && rootCell.listing === null
  const rootFailed = rootCell?.phase === 'error' && rootCell.listing === null

  return (
    <div className={css.treeSurface}>
      <div className={css.subheader} data-surface-subheader="">
        <Tooltip label={rootCell?.phase === 'loading' ? t('tree.refreshing') : t('tree.refresh')} side="bottom">
          <button
            type="button"
            className={css.iconButton}
            aria-label={t('tree.refresh')}
            disabled={rootCell?.phase === 'loading'}
            onClick={onRefresh}
          >
            <IconRefreshOutline14 className={rootCell?.phase === 'loading' ? css.spinning : undefined} />
          </button>
        </Tooltip>
        <label className={css.search}>
          <IconSearchOutline16 size={14} />
          <input
            type="search"
            value={query}
            aria-label={t('tree.filterAria')}
            placeholder={t('tree.filter')}
            spellCheck={false}
            onChange={(event) => { onQuery(event.currentTarget.value) }}
          />
        </label>
      </div>
      {rootPending ? (
        <div className={css.state} aria-live="polite">
          <IconLoadingOutline16 className={css.spinning} />
          <span>{t('tree.loading')}</span>
        </div>
      ) : rootFailed ? (
        <div className={css.state} role="alert">
          <span>{t('tree.error')}</span>
          <button type="button" className={css.retry} onClick={onRetryRoot}>{t('tree.retry')}</button>
        </div>
      ) : (
        <div ref={treeRef} className={css.tree} role="tree" aria-label={t('tree.aria')}>
          {rows.map((row) => {
            const open = row.entry.kind === 'directory' && expandedKeys.includes(row.key)
            const directory = directories[row.key]
            const pending = open && directory?.phase === 'loading'
            const failed = open && directory?.phase === 'error'
            return (
              <button
                key={row.key}
                type="button"
                role="treeitem"
                className={css.row}
                style={depthStyle(row.depth)}
                data-selected={selectedKey === row.key || undefined}
                aria-selected={selectedKey === row.key}
                aria-level={row.depth + 1}
                aria-expanded={row.entry.kind === 'directory' ? open : undefined}
                disabled={row.entry.kind === 'other'}
                title={row.entry.kind === 'other' ? row.entry.name : undefined}
                onClick={() => { onActivate(row.entry) }}
                onKeyDown={(event) => { onKeyDown(event, row) }}
              >
                <span className={css.disclosure} aria-hidden>
                  {row.entry.kind === 'directory' && (
                    <IconTriangleRightFill14 className={open ? css.disclosureOpen : undefined} size={10} />
                  )}
                </span>
                <span className={css.fileIcon} aria-hidden>{rowIcon(row, open)}</span>
                <span className={css.rowText}>
                  <span className={css.name}>{row.entry.name}</span>
                  {searching && <span className={css.path}>{row.entry.locator.segments.slice(0, -1).join('/') || '/'}</span>}
                </span>
                {pending && <IconLoadingOutline16 className={css.spinning} size={12} aria-hidden />}
                {failed && <IconWarningOutline16 size={12} aria-hidden />}
              </button>
            )
          })}
          {rows.length === 0 && (
            <div className={css.empty}>{searching ? t('tree.emptyFilter') : t('tree.empty')}</div>
          )}
        </div>
      )}
      {(searching || truncated) && (
        <div className={css.hints}>
          {searching && <span>{t('tree.filterScope')}</span>}
          {truncated && <span>{t('tree.truncated')}</span>}
        </div>
      )}
    </div>
  )
}
