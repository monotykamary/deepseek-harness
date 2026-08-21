import { useEffect, useMemo, useRef, useState } from 'react'
import {
  IconChevronLeftOutline14, IconFullscreenOutline16, IconLoadingOutline16, IconRefreshOutline14, IconWrapTextOutline14,
  SourceEditor, Tooltip,
} from '@monotykamary/dsh-client-ui-primitives'
import type {
  WorkspaceFileLocator, WorkspaceFilePreview, WorkspaceFileVersion, WorkspaceFileWriteResult,
  WorkspaceTextFilePreview, WorkspaceUnavailableFilePreview,
} from '@monotykamary/dsh-api-remotes/client'
import type { TranslateNS } from '@monotykamary/dsh-client-ui-slots'
import type { PreviewCell } from './store.ts'
import { byteLimitLabel, languageFor, locatorLabel } from './presentation.ts'
import { FileSaveCoordinator } from './file-save-coordinator.ts'
import type { NS } from './locales.ts'
import css from './FilesPanel.module.css'

const SAVE_DEBOUNCE_MS = 500

const WrapTextIcon = IconWrapTextOutline14

type SavePhase = 'idle' | 'pending' | 'saved' | 'conflict' | 'too-large' | 'not-file' | 'error'

interface FilePreviewProps {
  readonly file: WorkspaceFileLocator
  readonly preview: PreviewCell | null
  readonly t: TranslateNS<typeof NS>
  readonly onBack: () => void
  readonly onRefresh: () => void
  readonly onRetry: () => void
  readonly onWrite: (
    file: WorkspaceFileLocator,
    content: string,
    expectedVersion: WorkspaceFileVersion,
  ) => Promise<WorkspaceFileWriteResult>
  readonly onCommit: (preview: WorkspaceFilePreview) => void
}

interface EditableFileProps {
  readonly file: WorkspaceFileLocator
  readonly value: WorkspaceTextFilePreview
  readonly t: TranslateNS<typeof NS>
  readonly onWrite: FilePreviewProps['onWrite']
  readonly onCommit: FilePreviewProps['onCommit']
  readonly wrap: boolean
}

/* v8 ignore next 3 -- closed Remote reason union backstop. */
function assertNever(value: never): never {
  throw new Error(`unhandled workspace preview reason: ${JSON.stringify(value)}`)
}

function unavailableText(
  value: WorkspaceUnavailableFilePreview,
  t: TranslateNS<typeof NS>,
): string {
  switch (value.reason) {
    case 'too-large': return t('preview.tooLarge', { limit: byteLimitLabel(value.maxBytes) })
    case 'not-text': return t('preview.notText')
    case 'not-file': return t('preview.notFile')
    /* v8 ignore next -- closed Remote reason union. */
    default: return assertNever(value.reason)
  }
}

function saveMessage(phase: SavePhase, t: TranslateNS<typeof NS>): string {
  switch (phase) {
    case 'idle': return ''
    case 'pending': return t('editor.saving')
    case 'saved': return t('editor.saved')
    case 'conflict': return t('editor.conflict')
    case 'too-large': return t('editor.tooLarge')
    case 'not-file': return t('preview.notFile')
    case 'error': return t('editor.error')
    /* v8 ignore next -- closed local phase union. */
    default: return assertNever(phase)
  }
}

