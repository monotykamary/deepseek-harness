/** Interactive terminal locale namespace. */
export const NS = 'terminal'

/** Interactive terminal dictionary key. */
export type TerminalKey = keyof typeof zh

/** Simplified Chinese terminal dictionary. */
export const zh = {
  'surface': '终端',
  'openBottom': '切换底部面板',
  'launcher.description': '打开交互式持久终端',
  'new': '新建终端',
  'settings': '终端设置',
  'settings.close': '关闭终端设置',
  'close': '关闭底部终端',
  'closeTab': '关闭终端标签',
  'kill': '终止终端',
  'retry': '重试连接',
  'connecting': '正在连接终端…',
  'disconnected': '终端连接已断开',
  'empty': '没有可用的终端',
  'settings.theme': '主题',
  'settings.font': '字体',
  'settings.customFont': '自定义字体系列',
  'settings.fontSize': '字号',
  'settings.lineHeight': '行高',
  'settings.ligatures': '连字',
  'settings.emojiColors': '彩色表情符号',
  'settings.cursorBlink': '光标闪烁',
  'settings.reset': '恢复默认设置',
} as const

/** English terminal dictionary, checked against the Chinese key set. */
export const en: Record<TerminalKey, string> = {
  'surface': 'Terminal',
  'openBottom': 'Toggle bottom panel',
  'launcher.description': 'Open an interactive persistent terminal',
  'new': 'New terminal',
  'settings': 'Terminal settings',
  'settings.close': 'Close terminal settings',
  'close': 'Close bottom terminal',
  'closeTab': 'Close terminal tab',
  'kill': 'Kill terminal',
  'retry': 'Retry connection',
  'connecting': 'Connecting terminal…',
  'disconnected': 'Terminal connection disconnected',
  'empty': 'No terminal is available',
  'settings.theme': 'Theme',
  'settings.font': 'Font',
  'settings.customFont': 'Custom font family',
  'settings.fontSize': 'Font size',
  'settings.lineHeight': 'Line height',
  'settings.ligatures': 'Ligatures',
  'settings.emojiColors': 'Color emoji',
  'settings.cursorBlink': 'Cursor blink',
  'settings.reset': 'Restore defaults',
}
