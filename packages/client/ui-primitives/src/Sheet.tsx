// Sheet: edge-anchored portaled panel for compact viewports — the mobile
// sidebar drawer and friend surfaces. Sits in the same overlay tier as Modal
// (AGENTS.md layering rule: portals at the end of body, one --dsw-layer-overlay
// tier, paint order by document order). Eye for touch: the panel hugs an edge,
// clears the display safe area, and dismisses on mask/Escape — the open state
// is its owner's, so close unmounts immediately (modal parity: no exit phase).

import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'
import css from './Sheet.module.css'
import { useEscapeClose } from './useEscapeClose.ts'

/** Dock edge for the sheet panel. */
export type SheetSide = 'left' | 'right'

/** Sheet component props. */
export interface SheetProps {
  /** Whether the sheet is showing. */
  open: boolean
  /** Escape or mask click. */
  onClose: () => void
  /** Dialog heading (aria-label). */
  title: string
  /** Docked edge ('left' default). */
  side?: SheetSide
  /** Panel contents (their host sizes them, not Sheet). */
  children?: ReactNode
  /** Optional extra class on the panel. */
  className?: string
}

/**
 * Render a portaled edge panel over the dimmed page.
 * @param props - controlled overlay state and panel contents.
 * @returns null when closed; otherwise the overlay tree.
 */
export function Sheet({ open, onClose, title, side = 'left', children, className }: SheetProps) {
  useEscapeClose(open, onClose)

  // The page must not scroll beneath the drawer.
  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [open])

  if (!open) return null

  return createPortal((
    <div className={css.root} role="presentation">
      <div className={css.mask} aria-hidden="true" onClick={onClose} />
      <div
        className={clsx(css.panel, className)}
        data-side={side}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {children}
      </div>
    </div>
  ), document.body)
}
