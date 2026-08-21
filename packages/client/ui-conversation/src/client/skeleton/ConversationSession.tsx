/** Strict per-session header/body content inserted into the resident conversation layout. */

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import clsx from 'clsx'
import type { SessionId, SessionListState, SessionSummary } from '@monotykamary/dsh-client-runtime/client'
import type {
  ConversationSessionHeaderSlotProps, ConversationSessionSlotProps,
} from '../contract/slots.ts'
import type { ViewTab } from '../contract/views.ts'
import { computeHeaderLayout } from './header-layout.ts'
import css from './ConversationRoot.module.css'

/** Full props composed from the strict session body contract. */
export type ConversationSessionProps = ConversationSessionSlotProps

/** Full props composed from the strict session header contract. */
export type ConversationSessionHeaderProps = ConversationSessionHeaderSlotProps

interface Breadcrumb {
  readonly id: SessionId
  readonly displayTitle: string
  readonly subagent: boolean
}

const DEFAULT_VIEW_ID = 'chat'

/** Resolve by id and keep stale persisted selections on the stable Chat fallback. */
function resolveActiveView(tabs: readonly ViewTab[], selectedId: string | null): ViewTab | undefined {
  const requestedId = selectedId ?? DEFAULT_VIEW_ID
  return tabs.find(view => view.id === requestedId)
    ?? tabs.find(view => view.id === DEFAULT_VIEW_ID)
}

function deriveAncestry(list: SessionListState, id: SessionId): readonly Breadcrumb[] {
  const chain: Breadcrumb[] = []
  const seen = new Set<SessionId>()
  let cursor: SessionId | undefined = id
  while (cursor !== undefined) {
    if (seen.has(cursor)) break
    seen.add(cursor)
    const summary: SessionSummary | undefined = list.byId[cursor]
    if (summary === undefined) break
    chain.unshift({
      id: summary.id,
      displayTitle: summary.displayTitle,
      subagent: summary.origin === 'subagent',
    })
    if (summary.origin !== 'subagent') break
    cursor = summary.parentId
  }
  return chain
}

function equalBreadcrumbs(left: readonly Breadcrumb[], right: readonly Breadcrumb[]): boolean {
  return left.length === right.length
    && left.every((item, index) => {
      const other = right.at(index)
      return other !== undefined && item.id === other.id && item.displayTitle === other.displayTitle
    })
}

/**
 * Renders Session header chrome above the resident conversation scrollport.
 * @param props - Strict Session store, view ledger, navigation, render, and locale shares.
 * @returns the title row and tabs, or the utilities-only reduced header on a
 * blank hero so the panel toggles stay reachable before the first message.
 */
