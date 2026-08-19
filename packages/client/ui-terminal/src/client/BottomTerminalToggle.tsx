import { PanelBottom } from 'lucide-react'
import { Tooltip } from '@monotykamary/dsh-client-ui-primitives'
import type { BottomTerminalToggleProps } from './contract.ts'
import css from './BottomTerminalToggle.module.css'

/** Session-header control toggling the mounted bottom terminal panel. */
export function BottomTerminalToggle({ toggleBottomTerminal, t }: BottomTerminalToggleProps) {
  const label = t('openBottom')
  return (
    <Tooltip label={label} side="bottom">
      <button type="button" className={css.button} aria-label={label} onClick={toggleBottomTerminal}>
        <PanelBottom size={16} strokeWidth={1.75} />
      </button>
    </Tooltip>
  )
}
