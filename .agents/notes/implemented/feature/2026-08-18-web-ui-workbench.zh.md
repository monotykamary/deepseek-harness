# Agent Note: Web UI workbench

Status: implemented

[English](2026-08-18-web-ui-workbench.md) | 中文

## Problem

Layout 已有可调整宽度的 Details 栏，但 `ui-conversation` 以单个已选 Tool 读取器占用了整个 slot。该读取器在组装应用中没有入口手势，因为 Tool 的 **Inspect** 会把中心视图切换到 Trajectory。因此，添加 Files、changes、Agents 或 terminal 视图，要么替换 inspector，要么把彼此无关的业务数据集中进 conversation 包。让步求解器还会在低于内联宽度下限时，把明确打开的 Details 偏好求解为零，令未来的面板动作在紧凑视口中不可见。

## Decision

`ui-workbench` 占用 layout 拥有的 `details` slot，并声明 Session 作用域的 `workbench.surface` 列表。每项功能以稳定 id、跟随 locale 的标签及 effect 范围的图标和启动器说明元数据注册自身列表 entry。Workbench 把这些注册投影为可用界面，在每 Session 的 entry store 中保存已打开和生效中的品牌化 id，并通过 `ctx.workbench.show()` 打开空面板、通过 `open(id)` 接收功能手势。服务会先拒绝未注册 id，再改变 layout 状态。

空面板会保持打开，并以居中启动器卡片展示全部已注册界面。关闭最后一个标签页会返回该启动器，而不会推断用户同时想关闭面板。标签页预留一个前置图标位置；悬停或键盘聚焦会在原位将图标换成关闭图标，因此标签文字不会位移。Immersive 界面只有在它是唯一已打开界面时才拥有顶部 chrome；打开另一界面会恢复通用标签与跨界面导航。`ui-conversation` 向其右对齐 Session utility 列表贡献右侧面板图标，并通过 `show()` 路由；功能专用操作仍是直接的 `open(id)` 快捷入口。

`ui-conversation` 用现有 chat store 注册 **Inspect**，并在该 entry 下声明 `conversation.details.tool`。Tool 的 **Inspect** 会选择调用并打开此界面。Inspector 保留 Input／Output 回退行为，并提供明确的 **在轨迹中查看** 交接，因此 Workbench 不会吸收 Trajectory 的事件账本职责。

`ui-deliverables` 注册 **Changes**。其现有 Turn Definition 会验证成功结果时的 diff intent，通过专用增量 `deliverables` Conversation target 发布变更组，并且只在 closing 边界已有可渲染更改时标记 Produced Files 行。**查看更改**会打开该标签页。已载入且成功的修改 hunk 按不同路径汇总；每个文件都是默认展开的手风琴行，显示行数统计，提供独立及全部收起控制，并保留原有的 `DiffBlock` 正文。面板明确报告已载入的 Session 窗口，不声称是 Git 工作树状态。

Layout 通过 Details owner share 传入 `column` 或 `sheet`。空间足够时，Workbench 填充内联可调整栏。明确打开的偏好若经让步求解为零，同一组件会通过共享的右侧 Sheet 渲染，而 conversation 保留完整 frame 宽度。关闭任一模式都使用 layout 拥有的回调。标签页在宿主模式翻转时保留，并且在重新加载之间保持临时状态。

空启动器、图标切换关闭按钮的标签页、面板控件与 Sheet 交互改编自 T3 Code 修订版 `a4cc1367b03ee0c1dc2b50fceac81ef5e63212e2` 的 `RightPanelTabs.tsx`、`PanelLayoutControls.tsx`、`RightPanelSheet.tsx` 和 `rightPanelStore.ts`。DSH 保留 Cordis slot 注册、Session store 生命周期和功能拥有的数据，而不采用 T3 的 route 与 Zustand 状态。

## Verification

逐文件覆盖率固定 Workbench store、展示投影、服务、空启动器、图标／关闭标签页、注册清理、右侧面板 utility、响应式 Sheet、deliverables Definition、增量 target，以及 Changes presenter 的独立与全部 disclosure 状态。无密钥 Web journey 会启动发货 Loader 组合，从页头图标打开空面板，通过卡片启动 Files，检查标签页悬停行为，并与通过 Changes 和 Inspect 的已记录变更路径一起验证内联与紧凑承载。

## Alternatives considered

**保留单一 Details occupant。** 这会保留更少 shell 代码，但每项新的右侧面板功能都必须替换已选 Tool 读取器，或者让 `ui-conversation` 成为无关领域的 registry 与数据拥有者。

**把所有右侧面板视图放进 ui-workbench。** 中央组件可以按已知 id 切换，但插件清理不会移除功能代码或状态，而且添加界面必须修改 shell。

**随 shell 一起交付 Files 与仓库 Diff。** 真正的 explorer 需要 Session 授权的文件系统约定，仓库 diff 需要 Git 能力。复用 directory-picker API 只能列目录，还会绕过执行文件系统的策略和 provider 选择。

## Consequences

Details 区域成为可叠加且 HMR 安全的插件宿主；Inspect、已载入变更 Changes 与独立拥有的 Files 功能可以共存，而无需耦合其数据。即使没有打开任何功能标签页，面板也有一个可发现的入口手势；紧凑界面的用户可以访问相同标签页，且不会损失 Chat 宽度。代价是增加一个 client 插件与服务，以及每 Session 的临时标签状态。交互式 Terminal 与 Files 以独立功能包注册；Preview、Agents 与 Git Diff 仍是独立功能工作，而不是占位标签页。
