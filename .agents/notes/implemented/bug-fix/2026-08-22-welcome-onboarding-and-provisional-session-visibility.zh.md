# Agent Note：欢迎引导与临时 Session 可见性

状态：已实现

[English](2026-08-22-welcome-onboarding-and-provisional-session-visibility.md) | 中文

## 问题

官方欢迎界面占用了无 Session 时的 Conversation Hero，因此 Session 水合会在回访用户读完之前替换它。发行版更新页面使用了回退颜色和原生按钮，与共享深色主题 token 及控件不一致。合并后的树投影还把当前空白 Session 显示为侧边栏**新会话**卡片，尽管新会话路由仍是临时状态。

## 决策

官方品牌插件持有首个 `settings.onboarding` 条目。设置协调器在 Session 目录就绪后启动，已有 Session 变为当前项时不会关闭活动条目。欢迎界面自行持有阻塞式弹窗与应用根节点的 `inert` 生命周期；合格连接通过保留的 `ui-onboarding.welcomeNoticeVersion` 字段持久化版本 `2026-08-22.1`，其他连接仅在进程内确认。完成后，所有权转交给后续引导条目，例如 DeepSeek 凭据设置。

更新页面对卡片、标签、状态、边框和 Badge 使用共享 `--dsw-*` 主题 token，并对操作使用共享 `Button` 变体。Workspace 投影在分组、扁平与搜索视图中排除所有 `blank` Session。浏览器顺序仍可提升临时 id，使首条提示词落地后的普通行出现在预期位置，但不会渲染临时卡片。

## 考虑过的替代方案

| 替代方案 | 未采用原因 |
|---|---|
| 将欢迎界面保留在 Conversation Hero | Session 水合会在文案读完之前替换 Hero。 |
| 仅在当前 Session 为空白时保持引导 | 选择恢复的 Session 仍会关闭活动产品步骤。 |
| 将当前空白 Session 显示为侧边栏卡片 | 它会重复临时的新会话路由，并在首条提示词之前暴露操作。 |

## 验证

包测试覆盖欢迎注册、Host 与进程内确认、非空当前 Session 下的引导持续性、共享更新控件、空白行隐藏和首条提示词后的物化。无密钥 DeepSeek 引导 Web 场景会捕获欢迎弹窗、完成确认，然后继续执行凭据设置。

## 后果

欢迎文案不再与 Conversation Hero 竞争，也不会在 Session 水合时消失。欢迎版本变化时可以有意重新打开弹窗。空白 Session 仍是可寻址的运行时状态，但不会成为侧边栏导航条目。
