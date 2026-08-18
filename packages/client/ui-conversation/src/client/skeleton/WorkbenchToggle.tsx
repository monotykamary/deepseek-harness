import { IconPanelLeftOutline16, Tooltip } from '@monotykamary/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@monotykamary/dsh-client-ui-slots'
import css from './WorkbenchToggle.module.css'

interface WorkbenchToggleInjected {
  /** Set whether the right panel is requested open without choosing a surface. */
  setWorkbenchOpen: (open: boolean) => void
}

type WorkbenchToggleProps =
  & PropsRuntime<'conversation.session.header.utilities'>
  & InjectFace<WorkbenchToggleInjected>
  & PropsLocale<'conversation'>

/**
 * Render the discoverable Session-header control for the right workbench panel.
 * @param props - live panel state, localized labels, and panel transition gesture.
 * @returns the tooltip-wrapped panel button.
 */
export function WorkbenchToggle({ detailsOpen, setWorkbenchOpen, t }: WorkbenchToggleProps) {
  const label = t(detailsOpen ? 'workbench.close' : 'workbench.open')
  return (
    <Tooltip label={label} side="bottom">
      <button
        type="button"
        className={css.button}
        aria-label={label}
        aria-expanded={detailsOpen}
        onClick={() => { setWorkbenchOpen(!detailsOpen) }}
      >
        <IconPanelLeftOutline16 className={css.rightPanelIcon} size={16} />
      </button>
    </Tooltip>
  )
}