export function ConversationSessionHeader({
  sessionId, useSession, useSessions, useStore, actions, detailsOpen,
  renderSlot, views, headerEntries, open, t,
}: ConversationSessionHeaderProps) {
  useSyncExternalStore(views.subscribe, views.version)
  useSyncExternalStore(headerEntries.subscribe, headerEntries.version)
  const tabs = views.list()
  const selectedId = useStore(s => s.view)
  const active = resolveActiveView(tabs, selectedId)
  const ancestry = useSessions(s => deriveAncestry(s, sessionId), equalBreadcrumbs)
  const composerPhase = useSession(s => s.composerPhase)
  const blank = useSession(s => s.blank)

  // Blank New Session pages keep the panel utilities only: the bottom-panel
  // and workbench toggles stay reachable before the first message, while the
  // title row, actions, tabs, and divider wait for a real conversation.
  const reduced = blank && composerPhase === 'blank'

  // The header measures the displayed box once per ResizeObserver tick and
  // the disclosure solver picks tiers from it. Both plugin-composed bands
  // are observed the same way: each reports its own measured width while
  // rendered, and a band that hides keeps its last measurement, so the
  // solver sees true content widths instead of per-entry estimates.
  const headerRef = useRef<HTMLElement | null>(null)
  const actionsRef = useRef<HTMLDivElement | null>(null)
  const utilitiesRef = useRef<HTMLDivElement | null>(null)
  const [layout, setLayout] = useState(() => ({ width: 0, actions: 0, utilities: 0 }))

  const titleText = ancestry.length > 0 ? (ancestry.at(-1)?.displayTitle ?? '') : sessionId
  const [configIndex, setConfigIndex] = useState(0)

  const solved = computeHeaderLayout({
    availableWidth: reduced ? 0 : layout.width,
    titleText,
    actionsBandWidth: reduced ? 0 : layout.actions,
    utilitiesBandWidth: reduced ? 0 : layout.utilities,
    tabLabels: tabs.map(viewTab => viewTab.label),
    previousConfigIndex: configIndex,
  })
  const tier = solved.tier

  useLayoutEffect(() => {
    setConfigIndex(solved.configIndex)
  }, [solved.configIndex])

  useLayoutEffect(() => {
    const el = headerRef.current
    if (el === null) return
    const apply = (entry: ResizeObserverEntry): void => {
      const box = entry.borderBoxSize[0]
      const next = box === undefined ? entry.target.clientWidth : box.inlineSize
      const target = entry.target
      if (target === el) {
        setLayout(prev => prev.width === next ? prev : { ...prev, width: next })
      } else if (target === actionsRef.current) {
        setLayout(prev => ({ ...prev, actions: next }))
      } else if (target === utilitiesRef.current) {
        setLayout(prev => ({ ...prev, utilities: next }))
      }
    }
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) apply(entry)
    })
    observer.observe(el)
    if (actionsRef.current !== null) observer.observe(actionsRef.current)
    if (utilitiesRef.current !== null) observer.observe(utilitiesRef.current)
    // Re-observe to catch bands mounting or unmounting at a tier edge; the
    // next render's measurement then feeds the solver's true band widths.
    return () => { observer.disconnect() }
  }, [solved.configIndex])

  return (
    <header
      ref={headerRef}
      className={clsx(css.header, reduced && css.headerReduced)}
      data-header-tier={solved.configIndex || undefined}
    >
      {reduced ? (
        <div className={css.titleRow}>
          <div className={css.headerUtilities}>
            {renderSlot('conversation.session.header.utilities', { detailsOpen })}
          </div>
        </div>
      ) : (
        <>
          <div className={css.titleRow}>
            <div className={css.titleCluster}>
              <nav className={css.crumbs} aria-label={t('session.hierarchy')}>
                {ancestry.map((summary, index) => {
                  const last = index === ancestry.length - 1
                  const title = (
                    <button
                      type="button"
                      className={clsx(
                        css.crumb,
                        summary.subagent && css.crumbSubagent,
                        last && css.crumbCurrent,
                      )}
                      disabled={last}
                      onClick={() => { open(summary.id) }}
                    >
                      {summary.displayTitle}
                    </button>
                  )
                  const lineage = last || summary.subagent
                  const lineageOwner = {
                    lineageSessionId: summary.id,
                    displayTitle: summary.displayTitle,
                    ...last ? {} : { openTitle: () => { open(summary.id) } },
                  }
                  return (
                    <span key={summary.id} className={css.crumbSeg}>
                      {index > 0 && <span className={css.crumbSep}>/</span>}
                      {lineage
                        ? summary.subagent
                          ? renderSlot(
                            'conversation.session.header.lineage',
                            lineageOwner,
                            { fallback: title },
                          )
                          : (
                            <>
                              {title}
                              {renderSlot(
                                'conversation.session.header.lineage',
                                lineageOwner,
                                { fallback: null },
                              )}
                            </>
                          )
                        : title}
                    </span>
                  )
                })}
                {ancestry.length === 0 && <span className={css.crumbCurrent}>{sessionId}</span>}
              </nav>
              {tier.showActions && (
                <div ref={actionsRef} className={css.headerActions}>
                  {renderSlot('conversation.session.header.actions', {})}
                </div>
              )}
            </div>
            {tier.showUtilities && (
              <div ref={utilitiesRef} className={css.headerUtilities}>
                {renderSlot('conversation.session.header.utilities', { detailsOpen })}
              </div>
            )}
          </div>
          {tabs.length > 1 && (
            <div className={css.tabs} role="tablist">
              {tabs.map(viewTab => (
                <button
                  key={viewTab.id}
                  type="button"
                  role="tab"
                  aria-selected={viewTab.id === active?.id}
                  className={clsx(css.tab, viewTab.id === active?.id && css.tabActive)}
                  onClick={() => { actions.setView(viewTab.id) }}
                >
                  {viewTab.label}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </header>
  )
}

/**
 * Renders the active Session view inside the resident scrollport and keeps
 * the input draft mirrored while blank Hero chrome is visible.
 * @param props - Strict Session input/store, view ledger, and render shares.
 * @returns the active view area, or null while the Session remains blank.
 */
export function ConversationSession({
  sessionId, useSession, useInput, inputActions, useStore, actions,
  renderSlot, views, bindDraftMirror, releaseSessionImages,
}: ConversationSessionProps) {
  useSyncExternalStore(views.subscribe, views.version)
  const tabs = views.list()
  const selectedId = useStore(s => s.view)
  const active = resolveActiveView(tabs, selectedId)
  const composerPhase = useSession(s => s.composerPhase)
  const blank = useSession(s => s.blank)
  const inputState = useInput(s => s)
  const storedDraft = useStore(s => s.draft)
  // `?? null`: persisted snapshots from before the inspect field rehydrate without it.
  const inspect = useStore(s => s.inspect ?? null)

  useEffect(() => {
    if (inputState.draft === '' && storedDraft !== '') inputActions.setDraft(storedDraft)
    const unmirror = bindDraftMirror(actions.setDraft)
    return () => { unmirror() }
    // Mount-only (deps pinned to inputActions): later store writes come from
    // the machine mirror, not this seed effect.
  }, [inputActions])

  useEffect(() => () => {
    releaseSessionImages(sessionId)
  }, [releaseSessionImages, sessionId])

  if (blank && composerPhase === 'blank') return null
  return (
    <div className={css.viewArea}>
      {active !== undefined && renderSlot('conversation.view', {
        inspect,
        onInspectDone: () => { actions.setInspect(null) },
      }, { only: active.id })}
    </div>
  )
}
