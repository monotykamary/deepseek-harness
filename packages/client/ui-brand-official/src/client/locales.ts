/** English official welcome dictionary. */
export const en = {
  eyebrow: 'DeepSeek Harness',
  title: 'A complete coding-agent workbench',
  lead: 'More than an upstream chat shell: the harness brings navigation, execution, and development surfaces into one plugin-native workflow.',
  navigationTitle: 'T3-inspired navigation',
  navigationBody: 'Workspace and session organization, agent presets, lifecycle controls, and fast switching stay together.',
  workbenchTitle: 'Terminal + file workbench',
  workbenchBody: 'Persistent terminals, a session-authorized file explorer, editing, diffs, and tool inspection share one workspace.',
  foveaTitle: 'Fovea code intelligence',
  foveaBody: 'Code-graph search and focused dependency tracing help the agent navigate large repositories with less context.',
  fabricTitle: 'Fabric execution',
  fabricBody: 'Typed tools, provider integrations, and orchestration make complex agent workflows observable and extensible.',
  footer: 'Everything is a Cordis plugin — skills, workflows, subagents, providers, UI surfaces, and the harness itself.',
  continue: 'Continue',
  error: 'The acknowledgement could not be saved. Please try again.',
} as const

/** Chinese official welcome dictionary. */
export const zh: Record<keyof typeof en, string> = {
  eyebrow: 'DeepSeek Harness',
  title: '完整的编程智能体工作台',
  lead: '不止于上游聊天外壳：这个 Harness 将导航、执行与开发界面整合为一套插件化工作流。',
  navigationTitle: '受 T3 启发的导航',
  navigationBody: '工作区与会话管理、智能体预设、生命周期控制和快速切换集中在同一处。',
  workbenchTitle: '终端与文件工作台',
  workbenchBody: '持久终端、会话授权的文件浏览器、编辑、差异和工具检查共享同一工作区。',
  foveaTitle: 'Fovea 代码智能',
  foveaBody: '代码图搜索与聚焦依赖追踪帮助智能体用更少上下文浏览大型代码库。',
  fabricTitle: 'Fabric 执行层',
  fabricBody: '类型化工具、Provider 集成与编排，让复杂智能体工作流可观察、可扩展。',
  footer: '一切皆为 Cordis 插件——技能、工作流、子智能体、Provider、UI 界面乃至 Harness 本身。',
  continue: '继续',
  error: '暂时无法保存确认状态，请重试。',
}

/** Translation keys owned by the official welcome surface. */
export type WelcomeKey = keyof typeof en
