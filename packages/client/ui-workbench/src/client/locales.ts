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
  'empty.title': '打开面板',
  'empty.description': '选择要在右侧面板中显示的内容。',
  'empty.unavailable': '没有可用的工作台面板',
} as const

/** English workbench dictionary, checked against the Chinese key set. */
export const en: Record<WorkbenchKey, string> = {
  'title': 'Workbench',
  'add': 'Add panel',
  'close': 'Close workbench',
  'closeSurface': 'Close {name}',
  'empty.title': 'Open a surface',
  'empty.description': 'Choose what to show in the right panel.',
  'empty.unavailable': 'No workbench surfaces are available',
}
