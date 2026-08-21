/**
 * Pure Workspace and Session row components. Session cards adapt T3 Code
 * revision a4cc1367b03ee0c1dc2b50fceac81ef5e63212e2: project context, title,
 * execution metadata, and status/actions occupy stable seats on an
 * interaction-only rounded surface. Hover reveals the settle/snooze quick
 * actions (un-settle / wake on parked rows); the full menu — dsh's rename,
 * fork, archive, and delete plus the lifecycle actions — opens on right-click
 * so the trailing seat stays a single hover affordance. Hover details close
 * while a menu or drag owns the row. See THIRD_PARTY_NOTICES.md.
 */
import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { AlarmClock, AlarmClockOff, Check, Clock, Undo2 } from 'lucide-react'
import {
  HoverCard, IconArchiveOutline20, IconBranchOutline16,
  IconEditOutline16, IconFolderClose16, IconFolderOpen16, IconPlusOutline16,
  IconTrashOutline16, IconTriangleRightFill14, Menu, StateDot,
} from '@monotykamary/dsh-client-ui-primitives'
import type { MenuEntry, MenuItem, StateDotState } from '@monotykamary/dsh-client-ui-primitives'
import { abbreviateHomePath } from '@monotykamary/dsh-client-runtime/client'
import type { WorkspaceBrowserProps } from '../contract/slots.ts'
import { resolveSnoozePresets, snoozeCountdown, type SnoozePreset } from '../snooze.ts'
import type { GroupNode, SearchResultNode, SessionNode } from '../tree.ts'
import { relativeTime } from '../tree.ts'
import css from './Rows.module.css'

/** The standard locale seat, prop-passed from the browser root. */
type RowTranslate = WorkspaceBrowserProps['t']

/** Row display title: blank rows show the localized New Session label. */
function displayTitle(node: SessionNode, t: RowTranslate): string {
  return node.blank ? t('session.new') : node.title
}

/** Localized compact relative time ("刚刚"/"5分钟" in zh, "now"/"5min" in en). */
function timeLabel(updatedAt: number, now: number, t: RowTranslate): string {
  const { unit, n } = relativeTime(updatedAt, now)
  return unit === 'now' ? t('time.now') : t(`time.${unit}`, { n })
}

/** Hover-card variant: distances wrap in the ago template; the now bucket stays bare (no "now ago"). */
function hoverTimeLabel(updatedAt: number, now: number, t: RowTranslate): string {
  const { unit, n } = relativeTime(updatedAt, now)
  return unit === 'now' ? t('time.now') : t('time.ago', { t: t(`time.${unit}`, { n }) })
}

/**
 * Absolute creation time through the dictionary's date template (the message
 * clock pattern): `toLocaleString` would follow the browser language, not the
 * app locale, and produce mixed-language text after a switch.
 */
function createdLabel(createdAt: number, t: RowTranslate): string {
  const d = new Date(createdAt)
  const pad2 = (v: number): string => String(v).padStart(2, '0')
  const date = t('date.ymd', { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() })
  return t('hover.created', { time: `${date} ${pad2(d.getHours())}:${pad2(d.getMinutes())}` })
}

/** Hover-card body: workspace title, display directory path, absolute creation time. */
function WorkspaceHoverContent({ label, cwd, createdAt, t }: {
  label: string
  cwd: string | undefined
  createdAt: number
  t: RowTranslate
}) {
  return (
    <div className={css.hoverContent}>
      <div className={css.hoverTitle}>{label}</div>
      <div className={css.hoverPath}>{cwd}</div>
      <div className={css.hoverTime}>{createdLabel(createdAt, t)}</div>
    </div>
  )
}

/**
 * Row drag wiring supplied by the tree owner. `drop` reports the half of the
 * row where the pointer released so the owner can resolve an insert anchor.
 */
