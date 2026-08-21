// TextShimmer: compositor-only in-flight band for transcript row text.

// The row-running signal has two parts: the caller's data-row chrome (icon
// states, visually hidden labels) and this wash band sweeping across the text
// box. The band is a plain painted strip animated with transform ONLY — one
// layer per row, glyphs rasterized once — which keeps an n-row transcript far
// cheaper than a background-clip:text sweep that re-rasterizes every glyph
// each frame. Reduced-motion renders nothing, and callers keep resting colors.

import { memo } from 'react'
import type { CSSProperties } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import css from './TextShimmer.module.css'

/** One sweep, band entering from off-left to off-right, at row pace. */
const DEFAULT_SWEEP_DURATION_SECONDS = 2.4
/** Sweep travel as a percentage of the band's own width (1.2 = 120%). */
const SWEEP_START_OFFSET_PERCENT = 1.2
const SWEEP_END_OFFSET_PERCENT = 4.08

/** TextShimmer tuning props. */
export interface TextShimmerProps {
  /** CSS color the band washes with between transparent edges. */
  color?: string | undefined
  /** Seconds for one full sweep (start-to-exit including the end hold). */
  duration?: number | undefined
}

/**
 * Render the wash band over a running row's text box.
 * @param props - optional band color and sweep duration.
 * @returns the sweep element, or nothing when the user prefers reduced motion.
 */
export const TextShimmer = memo(function TextShimmer(
  { color = 'var(--dsw-alias-bg-base)', duration = DEFAULT_SWEEP_DURATION_SECONDS }: TextShimmerProps,
) {
  const reduceMotion = useReducedMotion()
  if (reduceMotion || duration <= 0) return null
  return (
    <motion.span
      aria-hidden
      className={css.band}
      style={{ '--dsw-text-shimmer-color': color } as CSSProperties}
      initial={false}
      animate={{
        x: [
          `${-SWEEP_START_OFFSET_PERCENT * 100}%`,
          `${SWEEP_END_OFFSET_PERCENT * 100}%`,
          `${SWEEP_END_OFFSET_PERCENT * 100}%`,
        ],
      }}
      transition={{
        duration,
        times: [0, 0.88, 1],
        ease: 'easeOut',
        repeat: Infinity,
        repeatDelay: 0.15,
      }}
    />
  )
})
