import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import {
  IconCloseOutline16, IconCodeOutline16, IconFolderOpenOutline16, IconInspectOutline12,
  IconListPenOutline16, IconPlusOutline16, Menu, Sheet, Tooltip,
} from '@monotykamary/dsh-client-ui-primitives'
import type { MenuItem } from '@monotykamary/dsh-client-ui-primitives'
import type {
  WorkbenchProps, WorkbenchSurface, WorkbenchSurfaceIcon, WorkbenchSurfaceId,
} from './contract.ts'
import css from './Workbench.module.css'

function assertNever(value: never): never {
  throw new Error(`unknown workbench surface icon: ${String(value)}`)
}

function SurfaceIcon({ icon }: { readonly icon: WorkbenchSurfaceIcon }) {
  switch (icon) {
    case 'inspect': return <IconInspectOutline12 size={12} />
    case 'changes': return <IconListPenOutline16 size={12} />
    case 'files': return <IconFolderOpenOutline16 size={12} />
    case 'generic': return <IconCodeOutline16 size={12} />
    default: return assertNever(icon)
  }
}

interface EmptyLauncherProps {
  readonly surfaces: readonly WorkbenchSurface[]
  readonly onOpen: (surface: WorkbenchSurface) => void
  readonly t: WorkbenchProps['t']
}

function EmptyLauncher({ surfaces, onOpen, t }: EmptyLauncherProps) {
  return (
    <div className={css.emptyLauncher} aria-label={t('empty.title')}>
      <div className={css.emptyContent}>
        <div className={css.emptyHeading}>
          <h2>{t('empty.title')}</h2>
          <p>{t('empty.description')}</p>
        </div>
        {surfaces.length === 0 ? (
          <div className={css.emptyUnavailable}>{t('empty.unavailable')}</div>
        ) : (
          <div className={css.launcherGrid}>
            {surfaces.map(surface => (
              <button
                key={surface.id}
                type="button"
                className={css.launcherCard}
                data-workbench-launcher-card={surface.id}
                aria-label={surface.label}
                onClick={() => { onOpen(surface) }}
              >
                <span className={css.launcherTitle}>
                  <SurfaceIcon icon={surface.icon} />
                  <span>{surface.label}</span>
                </span>
                <span className={css.launcherDescription}>{surface.description}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Render the T3-adapted tabbed host for independently registered Details surfaces.
 * @param props - Details host mode, surface directory, tab store, child renderer, and locale seats.
 * @returns inline workbench content or the same content inside a right Sheet.
 */
export function Workbench({
  mode, closePanel, useStore, actions, renderSlot, useSurfaces, t,
}: WorkbenchProps) {
  const surfaces = useSurfaces(value => value)
  const openIds = useStore(state => state.openIds)
  const activeId = useStore(state => state.activeId)
  const [launcherOpen, setLauncherOpen] = useState(false)
  const tabRefs = useRef(new Map<WorkbenchSurfaceId, HTMLButtonElement>())
  const byId = useMemo(() => new Map(surfaces.map(surface => [surface.id, surface])), [surfaces])
  const openSurfaces = useMemo(
    () => openIds.flatMap((id) => {
      const surface = byId.get(id)
      return surface === undefined ? [] : [surface]
    }),
    [byId, openIds],
  )
  const addable = useMemo(
    () => surfaces.filter(surface => !openIds.includes(surface.id)),
    [openIds, surfaces],
  )
  const active = activeId === null ? undefined : byId.get(activeId)
  const availableIds = useMemo(() => surfaces.map(surface => surface.id), [surfaces])

  useEffect(() => {
    actions.reconcile(availableIds)
  }, [actions, availableIds])

  const activateAndFocus = (surface: WorkbenchSurface): void => {
    actions.openSurface(surface.id)
    requestAnimationFrame(() => { tabRefs.current.get(surface.id)?.focus() })
  }

  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    let next = index
    if (event.key === 'ArrowLeft') next = (index - 1 + openSurfaces.length) % openSurfaces.length
    else if (event.key === 'ArrowRight') next = (index + 1) % openSurfaces.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = openSurfaces.length - 1
    else return
    event.preventDefault()
    const surface = openSurfaces[next]
    /* v8 ignore next -- the handler exists only on a rendered tab, so the modulo index resolves. */
    if (surface === undefined) throw new Error('workbench tab navigation resolved no surface')
    activateAndFocus(surface)
  }

  const launcherItems: MenuItem[] = addable.map(surface => ({ id: surface.id, label: surface.label }))
  const panel = (
    <section className={css.root} data-workbench="">
      <div className={css.tabBar}>
        <div className={css.tabs} role="tablist" aria-label={t('title')}>
          {openSurfaces.map((surface, index) => {
            const selected = surface.id === active?.id
            return (
              <div
                key={surface.id}
                className={css.tabCell}
                data-active={selected || undefined}
                data-workbench-tab={surface.id}
              >
                <button
                  type="button"
                  className={css.tabClose}
                  aria-label={t('closeSurface', { name: surface.label })}
                  onClick={() => { actions.closeSurface(surface.id) }}
                >
                  <span className={css.tabIcon} data-workbench-tab-icon="">
                    <SurfaceIcon icon={surface.icon} />
                  </span>
                  <span className={css.tabCloseGlyph} data-workbench-tab-close-glyph="">
                    <IconCloseOutline16 size={12} />
                  </span>
                </button>
                <button
                  ref={(node) => {
                    if (node === null) tabRefs.current.delete(surface.id)
                    else tabRefs.current.set(surface.id, node)
                  }}
                  type="button"
                  id={`workbench-tab-${encodeURIComponent(surface.id)}`}
                  className={css.tab}
                  role="tab"
                  aria-selected={selected}
                  aria-controls={`workbench-panel-${encodeURIComponent(surface.id)}`}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => { actions.openSurface(surface.id) }}
                  onKeyDown={(event) => { onTabKeyDown(event, index) }}
                >
                  {surface.label}
                </button>
              </div>
            )
          })}
          {openSurfaces.length > 0 && addable.length > 0 && (
            <Menu
              open={launcherOpen}
              items={launcherItems}
              portal
              compact
              align="end"
              anchor={(
                <Tooltip label={t('add')} side="bottom">
                  <button
                    type="button"
                    className={css.iconButton}
                    aria-label={t('add')}
                    aria-expanded={launcherOpen}
                    onClick={() => { setLauncherOpen(value => !value) }}
                  >
                    <IconPlusOutline16 size={14} />
                  </button>
                </Tooltip>
              )}
              onSelect={(id) => {
                actions.openSurface(id as WorkbenchSurfaceId)
                setLauncherOpen(false)
              }}
              onClose={() => { setLauncherOpen(false) }}
            />
          )}
        </div>
        <Tooltip label={t('close')} side="bottom">
          <button type="button" className={css.iconButton} aria-label={t('close')} onClick={closePanel}>
            <IconCloseOutline16 />
          </button>
        </Tooltip>
      </div>
      <div
        className={css.body}
        role="tabpanel"
        id={active === undefined ? undefined : `workbench-panel-${encodeURIComponent(active.id)}`}
        aria-labelledby={active === undefined ? undefined : `workbench-tab-${encodeURIComponent(active.id)}`}
      >
        {active === undefined
          ? <EmptyLauncher surfaces={surfaces} onOpen={activateAndFocus} t={t} />
          : renderSlot('workbench.surface', {}, { only: active.id })}
      </div>
    </section>
  )

  return mode === 'sheet'
    ? <Sheet open onClose={closePanel} title={t('title')} side="right" className={css.sheet as string}>{panel}</Sheet>
    : panel
}
