import { FolderOpen, Tooltip } from '@monotykamary/dsh-client-ui-primitives'
import type { FilesHeaderActionProps } from './contract.ts'
import css from './FilesHeaderAction.module.css'

/** Session-header gesture that opens the Files workbench surface. */
export function FilesHeaderAction({ openFiles, t }: FilesHeaderActionProps) {
  return (
    <Tooltip label={t('open')} side="bottom">
      <button type="button" className={css.trigger} aria-label={t('open')} onClick={openFiles}>
        <FolderOpen size={14} />
        <span>{t('tab')}</span>
      </button>
    </Tooltip>
  )
}