function EditableFile({ file, value, t, onWrite, onCommit, wrap }: EditableFileProps) {
  const [draft, setDraft] = useState(value.content)
  const [phase, setPhase] = useState<SavePhase>('idle')
  const version = useRef(value.version)
  const mounted = useRef(true)
  const fileKey = locatorLabel(file)

  const coordinator = useMemo(() => new FileSaveCoordinator({
    debounceMs: SAVE_DEBOUNCE_MS,
    persist: async (content) => {
      const result = await onWrite(file, content, version.current)
      switch (result.kind) {
        case 'saved': {
          version.current = result.version
          onCommit({
            kind: 'text',
            file: result.file,
            name: result.file.segments.at(-1) ?? '',
            content: result.content,
            byteLength: result.byteLength,
            version: result.version,
          })
          if (mounted.current) setDraft(result.content)
          return true
        }
        case 'conflict':
        case 'too-large':
        case 'not-file':
          if (mounted.current) setPhase(result.kind)
          return false
        /* v8 ignore next 2 -- closed WorkspaceFileWriteResult union backstop. */
        default:
          return assertNever(result)
      }
    },
    onPendingChange: (pending) => {
      if (mounted.current) setPhase(pending ? 'pending' : 'saved')
    },
    onError: () => {
      /* v8 ignore next -- disposed coordinators cannot publish transport errors. */
      if (mounted.current) setPhase('error')
    },
  }), [fileKey, file, onCommit, onWrite])

  useEffect(() => {
    version.current = value.version
    setDraft(value.content)
  }, [value.content, value.version])

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      coordinator.dispose()
    }
  }, [coordinator])

  const message = saveMessage(phase, t)
  const failed = phase === 'conflict' || phase === 'too-large' || phase === 'not-file' || phase === 'error'

  return (
    <div className={css.editorSurface}>
      <SourceEditor
        value={draft}
        ariaLabel={t('editor.label', { path: fileKey })}
        lang={languageFor(file)}
        wrap={wrap}
        onChange={(content) => {
          setDraft(content)
          coordinator.change(content)
        }}
        onSave={() => { coordinator.saveNow() }}
      />
      {message !== '' && (
        <div className={css.saveState} role={failed ? 'alert' : 'status'} data-error={failed || undefined}>
          {message}
        </div>
      )}
    </div>
  )
}

/** T3-adapted bounded source editor with a compact breadcrumb toolbar. */
export function FilePreview({
  file, preview, t, onBack, onRefresh, onRetry, onWrite, onCommit,
}: FilePreviewProps) {
  const loading = preview === null || preview.phase === 'loading'
  const editable = preview?.phase === 'ready' && preview.value?.kind === 'text'
  const [wrap, setWrap] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const fileKey = locatorLabel(file)
  useEffect(() => { setWrap(false); setFullscreen(false) }, [fileKey])
  return (
    <div className={css.previewSurface} data-fullscreen={fullscreen || undefined}>
      <div className={css.subheader} data-surface-subheader="">
        <Tooltip label={t('preview.back')} side="bottom">
          <button type="button" className={css.iconButton} aria-label={t('preview.back')} onClick={onBack}>
            <IconChevronLeftOutline14 />
          </button>
        </Tooltip>
        <div className={css.breadcrumb} title={locatorLabel(file)}>
          {file.segments.map((segment, index) => (
            <span key={`${String(index)}:${segment}`} className={css.crumb} data-current={index === file.segments.length - 1 || undefined}>
              {index > 0 && <span className={css.crumbSeparator}>/</span>}
              <span>{segment}</span>
            </span>
          ))}
        </div>
        {editable && (
          <Tooltip label={wrap ? t('editor.wrapOff') : t('editor.wrapOn')} side="bottom">
            <button
              type="button"
              className={css.iconButton}
              aria-label={wrap ? t('editor.wrapOff') : t('editor.wrapOn')}
              aria-pressed={wrap}
              onClick={() => { setWrap(value => !value) }}
            >
              <WrapTextIcon />
            </button>
          </Tooltip>
        )}
        {editable && (
          <Tooltip label={fullscreen ? t('editor.restore') : t('editor.fullscreen')} side="bottom">
            <button
              type="button"
              className={css.iconButton}
              aria-label={fullscreen ? t('editor.restore') : t('editor.fullscreen')}
              onClick={() => { setFullscreen(value => !value) }}
            >
              <IconFullscreenOutline16 />
            </button>
          </Tooltip>
        )}
        <Tooltip label={t('preview.refresh')} side="bottom">
          <button
            type="button"
            className={css.iconButton}
            aria-label={t('preview.refresh')}
            disabled={loading}
            onClick={onRefresh}
          >
            <IconRefreshOutline14 />
          </button>
        </Tooltip>
      </div>
      {loading ? (
        <div className={css.state} aria-live="polite">
          <IconLoadingOutline16 className={css.spinning} />
          <span>{t('preview.loading')}</span>
        </div>
      ) : preview.phase === 'error' ? (
        <div className={css.state} role="alert">
          <span>{t('preview.error')}</span>
          <button type="button" className={css.retry} onClick={onRetry}>{t('preview.retry')}</button>
        </div>
      ) : preview.value?.kind === 'unavailable' ? (
        <div className={css.state}>{unavailableText(preview.value, t)}</div>
      ) : preview.value?.kind === 'text' ? (
        <EditableFile
          key={locatorLabel(file)}
          file={file}
          value={preview.value}
          t={t}
          onWrite={onWrite}
          onCommit={onCommit}
          wrap={wrap}
        />
      ) : null}
    </div>
  )
}
