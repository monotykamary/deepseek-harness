// TodoPanel: plan strip above the composer (the web counterpart of the TUI
// plan panel). Renders the standing todo/write whole-list snapshot (cleared on
// the next turn/start) — no data of its own, hidden while the list is empty.
// Mounted through the 'conversation.input.dock' slot (QueueDock posture): the
// dock adapter does the selecting, so the panel takes the plain list and stays
// framework-free. Visual: figma 772:51905 / 772:52972 / 772:53419.

import { useState } from 'react'
import type { Context } from '@monotykamary/cordis'
import type { PropsLocale, PropsRuntime } from '@monotykamary/dsh-client-ui-slots'
// The domain's client-namespace pure-type outlet: one import edge delivers
// the `todos` projection-key merge (single source, no consumer-side restated
// declare) and the payload type. Type-only by construction — the outlet is
// free of host value imports, so no host Context merge enters this program.
import type { TodoItem } from '@monotykamary/dsh-tool-todo/client'
import {
  IconChecklistOutline14, IconChevronDownOutline14, IconChevronUpOutline14,
  IconCircleCheckOutline14, IconCircleDashedOutline14, IconLoadingOutline16,
} from '@monotykamary/dsh-client-ui-primitives'
import { NS } from '../locales.ts'
import css from './TodoPanel.module.css'

export interface TodoPanelProps {
  /** The session's current plan (empty renders nothing) — selected by the dock adapter. */
  todos: readonly TodoItem[]
  /** The dock entry's locale seat, passed down as a plain prop. */
  t: TodoDockProps['t']
}

/** Local exhaustiveness helper — client packages do not depend on `dsh-llm`. */
/* v8 ignore next 3 -- closed-union backstop; only reached if status is forged */
function assertNever(value: never): never {
  throw new Error(`unreachable todo status: ${String(value)}`)
}

function CompletedGlyph() {
  return <IconCircleCheckOutline14 className={css.glyphCompleted} />
}

function ProgressGlyph() {
  return <IconLoadingOutline16 size={14} className={css.glyphProgress} />
}

function PendingGlyph() {
  return <IconCircleDashedOutline14 className={css.glyphPending} />
}

function StatusGlyph({ status }: { status: TodoItem['status'] }) {
  switch (status) {
    case 'completed': return <CompletedGlyph />
    case 'in_progress': return <ProgressGlyph />
    case 'pending': return <PendingGlyph />
    /* v8 ignore next -- closed TodoItem status union */
    default: return assertNever(status)
  }
}

/** Header summary: "·"-joined per-status counts; zero-count segments are omitted as noise (a non-empty list keeps at least one). */
function progressLabel(todos: readonly TodoItem[], t: TodoPanelProps['t']): string {
  const done = todos.filter(item => item.status === 'completed').length
  const active = todos.filter(item => item.status === 'in_progress').length
  const pending = todos.length - done - active
  // En spaces (U+2002): HTML collapses runs of ASCII spaces, so widening the
  // separator breathing room needs a literal wide space.
  return [
    ...done > 0 ? [t('todo.progress.done', { done })] : [],
    ...active > 0 ? [t('todo.progress.active', { active })] : [],
    ...pending > 0 ? [t('todo.progress.pending', { pending })] : [],
  ].join('\u2002·\u2002')
}

export function TodoPanel({ todos, t }: TodoPanelProps) {
  const [collapsed, setCollapsed] = useState(true)
  if (todos.length === 0) return null

  return (
    <section className={css.root} data-testid="todo-panel" aria-label={t('todo.title')}>
      <div className={css.body}>
        <button
          type="button"
          className={css.header}
          aria-expanded={!collapsed}
          onClick={() => { setCollapsed(v => !v) }}
        >
          <span className={css.lead} aria-hidden><IconChecklistOutline14 /></span>
          <span className={css.title}>{t('todo.title')}</span>
          <span className={css.progress}>{progressLabel(todos, t)}</span>
          <span className={css.chevron} aria-hidden>
            {collapsed ? <IconChevronUpOutline14 /> : <IconChevronDownOutline14 />}
          </span>
        </button>
        {!collapsed && (
          <ul className={css.list}>
            {todos.map(item => (
              <li key={item.content} className={css.item} data-status={item.status}>
                <span className={css.glyph} aria-hidden><StatusGlyph status={item.status} /></span>
                <span className={css.content}>{item.content}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

/** Full props of a dock entry: InputZone owner share + session standard kit + global seat + the locale seat. */
export type TodoDockProps = PropsRuntime<'conversation.input.dock'> & PropsLocale<'conversation'>

/** Dock adapter: reads the host-computed 'todos' projection (whole list; absent or null renders nothing). */
export function TodoDock({ useProjection, t }: TodoDockProps) {
  const todos = useProjection('todos')
  return <TodoPanel todos={todos ?? []} t={t} />
}

/**
 * The plan strip as a plain registrant plugin (QueueDock posture), following
 * the input-dock declaration across independent activation and reload.
 */
export const todoDockEntry = {
  name: 'conversation-todo-dock',
  inject: ['slots'],
  /**
   * Register the plan strip before the goal and queue entries (order 0).
   * @param ctx - registrant context (disposal rides ctx.effect inside slots.register).
   */
  apply(ctx: Context): void {
    ctx.slots.inject('conversation.input.dock', () =>
      ctx.slots.register({ name: 'conversation.input.dock', id: 'todo', order: 0, locale: NS }, TodoDock))
  },
}
