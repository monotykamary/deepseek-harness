import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { ChevronRight, File, Folder, FolderOpen } from '@monotykamary/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale } from '@monotykamary/dsh-client-ui-slots'
import {
  changedFiles, changedFileTree, totalChangeStats, type ChangedFileTreeNode,
} from './changed-files.ts'
import type { DeliverableChange } from './contract.ts'
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

/** Resolved labels for the reusable receipt-backed changed-files card. */
export interface ProducedFilesCardLabels {
  /** Summarize the distinct changed-file count. */
  changed: (count: number) => string
  /** Accessible action for one changed path. */
  viewFileDiff: (path: string) => string
  /** Expand every inferred directory. */
  expandFolders: string
  /** Collapse every inferred directory. */
  collapseFolders: string
  /** Open the complete diff view. */
  viewDiff: string
}

/** Pure changed-files card props for non-chat receipt consumers. */
export interface ProducedFilesCardProps {
  /** Committed mutation groups to summarize. */
  changes: readonly DeliverableChange[]
  /** Owner-resolved labels. */
  labels: ProducedFilesCardLabels
  /** Optional complete-diff navigation; omitted consumers retain a read-only file tree. */
  openChanges?: (() => void) | undefined
}

function Stats({ additions, deletions }: { additions: number; deletions: number }) {
  return (
    <span className={css.stats} aria-label={`+${additions} −${deletions}`}>
      <span className={css.additions}>+{additions}</span>
      <span className={css.deletions}>−{deletions}</span>
    </span>
  )
}

/**
 * Render committed mutation groups as the same hierarchical card used at the end of a chat Turn.
 * @param props - Receipt groups, resolved labels, and optional full-diff navigation.
 * @returns Expandable changed-file hierarchy, or null when no file changed.
 */
export function ProducedFilesCard({ changes, labels, openChanges }: ProducedFilesCardProps) {
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
    const body = (
      <>
        <span className={css.chevronSpacer} />
        <File size={14} className={css.fileIcon} />
        <span className={`${css.path} ${css.filePath}`}>{node.name}</span>
        <Stats additions={node.additions} deletions={node.deletions} />
      </>
    )
    return openChanges === undefined ? (
      <div key={`file:${node.path}`} className={css.treeRow} style={style} title={node.path}>{body}</div>
    ) : (
      <button
        key={`file:${node.path}`}
        type="button"
        className={css.treeRow}
        style={style}
        title={node.path}
        aria-label={labels.viewFileDiff(node.path)}
        onClick={openChanges}
      >
        {body}
      </button>
    )
  })

  return (
    <div className={css.root} data-changed-files-card="">
      <div className={css.header}>
        <div className={css.summaryLine}>
          <span className={css.summary}>{labels.changed(files.length)}</span>
          <Stats additions={total.additions} deletions={total.deletions} />
        </div>
        <div className={css.actions}>
          {directoryPaths.length > 0 && (
            <button type="button" className={css.actionButton} onClick={toggleAllDirectories}>
              {allDirectoriesCollapsed ? labels.expandFolders : labels.collapseFolders}
            </button>
          )}
          {openChanges === undefined ? null : <button type="button" className={css.actionButton} onClick={openChanges}>{labels.viewDiff}</button>}
        </div>
      </div>
      <div className={css.tree}>{renderNodes(tree)}</div>
    </div>
  )
}

/**
 * Render one completed chat Turn's committed mutations with Changes navigation.
 * @param props - Turn-local receipt groups, navigation action, and deliverables translator.
 * @returns The shared changed-files card.
 */
export function ProducedFiles({ matched: { changes }, openChanges, t }: ProducedFilesProps) {
  return (
    <ProducedFilesCard
      changes={changes}
      openChanges={openChanges}
      labels={{
        changed: count => t(count === 1 ? 'produced.changedOne' : 'produced.changed', { count: String(count) }),
        viewFileDiff: path => t('produced.viewFileDiff', { name: path }),
        expandFolders: t('produced.expandFolders'),
        collapseFolders: t('produced.collapseFolders'),
        viewDiff: t('produced.viewDiff'),
      }}
    />
  )
}