export interface RowDragProps {
  /** Start dragging this row. */
  start: () => void
  /** A compatible row drag is in flight. */
  active: boolean
  /** Current marker on this row: insert line above, below, or none. */
  marker: 'before' | 'after' | null
  /** Report the hovered half while a compatible drag passes over this row. */
  hover: (half: 'before' | 'after') => void
  drop: (half: 'before' | 'after') => void
  end: () => void
}

/** Drag lifecycle owned by a workspace row; its enclosing group owns hit testing. */
interface WorkspaceRowDragProps {
  start: () => void
  end: () => void
}

/** Pointer-position half of a row (insert line above or below). */
function rowHalf(e: { clientY: number; currentTarget: HTMLElement }): 'before' | 'after' {
  const rect = e.currentTarget.getBoundingClientRect()
  return e.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
}

/**
 * Project (workspace) header row: folder + title;
 * hover reveals the chevron and create button, and dwelling on a real
 * Workspace shows its hover card (the ungrouped bucket has none).
 * `containsCurrent` arrives on the node (derivation fact, no renderer scan).
 * @param props.group - derived group node.
 * @param props.onToggle - expand/collapse the group.
 * @param props.onCreate - start a frontend Session inside this Workspace.
 * @param props.drag - optional workspace-row drag wiring.
 * @param props.home - host account home for POSIX hover-path abbreviation.
 * @param props.t - the browser root's locale seat.
 * @returns the row element.
 */
export function ProjectRowItem({ group, onToggle, onCreate, actions, drag, home, t }: {
  group: GroupNode
  onToggle: () => void
  onCreate: () => void
  /** Real-Workspace actions; absent for the ungrouped bucket (no menu shown). */
  actions?: { rename: () => void; delete: () => void } | undefined
  /** Present only for real Workspace rows in the grouped view. */
  drag?: WorkspaceRowDragProps | undefined
  /** Host account home; POSIX home-rooted hover paths display as `~`. */
  home?: string | undefined
  t: RowTranslate
}) {
  const row = group
  // The ungrouped bucket has no workspace title: its label is dictionary copy.
  const label = row.workspaceId === undefined ? t('group.ungrouped') : row.label
  const active = group.expanded && group.containsCurrent
  // The menu opens at the pointer: the trailing seat keeps only the create
  // action, and the ungrouped bucket (no actions prop) keeps the browser menu.
  const [menuRect, setMenuRect] = useState<DOMRect | null>(null)
  const menuOpen = menuRect !== null
  const workspaceMenuItems = [
    { id: 'rename', label: t('rename'), icon: <IconEditOutline16 /> },
    { id: 'delete', label: t('delete.workspace'), icon: <IconTrashOutline16 />, danger: true },
  ]
  const ownRow = (
    <div
      className={clsx(css.projectRow, menuOpen && css.menuOpen)}
      role="treeitem"
      aria-expanded={row.expanded}
      onClick={onToggle}
      onContextMenu={(e) => {
        if (actions === undefined) return
        e.preventDefault()
        e.stopPropagation()
        setMenuRect(pointerRect(e))
      }}
      draggable={drag !== undefined}
      onDragStart={drag === undefined
        ? undefined
        : (e) => {
          e.dataTransfer.effectAllowed = 'move'
          e.dataTransfer.setData('text/plain', row.key)
          drag.start()
        }}
      onDragEnd={drag?.end}
    >
      <span className={clsx(css.slot, css.folder, active && css.folderActive)}>
        {row.expanded ? <IconFolderOpen16 /> : <IconFolderClose16 />}
      </span>
      <span className={clsx(css.slot, css.chevron)}>
        <IconTriangleRightFill14 className={clsx(css.arrow, row.expanded && css.arrowOpen)} />
      </span>
      <span className={css.projectText}>
        <span className={css.title}>{label}</span>
      </span>
      <span className={css.rowActions}>
        <button
          type="button"
          className={css.iconButton}
          aria-label={t('actions.newSession.aria', { name: label })}
          onClick={(e) => { e.stopPropagation(); onCreate() }}
        >
          <IconPlusOutline16 />
        </button>
      </span>
      {actions !== undefined && (
        <Menu
          open={menuOpen}
          onClose={() => { setMenuRect(null) }}
          items={workspaceMenuItems}
          onSelect={(id) => {
            setMenuRect(null)
            // Unknown ids leave before the dispatch: a future menu row must
            // not inherit the destructive branch as an else fallback.
            /* v8 ignore next -- workspaceMenuItems carries exactly these two rows today. */
            if (id !== 'rename' && id !== 'delete') return
            if (id === 'rename') actions.rename()
            else actions.delete()
          }}
          portal
          getAnchorRect={() => menuRect}
          anchor={null}
        />
      )}
    </div>
  )
  // The ungrouped bucket has no backing Workspace: no card to show.
  if (row.createdAt === undefined) return ownRow
  return (
    <HoverCard
      anchor={ownRow}
      content={<WorkspaceHoverContent
        label={row.label}
        cwd={row.cwd === undefined ? undefined : abbreviateHomePath(row.cwd, home)}
        createdAt={row.createdAt}
        t={t}
      />}
      disabled={menuOpen}
      copyText={row.cwd}
      copyLabel={t('copy')}
      copiedLabel={t('hover.copied')}
    />
  )
}

