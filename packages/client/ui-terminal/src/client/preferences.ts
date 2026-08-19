/** Browser-local xterm appearance settings shared by every terminal placement. */

/** Persisted terminal appearance preferences. */
export interface TerminalPreferences {
  readonly theme: TerminalThemeId
  readonly font: TerminalFontId
  readonly customFontFamily: string
  readonly fontSize: number
  readonly lineHeight: number
  readonly ligatures: boolean
  readonly muteEmojiColors: boolean
  readonly cursorBlink: boolean
}

/** Built-in terminal theme identity. */
export type TerminalThemeId = 'harness' | 'tokyo-night' | 'catppuccin' | 'light'
/** Built-in localterm font or user-resolved family identity. */
export type TerminalFontId =
  | 'geist-mono'
  | 'anonymous-pro'
  | 'dm-mono'
  | 'fira-code'
  | 'ibm-plex-mono'
  | 'inconsolata'
  | 'jetbrains-mono'
  | 'roboto-mono'
  | 'source-code-pro'
  | 'space-mono'
  | 'ubuntu-mono'
  | 'custom'

/** Bundled localterm font exposed by the terminal appearance editor. */
export interface TerminalFontOption {
  readonly id: Exclude<TerminalFontId, 'custom'>
  readonly label: string
}

/** Complete built-in localterm terminal font catalog. */
export const TERMINAL_FONTS: readonly (TerminalFontOption | { readonly id: 'custom'; readonly label: string })[] = [
  { id: 'geist-mono', label: 'Geist Mono' },
  { id: 'anonymous-pro', label: 'Anonymous Pro' },
  { id: 'dm-mono', label: 'DM Mono' },
  { id: 'fira-code', label: 'Fira Code' },
  { id: 'ibm-plex-mono', label: 'IBM Plex Mono' },
  { id: 'inconsolata', label: 'Inconsolata' },
  { id: 'jetbrains-mono', label: 'JetBrains Mono' },
  { id: 'roboto-mono', label: 'Roboto Mono' },
  { id: 'source-code-pro', label: 'Source Code Pro' },
  { id: 'space-mono', label: 'Space Mono' },
  { id: 'ubuntu-mono', label: 'Ubuntu Mono' },
  { id: 'custom', label: 'Custom…' },
]

const STORAGE_KEY = 'dsh.terminal.preferences.v1'
const FONT_SIZE_MIN = 10
const FONT_SIZE_MAX = 24
const LINE_HEIGHT_MIN = 1
const LINE_HEIGHT_MAX = 1.6
const CUSTOM_FONT_MAX_CODE_UNITS = 120

/** Default terminal appearance used before any browser-local override. */
export const DEFAULT_TERMINAL_PREFERENCES: TerminalPreferences = {
  theme: 'harness',
  font: 'geist-mono',
  customFontFamily: '',
  fontSize: 13,
  lineHeight: 1.2,
  ligatures: true,
  muteEmojiColors: false,
  cursorBlink: true,
}

function clamp(value: unknown, minimum: number, maximum: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, value))
    : fallback
}

function isTheme(value: unknown): value is TerminalThemeId {
  return value === 'harness' || value === 'tokyo-night' || value === 'catppuccin' || value === 'light'
}

function isFont(value: unknown): value is TerminalFontId {
  return typeof value === 'string' && (
    value === 'custom' || TERMINAL_FONTS.some(font => font.id === value)
  )
}

