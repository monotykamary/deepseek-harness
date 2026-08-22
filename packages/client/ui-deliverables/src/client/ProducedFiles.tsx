import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { ChevronRight, File, Folder, FolderOpen } from '@monotykamary/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale } from '@monotykamary/dsh-client-ui-slots'
import {
  changedFiles, changedFileTree, totalChangeStats, type ChangedFileTreeNode,
} from './changed-files.ts'
import type { ProducedFilesMatch } from './turn-deliverables.ts'
import type { NS } from './locales.ts'
import css from './ProducedFiles.module.css'

/** Workbench navigation injected by the deliverables plugin. */
export interface ProducedFilesInjected {
  /** Open the loaded Changes surface. */
  openChanges: () => void
}

/** Changed-files card props for one completed Turn. */
export type ProducedFilesProps = {
  matched: ProducedFilesMatch
} & PropsLocale<typeof NS> & InjectFace<ProducedFilesInjected>

function Stats({ additions, deletions }: { additions: number; deletions: number }) {
  return (
    <span className={css.stats} aria-label={`+${additions} −${deletions}`}>
      <span className={css.additions}>+{additions}</span>
      <span className={css.deletions}>−{deletions}</span>
    </span>
  )
}

/**
 * Render one Turn's committed mutations as an expandable changed-files card.
 * @param props - Turn-local receipt groups, navigation actions, and locale seat.
 * @returns Hierarchical changed-files summary and full-diff launcher.
 */
export function ProducedFiles({
  matched: { changes }, openChanges, t,
}: ProducedFilesProps) {
  const files = useMemo(() => changedFiles(changes), [changes])
  const tree = useMemo(() => changedFileTree(files), [files])
  const total = useMemo(() => totalChangeStats(files), [files])
  const [collapsedDirectories, setCollapsedDirectories] = useState<ReadonlySet<string>>(() => new Set())
  const directoryPaths = useMemo(() => {
    const paths: string[] = []
    const visit = (nodes: readonly ChangedFileTreeNode[]) => {
      for (const node of nodes) {
        if (node.kind === 'directory') {
          paths.push(node.path)
          visit(node.children)
        }
      }
    }
    visit(tree)
    return paths
  }, [tree])
  const allDirectoriesCollapsed = directoryPaths.length > 0
    && directoryPaths.every(path => collapsedDirectories.has(path))

  if (files.length === 0) return null

  const toggleAllDirectories = () => {
    setCollapsedDirectories(allDirectoriesCollapsed ? new Set() : new Set(directoryPaths))
  }

  const toggleDirectory = (path: string) => {
    setCollapsedDirectories((current) => {
      const next = new Set(current)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const renderNodes = (nodes: readonly ChangedFileTreeNode[], depth = 0): ReactNode => nodes.map((node) => {
    const style = { '--changed-files-depth': String(depth) } as CSSProperties
    if (node.kind === 'directory') {
      const open = !collapsedDirectories.has(node.path)
      return (
        <div key={`directory:${node.path}`} className={css.treeGroup}>
          <button type="button" className={css.treeRow} style={style} aria-expanded={open} onClick={() => { toggleDirectory(node.path) }}>
            <ChevronRight size={14} className={open ? css.chevronOpen : css.chevron} />
            {open
              ? <FolderOpen size={14} className={css.folderIcon} />
              : <Folder size={14} className={css.folderIcon} />}
            <span className={`${css.path} ${css.directoryPath}`}>{node.name}</span>
            <Stats additions={node.additions} deletions={node.deletions} />
          </button>
          {open && <div className={css.tree}>{renderNodes(node.children, depth + 1)}</div>}
        </div>
      )
    }
    return (
      <button
        key={`file:${node.path}`}
        type="button"
        className={css.treeRow}
        style={style}
        title={node.path}
        aria-label={t('produced.viewFileDiff', { name: node.path })}
        onClick={openChanges}
      >
        <span className={css.chevronSpacer} />
        <File size={14} className={css.fileIcon} />
        <span className={`${css.path} ${css.filePath}`}>{node.name}</span>
        <Stats additions={node.additions} deletions={node.deletions} />
      </button>
    )
  })

  return (
    <div className={css.root} data-changed-files-card="">
      <div className={css.header}>
        <div className={css.summaryLine}>
          <span className={css.summary}>{t(files.length === 1 ? 'produced.changedOne' : 'produced.changed', { count: String(files.length) })}</span>
          <Stats additions={total.additions} deletions={total.deletions} />
        </div>
        <div className={css.actions}>
          {directoryPaths.length > 0 && (
            <button type="button" className={css.actionButton} onClick={toggleAllDirectories}>
              {t(allDirectoriesCollapsed ? 'produced.expandFolders' : 'produced.collapseFolders')}
            </button>
          )}
          <button type="button" className={css.actionButton} onClick={openChanges}>{t('produced.viewDiff')}</button>
        </div>
      </div>
      <div className={css.tree}>{renderNodes(tree)}</div>
    </div>
  )
}
