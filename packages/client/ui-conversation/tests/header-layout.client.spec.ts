/**
 * Header disclosure solver audit: the tier ladder must fit every supported
 * width under adversarial titles and measured band loads, reveal details
 * progressively as room appears, and keep hysteresis from oscillating on a
 * boundary. Mirrors the localterm compute-header-layout audit. Band widths
 * are measured rendered boxes (labeled Files/preset buttons in the actions
 * band, the session-log control plus toggles in utilities).
 */
import { describe, expect, it } from 'vitest'
import { computeHeaderLayout } from '../src/client/skeleton/header-layout.ts'

const MIN_WIDTH = 200
const MAX_WIDTH = 1280
const STEP = 8

const ADVERSARIAL_TITLES = [
  'A',
  'Session with a very long display title that keeps going without a natural break',
  '超长会话标题让你的头部换行结果不可捉摸',
] as const

/** Realistic measured boxes: 3 labeled actions and 3 utility controls. */
const REAL_FULL_ACTIONS = 182
const REAL_FULL_UTILITIES = 226

const TABS = ['Chat', 'Trajectory'] as const

const assertWidthsFit = (previousConfigIndex: number | undefined): void => {
  const failures: string[] = []
  for (let availableWidth = MIN_WIDTH; availableWidth <= MAX_WIDTH; availableWidth += STEP) {
    for (const title of ADVERSARIAL_TITLES) {
      const layout = computeHeaderLayout({
        availableWidth,
        titleText: title,
        actionsBandWidth: REAL_FULL_ACTIONS,
        utilitiesBandWidth: REAL_FULL_UTILITIES,
        tabLabels: TABS,
        previousConfigIndex: previousConfigIndex ?? 0,
      })
      if (!layout.fits) {
        failures.push(`${availableWidth}px '${title}': layout does not fit`)
      }
      if (layout.requiredWidthPx > availableWidth) {
        failures.push(`${availableWidth}px: requires ${layout.requiredWidthPx}px`)
      }
    }
  }
  expect(failures).toEqual([])
}

describe('computeHeaderLayout', () => {
  const solve = (availableWidth: number) => computeHeaderLayout({
    availableWidth,
    titleText: 'A session',
    actionsBandWidth: REAL_FULL_ACTIONS,
    utilitiesBandWidth: REAL_FULL_UTILITIES,
    tabLabels: ['Chat'],
    previousConfigIndex: 2,
  })

  it('fits adversarial titles at every audited width', () => {
    assertWidthsFit(undefined)
  })

  it('continues to fit while hysteresis retains a previous tier', () => {
    assertWidthsFit(2)
  })

  it('discloses bands progressively as room appears', () => {
    const narrow = computeHeaderLayout({
      availableWidth: MIN_WIDTH,
      titleText: 'Session title',
      actionsBandWidth: REAL_FULL_ACTIONS,
      utilitiesBandWidth: REAL_FULL_UTILITIES,
      tabLabels: TABS,
      previousConfigIndex: 0,
    })
    const wide = computeHeaderLayout({
      availableWidth: MAX_WIDTH,
      titleText: 'Session title',
      actionsBandWidth: REAL_FULL_ACTIONS,
      utilitiesBandWidth: REAL_FULL_UTILITIES,
      tabLabels: TABS,
      previousConfigIndex: 0,
    })
    expect(narrow.configIndex).toBeGreaterThan(wide.configIndex)
    expect(narrow.tier.showActions).toBe(false)
    expect(wide.tier.showActions).toBe(true)
    expect(wide.tier.showUtilities).toBe(true)
  })

  it('sheds actions before utilities and keeps the title last', () => {
    const actionless = computeHeaderLayout({
      availableWidth: 280,
      titleText: 'Session',
      actionsBandWidth: REAL_FULL_ACTIONS,
      utilitiesBandWidth: REAL_FULL_UTILITIES,
      tabLabels: TABS,
      previousConfigIndex: 0,
    })
    expect(actionless.tier.showTitle).toBe(true)
    expect(actionless.tier.showActions).toBe(false)
  })

  it('treats oversized measured bands honestly instead of shrinking them', () => {
    // A very wide measured utility box (e.g. labels grown in another locale)
    // must not be re-estimated: the solver sheds the band rather than
    // letting the title row overflow its box.
    const constrained = computeHeaderLayout({
      availableWidth: 390,
      titleText: 'A session',
      actionsBandWidth: 160,
      utilitiesBandWidth: 999,
      tabLabels: ['Chat'],
      previousConfigIndex: 0,
    })
    expect(constrained.fits).toBe(true)
    expect(constrained.requiredWidthPx).toBeLessThanOrEqual(390)
    expect(constrained.tier.showUtilities).toBe(false)
  })

  it('keeps the earlier tier until the richer one clears the hysteresis margin', () => {
    // In the no-actions retention zone at 380px, the NO_ACTIONS tier (which
    // needed 360.6px) fits but leaves too little room for the richer FULL
    // tier inside the 24px hysteresis margin, so TITLE_ONLY persists.
    // One margin beyond the fit width it re-shows.
    const held = solve(360.6 + 8)
    expect(held.tier.showUtilities).toBe(false)
    expect(held.tier.showActions).toBe(false)
    const clear = solve(360.6 + 32)
    expect(clear.tier.showUtilities).toBe(true)
    expect(clear.tier.showActions).toBe(false)
    expect(clear.fits).toBe(true)
  })
})
