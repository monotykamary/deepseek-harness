import { useCallback, useEffect, useMemo, useRef } from 'react'
import type { WorkspaceFileEntry, WorkspaceFileLocator } from '@monotykamary/dsh-api-remotes/client'
import type { FilesPanelProps } from './contract.ts'
import {
  ROOT_LOCATOR, loadedEntries, locatorKey, searchRows, treeRows,
} from './presentation.ts'
import { FilesTree } from './FilesTree.tsx'
import { FilePreview } from './FilePreview.tsx'
import css from './FilesPanel.module.css'

let requestSerial = 0

/** Session-scoped Files workbench surface over cancellable Remote reads. */
export function FilesPanel({ useStore, actions, list, read, t }: FilesPanelProps) {
  const directories = useStore(state => state.directories)
  const expandedKeys = useStore(state => state.expandedKeys)
  const selected = useStore(state => state.selected)
  const preview = useStore(state => state.preview)
  const query = useStore(state => state.query)
  const controllers = useRef(new Set<AbortController>())

  const stopRequests = useCallback(() => {
    for (const controller of controllers.current) controller.abort()
    controllers.current.clear()
    actions.cancelPending()
  }, [actions])

  useEffect(() => stopRequests, [stopRequests])

  const loadDirectory = useCallback((directory: WorkspaceFileLocator): void => {
    const key = locatorKey(directory)
    const requestId = ++requestSerial
    const controller = new AbortController()
    controllers.current.add(controller)
    actions.beginDirectory(key, requestId)
    void list(directory, controller.signal).then(
      (value) => { actions.resolveDirectory(key, requestId, value) },
      () => {
        if (controller.signal.aborted) actions.cancelPending()
        else actions.rejectDirectory(key, requestId)
      },
    ).finally(() => { controllers.current.delete(controller) })
  }, [actions, list])

  const loadPreview = useCallback((file: WorkspaceFileLocator): void => {
    const requestId = ++requestSerial
    const controller = new AbortController()
    controllers.current.add(controller)
    actions.beginPreview(file, requestId)
    void read(file, controller.signal).then(
      (value) => { actions.resolvePreview(requestId, value) },
      () => {
        if (controller.signal.aborted) actions.cancelPending()
        else actions.rejectPreview(requestId)
      },
    ).finally(() => { controllers.current.delete(controller) })
  }, [actions, read])

  const rootKey = locatorKey(ROOT_LOCATOR)
  const rootCell = directories[rootKey]
  useEffect(() => {
    if (rootCell === undefined) loadDirectory(ROOT_LOCATOR)
  }, [loadDirectory, rootCell])

  const knownDirectories = useMemo(
    () => loadedEntries(directories).filter(entry => entry.kind === 'directory'),
    [directories],
  )
  useEffect(() => {
    for (const entry of knownDirectories) {
      const key = locatorKey(entry.locator)
      if (expandedKeys.includes(key) && directories[key] === undefined) loadDirectory(entry.locator)
    }
  }, [directories, expandedKeys, knownDirectories, loadDirectory])

  const selectedKey = selected === null ? null : locatorKey(selected)
  useEffect(() => {
    if (selected !== null && (preview === null || locatorKey(preview.file) !== selectedKey)) {
      loadPreview(selected)
    }
  }, [loadPreview, preview, selected, selectedKey])

  const searching = query.trim() !== ''
  const rows = useMemo(
    () => searching ? searchRows(directories, query) : treeRows({ directories, expandedKeys }),
    [directories, expandedKeys, query, searching],
  )
  const truncated = useMemo(
    () => Object.values(directories).some(cell => cell.listing?.truncated === true),
    [directories],
  )

  const activate = (entry: WorkspaceFileEntry): void => {
    /* v8 ignore next -- `other` rows are disabled before this private callback can run. */
    if (entry.kind === 'other') return
    if (entry.kind === 'file') {
      actions.expandPath(entry.locator, false)
      actions.selectFile(entry.locator)
      return
    }
    const key = locatorKey(entry.locator)
    const opening = searching || !expandedKeys.includes(key)
    if (searching) {
      actions.setQuery('')
      actions.expandPath(entry.locator, true)
    } else {
      actions.toggleDirectory(key)
    }
    const cell = directories[key]
    if (opening && (cell === undefined || cell.phase === 'error')) loadDirectory(entry.locator)
  }

  const refresh = (): void => {
    stopRequests()
    actions.refresh()
  }

  return (
    <div className={css.root} data-workbench-files="">
      {selected === null ? (
        <FilesTree
          rows={rows}
          query={query}
          searching={searching}
          rootCell={rootCell}
          directories={directories}
          expandedKeys={expandedKeys}
          selectedKey={selectedKey}
          truncated={truncated}
          t={t}
          onQuery={actions.setQuery}
          onRefresh={refresh}
          onActivate={activate}
          onRetryRoot={() => { loadDirectory(ROOT_LOCATOR) }}
        />
      ) : (
        <FilePreview
          file={selected}
          preview={preview}
          t={t}
          onBack={actions.showTree}
          onRefresh={() => { stopRequests(); loadPreview(selected) }}
          onRetry={() => { loadPreview(selected) }}
        />
      )}
    </div>
  )
}
