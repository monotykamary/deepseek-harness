// StateDot: session state indicator (figma nodes 14:3303/3305/3312, 122:9182).
// done/warning/error: 10x10 halo (same color, 10% opacity) around a 6x6 solid
// core. ongoing: a spinning Lucide loader. Colors resolve through --dsw-*
// tokens only.

import clsx from 'clsx'
import { LoaderCircle } from './icons/index.tsx'
import css from './StateDot.module.css'

/** Four-color state semantic (green done / amber user-attention / blue running ring / red error). */
export type StateDotState = 'done' | 'warning' | 'ongoing' | 'error'

/**
 * Render a state dot.
 * @param props.state - which of the four states to show.
 * @param props.size - outer diameter in px (default 10, the figma size).
 * @param props.className - extra class for layout placement.
 * @returns the dot element (aria-hidden; pair with text for accessibility).
 */
export function StateDot({ state, size = 10, className }: {
  state: StateDotState
  size?: number | undefined
  className?: string | undefined
}) {
  if (state === 'ongoing') {
    return <LoaderCircle className={clsx(css.matrix, className)} data-state="ongoing" size={size} aria-hidden="true" />
  }
  return (
    <span
      className={clsx(css.dot, className)}
      data-state={state}
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  )
}