/* v8 ignore next 3 -- closed-union backstop; only reached if the status is forged */
function assertNever(value: never): never {
  throw new Error(`unknown pending interaction: ${String(value)}`)
}

interface SessionStatus {
  state: StateDotState
  label: string
}

/**
 * Session status presentation; pending interaction is primary and live activity
 * outranks completion reminders.
 */
function sessionStatuses(
  node: Pick<SessionNode, 'pendingInteraction' | 'running' | 'runningSubagentCount' | 'completed'>,
  t: RowTranslate,
): readonly [SessionStatus, ...SessionStatus[]] {
  const subagents: SessionStatus | undefined = node.runningSubagentCount === 0
    ? undefined
    : {
      state: 'ongoing',
      label: t(
        node.runningSubagentCount === 1
          ? 'status.subagentsRunning.one'
          : 'status.subagentsRunning.other',
        { n: node.runningSubagentCount },
      ),
    }
  let pending: SessionStatus | undefined
  switch (node.pendingInteraction) {
    case 'approval':
      pending = { state: 'warning', label: t('status.waitingApproval') }
      break
    case 'plan-review':
      pending = { state: 'warning', label: t('status.planReview') }
      break
    case 'question':
      pending = { state: 'warning', label: t('status.waitingAnswer') }
      break
    case undefined: break
    /* v8 ignore next -- closed PendingInteractionStatus union */
    default: return assertNever(node.pendingInteraction)
  }
  if (pending !== undefined) return subagents === undefined ? [pending] : [pending, subagents]
  if (node.running) {
    const primary: SessionStatus = { state: 'ongoing', label: t('status.running') }
    return subagents === undefined ? [primary] : [primary, subagents]
  }
  if (subagents !== undefined) return [subagents]
  if (node.completed) return [{ state: 'done', label: t('status.completed') }]
  return [{ state: 'done', label: t('status.idle') }]
}

/** Primary status dot plus every status's screen-reader label, shared by the search and session rows. */
function SessionStatusDots({ statuses }: { statuses: readonly [SessionStatus, ...SessionStatus[]] }) {
  return (
    <>
      <StateDot state={statuses[0].state} />
      {statuses.map(status => (
        <span className={css.visuallyHidden} key={status.label}>{status.label}</span>
      ))}
    </>
  )
}

