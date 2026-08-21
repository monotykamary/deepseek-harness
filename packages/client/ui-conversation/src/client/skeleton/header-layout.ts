/**
 * Interior-header disclosure solver for the session header: a tier ladder
 * from full chrome down to a lone title row, measured with @chenglou/pretext
 * so the transitions land where the text actually fits. This is the
 * testable kernel of the header solver pattern borrowed from localterm
 * (apps/terminal/src/utils/compute-header-layout.ts): title and tab labels
 * are pretext-measured, the ladder is ordered widest-first, and hysteresis
 * retains the previous tier during reflow so the header never oscillates.
 *
 * Layout being solved (ConversationRoot session header in the center column):
 *
 *   titleRow = [title cluster] [flex spacer] [utilities]   gap 20px
 *   tabs     = Chat | Trajectory | ...                     gap 36px
 *
 * The title cluster holds the breadcrumb (session title text, ellipsis-capped
 * at the CSS max-width) and the actions band (slot-contributed session
 * context chrome); the utilities band holds panel toggles. The two bands are
 * plugin-composed, so their rendered widths are unknown to the header until
 * first render; the solver consumes their MEASURED rendered widths (the
 * component measures the DOM boxes) rather than per-entry estimates.
 * Disclosure sheds whole bands in the order the user can spare:
 *
 *   1. FULL        title + actions + utilities
 *   2. NO_ACTIONS  title + utilities (context buttons go first)
 *   3. TITLE_ONLY  title (panel toggles go last; the crumb ellipsizes)
 *
 * The tabs row always renders when there are tabs: it is the navigation
 * surface, and a single-line crumb guarantees the floor never overflows.
 */
import { prepareWithSegments, measureNaturalWidth } from '@chenglou/pretext'

const SANS_14 = '14px system-ui, -apple-system, sans-serif'  // .crumb text
const SANS_500_13 = '500 13px system-ui, -apple-system, sans-serif'  // .tab text

const TITLE_ROW_GAP_FULL = 20
const TITLE_ROW_GAP_COMPACT = 10
const HEADER_PAD_X_FULL = 20
const HEADER_PAD_X_COMPACT = 12
const CRUMB_PAD_X = 16 // 2 x 8px .crumb horizontal padding
const CRUMB_MAX = 220 // .crumb max-width; ellipsis beyond
const TABS_GAP = 36
const TABS_PAD_LEFT = 8
const TAB_LABEL_PAD_X = 16 // approximate .tab button horizontal padding
const SAFETY_MARGIN_PX = 8
const HYSTERESIS_PX = 24

const CRUMB_ELLIPSIS_MIN_PX = CRUMB_PAD_X + 10 // one ellipsis glyph plus the crumb padding

const measure = (text: string, font: string): number => {
  try {
    return measureNaturalWidth(prepareWithSegments(text, font))
  } catch {
    // ~0.53em Latin in 14px: sensible floor where pretext cannot run.
    return text.length * 7.4
  }
}

/**
 * Natural width of the crumb button: ellipsis-capped text plus padding. The
 * crumb is a flex child that shrinks to the ellipsis floor when space runs
 * out, so the solver treats natural width as desired and the floor as the
 * minimum.
 */
const crumbWidth = (text: string): number =>
  CRUMB_ELLIPSIS_MIN_PX + Math.min(measure(text, SANS_14), CRUMB_MAX)

/** Width of one rendered tab button: measured 13/16 label plus padding. */
const tabWidth = (label: string): number => measure(label, SANS_500_13) + TAB_LABEL_PAD_X

/** Width of the visible tab strip, or 0 when no tabs render a row. */
const tabstripWidth = (labels: readonly string[]): number => {
  if (labels.length === 0) return 0
  const text = labels.reduce((sum, label) => sum + tabWidth(label), 0)
  return text + TABS_GAP * (labels.length - 1) + TABS_PAD_LEFT
}

/** One disclosure tier: which bands and chrome are visible. */
export interface HeaderTier {
  /** Show the session title text (breadcrumb cluster). */
  showTitle: boolean
  /** Show the session-actions band. */
  showActions: boolean
  /** Show the utilities (panel toggles) band. */
  showUtilities: boolean
  /** Title row horizontal gap. */
  titleGap: number
  /** Header row horizontal padding, each side. */
  headerPadX: number
}

const FULL_TIER = Object.freeze({
  showTitle: true,
  showActions: true,
  showUtilities: true,
  titleGap: TITLE_ROW_GAP_FULL,
  headerPadX: HEADER_PAD_X_FULL,
} satisfies HeaderTier)

const NO_ACTIONS_TIER = Object.freeze({
  showTitle: true,
  showActions: false,
  showUtilities: true,
  titleGap: TITLE_ROW_GAP_COMPACT,
  headerPadX: HEADER_PAD_X_COMPACT,
} satisfies HeaderTier)

