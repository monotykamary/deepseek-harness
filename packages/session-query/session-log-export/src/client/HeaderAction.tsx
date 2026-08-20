import type { ReactNode } from 'react'
import { IconDownloadOutline16 } from '@monotykamary/dsh-client-ui-primitives'
import { SessionLogDownloadDialog, type SessionLogDownloadDialogProps } from './Dialog.tsx'
import css from './HeaderAction.module.css'

/**
 * Render the Session Header export capsule and its shared result dialog.
 * @param props - Session runtime, download controller, and localized dialog copy.
 * @returns the persistent Header action and Session-scoped dialog, hidden
 * while the Session is still blank (no durable log exists to export).
 */
export function SessionLogDownloadHeaderAction(props: SessionLogDownloadDialogProps): ReactNode {
  const { sessionId, useSession, useSessionLogDownload, request } = props
  const blank = useSession(s => s.blank)
  const entry = useSessionLogDownload(state => state.bySession[String(sessionId)])
  const busy = entry?.status === 'downloading'
  if (blank) return null

  return (
    <>
      <button
        type="button"
        className={css.sessionLogButton}
        disabled={busy}
        aria-busy={busy}
        onClick={() => { void request(sessionId) }}
      >
        <span>Session log</span>
        <IconDownloadOutline16 size={12} />
      </button>
      <SessionLogDownloadDialog {...props} />
    </>
  )
}
