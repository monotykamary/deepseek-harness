import type { DiffHunk } from '@monotykamary/dsh-client-ui-primitives'
import type { DeliverableChange } from './contract.ts'

/** Added and removed line totals for one file or directory. */
export interface ChangeStats {
  readonly additions: number
  readonly deletions: number
}

/** One distinct changed file with all loaded receipt hunks in commit order. */
export interface ChangedFileSummary extends ChangeStats {
  readonly kind: 'file'
  readonly name: string
  readonly path: string
  readonly diffs: readonly DiffHunk[]
}

/** One directory inferred from changed-file paths. */
export interface ChangedDirectorySummary extends ChangeStats {
  readonly kind: 'directory'
  readonly name: string
  readonly path: string
  readonly children: readonly ChangedFileTreeNode[]
}

/** A directory or file row in the changed-files tree. */
export type ChangedFileTreeNode = ChangedDirectorySummary | ChangedFileSummary

interface MutableDirectory {
  readonly name: string
  readonly path: string
  readonly directories: Map<string, MutableDirectory>
  readonly files: ChangedFileSummary[]
}

function contentLineCount(text: string | null): number {
  if (text === null || text === '') return 0
  return (text.endsWith('\n') ? text.slice(0, -1) : text).split('\n').length
}

/**
 * Count added and removed receipt lines.
 * @param diffs - Applied mutation hunks.
 * @returns Added and removed line totals.
 */
export function changeStats(diffs: readonly DiffHunk[]): ChangeStats {
  let additions = 0
  let deletions = 0
  for (const diff of diffs) {
    additions += contentLineCount(diff.newText)
    deletions += contentLineCount(diff.oldText)
  }
  return { additions, deletions }
}

/**
 * Merge receipt groups into one entry per path.
 * @param changes - Mutation groups carrying commit order.
 * @returns Distinct files in first-seen order.
 */
export function changedFiles(changes: readonly DeliverableChange[]): readonly ChangedFileSummary[] {
  const byPath = new Map<string, DiffHunk[]>()
  for (const change of [...changes].sort((a, b) => a.commitOrder - b.commitOrder)) {
    for (const diff of change.diffs) {
      const diffs = byPath.get(diff.path) ?? []
      diffs.push(diff)
      byPath.set(diff.path, diffs)
    }
  }
  return [...byPath].map(([path, diffs]) => ({
    kind: 'file',
    name: path.split(/[\\/]/u).at(-1) ?? path,
    path,
    diffs,
    ...changeStats(diffs),
  }))
}

function finalizeDirectory(directory: MutableDirectory): ChangedDirectorySummary {
  const children: ChangedFileTreeNode[] = [
    ...[...directory.directories.values()].map(finalizeDirectory),
    ...directory.files,
  ]
  return {
    kind: 'directory',
    name: directory.name,
    path: directory.path,
    additions: children.reduce((total, child) => total + child.additions, 0),
    deletions: children.reduce((total, child) => total + child.deletions, 0),
    children,
  }
}

/**
 * Group changed files by path segments while preserving first-seen order.
 * @param files - Distinct changed files.
 * @returns Root tree rows; common directories become expandable nodes.
 */
export function changedFileTree(files: readonly ChangedFileSummary[]): readonly ChangedFileTreeNode[] {
  const root: MutableDirectory = { name: '', path: '', directories: new Map(), files: [] }
  for (const file of files) {
    const segments = file.path.split(/[\\/]/u).filter(Boolean)
    let directory = root
    let directoryPath = ''
    for (const segment of segments.slice(0, -1)) {
      directoryPath = directoryPath === '' ? segment : `${directoryPath}/${segment}`
      let child = directory.directories.get(segment)
      if (child === undefined) {
        child = { name: segment, path: directoryPath, directories: new Map(), files: [] }
        directory.directories.set(segment, child)
      }
      directory = child
    }
    directory.files.push(file)
  }
  const directories: ChangedFileTreeNode[] = [...root.directories.values()].map(finalizeDirectory)
  return [...directories, ...root.files]
}

/**
 * Sum statistics across changed files.
 * @param files - Distinct changed files.
 * @returns Aggregate additions and deletions.
 */
export function totalChangeStats(files: readonly ChangedFileSummary[]): ChangeStats {
  return {
    additions: files.reduce((total, file) => total + file.additions, 0),
    deletions: files.reduce((total, file) => total + file.deletions, 0),
  }
}
