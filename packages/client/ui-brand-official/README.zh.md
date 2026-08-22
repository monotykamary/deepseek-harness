# @monotykamary/dsh-client-ui-brand-official

[English](README.md) | 中文

本包始终注册首个 `settings.onboarding` 步骤。仅当 `DSH_CLIENT_BUILD_PROFILE` 为 `official` 时，它才会填充 `sidebar.brand.mark`、`sidebar.brand.name` 和 `conversation.hero.brand.mark`；其他构建继续使用外壳的回退品牌。

欢迎界面和由三个标记组成的事务组通过声明感知的 `slots.inject()` 安装。因此，无论本包的 row 在设置、侧边栏与会话 declarer 之前还是之后激活，都能正常工作；每项 contribution 会随其声明撤回，HMR 期间不会留下部分标记组合。Node 侧是空 Loader seat；浏览器标题仍是本包之外的构建环境职责。

欢迎界面在 Session 目录就绪后以阻塞式弹窗渲染，并在已有 Session 加载后继续挂载。具备设置资格的浏览器（包括受信任的 tailnet 访问）将当前版本持久化到 `ui-onboarding.welcomeNoticeVersion`；不具备资格的浏览器仅在当前进程内确认。它完全使用设计 token，通过卡片说明相对于上游外壳的主要扩展：受 T3 启发的 Workspace 与 Session 导航、持久终端和文件工作台、Fovea 代码图导航，以及 Fabric 类型化执行。T3 派生 UI 的归属信息继续保存在 [`THIRD_PARTY_NOTICES.md`](../../../THIRD_PARTY_NOTICES.md) 中。

## 模型体验

无。本包只贡献浏览器展示；这里没有任何内容进入模型请求。

#### KV Cache 影响

无；本包既不组装也不发送 Provider 请求。

## 已知限制与延期工作

- **本包只提供一组 occupant** —— 替代展示应由另一个占用相同 slot 的 Cordis 包提供。
- **欢迎界面仅提供信息** —— 它不会重复外壳中已经存在的 Workspace 选择、设置或 Workbench 操作。
- **浏览器标题相互独立** —— `DSH_CLIENT_TITLE` 在构建时选择标题文本，而不是通过 UI slot 选择。
