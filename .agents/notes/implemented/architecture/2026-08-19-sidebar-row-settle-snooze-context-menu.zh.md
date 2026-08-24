# Agent Note：侧栏行的结算／稍后快速操作与右键菜单

Status: implemented

[English](2026-08-19-sidebar-row-settle-snooze-context-menu.md) | 中文

## Problem

侧栏 Session 卡片移植自 T3 Code 修订版 `a4cc1367b03ee0c1dc2b50fceac81ef5e63212e2`（卡片、项目上下文、已结 shelf），但移植时丢掉了行的两个 hover 快速操作——**结算**（对勾）与**稍后提醒**（时钟）——并保留 dsh 的省略号按钮作为唯一的行菜单触发。用户要求把这些按钮加回来，并移除省略号、改用右键菜单。

## Decision

通过插件拥有的 [`sessionDisposition` service](2026-08-24-shared-session-disposition-service.zh.md) 把手动生命周期加入 workspace 浏览器；所有行菜单移到指针处。

- **结算／取消结算**是 `SessionDispositionContract` 上的 shelf 成员操作：service 的持久化显式集合把 Session 放入与闲置策略相同的已结 shelf，保持活跃集合则把自动已结行取消结算回活跃列表（对应 T3 的 `settledOverride: 'active'`）。最终已结集合为 `（自动 ∪ 显式）− 保持活跃`。结算会清除任何稍后；公开快照只发布有效已结 id、唤醒截止时间和已唤醒 id，私有持久化则与 `WorkspaceViewState` 分离。
- **稍后提醒／唤醒**是唤醒时间记录：`snoozedUntilBySession` 把行隐藏到其独立的折叠**稍后** shelf（位于活跃列表与已结 shelf 之间），直到所选唤醒预设——1 小时后、3 小时后、今晚（仅在距 18:00 超过 1 小时时出现）、明天 9:00 或下周一 9:00——在打开时通过应用字典解析（`snooze.ts`，HH:mm 与悬浮卡片时钟一致，不做浏览器 locale 格式化）。仍在稍后的行以蓝色倒计时代替相对时间，并提供**立即唤醒** hover 操作；唤醒时刻过后，行以琥珀色**已唤醒**胶囊返回，点击胶囊或访问该 Session 即可消除。待处理交互会让稍后的行提前唤醒，且被阻塞在用户侧的行（待处理交互）既不提供结算也不提供稍后：待处理的工作永远不会被隐藏。service 同时调度分钟量化的闲置重算和最早未来唤醒截止时间，因此所有观察界面都会看到 Woke 精确翻转，而不会最多延迟一分钟。
- **快速操作**仅在 hover 时替换尾部状态 seat（T3 式交叉淡入）：活跃行为结算＋稍后提醒，已结行为取消结算，稍后行为立即唤醒。稍后时钟打开预设浮层（`Menu` 原语，portal，预设于打开时解析）。
- **右键菜单**替换两个省略号触发器。Workspace 行在指针处打开重命名／删除；Session 行打开重命名／分叉／归档以及生命周期条目（稍后为预设子菜单；结算／取消结算／立即唤醒按行状态给出），通过 `Menu` 原语的 `getAnchorRect` portal 模式与零尺寸指针矩形。未分组桶保留浏览器默认菜单。悬浮卡片与 hover 操作的固定复用现有 `menuOpen` 类，同时覆盖右键菜单与稍后浮层。
- **图标**：生命周期字形使用 ui-primitives 规范导出的 Lucide 组件（`Clock`、`Check`、`Undo2`、`AlarmClock`、`AlarmClockOff`），与 T3 侧栏一致——hover seat 中稍后时钟在前，随后是带文字标签的结算按钮（图标＋文字）。

## Alternatives considered

- **Host 侧结算状态**（T3 的服务器支撑 `thread.settle`／`thread.unsettle`／`thread.snooze`）：harness 的已结本来就是客户端派生投影，因此用户覆盖应放在它旁边由插件拥有的浏览器 service 中——无需改线协议、不影响会话日志格式，并且刷新后稳定。
- **在新按钮旁保留省略号**：用户明确要求移除省略号；右键菜单也承载 T3 在那里暴露的生命周期条目。
- **`toLocaleString` 唤醒时间标签**：因与悬浮卡片时钟相同的原因被否决——应用 locale 必须拥有文本，因此 `snooze.ts` 自行补零 HH:mm 并使用 `weekday.*` 字典键。

## Consequences

- ui-workspace README 的已结 shelf 段落与行菜单段落记录了手动生命周期；两种语言的字典新增 `actions.*`、`snooze.*`、`menu.*`、`weekday.*` 键。
- 测试：rows 与 workspace-browser spec 驱动右键菜单、快速操作、稍后浮层／子菜单、Woke 胶囊、倒计时单位以及 service 投影的 shelf 转换；`session-disposition.client.spec.ts` 覆盖持久化、自动结算、保持活跃固定、优先级、截止时刻精确唤醒、交互提前唤醒、归档清理和 dispose；`deriveShelfSets` 与 `snooze.ts` 保留直接单元 spec；`workspace-management.e2e.ts` 场景使用 `click({ button: 'right' })`。
- Web e2e 的 Session 行锚点从操作按钮属性改为结算按钮的 aria-label。
- ui-primitives 图标测试确认这些生命周期字形渲染为规范的 Lucide SVG。
