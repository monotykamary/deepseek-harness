/**
 * Sidebar shell: T3-adapted chrome around dsh-owned composition seats. Collapse
 * remains a slide plus crossfade: content freezes at its expanded width (inline
 * style) and fades in place while the AppFrame grid track clips it. At settle,
 * wide content unmounts and the upper controls enter the 56px rail on one fade
 * ending with the slide. The bottom-pinned footer only fades.
 *
 * The brand is identity rather than a duplicate action. New Session is the
 * first menu row, followed by the `sidebar.workspaces` browser; the foot holds
 * `sidebar.settings` plus `sidebar.footer.action`. The shell passes only the
 * wide flag and the browser's expand request.
 *
 * The column also owns whether nested scroll regions draw a scrollbar: the
 * shell tracks the pointer and rebinds ui-theme's scrollbar indirection while
 * the pointer is elsewhere.
 */
import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import {
  FishLogo, MessageSquarePlus, PanelLeft, Tooltip,
} from '@monotykamary/dsh-client-ui-primitives'
import type { SidebarRootComponentProps } from './contract/slots.ts'
import css from './SidebarRoot.module.css'

/** Wide-content unmount delay; matches the 150ms wide-content fade-out. */
const COLLAPSE_SETTLE_MS = 150

/**
 * How long the column's scrollbars stay drawn after the pointer leaves it.
 * The bar is a pointer affordance here, and hiding it on the leave event
 * itself makes it blink out while the pointer is only crossing the column's
 * edge — on the way to the conversation, or around a portalled menu.
 */
const SCROLLBAR_LINGER_MS = 2000

/**
 * Render the sidebar column shell.
 * @param props - composed slot props (runtime share + injected callbacks, contract/slots.ts).
 * @returns the sidebar element tree.
 */