function parsePreferences(raw: string | null): TerminalPreferences {
  if (raw === null) return DEFAULT_TERMINAL_PREFERENCES
  let value: unknown
  try {
    value = JSON.parse(raw) as unknown
  } catch {
    return DEFAULT_TERMINAL_PREFERENCES
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return DEFAULT_TERMINAL_PREFERENCES
  }
  const record = value as Record<string, unknown>
  return {
    theme: isTheme(record.theme) ? record.theme : DEFAULT_TERMINAL_PREFERENCES.theme,
    font: isFont(record.font) ? record.font : DEFAULT_TERMINAL_PREFERENCES.font,
    customFontFamily: typeof record.customFontFamily === 'string'
      ? record.customFontFamily.slice(0, CUSTOM_FONT_MAX_CODE_UNITS)
      : '',
    fontSize: clamp(record.fontSize, FONT_SIZE_MIN, FONT_SIZE_MAX, DEFAULT_TERMINAL_PREFERENCES.fontSize),
    lineHeight: clamp(record.lineHeight, LINE_HEIGHT_MIN, LINE_HEIGHT_MAX, DEFAULT_TERMINAL_PREFERENCES.lineHeight),
    ligatures: typeof record.ligatures === 'boolean' ? record.ligatures : DEFAULT_TERMINAL_PREFERENCES.ligatures,
    muteEmojiColors: typeof record.muteEmojiColors === 'boolean'
      ? record.muteEmojiColors
      : DEFAULT_TERMINAL_PREFERENCES.muteEmojiColors,
    cursorBlink: typeof record.cursorBlink === 'boolean'
      ? record.cursorBlink
      : DEFAULT_TERMINAL_PREFERENCES.cursorBlink,
  }
}

/**
 * Resolve the CSS font-family chain selected by one preference snapshot.
 * @param preferences - validated browser-local appearance values.
 * @returns quoted selected family followed by system monospace fallbacks.
 */
/**
 * Resolve the primary CSS font face selected by one preference snapshot.
 * @param preferences - validated browser-local appearance values.
 * @returns bundled or custom family name without fallback syntax.
 */
export function terminalFontName(preferences: TerminalPreferences): string {
  if (preferences.font === 'custom') {
    return preferences.customFontFamily.trim() || 'Geist Mono'
  }
  const font = TERMINAL_FONTS.find(option => option.id === preferences.font)
  if (font === undefined) throw new Error(`unknown terminal font: ${preferences.font}`)
  return font.label
}

/**
 * Resolve the CSS font-family chain selected by one preference snapshot.
 * @param preferences - validated browser-local appearance values.
 * @returns quoted selected family followed by system monospace fallbacks.
 */
export function terminalFontFamily(preferences: TerminalPreferences): string {
  const fallback = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
  const family = terminalFontName(preferences).replaceAll("'", "\\'")
  return `'${family}', ${fallback}`
}

/** Observable browser-local preference store used as a slot hook source. */
export class TerminalPreferenceStore {
  private value: TerminalPreferences
  private readonly listeners = new Set<() => void>()
  private readonly onStorage = (event: StorageEvent): void => {
    if (event.key !== STORAGE_KEY) return
    this.replace(parsePreferences(event.newValue))
  }

  constructor() {
    this.value = parsePreferences(window.localStorage.getItem(STORAGE_KEY))
    window.addEventListener('storage', this.onStorage)
  }

  /**
   * Read the current immutable preference snapshot.
   * @returns current browser-local preferences.
   */
  getSnapshot = (): TerminalPreferences => this.value

  /** Subscribe to same-tab writes and cross-tab storage changes. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /**
   * Merge, validate, persist, and publish one preference update.
   * @param patch - fields to replace before full validation.
   */
  update(patch: Partial<TerminalPreferences>): void {
    const next = parsePreferences(JSON.stringify({ ...this.value, ...patch }))
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    this.replace(next)
  }

  /** Restore and publish the package defaults. */
  reset(): void {
    window.localStorage.removeItem(STORAGE_KEY)
    this.replace(DEFAULT_TERMINAL_PREFERENCES)
  }

  /** Detach the cross-tab subscription and release listeners. */
  dispose(): void {
    window.removeEventListener('storage', this.onStorage)
    this.listeners.clear()
  }

  private replace(next: TerminalPreferences): void {
    if (JSON.stringify(next) === JSON.stringify(this.value)) return
    this.value = next
    for (const listener of this.listeners) listener()
  }
}
