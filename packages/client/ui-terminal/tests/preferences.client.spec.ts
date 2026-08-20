// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_TERMINAL_PREFERENCES, TERMINAL_FONTS, TerminalPreferenceStore, terminalFontFamily,
} from '../src/client/preferences.ts'
import { HARNESS_DARK, HARNESS_LIGHT, terminalTheme } from '../src/client/themes.ts'

const STORAGE_KEY = 'dsh.terminal.preferences.v1'

beforeEach(() => { localStorage.clear() })

describe('TerminalPreferenceStore', () => {
  it('loads defaults for missing, malformed, and non-object storage', () => {
    expect(new TerminalPreferenceStore().getSnapshot()).toEqual(DEFAULT_TERMINAL_PREFERENCES)
    localStorage.setItem(STORAGE_KEY, '{')
    expect(new TerminalPreferenceStore().getSnapshot()).toEqual(DEFAULT_TERMINAL_PREFERENCES)
    localStorage.setItem(STORAGE_KEY, '[]')
    expect(new TerminalPreferenceStore().getSnapshot()).toEqual(DEFAULT_TERMINAL_PREFERENCES)
  })

  it('validates persisted ids, clamps dimensions, bounds custom families, and drops legacy theme keys', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      theme: 'tokyo-night', font: 'custom', customFontFamily: 'x'.repeat(200),
      fontSize: 100, lineHeight: 0, ligatures: false, muteEmojiColors: true, cursorBlink: false,
    }))
    const store = new TerminalPreferenceStore()
    expect(store.getSnapshot()).toEqual({
      font: 'custom', customFontFamily: 'x'.repeat(120),
      fontSize: 24, lineHeight: 1, ligatures: false, muteEmojiColors: true, cursorBlink: false,
    })
    store.dispose()
  })

  it('publishes same-tab writes, deduplicates equivalent updates, resets, and disposes', () => {
    const store = new TerminalPreferenceStore()
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)
    store.update({ fontSize: 17 })
    expect(store.getSnapshot()).toMatchObject({ fontSize: 17 })
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')).toMatchObject({ fontSize: 17 })
    expect(listener).toHaveBeenCalledOnce()
    store.update({ fontSize: 17 })
    expect(listener).toHaveBeenCalledOnce()
    store.reset()
    expect(store.getSnapshot()).toEqual(DEFAULT_TERMINAL_PREFERENCES)
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(listener).toHaveBeenCalledTimes(2)
    unsubscribe()
    store.update({ cursorBlink: false })
    expect(listener).toHaveBeenCalledTimes(2)
    store.dispose()
  })

  it('accepts only its cross-tab storage key and stops after disposal', () => {
    const store = new TerminalPreferenceStore()
    const listener = vi.fn()
    store.subscribe(listener)
    window.dispatchEvent(new StorageEvent('storage', { key: 'other', newValue: '{}' }))
    expect(listener).not.toHaveBeenCalled()
    window.dispatchEvent(new StorageEvent('storage', {
      key: STORAGE_KEY,
      newValue: JSON.stringify({ ...DEFAULT_TERMINAL_PREFERENCES, theme: 'catppuccin', fontSize: 15 }),
    }))
    expect(store.getSnapshot()).toEqual({ ...DEFAULT_TERMINAL_PREFERENCES, fontSize: 15 })
    expect(listener).toHaveBeenCalledOnce()
    store.dispose()
    window.dispatchEvent(new StorageEvent('storage', {
      key: STORAGE_KEY,
      newValue: JSON.stringify({ ...DEFAULT_TERMINAL_PREFERENCES, theme: 'light' }),
    }))
    expect(store.getSnapshot()).toEqual({ ...DEFAULT_TERMINAL_PREFERENCES, fontSize: 15 })
  })
})

describe('terminal appearance resolution', () => {
  it('resolves every font family and safely quotes custom input', () => {
    const family = (font: typeof DEFAULT_TERMINAL_PREFERENCES.font, customFontFamily = '') =>
      terminalFontFamily({ ...DEFAULT_TERMINAL_PREFERENCES, font, customFontFamily })
    expect(TERMINAL_FONTS.map(font => font.id)).toEqual([
      'geist-mono', 'anonymous-pro', 'dm-mono', 'fira-code', 'ibm-plex-mono', 'inconsolata',
      'jetbrains-mono', 'roboto-mono', 'source-code-pro', 'space-mono', 'ubuntu-mono', 'custom',
    ])
    for (const font of TERMINAL_FONTS) {
      if (font.id !== 'custom') expect(family(font.id)).toContain(font.label)
    }
    expect(family('custom', "User's Mono")).toContain("User\\'s Mono")
    expect(family('custom', '   ')).toBe(family('geist-mono'))
  })

  it('resolves the two harness palettes from the app color scheme', () => {
    expect(terminalTheme('dark')).toBe(HARNESS_DARK)
    expect(terminalTheme('light')).toBe(HARNESS_LIGHT)
    expect(HARNESS_DARK.background).toMatch(/^#/)
    expect(HARNESS_LIGHT.background).toMatch(/^#/)
    expect(HARNESS_DARK.background).not.toBe(HARNESS_LIGHT.background)
  })
})
