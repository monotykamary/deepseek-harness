/** Workbench locale namespace. */
export const NS = 'workbench'

/** Workbench dictionary key. */
export type WorkbenchKey = keyof typeof zh

/** Simplified Chinese workbench dictionary. */
export const zh = {
  'title': '工作台',
  'add': '添加面板',
  'close': '关闭工作台',
  'closeSurface': '关闭{name}',
  'empty': '从“添加面板”中选择一个面板',
} as const

/** English workbench dictionary, checked against the Chinese key set. */
export const en: Record<WorkbenchKey, string> = {
  'title': 'Workbench',
  'add': 'Add panel',
  'close': 'Close workbench',
  'closeSurface': 'Close {name}',
  'empty': 'Choose a panel from Add panel',
}
