# Agent Note: Reusable receipt and attachment presentation atoms

Status: implemented

[English](2026-08-23-reusable-receipt-and-attachment-atoms.md) | 中文

## Problem

conversation 树之外的已组合应用可以拥有图片草稿与 receipt-backed 任务输出，但主 chat 的附件栏、图片灯箱和已更改文件层级只能通过 conversation slot 访问。复制这些组件会分裂交互、无障碍与 receipt 投影行为。仅为读取 ledger 而导入 deliverables Node 插件，还会执行无关的提示词和工具注册代码。

## Decision

`@monotykamary/dsh-client-ui-attachment/client` 导出其 conversation slot 条目使用的纯 `AttachmentRail` 与 `ImageLightbox` atom。consumer 拥有文件、object URL 生命周期、移除、预览选择、限制与本地化标签；document 拖拽状态与 conversation 草稿所有权仍留在 slot 插件内部。

`@monotykamary/dsh-client-ui-deliverables/client` 导出 `ProducedFilesCard`。它根据持有方提供的修改组与标签，渲染与 chat 轮次尾部相同的 receipt-backed 层级。完整 diff 导航可选：chat wrapper 提供 Changes 操作；没有该目标的 consumer 会得到文件夹控制与不可交互的文件行，而不是无效按钮。

`ProducedFilesCard` 及其每一层递归 tree／group 都拥有 `width: 100%`、`max-width: 100%` 与 border-box 裁剪。缩进消耗行本身已有的宽度，而不会增加嵌套 flex item 的固有宽度，因此任意路径深度的新增／删除总数都留在卡片内。

`Menu` 接受可选的非选择型 `header`，位于内部滚动的条目视口上方。搜索 consumer 拥有查询、焦点、过滤、指针／键盘高亮与空状态行为；Menu 继续拥有 portal 定位、视口钳制、关闭与选中行为。

`@monotykamary/dsh-tool-session-mutations/ledger` 是提供 `mutationLedger`、`renderMutation`、`boundedText` 及其类型的纯 Node 入口。自动化可从已 settled 的 Session 捕获 receipt，而不会执行 deliverables 插件。每个 consumer 自行拥有持久化与模型上下文上限；ledger 仍只覆盖 receipt，不会声称包含 shell 或外部变更。

## Alternatives considered

**把 chat 组件复制到每个应用。** 这不需要新增导出，却会形成彼此独立的缩略图几何、翻页、灯箱行为、已更改文件分组与无障碍修复。

**到处导入插件根入口。** 根入口会注册模型指引与工具，并携带与 receipt 投影无关的 Cordis 依赖。纯 ledger 入口保留包所有权，同时避免这些 effect。

**让非 chat 状态经过 conversation slot。** Slot 承载 conversation 所有权与 Session scope。独立应用已经拥有草稿与持久输出，把这些状态投影到隐藏 conversation 会制造错误的生命周期耦合。

## Consequences

附件与已更改文件呈现在已组合应用间共享同一实现，嵌套总数保持在卡片内，可搜索选择器无需把输入框嵌进 menuitem 即可复用 Menu 定位，自动化也能在没有插件副作用的情况下复用修改投影。导出的 atom 扩大了包所支持的 client API，因此测试与文档会覆盖其纯 props 行为及包产物。只读已更改文件卡片会刻意省略完整 diff 操作；需要导航的 consumer 必须提供真实目标。Receipt handoff 仍不包含 shell 与外部变更，任何模型可见位置都必须说明这一限制。
