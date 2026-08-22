/** `deliverables` namespace dictionaries. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'deliverables'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'produced.changedOne': '已更改文件（1）',
  'produced.changed': '已更改文件（{count}）',
  'produced.expandFolders': '展开全部',
  'produced.collapseFolders': '收起全部',
  'produced.viewDiff': '查看差异',
  'produced.open': '打开 {name}',
  'produced.viewFileDiff': '查看 {name} 的差异',
  'changes.tab': '更改',
  'changes.description': '查看此会话中已加载的文件更改',
  'changes.title': '已更改文件',
  'changes.summaryOne': '1 个已更改文件 · +{additions} −{deletions}',
  'changes.summary': '{files} 个已更改文件 · +{additions} −{deletions}',
  'changes.expandAll': '展开所有更改',
  'changes.collapseAll': '收起所有更改',
  'changes.empty': '当前载入的会话窗口中没有文件更改',
  'changes.copy': '复制',
  'changes.copied': '复制成功',
  'changes.collapseDiff': '收起差异',
  'changes.expandDiff': '展开其余 {count} 行差异',
  'changes.showDiff': '… 其余 {count} 行',
  'changes.collapse': '收起',
  'changes.file': '个文件',
  'changes.files': '个文件',
}

/** English dictionary (same key set). */
export const en: Record<DeliverablesKey, string> = {
  'produced.changedOne': 'Changed files (1)',
  'produced.changed': 'Changed files ({count})',
  'produced.expandFolders': 'Expand all',
  'produced.collapseFolders': 'Collapse all',
  'produced.viewDiff': 'View diff',
  'produced.open': 'Open {name}',
  'produced.viewFileDiff': 'View diff for {name}',
  'changes.tab': 'Changes',
  'changes.description': 'Review loaded file changes in this Session',
  'changes.title': 'Changed files',
  'changes.summaryOne': '1 changed file · +{additions} −{deletions}',
  'changes.summary': '{files} changed files · +{additions} −{deletions}',
  'changes.expandAll': 'Expand all changes',
  'changes.collapseAll': 'Collapse all changes',
  'changes.empty': 'No file changes are present in the loaded Session window',
  'changes.copy': 'Copy',
  'changes.copied': 'Copied',
  'changes.collapseDiff': 'Collapse diff',
  'changes.expandDiff': 'Expand the remaining {count} diff lines',
  'changes.showDiff': '… {count} more lines',
  'changes.collapse': 'Collapse',
  'changes.file': 'file',
  'changes.files': 'files',
}

/** Union of this namespace's dictionary keys. */
export type DeliverablesKey = keyof typeof zh
