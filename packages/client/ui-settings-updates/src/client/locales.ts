export const en = {
  nav: 'Updates', title: 'Distribution updates', channel: 'Install channel', checking: 'Checking for updates…',
  failed: 'Update check failed', retry: 'Retry', available: 'Update available', current: 'Up to date',
  check: 'Check again', update: 'Update DSH',
} as const

export const zh: Record<keyof typeof en, string> = {
  nav: '更新', title: '发行版更新', channel: '安装渠道', checking: '正在检查更新…',
  failed: '更新检查失败', retry: '重试', available: '有可用更新', current: '已是最新版本',
  check: '再次检查', update: '更新 DSH',
}

/** Translation keys owned by the Updates settings page. */
export type UpdateLocaleKey = keyof typeof en
