import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import {
  X, CodeXml, FolderOpen, ScanSearch,
  ListTodo, Plus, Menu, Sheet, Tooltip,
} from '@monotykamary/dsh-client-ui-primitives'
import type { MenuItem } from '@monotykamary/dsh-client-ui-primitives'
import type {
  WorkbenchProps, WorkbenchSurface, WorkbenchSurfaceIcon, WorkbenchSurfaceId,
} from './contract.ts'
import css from './Workbench.module.css'

/* v8 ignore next 3 -- closed WorkbenchSurfaceIcon union backstop. */
function assertNever(value: never): never {
  throw new Error(`unknown workbench surface icon: ${String(value)}`)
}

function SurfaceIcon({ icon }: { readonly icon: WorkbenchSurfaceIcon }) {
  switch (icon) {
    case 'inspect': return <ScanSearch size={12} />
    case 'changes': return <ListTodo size={12} />
    case 'files': return <FolderOpen size={12} />
    case 'terminal': return <CodeXml size={12} />
    case 'generic': return <CodeXml size={12} />
    /* v8 ignore next -- closed WorkbenchSurfaceIcon union backstop. */
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
  mode, closePanel, useStore, actions, renderSlot, useSurfaces, attach, t,
}: WorkbenchProps) {
  useLayoutEffect(() => attach(), [attach])
  const surfaces = useSurfaces(value => value)
  const panels = useStore(state => state.panels)
  const activePanelId = useStore(state => state.activePanelId)
  const [launcherOpen, setLauncherOpen] = useState(false)
  const tabRefs = useRef(new Map<string, HTMLButtonElement>())
  const byId = useMemo(() => new Map(surfaces.map(surface => [surface.id, surface])), [surfaces])
  const openPanels = useMemo(
    () => panels.flatMap((panel) => {
      const surface = byId.get(panel.surfaceId)
      return surface === undefined ? [] : [{ panel, surface }]
    }),
    [byId, panels],
  )
  const addable = useMemo(
    () => surfaces.filter(surface => surface.repeatable || !panels.some(panel => panel.surfaceId === surface.id)),
    [panels, surfaces],
  )
  const active = activePanelId === null ? undefined : openPanels.find(item => item.panel.id === activePanelId)
  const availableIds = useMemo(() => surfaces.map(surface => surface.id), [surfaces])

  useEffect(() => {
    actions.reconcile(availableIds)
  }, [actions, availableIds])

  const activateSurface = (surface: WorkbenchSurface): void => {
    actions.openSurface(surface.id)
  }

  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    let next = index
    if (event.key === 'ArrowLeft') next = (index - 1 + openPanels.length) % openPanels.length
    else if (event.key === 'ArrowRight') next = (index + 1) % openPanels.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = openPanels.length - 1
    else return
    event.preventDefault()
    const item = openPanels[next]
    /* v8 ignore next -- the handler exists only on a rendered tab, so the modulo index resolves. */
    if (item === undefined) throw new Error('workbench tab navigation resolved no panel')
    actions.activatePanel(item.panel.id)
    tabRefs.current.get(item.panel.id)?.focus()
  }

  const launcherItems: MenuItem[] = addable.map(surface => ({ id: surface.id, label: surface.label }))
  const immersive = openPanels.length === 1 && active?.surface.immersive === true
  const panel = (
    <section className={css.root} data-workbench="" data-immersive={immersive || undefined}>
      {!immersive && <div className={css.tabBar}>
        <div className={css.tabs} role="tablist" aria-label={t('title')}>
          {openPanels.map(({ panel, surface }, index) => {
            const selected = panel.id === active?.panel.id
            const label = surface.repeatable ? `${surface.label} ${String(panel.ordinal)}` : surface.label
            return (
              <div
                key={panel.id}
                className={css.tabCell}
                data-active={selected || undefined}
                data-workbench-tab={panel.id}
              >
                <button
                  type="button"
                  className={css.tabClose}
                  aria-label={t('closeSurface', { name: label })}
                  onClick={() => { actions.closePanel(panel.id) }}
                >
                  <span className={css.tabIcon} data-workbench-tab-icon="">
                    <SurfaceIcon icon={surface.icon} />
                  </span>
                  <span className={css.tabCloseGlyph} data-workbench-tab-close-glyph="">
                    <X size={12} />
                  </span>
                </button>
                <button
                  ref={(node) => {
                    if (node === null) tabRefs.current.delete(panel.id)
                    else tabRefs.current.set(panel.id, node)
                  }}
                  type="button"
                  id={`workbench-tab-${encodeURIComponent(panel.id)}`}
                  className={css.tab}
                  role="tab"
                  aria-selected={selected}
                  aria-controls={`workbench-panel-${encodeURIComponent(panel.id)}`}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => { actions.activatePanel(panel.id) }}
                  onKeyDown={(event) => { onTabKeyDown(event, index) }}
                >
                  {label}
                </button>
              </div>
            )
          })}
          {openPanels.length > 0 && addable.length > 0 && (
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
                    <Plus size={14} />
                  </button>
                </Tooltip>
              )}
              onSelect={(id) => {
                const surface = byId.get(id as WorkbenchSurfaceId)
                if (surface?.repeatable === true) actions.openNewSurface(surface.id)
                else actions.openSurface(id as WorkbenchSurfaceId)
                setLauncherOpen(false)
              }}
              onClose={() => { setLauncherOpen(false) }}
            />
          )}
        </div>
        <Tooltip label={t('close')} side="bottom">
          <button type="button" className={css.iconButton} aria-label={t('close')} onClick={closePanel}>
            <X size={16} />
          </button>
        </Tooltip>
      </div>}
      <div className={css.bodyStack}>
        {openPanels.map(({ panel: openPanel, surface }) => {
          const selected = openPanel.id === active?.panel.id
          return (
            <div
              key={openPanel.id}
              className={css.body}
              data-active={selected || undefined}
              role="tabpanel"
              id={`workbench-panel-${encodeURIComponent(openPanel.id)}`}
              aria-labelledby={`workbench-tab-${encodeURIComponent(openPanel.id)}`}
              aria-hidden={!selected}
              ref={(element) => {
                if (element === null) return
                if (selected) element.removeAttribute('inert')
                else element.setAttribute('inert', '')
              }}
            >
              {renderSlot('workbench.surface', { workbenchPanelOrdinal: openPanel.ordinal }, { only: surface.id })}
            </div>
          )
        })}
        {active === undefined && (
          <div className={css.body} data-active="" role="tabpanel">
            <EmptyLauncher surfaces={surfaces} onOpen={activateSurface} t={t} />
          </div>
        )}
      </div>
    </section>
  )

  return mode === 'sheet'
    ? <Sheet open onClose={closePanel} title={t('title')} side="right" className={css.sheet as string}>{panel}</Sheet>
    : panel
}
