import type { ITheme } from '@xterm/xterm'

/** Terminal color scheme, resolved from the app appearance (light/dark/system). */
export type TerminalColorScheme = 'light' | 'dark'

const DARK_ANSI = {
  black: '#202124', red: '#e06c75', green: '#98c379', yellow: '#e5c07b',
  blue: '#61afef', magenta: '#c678dd', cyan: '#56b6c2', white: '#d7dae0',
  brightBlack: '#6b7280', brightRed: '#ff7b86', brightGreen: '#b4e391',
  brightYellow: '#ffd68a', brightBlue: '#82c7ff', brightMagenta: '#de98f2',
  brightCyan: '#7dd9e5', brightWhite: '#ffffff',
} as const

const LIGHT_ANSI = {
  black: '#202124', red: '#c53929', green: '#32813b', yellow: '#946b00',
  blue: '#2864b4', magenta: '#8f3f9f', cyan: '#0b7285', white: '#e5e7eb',
  brightBlack: '#6b7280', brightRed: '#df5143', brightGreen: '#459c50',
  brightYellow: '#ad8100', brightBlue: '#3d7acb', brightMagenta: '#a657b7',
  brightCyan: '#16889d', brightWhite: '#ffffff',
} as const

/** Harness dark palette, active while the app appearance resolves to dark. */
export const HARNESS_DARK: ITheme = {
  ...DARK_ANSI,
  background: '#151516', foreground: '#d7dae0', cursor: '#f2f2f3', cursorAccent: '#151516',
  selectionBackground: '#3a3a3f', selectionForeground: '#ffffff',
}

/** Harness light palette, active while the app appearance resolves to light. */
export const HARNESS_LIGHT: ITheme = {
  ...LIGHT_ANSI,
  background: '#fafafa', foreground: '#25252a', cursor: '#25252a', cursorAccent: '#fafafa',
  selectionBackground: '#c7d8f5',
}

/**
 * Resolve the resolved app color scheme to an xterm palette. The terminal has
 * no user-chosen theme: it follows the app appearance (light/dark/system).
 * @param colorScheme - resolved active app color scheme.
 * @returns stable xterm color object for that scheme.
 */
export function terminalTheme(colorScheme: TerminalColorScheme): ITheme {
  return colorScheme === 'light' ? HARNESS_LIGHT : HARNESS_DARK
}
