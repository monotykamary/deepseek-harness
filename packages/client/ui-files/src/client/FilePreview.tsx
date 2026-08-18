import {
  CodeBlock, IconChevronLeftOutline14, IconLoadingOutline16, IconRefreshOutline14, Tooltip,
} from '@monotykamary/dsh-client-ui-primitives'
import type { WorkspaceFileLocator, WorkspaceUnavailableFilePreview } from '@monotykamary/dsh-api-remotes/client'
import type { TranslateNS } from '@monotykamary/dsh-client-ui-slots'
import type { PreviewCell } from './store.ts'
import { byteLimitLabel, languageFor, locatorLabel } from './presentation.ts'
import type { NS } from './locales.ts'
import css from './FilesPanel.module.css'

interface FilePreviewProps {
  readonly file: WorkspaceFileLocator
  readonly preview: PreviewCell | null
  readonly t: TranslateNS<typeof NS>
  readonly onBack: () => void
  readonly onRefresh: () => void
  readonly onRetry: () => void
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

/** Bounded source preview with a compact breadcrumb toolbar. */
export function FilePreview({ file, preview, t, onBack, onRefresh, onRetry }: FilePreviewProps) {
  const loading = preview === null || preview.phase === 'loading'
  return (
    <div className={css.previewSurface}>
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
        <div className={css.previewScroll}>
          <CodeBlock
            code={preview.value.content}
            lang={languageFor(file)}
            className={css.code}
            copyLabel={t('preview.copy')}
            copiedLabel={t('preview.copied')}
          />
        </div>
      ) : null}
    </div>
  )
}
