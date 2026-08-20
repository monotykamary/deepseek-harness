/** `settings.sessionTitle` namespace dictionaries (the preference row's copy). */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  title: '自动生成会话标题',
  description: '开启后，新会话使用其当前模型自动生成一句标题；关闭时使用截断的默认标题。',
} satisfies Record<string, string>

/** The settings.sessionTitle namespace key union. */
export type SessionTitleKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  title: 'Auto-generate session titles',
  description: 'When on, new sessions get a one-line title from their current model; when off, they use the truncated default title.',
} satisfies Record<SessionTitleKey, string>
