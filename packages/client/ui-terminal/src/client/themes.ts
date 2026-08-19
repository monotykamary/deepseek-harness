import type { ITheme } from '@xterm/xterm'
import type { TerminalThemeId } from './preferences.ts'

/** One selectable built-in xterm theme. */
export interface TerminalThemeOption {
  readonly id: TerminalThemeId
  readonly label: string
  readonly colors: ITheme
}

const ANSI = {
  black: '#202124', red: '#e06c75', green: '#98c379', yellow: '#e5c07b',
  blue: '#61afef', magenta: '#c678dd', cyan: '#56b6c2', white: '#d7dae0',
  brightBlack: '#6b7280', brightRed: '#ff7b86', brightGreen: '#b4e391',
  brightYellow: '#ffd68a', brightBlue: '#82c7ff', brightMagenta: '#de98f2',
  brightCyan: '#7dd9e5', brightWhite: '#ffffff',
} as const

/** Built-in terminal palettes adapted for the harness workbench. */
export const TERMINAL_THEMES: readonly TerminalThemeOption[] = [
  {
    id: 'harness',
    label: 'Harness',
    colors: {
      ...ANSI,
      background: '#151516', foreground: '#d7dae0', cursor: '#f2f2f3', cursorAccent: '#151516',
      selectionBackground: '#3a3a3f', selectionForeground: '#ffffff',
    },
  },
  {
    id: 'tokyo-night',
    label: 'Tokyo Night',
    colors: {
      background: '#1a1b26', foreground: '#c0caf5', cursor: '#c0caf5', selectionBackground: '#33467c',
      black: '#15161e', red: '#f7768e', green: '#9ece6a', yellow: '#e0af68', blue: '#7aa2f7',
      magenta: '#bb9af7', cyan: '#7dcfff', white: '#a9b1d6', brightBlack: '#414868',
      brightRed: '#f7768e', brightGreen: '#9ece6a', brightYellow: '#e0af68', brightBlue: '#7aa2f7',
      brightMagenta: '#bb9af7', brightCyan: '#7dcfff', brightWhite: '#c0caf5',
    },
  },
  {
    id: 'catppuccin',
    label: 'Catppuccin',
    colors: {
      background: '#1e1e2e', foreground: '#cdd6f4', cursor: '#f5e0dc', selectionBackground: '#45475a',
      black: '#45475a', red: '#f38ba8', green: '#a6e3a1', yellow: '#f9e2af', blue: '#89b4fa',
      magenta: '#f5c2e7', cyan: '#94e2d5', white: '#bac2de', brightBlack: '#585b70',
      brightRed: '#f38ba8', brightGreen: '#a6e3a1', brightYellow: '#f9e2af', brightBlue: '#89b4fa',
      brightMagenta: '#f5c2e7', brightCyan: '#94e2d5', brightWhite: '#a6adc8',
    },
  },
  {
    id: 'light',
    label: 'Light',
    colors: {
      background: '#fafafa', foreground: '#25252a', cursor: '#25252a', cursorAccent: '#fafafa',
      selectionBackground: '#c7d8f5', black: '#202124', red: '#c53929', green: '#32813b',
      yellow: '#946b00', blue: '#2864b4', magenta: '#8f3f9f', cyan: '#0b7285', white: '#e5e7eb',
      brightBlack: '#6b7280', brightRed: '#df5143', brightGreen: '#459c50', brightYellow: '#ad8100',
      brightBlue: '#3d7acb', brightMagenta: '#a657b7', brightCyan: '#16889d', brightWhite: '#ffffff',
    },
  },
]

/**
 * Resolve one validated preference id to an xterm palette.
 * @param id - built-in theme identity.
 * @returns stable xterm color object for that theme.
 */
export function terminalTheme(id: TerminalThemeId): ITheme {
  const option = TERMINAL_THEMES.find(theme => theme.id === id)
  if (option === undefined) throw new Error(`unknown terminal theme: ${id}`)
  return option.colors
}
