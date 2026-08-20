/**
 * Pure snooze presentation: preset wake times resolved at open time and the
 * compact "wakes in" countdown label. T3 Code's sidebar snooze presets,
 * adapted to the app-locale dictionary (no browser-locale formatting: the
 * same rule as the hover-card clock in Rows.tsx).
 */
import type { WorkspaceBrowserProps } from './contract/slots.ts'
import type { WorkspaceKey } from './locales.ts'

/** Locale seat used by preset labels and the countdown. */
type Translate = WorkspaceBrowserProps['t']

/** One "snooze until" choice rendered in the popover and context submenu. */
export interface SnoozePreset {
  /** Stable action id (menu dispatch key). */
  id: string
  /** Localized preset name ("In 1 hour"). */
  label: string
  /** Wake-time column: HH:mm, or weekday + HH:mm for the Monday entry. */
  whenLabel: string
  /** Wake time in epoch milliseconds. */
  snoozedUntil: number
}

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
const EVENING_HOUR = 18
const MORNING_HOUR = 9

/** Weekday names keyed by `Date.getDay()` (0 = Sunday). */
const WEEKDAY_KEYS: readonly WorkspaceKey[] = [
  'weekday.sun', 'weekday.mon', 'weekday.tue', 'weekday.wed',
  'weekday.thu', 'weekday.fri', 'weekday.sat',
]

/** HH:mm with zero padding (the `date.ymd` template's clock pattern). */
function timeOfDayLabel(date: Date): string {
  const pad2 = (value: number): string => String(value).padStart(2, '0')
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

/** The given hour on `base`'s calendar day. */
function atHour(base: Date, hour: number): Date {
  const next = new Date(base)
  next.setHours(hour, 0, 0, 0)
  return next
}

/** Calendar-day advance instead of adding DAY_MS: fixed offsets land on the wrong local day across DST transitions. */
function addDays(base: Date, days: number): Date {
  const next = new Date(base)
  next.setDate(next.getDate() + days)
  return next
}

/**
 * Resolve the "snooze until" choices relative to `now`. "This evening" only
 * appears while it is meaningfully before evening; afterwards the calendar
 * choices start at "Tomorrow". Resolved at open time so "In 1 hour" is
 * relative to the click, not to when the row mounted.
 * @param now - the click moment.
 * @param t - workspace locale seat for the preset labels.
 * @returns the presets in menu order.
 */
export function resolveSnoozePresets(now: Date, t: Translate): readonly SnoozePreset[] {
  const presets: SnoozePreset[] = [
    {
      id: 'hour',
      label: t('snooze.hour'),
      whenLabel: timeOfDayLabel(new Date(now.getTime() + HOUR_MS)),
      snoozedUntil: now.getTime() + HOUR_MS,
    },
    {
      id: 'three-hours',
      label: t('snooze.threeHours'),
      whenLabel: timeOfDayLabel(new Date(now.getTime() + 3 * HOUR_MS)),
      snoozedUntil: now.getTime() + 3 * HOUR_MS,
    },
  ]
  const evening = atHour(now, EVENING_HOUR)
  if (evening.getTime() - now.getTime() > HOUR_MS) {
    presets.push({
      id: 'evening',
      label: t('snooze.evening'),
      whenLabel: timeOfDayLabel(evening),
      snoozedUntil: evening.getTime(),
    })
  }
  const tomorrow = atHour(addDays(now, 1), MORNING_HOUR)
  presets.push({
    id: 'tomorrow',
    label: t('snooze.tomorrow'),
    whenLabel: timeOfDayLabel(tomorrow),
    snoozedUntil: tomorrow.getTime(),
  })
  const daysUntilMonday = (1 - now.getDay() + 7) % 7 || 7
  const nextWeek = atHour(addDays(now, daysUntilMonday), MORNING_HOUR)
  /* v8 ignore next -- defensive: getDay() is always within 0..6. */
  const weekdayLabel = t(WEEKDAY_KEYS[nextWeek.getDay()] ?? 'weekday.sun')
  presets.push({
    id: 'next-week',
    label: t('snooze.nextWeek'),
    whenLabel: `${weekdayLabel} ${timeOfDayLabel(nextWeek)}`,
    snoozedUntil: nextWeek.getTime(),
  })
  return presets
}

/** Countdown magnitude bucket for a still-snoozed row. */
export interface SnoozeCountdown {
  unit: 'minutes' | 'hours' | 'days'
  n: number
}

/**
 * Compact "wakes in" label values for a snoozed row: minutes under one hour
 * (never reading "0m" while still hidden), hours under one day, days beyond.
 * @param until - wake time in epoch milliseconds.
 * @param now - current epoch milliseconds.
 * @returns the bucket plus its magnitude.
 */
export function snoozeCountdown(until: number, now: number): SnoozeCountdown {
  const remaining = until - now
  if (remaining < HOUR_MS) return { unit: 'minutes', n: Math.max(1, Math.ceil(remaining / 60_000)) }
  if (remaining < DAY_MS) return { unit: 'hours', n: Math.ceil(remaining / HOUR_MS) }
  return { unit: 'days', n: Math.ceil(remaining / DAY_MS) }
}
