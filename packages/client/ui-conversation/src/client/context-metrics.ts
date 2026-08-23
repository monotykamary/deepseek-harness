import type { ContextPressureProjection } from '@monotykamary/dsh-token-meter/client'

/** Context occupancy with its current numerator and denominator. */
export interface ContextOccupancy {
  percent: number
  usedTokens: number
  contextWindow: number
}

/**
 * Format a compact token count.
 * @param value - Token count.
 * @returns Display string using K or M above each threshold.
 */
export function formatTokens(value: number): string {
  const scaled = (entry: number): string =>
    entry >= 100 ? String(Math.round(entry)) : String(Math.round(entry * 10) / 10)
  if (value < 1_000) return String(value)
  if (value < 1_000_000) return `${scaled(value / 1_000)}K`
  return `${scaled(value / 1_000_000)}M`
}

/**
 * Derive approximate context occupancy from the latest projected pressure.
 * @param pressure - Session context-pressure projection.
 * @returns Occupancy and token bounds, or null until both values are known.
 */
export function contextOccupancy(
  pressure: ContextPressureProjection | undefined,
): ContextOccupancy | null {
  const usedTokens = pressure?.projectedTokens ?? pressure?.pressureTokens
  if (usedTokens === undefined || pressure?.contextWindow === undefined) return null
  return {
    percent: Math.min(100, Math.round(usedTokens / pressure.contextWindow * 100)),
    usedTokens,
    contextWindow: pressure.contextWindow,
  }
}
