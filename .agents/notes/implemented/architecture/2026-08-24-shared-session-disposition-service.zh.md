# Agent Note：跨客户端界面的共享 Session disposition service

Status: implemented

[English](2026-08-24-shared-session-disposition-service.md) | 中文

## Problem

结算、取消结算、稍后提醒、唤醒和自动闲置结算最初位于 Workspace 浏览器的持久化视图 store 与组件 hook 中。该实现可以渲染一个侧栏，但 Factory 涌现工作等其他应用界面若要遵循同一 Session 生命周期，只能导入私有 React 代码、重复实现优先级与计时器，或者持久化第二份可能与侧栏漂移的答案。

## Decision

ui-workspace 客户端插件提供动态 `sessionDisposition` service，作为浏览器进程中 Session disposition 策略和手动覆盖的唯一所有者。

- `SessionDispositionContract` 暴露一个可经 renderer 绑定的 `state` observable，以及 `settleSession`、`unsettleSession`、`snoozeSession` 和 `wakeSession` 操作。公开快照包含有效已结 Session id、有效未来稍后截止时间和已唤醒 Session id；Consumer 无法取得私有的显式结算或保持活跃集合。
- `SessionDispositionService` 订阅规范 Session 列表、`ui-workspace` 设置 scope 与自身持久化覆盖。它计算 `（自动 ∪ 显式）− 保持活跃`，应用结算覆盖稍后与稍后覆盖结算的优先级，唤醒阻塞于用户的 Session，将输出限制为已列出的 Session，并同时拥有分钟级闲置重算和精确唤醒截止时间调度。它的 `ctx.effect()` disposer 会随提供该 service 的插件 fiber 移除订阅和计时器。
- 手动覆盖持久化在 `dsh.workspace.session-disposition.v1` 下。`WorkspaceViewState` 在 `dsh.workspace.view.v7` 下只保留呈现偏好：scope、分组、排序、分组展开和 shelf disclosure。预发布仓库不会迁移包含生命周期字段的 `dsh.workspace.view.v6` 文档。
- Workspace 浏览器通过 slot hook compartment 消费 service observable，并把行操作路由到 service 方法。其他客户端应用通过自身 renderer 注册绑定同一 `HostObservable`，而不是在 Cordis 代码中调用 React hook。
- Factory 只按最新 observed run 的 Session id 对 observed inbox flow 中的任务分类。已结 Session 把涌现卡片移入带取消结算操作的折叠历史 shelf；稍后或归档 Session 隐藏这些卡片；具名 flow 无论关联 Session disposition 如何都保持可见。Factory 不存储生命周期副本，并通过共享 service 恢复卡片。

## Alternatives considered

- **在 Factory 中重复实现结算与稍后推导**：否决，因为策略资格、操作优先级、唤醒时间以及未来变更会有两个所有者，并可能产生用户可见的不一致。
- **导出 Workspace 组件的私有 settlement hook**：否决，因为这会使应用组合依赖另一个组件树，并继续把策略留在呈现实现中。
- **在每个应用中分别持久化 disposition**：否决，因为同时存在的界面可能写入冲突的手动覆盖，并在重载后显示不同生命周期状态。
- **现在添加 Session log 或远程 disposition 记录**：否决，因为该生命周期仍是浏览器本地策略，不会进入模型请求，也不需要更改 wire 或持久 Session 格式。未来若要求跨浏览器同步，可以替换 service contract 背后的 Provider。

## Consequences

Workspace、Factory 和未来客户端界面观察同一份有效答案并使用同一条操作路径。ui-workspace 除 slot Consumer 外还拥有一个小型 Service Definition／Provider seam，Factory 则把 ui-workspace 声明为动态客户端依赖。service 测试固定持久化、自动结算、保持活跃行为、操作优先级、唤醒时间、交互提前唤醒、已列出 Session 过滤和 dispose；Workspace 组件测试固定 renderer 投影与操作路由；Factory Work 测试固定已结历史、取消结算、稍后／归档隐藏和具名 flow 独立性。
