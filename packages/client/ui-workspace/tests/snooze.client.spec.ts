// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { makeTranslate } from '@monotykamary/dsh-client-test-runtime'
import { zh as commonZh } from '@monotykamary/dsh-client-locale/src/locales/zh.ts'
import { resolveSnoozePresets, snoozeCountdown } from '../src/client/snooze.ts'
import { zh } from '../src/client/locales.ts'

const t = makeTranslate(zh, commonZh) as never

describe('resolveSnoozePresets', () => {
  it('offers hour, three-hour, evening, tomorrow, and next-week choices with HH:mm columns', () => {
    // Local calendar fields keep the day/hour expectations timezone-agnostic.
    const now = new Date(2026, 7, 19, 10, 5, 0, 0) // Wednesday
    const presets = resolveSnoozePresets(now, t)
    expect(presets.map(p => p.id)).toEqual(['hour', 'three-hours', 'evening', 'tomorrow', 'next-week'])
    const [hour, three, evening, tomorrow, nextWeek] = presets
    expect(hour?.snoozedUntil).toBe(now.getTime() + 3_600_000)
    expect(hour?.whenLabel).toBe('11:05')
    expect(three?.snoozedUntil).toBe(now.getTime() + 3 * 3_600_000)
    const eveningAt = new Date(now)
    eveningAt.setHours(18, 0, 0, 0)
    expect(evening?.snoozedUntil).toBe(eveningAt.getTime())
    const tomorrowAt = new Date(now)
    tomorrowAt.setDate(tomorrowAt.getDate() + 1)
    tomorrowAt.setHours(9, 0, 0, 0)
    expect(tomorrow?.snoozedUntil).toBe(tomorrowAt.getTime())
    // Wednesday → next Monday (5 days ahead), 9:00, weekday-labeled column.
    expect(nextWeek?.whenLabel).toMatch(/^\S+ 09:00$/)
    const mondayAt = new Date(now)
    mondayAt.setDate(mondayAt.getDate() + 5)
    mondayAt.setHours(9, 0, 0, 0)
    expect(nextWeek?.snoozedUntil).toBe(mondayAt.getTime())
  })

  it('drops the evening preset once it is within an hour, starting the calendar at Tomorrow', () => {
    const now = new Date(2026, 7, 19, 17, 45, 0, 0)
    const presets = resolveSnoozePresets(now, t)
    expect(presets.map(p => p.id)).toEqual(['hour', 'three-hours', 'tomorrow', 'next-week'])
  })

  it('resolves next-week to the following Monday when snoozing on a Monday', () => {
    const now = new Date(2026, 7, 17, 12, 0, 0, 0) // Monday
    const presets = resolveSnoozePresets(now, t)
    const nextWeek = presets.find(p => p.id === 'next-week')
    const mondayAt = new Date(now)
    mondayAt.setDate(mondayAt.getDate() + 7)
    mondayAt.setHours(9, 0, 0, 0)
    expect(nextWeek?.snoozedUntil).toBe(mondayAt.getTime())
  })

  it('labels the Monday preset with the localized weekday', () => {
    // Friday 12:00 → Monday is 3 days ahead.
    const now = new Date(2026, 7, 21, 12, 0, 0, 0)
    const presets = resolveSnoozePresets(now, t)
    const nextWeek = presets.find(p => p.id === 'next-week')
    expect(nextWeek?.whenLabel.startsWith('周一 ')).toBe(true)
  })
})

describe('snoozeCountdown', () => {
  it('rounds minutes up from one minute and hours/days to the next unit', () => {
    expect(snoozeCountdown(60_000, 0)).toEqual({ unit: 'minutes', n: 1 })
    expect(snoozeCountdown(30_000, 0)).toEqual({ unit: 'minutes', n: 1 })
    expect(snoozeCountdown(59 * 60_000, 0)).toEqual({ unit: 'minutes', n: 59 })
    expect(snoozeCountdown(60 * 60_000, 0)).toEqual({ unit: 'hours', n: 1 })
    expect(snoozeCountdown(2 * 3_600_000, 0)).toEqual({ unit: 'hours', n: 2 })
    expect(snoozeCountdown(23 * 3_600_000 + 1, 0)).toEqual({ unit: 'hours', n: 24 })
    expect(snoozeCountdown(24 * 3_600_000, 0)).toEqual({ unit: 'days', n: 1 })
    expect(snoozeCountdown(3 * 86_400_000, 0)).toEqual({ unit: 'days', n: 3 })
  })
})
