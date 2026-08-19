/** Bottom-panel height policy owned by the root application frame. */

/** Height restored when a closed bottom panel opens. */
export const BOTTOM_DEFAULT = 280
/** Smallest user-selected open bottom-panel height. */
export const BOTTOM_MIN = 160
/** Largest persisted bottom-panel height preference. */
export const BOTTOM_MAX = 520
/** Minimum center conversation height retained during responsive concessions. */
export const CENTER_MIN_HEIGHT = 240

/**
 * Clamp a drag preference while preserving zero as the closed state.
 * @param value - requested height in pixels.
 * @param minimum - smallest open height.
 * @param maximum - largest open height.
 * @returns zero or the clamped open height.
 */
export function clampHeight(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0
  return Math.min(maximum, Math.max(minimum, value))
}

/**
 * Resolve a stored preference against the frame's current vertical room.
 * @param frameHeight - current AppFrame height in pixels.
 * @param preference - stored bottom-panel height or zero.
 * @returns rendered height after retaining the center floor.
 */
export function resolveBottomHeight(frameHeight: number, preference: number): number {
  if (preference === 0 || frameHeight <= CENTER_MIN_HEIGHT) return 0
  return Math.min(preference, Math.max(0, frameHeight - CENTER_MIN_HEIGHT))
}