/** Hover-card body: full title, relative time, and every relevant live status. */
function SessionHoverContent({ node, now, t }: { node: SessionNode; now: number; t: RowTranslate }) {
  const statuses = sessionStatuses(node, t)
  return (
    <div className={css.hoverContent}>
      <div className={css.hoverTitle}>{node.title}</div>
      <div className={css.hoverTime}>{hoverTimeLabel(node.updatedAt, now, t)}</div>
      {statuses.map(status => (
        <div className={css.hoverStatus} key={status.label}>
          <StateDot state={status.state} />
          <span>{status.label}</span>
        </div>
      ))}
    </div>
  )
}

/**
 * Zero-size rect at the pointer for the portalled context menus: the Menu
 * primitive anchors at the given point instead of a rendered trigger.
 */
function pointerRect(e: { clientX: number; clientY: number }): DOMRect {
  const { clientX, clientY } = e
  return {
    left: clientX, top: clientY, right: clientX, bottom: clientY,
    width: 0, height: 0, x: clientX, y: clientY,
    /* v8 ignore next -- Menu reads only the rect fields; toJSON is never invoked. */
    toJSON: () => ({}),
  }
}

/** Menu rows for the snooze presets: label plus a trailing wake-time column. */
function snoozePresetItems(presets: readonly SnoozePreset[]): readonly MenuItem[] {
  return presets.map(preset => ({
    id: `snooze:${preset.id}`,
    label: (
      <span className={css.snoozeRow}>
        <span>{preset.label}</span>
        <span className={css.snoozeWhen}>{preset.whenLabel}</span>
      </span>
    ),
  }))
}

/**
 * Hover entry point for snooze: a clock button opening the preset menu.
 * Controlled by the row (which also uses the open state to pin its hover
 * actions while the menu is up, mirroring T3 Code's SnoozePopoverButton).
 */
function SnoozePopover({ open, onOpenChange, onSnooze, t }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSnooze: (until: number) => void
  t: RowTranslate
}) {
  // Presets resolve at open time so "In 1 hour" is relative to the click,
  // not to when the row mounted.
  const presets = useMemo(() => (open ? resolveSnoozePresets(new Date(), t) : []), [open, t])
  return (
    <Menu
      open={open}
      onClose={() => { onOpenChange(false) }}
      items={snoozePresetItems(presets)}
      onSelect={(id) => {
        onOpenChange(false)
        const preset = presets.find(candidate => `snooze:${candidate.id}` === id)
        if (preset !== undefined) onSnooze(preset.snoozedUntil)
      }}
      side="bottom"
      align="end"
      portal
      dense
      closeOnPointerLeave
      anchor={(
        <button
          type="button"
          className={clsx(css.iconButton, css.quickAction)}
          aria-label={t('actions.snooze.aria')}
          aria-expanded={open}
          onClick={(e) => { e.stopPropagation(); onOpenChange(!open) }}
        >
          <Clock size={14} />
        </button>
      )}
    />
  )
}

/** Localized "wakes in" countdown (reuses the relative-time dictionary). */
function countdownLabel(until: number, now: number, t: RowTranslate): string {
  const { unit, n } = snoozeCountdown(until, now)
  const key = unit === 'minutes' ? 'time.minutes' : unit === 'hours' ? 'time.hours' : 'time.days'
  return t(key, { n })
}

/**
 * One flat search result: title, Workspace context, and optional content
 * excerpt. Search navigation opens the session only; it does not address an
 * event inside the conversation.
 * @param props.result - merged local/content search row.
 * @param props.currentId - selected session id.
 * @param props.onOpen - open the selected session.
 * @param props.t - Workspace-browser translation seat.
 * @returns the result button.
 */
