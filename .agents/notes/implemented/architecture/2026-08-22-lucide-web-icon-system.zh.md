# Agent Note：Lucide Web 图标系统

Status: implemented

[English](2026-08-22-lucide-web-icon-system.md) | 中文

## Problem

已发布的 Web 客户端混用了 70 个手写 `ic_ds_*` 字形、功能局部 SVG 操作图标、Unicode 控制符号，以及少量直接的 `lucide-react` 导入。因此，通过链接版 `dsh` Web CLI 看到的侧栏、composer、消息、设置、终端和 trajectory 视图具有不同的描边粗细与视觉词汇。新增普通操作时还必须在扩展私有字形文件和引入另一种图标来源之间选择。

## Decision

Lucide 是产品自有 Web 界面图标的唯一来源。`@monotykamary/dsh-client-ui-primitives` 持有 `lucide-react` 依赖，并从 `src/icons/index.tsx` 以 Lucide 的规范组件名重新导出；消费包从 ui-primitives 导入这些名称，并传入布局所需尺寸。迁移删除 `ic_ds_*` 实现与兼容名称，不在首次打标签发布前保留别名。

功能局部操作 SVG 与 Unicode 展开／折叠符号改用对应 Lucide 组件，包括 composer 的发送／停止、权限盾牌、todo 状态、消息操作、文件控件、终端分屏／全屏控件以及 trajectory 字形。填充状态在 Lucide 组件上设置 `fill="currentColor"`，同时保留描边。

品牌图稿仍为产品专属：`FishLogo` 与 `BrandWordmark` 保留各自 SVG 几何。`DropOverlay` 与 `EmptyHero` 仍是插图，`ContextMeter` 仍是比例数据可视化；它们不是图标替代品。`verify-web-icons` 固定这些非图标 SVG 文件，拒绝其他位置新增内联 SVG、拒绝 barrel 之外直接导入 `lucide-react`，并拒绝已删除的旧组件名。

## Alternatives considered

- **让每个功能包直接依赖 Lucide**：否决，因为这会重复依赖所有权，并允许版本或导入规则漂移。零 Cordis 的 ui-primitives 包已经持有共享视觉原子，并提供单一的已发布浏览器依赖路径。
- **保留由 Lucide 支撑的 `Icon*` 兼容别名**：否决，因为首次打标签发布前没有外部消费方需要保护；别名会保留过时的设计词汇，而 Lucide 原生名称可直接在上游文档中检索。
- **在存在相近 Lucide 图标时仍保留 Figma 字形**：否决，因为保留局部近似正是本次变更要消除的不一致。产品身份图稿与非图标可视化作为明确例外保留，而不是形成可随意扩展的字形 allowlist。

## Consequences

界面全面采用 Lucide 的几何与描边粗细，因此即使控件尺寸与无障碍标签不变，浏览器快照也可能变化。现有图标位置保留显式尺寸，避免 Lucide 的 24px 默认值改变布局。新界面图标必须存在于 Lucide、由 ui-primitives 重新导出并通过 `verify-web-icons`；真正产品专属的插图或可视化需要具名的 gate 例外。