const TITLE_ONLY_TIER = Object.freeze({
  ...NO_ACTIONS_TIER,
  showUtilities: false,
} satisfies HeaderTier)

/** Ordered widest-first; the solver picks the first that fits. */
export const HEADER_TIERS: readonly HeaderTier[] = [
  FULL_TIER,
  NO_ACTIONS_TIER,
  TITLE_ONLY_TIER,
]

export interface HeaderLayoutParams {
  /** Measured width of the header container (px), 0 before any read. */
  availableWidth: number
  /** Session title text rendered into the breadcrumb. */
  titleText: string
  /** Measured rendered width of the actions band (px). */
  actionsBandWidth: number
  /** Measured rendered width of the utilities band (px). */
  utilitiesBandWidth: number
  /** Visible tab labels (a single tab renders no tab row). */
  tabLabels: readonly string[]
  /** Prior tier index for hysteresis; 0 on first mount. */
  previousConfigIndex: number
}

export interface HeaderLayoutResult {
  /** Resolved ladder index. */
  configIndex: number
  /** Tier to render. */
  tier: HeaderTier
  /** Measured required width for this tier, without hysteresis margin. */
  requiredWidthPx: number
  /** True when this tier fits the available width. */
  fits: boolean
}

/**
 * Width consumed by the whole header at one tier. The title row and the tab
 * row render on separate lines inside the same padded box, so the binding
 * constraint is the WIDER of the two rows, not their sum. The crumb is a
 * flex child that shrinks to the ellipsis floor, so the solver sizes it from
 * the room the fixed bands leave (the localterm selectWidthPx idea, applied
 * to the title).
 */
const computeWidth = (p: HeaderLayoutParams, tier: HeaderTier): number => {
  const actionsWidth = tier.showActions ? p.actionsBandWidth : 0
  const utilitiesWidth = tier.showUtilities ? p.utilitiesBandWidth : 0
  const groups = (tier.showTitle ? 1 : 0) + (tier.showActions ? 1 : 0) + (tier.showUtilities ? 1 : 0)
  const gaps = Math.max(0, groups - 1) * tier.titleGap
  const fixed = actionsWidth + utilitiesWidth + gaps + tier.headerPadX * 2
  const natural = tier.showTitle ? crumbWidth(p.titleText) : 0
  const tabRow = p.tabLabels.length > 0 ? tabstripWidth(p.tabLabels) : 0
  const room = Math.max(CRUMB_ELLIPSIS_MIN_PX, p.availableWidth - fixed - SAFETY_MARGIN_PX)
  const title = tier.showTitle ? Math.min(natural, room) : 0
  const titleRow = fixed + title
  return Math.max(titleRow, tabRow) + SAFETY_MARGIN_PX
}

/** Locked-in-range ladder access (noUncheckedIndexedAccess). */
const tierAt = (index: number): HeaderTier => {
  const tier = HEADER_TIERS[index]
  if (tier === undefined) throw new Error(`header tier ${index} is missing`)
  return tier
}

/**
 * Solve the disclosure tier for the current width. The widest tier that fits
 * wins; hysteresis retains the previous (sparser) tier when the width grows
 * by less than the hysteresis margin, so a narrow reflow never re-shows the
 * full header on a hairline boundary.
 * @param params - measured width, title text, measured band widths, tabs.
 * @returns the tier to render and its measured width.
 */
export const computeHeaderLayout = (params: HeaderLayoutParams): HeaderLayoutResult => {
  const { availableWidth } = params
  if (availableWidth === 0) {
    return { configIndex: 0, tier: tierAt(0), requiredWidthPx: 0, fits: true }
  }

  const prevIndex = Math.min(params.previousConfigIndex, HEADER_TIERS.length - 1)

  for (let index = 0; index < HEADER_TIERS.length; index++) {
    const tier = tierAt(index)
    const requiredWidthPx = computeWidth(params, tier)
    if (requiredWidthPx <= availableWidth) {
      if (index >= prevIndex) {
        return { configIndex: index, tier, requiredWidthPx, fits: true }
      }
      const prevTier = tierAt(prevIndex)
      const prevWidth = computeWidth(params, prevTier)
      // Restore only when the candidate tier clears the hysteresis margin:
      // then a reflow across the boundary cannot bounce back into it.
      if (availableWidth >= requiredWidthPx + HYSTERESIS_PX) {
        return { configIndex: index, tier, requiredWidthPx, fits: true }
      }
      return {
        configIndex: prevIndex,
        tier: prevTier,
        requiredWidthPx: prevWidth,
        fits: prevWidth <= availableWidth,
      }
    }
  }

  const last = tierAt(HEADER_TIERS.length - 1)
  return {
    configIndex: HEADER_TIERS.length - 1,
    tier: last,
    requiredWidthPx: computeWidth(params, last),
    fits: true,
  }
}