export function SearchResultItem({ result, currentId, onOpen, t }: {
  result: SearchResultNode
  currentId: string | undefined
  onOpen: (id: SearchResultNode['id']) => void
  t: RowTranslate
}) {
  const selected = result.id === currentId
  const statuses = sessionStatuses(result, t)
  const primaryStatus = statuses[0]
  return (
    <button
      type="button"
      className={clsx(css.searchResultRow, selected && css.selected)}
      role="treeitem"
      aria-selected={selected}
      onClick={() => { onOpen(result.id) }}
    >
      <span className={css.searchResultHeading}>
        <span className={css.slot}>
          {(primaryStatus.state !== 'done' || result.completed) && (
            <SessionStatusDots statuses={statuses} />
          )}
        </span>
        <span className={css.searchResultTitle}>{result.title}</span>
      </span>
      <span className={css.searchResultMeta}>
        <span className={css.searchResultWorkspace}>{result.workspace}</span>
        {result.snippet !== undefined && (
          <span className={css.searchResultSnippet}>{result.snippet}</span>
        )}
      </span>
    </button>
  )
}

/**
 * One top-level Session card: Workspace context, primary status or time,
 * title, git branch, relative time, and the row quick actions.
 * @param props.node - derived session node.
 * @param props.currentId - selected session id (row highlight).
 * @param props.now - epoch ms for relative-time formatting.
 * @param props.onOpen - open a session by id.
 * @param props.onRename - open the session rename dialog (id + current title).
 * @param props.onFork - fork a session at its last completed turn.
 * @param props.onArchive - archive a session by id.
 * @param props.onSettle - settle this session into the history shelf.
 * @param props.onUnsettle - un-settle: clear an explicit settle or pin an auto-settled row active.
 * @param props.onSnooze - snooze this session until the given epoch ms.
 * @param props.onWake - wake now / dismiss the Woke indicator.
 * @param props.drag - optional draggable-row wiring.
 * @param props.settled - whether this row belongs to the receded history shelf.
 * @param props.snoozedUntil - future wake time while this row is snoozed (countdown + wake action).
 * @param props.woke - the snooze elapsed; the row is back with the Woke pill.
 * @param props.t - the browser root's locale seat.
 * @returns the Session card.
 */
