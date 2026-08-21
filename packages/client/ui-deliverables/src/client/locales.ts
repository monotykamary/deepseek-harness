/** `deliverables` namespace dictionaries. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'deliverables'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'produced.label': '产物',
  'produced.moreOne': '+ 1 个文件',
  'produced.more': '+ {count} 个文件',
  'produced.open': '打开 {name}',
  'produced.viewChanges': '查看更改',
  'produced.showInFolder': '在文件夹中显示',
  'changes.tab': '更改',
  'changes.description': '查看此会话中已加载的文件更改',
  'changes.title': '已载入的更改',
  'changes.summary': '{changes} 次更改 · {files} 个文件',
  'changes.expandAll': '展开所有更改',
  'changes.collapseAll': '收起所有更改',
  'changes.empty': '当前载入的会话窗口中没有文件更改',
}

/** English dictionary (same key set). */
export const en: Record<DeliverablesKey, string> = {
  'produced.label': 'Produced',
  'produced.moreOne': '+ 1 file',
  'produced.more': '+ {count} files',
  'produced.open': 'Open {name}',
  'produced.viewChanges': 'View changes',
  'produced.showInFolder': 'Show in folder',
  'changes.tab': 'Changes',
  'changes.description': 'Review loaded file changes in this Session',
  'changes.title': 'Loaded changes',
  'changes.summary': 'Changes {changes} · Files {files}',
  'changes.expandAll': 'Expand all changes',
  'changes.collapseAll': 'Collapse all changes',
  'changes.empty': 'No file changes are present in the loaded Session window',
}

/** Union of this namespace's dictionary keys. */
export type DeliverablesKey = keyof typeof zh
