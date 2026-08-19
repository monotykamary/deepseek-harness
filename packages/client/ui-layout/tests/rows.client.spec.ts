import { describe, expect, it } from 'vitest'
import {
  BOTTOM_MAX, BOTTOM_MIN, CENTER_MIN_HEIGHT, clampHeight, resolveBottomHeight,
} from '@monotykamary/dsh-client-ui-layout/src/client/rows.ts'

describe('bottom-panel row policy', () => {
  it('preserves zero and clamps finite open preferences', () => {
    expect(clampHeight(0, BOTTOM_MIN, BOTTOM_MAX)).toBe(0)
    expect(clampHeight(Number.NaN, BOTTOM_MIN, BOTTOM_MAX)).toBe(0)
    expect(clampHeight(1, BOTTOM_MIN, BOTTOM_MAX)).toBe(BOTTOM_MIN)
    expect(clampHeight(300, BOTTOM_MIN, BOTTOM_MAX)).toBe(300)
    expect(clampHeight(9999, BOTTOM_MIN, BOTTOM_MAX)).toBe(BOTTOM_MAX)
  })

  it('concedes height to retain the center minimum and closes without room', () => {
    expect(resolveBottomHeight(1_000, 300)).toBe(300)
    expect(resolveBottomHeight(500, 400)).toBe(500 - CENTER_MIN_HEIGHT)
    expect(resolveBottomHeight(CENTER_MIN_HEIGHT, 300)).toBe(0)
    expect(resolveBottomHeight(1_000, 0)).toBe(0)
  })
})