export function SidebarRoot({
  applicationSurface,
  openApplicationSurface,
  collapsed,
  width,
  drawerClose,
  startSession,
  toggleSidebar,
  t,
  renderSlot,
}: SidebarRootComponentProps) {
  // Wide content stays mounted while the collapse animates (fading via
  // .collapsed .wide), unmounts at settle, and remounts right away on expand.
  const [settled, setSettled] = useState(collapsed)
  useEffect(() => {
    if (!collapsed) { setSettled(false); return }
    const timer = window.setTimeout(() => { setSettled(true) }, COLLAPSE_SETTLE_MS)
    return () => { window.clearTimeout(timer) }
  }, [collapsed])
  const wide = !collapsed || !settled

  // Freeze the content at its expanded width while it fades out (collapsed
  // && wide): the sliding column then clips it instead of reflowing it. The
  // rail layout (.collapsed styles) only applies once the fade settles.
  const lastWideWidth = useRef(width)
  if (!collapsed) lastWideWidth.current = width

  // Rail-in only crossfades a live collapse: a refresh straight into the
  // collapsed state renders the rail statically (no delay-hidden icons).
  const everWide = useRef(!collapsed)
  if (!collapsed) everWide.current = true

  // Scrollbars in the column follow the pointer (.quietBars rebinds them
  // away): drawn while it is inside, and for SCROLLBAR_LINGER_MS after it
  // leaves. A pointer that returns within that window cancels the pending
  // hide rather than restarting from a hidden bar.
  const column = useRef<HTMLDivElement>(null)
  const [pointerInside, setPointerInside] = useState(false)
  const lingerTimer = useRef<number | undefined>(undefined)
  const armLinger = (): void => {
    if (lingerTimer.current !== undefined) return
    lingerTimer.current = window.setTimeout(() => {
      lingerTimer.current = undefined
      setPointerInside(false)
    }, SCROLLBAR_LINGER_MS)
  }
  const cancelLinger = (): void => {
    window.clearTimeout(lingerTimer.current)
    lingerTimer.current = undefined
  }
  // Leaving is decided by the column's BOX, not by DOM containment, and only
  // while the bars are drawn. ui-settings renders its full-viewport panel as a
  // fixed-position DESCENDANT of this column, so a pointer moved onto that
  // panel — or onto the conversation once it closes — fires no `pointerleave`
  // here, and the bars would stay drawn over a column nobody is pointing at.
  // The element's own leave stays as the one signal geometry cannot give: a
  // pointer that leaves the window emits no further moves.
  useEffect(() => {
    if (!pointerInside) return
    const onMove = (event: PointerEvent): void => {
      const rect = column.current?.getBoundingClientRect()
      /* the listener only exists while the column is mounted and revealed. */
      if (rect === undefined) return
      const inside = event.clientX >= rect.left && event.clientX < rect.right
        && event.clientY >= rect.top && event.clientY < rect.bottom
      if (inside) cancelLinger()
      else armLinger()
    }
    document.addEventListener('pointermove', onMove)
    return () => {
      document.removeEventListener('pointermove', onMove)
      cancelLinger()
    }
  }, [pointerInside])

  return (
    <div
      ref={column}
      className={clsx(
        css.root, !wide && css.collapsed, !wide && everWide.current && css.railIn,
        collapsed && wide && css.fading, !pointerInside && css.quietBars,
      )}
      style={wide ? { width: collapsed ? lastWideWidth.current : width } : undefined}
      onPointerEnter={() => {
        cancelLinger()
        setPointerInside(true)
      }}
      onPointerLeave={() => { armLinger() }}
    >
      <div className={css.logoRow}>
        {/* Expanded, the brand doubles as a New Session shortcut; the
            collapsed rail's logo is the expand toggle below instead. */}
        {wide && (
          <button
            type="button"
            className={clsx(css.brand, css.wide)}
            aria-label={t('session.new.label')}
            onClick={() => { startSession() }}
          >
            <span className={css.brandIdentity} aria-hidden="true">
              <span className={css.brandMark}>
                {renderSlot('sidebar.brand.mark', { size: 24 }, { fallback: <FishLogo size={24} /> })}
              </span>
              <span className={css.brandName}>
                {renderSlot('sidebar.brand.name', {}, {
                  fallback: (
                    <>
                      <span className={css.fallbackBrandName}>DSH Local Build</span>
                      {process.env.DSH_CLIENT_COMMIT_HASH
                        ? <span className={css.buildRevision}>{process.env.DSH_CLIENT_COMMIT_HASH}</span>
                        : null}
                    </>
                  ),
                })}
              </span>
            </span>
          </button>
        )}
        {/* The rail rests on the whale mark; hover reveals the expand icon. */}
        <Tooltip label={collapsed ? t('toggle.open') : t('toggle.collapse')} delayMs={500}>
          <button
            type="button"
            className={clsx(css.iconButton, css.toggle)}
            aria-label={collapsed ? t('toggle.open') : t('toggle.collapse')}
            onClick={() => {
              // Drawer host (compact frame): collapse must dismiss the drawer — the
              // drawer column ignores rail/narrow store fields, so flipping them
              // dead-ends. Column host: rail flip as usual.
              if (drawerClose !== undefined) drawerClose()
              else toggleSidebar()
            }}
          >
            {!wide && (
              <span className={css.railMark} aria-hidden="true">
                {renderSlot('sidebar.brand.mark', { size: 24 }, { fallback: <FishLogo size={24} /> })}
              </span>
            )}
            {/* Rail icons render at 18 (figma rail spec); expanded keeps the glyph-native sizes. */}
            <PanelLeft className={css.panelIcon} size={wide ? 16 : 18} />
          </button>
        </Tooltip>
      </div>

      {/* T3-adapted primary action: a quiet navigation row rather than an
          elevated capsule. The rail retains the same action as an icon. */}
      <Tooltip label={t('session.new.label')} delayMs={500} disabled={wide}>
        <button
          type="button"
          className={css.newSession}
          aria-label={t('session.new.label')}
          onClick={() => { startSession() }}
        >
          <MessageSquarePlus size={wide ? 14 : 18} />
          {wide && <span className={clsx(css.newSessionLabel, css.wide)}>{t('session.new')}</span>}
        </button>
      </Tooltip>

      <div className={css.navigationArea}>
        {renderSlot('sidebar.navigation', {
          wide,
          activeSurface: applicationSurface,
          openSurface: openApplicationSurface,
        })}
      </div>

      {/* The browser owns persistent search, Workspace scope, and rows; its
          rail controls ride the same slot during collapse. */}
      <div className={css.regionArea}>
        {renderSlot('sidebar.workspaces', {
          wide,
          expandSidebar: () => { if (collapsed) toggleSidebar() },
        })}
      </div>

      {/* Footer actions stack above Settings in both sidebar widths. */}
      <div className={css.footArea}>
        <div className={css.footerActions}>
          {renderSlot('sidebar.footer.action', { wide })}
        </div>
        <div className={css.settingsArea}>
          {renderSlot('sidebar.settings', { wide })}
        </div>
      </div>
    </div>
  )
}
