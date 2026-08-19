import type { TerminalPreferences } from './preferences.ts'
import { terminalFontName } from './preferences.ts'

const FONT_LOAD_PROBE_PX = 16

/**
 * Wait for the selected regular and bold faces before xterm remeasures cells.
 * @param preferences - selected bundled or custom terminal font.
 */
export async function awaitTerminalFontReady(preferences: TerminalPreferences): Promise<void> {
  if (typeof document === 'undefined') return
  const family = terminalFontName(preferences).replaceAll('"', '\\"')
  try {
    await document.fonts.ready
    await Promise.all([
      document.fonts.load(`${FONT_LOAD_PROBE_PX}px "${family}"`),
      document.fonts.load(`bold ${FONT_LOAD_PROBE_PX}px "${family}"`),
    ])
  } catch {
    // Browser font loading failures retain xterm's measured fallback face.
  }
}