export function SessionNodeItem({
  node, currentId, now, onOpen, onRename, onFork, onArchive, onSettle, onUnsettle,
  onSnooze, onWake, drag, settled = false, snoozedUntil, woke = false, t,
}: {
  node: SessionNode
  currentId: string | undefined
  now: number
  onOpen: (id: SessionNode['id']) => void
  /** Open the browser-owned session rename dialog (row menu action). */
  onRename: (id: SessionNode['id'], currentTitle: string) => void
  /** Fork a session at its last completed turn (row menu action). */
  onFork: (id: SessionNode['id']) => void
  /** Archive this session (row menu action; commits without a dialog). */
  onArchive: (id: SessionNode['id']) => void
  /** Settle this session into the history shelf (quick action and menu). */
  onSettle: (id: SessionNode['id']) => void
  /** Un-settle: clear an explicit settle or pin an auto-settled row back into the active list. */
  onUnsettle: (id: SessionNode['id']) => void
  /** Snooze this session until the given epoch ms (quick popover and menu). */
  onSnooze: (id: SessionNode['id'], until: number) => void
  /** Wake now / dismiss the Woke indicator. */
  onWake: (id: SessionNode['id']) => void
  /** Present only on draggable rows (workspace-group sessions outside search). */
  drag?: RowDragProps | undefined
  /** Recede an inactivity-settled row until hover or focus. */
  settled?: boolean | undefined
  /** Future wake time while this row is snoozed (countdown label + wake action). */
  snoozedUntil?: number | undefined
  /** The snooze elapsed; the row is back with the Woke pill. */
  woke?: boolean | undefined
  t: RowTranslate
}) {
  const row = node
  const title = displayTitle(row, t)
  const selected = node.id === currentId
  const statuses = sessionStatuses(node, t)
  const primaryStatus = statuses[0]
  const showStatus = primaryStatus.state !== 'done' || row.completed
  // Blocked-on-you work never parks (the same invariant as the inactivity
  // derivation): no settle, no snooze on pending-interaction rows.
  const parkable = node.pendingInteraction === undefined
  // The menu opens at the pointer (right-click); the trailing seat's
  // quick actions stay a single hover affordance.
  const [menuRect, setMenuRect] = useState<DOMRect | null>(null)
  const menuOpen = menuRect !== null
  const [snoozeOpen, setSnoozeOpen] = useState(false)
  // Presets resolve at open time, shared by the popover and the context submenu.
  const snoozePresets = useMemo(
    () => (menuOpen || snoozeOpen ? resolveSnoozePresets(new Date(), t) : []),
    [menuOpen, snoozeOpen, t],
  )
  // Archive hides the row through the registry-global archive set and never
  // touches the session log, so it is not styled as destructive and needs no
  // confirmation dialog.
  const sessionMenuItems: MenuEntry[] = [
    { id: 'rename', label: t('rename'), icon: <IconEditOutline16 /> },
    { id: 'fork', label: t('menu.fork'), icon: <IconBranchOutline16 /> },
    ...(parkable
      ? [
        {
          id: 'snooze',
          label: t('menu.snooze'),
          icon: <Clock size={14} />,
          submenu: snoozePresetItems(snoozePresets),
        },
      ]
      : []),
    ...(settled
      ? [{ id: 'unsettle', label: t('menu.unsettle'), icon: <Undo2 size={14} /> }]
      : snoozedUntil !== undefined
        ? [{ id: 'wake', label: t('menu.wake'), icon: <AlarmClockOff size={14} /> }]
        : parkable
          ? [{ id: 'settle', label: t('menu.settle'), icon: <Check size={14} /> }]
          : []),
    // 20-native glyph in the menu's 16px icon slot (Menu.module.css .itemIcon).
    { id: 'archive', label: t('menu.archiveSession'), icon: <IconArchiveOutline20 size={16} /> },
  ]
  const dispatchMenu = (id: string): void => {
    setMenuRect(null)
    setSnoozeOpen(false)
    if (id.startsWith('snooze:')) {
      const preset = snoozePresets.find(candidate => `snooze:${candidate.id}` === id)
      /* v8 ignore next -- the popover and submenu items come from the same presets, so the id always resolves. */
      if (preset !== undefined) onSnooze(node.id, preset.snoozedUntil)
      return
    }
    if (id === 'rename') { onRename(node.id, row.title); return }
    if (id === 'fork') { onFork(node.id); return }
    if (id === 'archive') { onArchive(node.id); return }
    if (id === 'settle') { onSettle(node.id); return }
    if (id === 'unsettle') { onUnsettle(node.id); return }
    /* v8 ignore next -- every other dispatchable id returns above; only 'wake' can fall through. */
    if (id === 'wake') onWake(node.id)
  }
  // T3-adapted Session cards keep project context, live status, title, and
  // execution metadata in stable rows; quick actions replace only the
  // trailing status seat on hover, so card text never shifts.
  const ownRow = (
    <div
      className={clsx(
        css.sessionRow, selected && css.selected, settled && css.settled,
        (menuOpen || snoozeOpen) && css.menuOpen,
        drag?.marker === 'before' && css.dropBefore, drag?.marker === 'after' && css.dropAfter,
      )}
      role="treeitem"
      aria-selected={selected}
      onClick={() => {
        onOpen(node.id)
        // A visit acknowledges the wake: the return-ticket pill disappears.
        if (woke) onWake(node.id)
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        setSnoozeOpen(false)
        setMenuRect(pointerRect(e))
      }}
      draggable={drag !== undefined}
      onDragStart={drag === undefined
        ? undefined
        : (e) => {
          e.dataTransfer.effectAllowed = 'move'
          e.dataTransfer.setData('text/plain', node.id)
          drag.start()
        }}
      onDragEnd={drag?.end}
      onDragOver={drag === undefined
        ? undefined
        : (e) => {
          if (!drag.active) return
          e.preventDefault()
          e.dataTransfer.dropEffect = 'move'
          drag.hover(rowHalf(e))
        }}
      onDrop={drag === undefined
        ? undefined
        : (e) => {
          if (!drag.active) return
          e.preventDefault()
          drag.drop(rowHalf(e))
        }}
    >
      <div className={css.sessionTop}>
        <span className={css.workspaceMeta}>
          <IconFolderClose16 className={css.workspaceIcon} />
          <span className={css.workspaceTitle}>{node.workspace}</span>
        </span>
        <span className={css.sessionTrailing}>
          {snoozedUntil !== undefined
            ? <span className={css.snoozeCountdown}>{countdownLabel(snoozedUntil, now, t)}</span>
            : woke
              ? (
                <button
                  type="button"
                  className={css.wokePill}
                  aria-label={t('actions.dismissWoke.aria')}
                  onClick={(e) => { e.stopPropagation(); onWake(node.id) }}
                >
                  <AlarmClock size={14} />
                  <span>{t('snooze.woke')}</span>
                </button>
              )
              : showStatus
                ? (
                  <span className={css.cardStatus} data-status-state={primaryStatus.state}>
                    <StateDot state={primaryStatus.state} />
                    <span>{primaryStatus.label}</span>
                    {statuses.slice(1).map(status => (
                      <span className={css.visuallyHidden} key={status.label}>{status.label}</span>
                    ))}
                  </span>
                )
                : <span className={css.cardTime} data-sidebar-session-time>{timeLabel(row.updatedAt, now, t)}</span>}
          <span className={css.rowActions}>
            {settled ? (
              <button
                type="button"
                className={clsx(css.iconButton, css.quickAction)}
                aria-label={t('actions.unsettle.aria')}
                onClick={(e) => { e.stopPropagation(); onUnsettle(node.id) }}
              >
                <Undo2 size={14} />
              </button>
            ) : snoozedUntil !== undefined ? (
              <button
                type="button"
                className={clsx(css.iconButton, css.quickAction)}
                aria-label={t('actions.wake.aria')}
                onClick={(e) => { e.stopPropagation(); onWake(node.id) }}
              >
                <AlarmClockOff size={14} />
              </button>
            ) : (
              <>
                {parkable && (
                  <>
                    {/* T3 order: the snooze clock sits first, then the labeled settle. */}
                    <SnoozePopover
                      open={snoozeOpen}
                      onOpenChange={setSnoozeOpen}
                      onSnooze={(until) => { onSnooze(node.id, until) }}
                      t={t}
                    />
                    <button
                      type="button"
                      className={css.settleAction}
                      aria-label={t('actions.settle.aria')}
                      onClick={(e) => { e.stopPropagation(); onSettle(node.id) }}
                    >
                      <Check size={14} />
                      <span>{t('actions.settle.label')}</span>
                    </button>
                  </>
                )}
              </>
            )}
          </span>
          <Menu
            open={menuOpen}
            onClose={() => { setMenuRect(null) }}
            items={sessionMenuItems}
            onSelect={dispatchMenu}
            portal
            getAnchorRect={() => menuRect}
            anchor={null}
          />
        </span>
      </div>
      <span className={css.title}>{title}</span>
      <div className={css.cardFoot}>
        {node.branch === undefined
          ? <span />
          : (
            <span className={css.branch}>
              <IconBranchOutline16 size={14} />
              <span>{node.branch}</span>
            </span>
          )}
        {showStatus && (
          <span className={css.cardTime} data-sidebar-session-time>{timeLabel(row.updatedAt, now, t)}</span>
        )}
      </div>
    </div>
  )
  return (
    <HoverCard
      anchor={ownRow}
      content={<SessionHoverContent node={node} now={now} t={t} />}
      disabled={menuOpen || snoozeOpen || drag?.active === true}
      copyText={row.title}
      copyLabel={t('copy')}
      copiedLabel={t('hover.copied')}
    />
  )
}
