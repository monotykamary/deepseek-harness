# Agent Note: T3-adapted Web sidebar hierarchy

Status: implemented

[English](2026-08-18-t3-adapted-web-sidebar.md) | 中文

## Problem

Web 侧边栏虽然已经提供正确的 DSH 操作，却压平了信息层级：New Session 是抬升的胶囊按钮，搜索藏在展开图标之后，紧凑的单行 Session 行无法同时展示 Workspace 上下文、标题、执行 preset、实时状态与时间。T3 Code 展示了一种更安静的导航层级：持续显示搜索、明确的项目作用域、稳定的多行 thread 卡片，以及只用于 hover、焦点和路由选择的表面。

直接复制 T3 的单体 Sidebar 会绕过 DSH 的运行时 slot 组合、类型化对象层、Workspace 分组、持久化拖拽记账以及 locale／插件所有权。因此，改编必须保留 DSH 行为，同时统一视觉层级与交互节奏。

## Decision

`ui-sidebar` 继续持有可调整宽度的栏、折叠状态机、身份展示、New Session、浏览器 slot 与页脚 slot。展开态 chrome 使用 8px 内容节奏、48px 身份行、32px 且半径 8px 的控件，以及唯一一行安静的 New Session 操作。字标只用于身份展示，不再作为第二个 New Session 操作；现有 56px 轨道与滑动／交叉淡化仍是 DSH 行为。

`ui-workspace` 渲染持续显示的 32px Search 行，其后是包含视图选项与添加工作区操作的「所有工作区」或「所有会话」作用域行。搜索保留现有的即时元数据筛选、250 ms 可中止内容请求、500 个 UTF-16 代码单元上限、过期结果拒绝，以及折叠后的查询保留。轨道 Search 控件会展开侧栏，并在 300 ms 滑动结束后聚焦已挂载的输入框。

分组和单列表模式下，每条可见 Session 都使用同一张最小高度 78px 的卡片。`SessionNode` 从运行时 `SessionSummary` 投影 Workspace 标签与可选 agent preset；卡片依次渲染 Workspace 加主要状态或时间、持久化标题、preset 加时间。待处理交互、运行状态、后代活动与未查看完成提醒保留既有优先级。Hover 或键盘焦点只会把尾部状态 seat 换成操作，当前路由使用 active-row 角色，因此交互 chrome 出现时文字不会移动。

`ui-theme` 在两套配色中持有四个共享角色：侧边栏控件填充、图标墨色、行 hover 与行 active。功能 CSS 只消费这些角色，不写字面颜色或主题选择器。这些角色与层级改编自 T3 Code 修订版 `a4cc1367b03ee0c1dc2b50fceac81ef5e63212e2`；[`THIRD_PARTY_NOTICES.md`](../../../../THIRD_PARTY_NOTICES.md) 保留完整的 T3 MIT 许可与担保免责声明文本。

## Testing

Sidebar 与 Workspace 组件套件钉住仅用于身份展示的字标、唯一 New Session 操作、明暗 token 对及其消费方、持续 Search、轨道聚焦、卡片元数据、状态优先级、操作菜单、拖拽行为与折叠快照。生命周期浏览器 replay 通过真实 Web profile 记录组装后侧边栏的 Search、所有工作区与 Session 卡片语义；真实 Chromium 检查覆盖明暗配色中的选中卡片和恢复后的折叠轨道。

## Alternatives considered

**复制 T3 Sidebar 组件及其依赖。** T3 组件把路由、项目、thread 生命周期、Electron chrome、store、Tailwind 与 UI primitive 合在同一棵树中。导入它会建立第二套组合和状态系统，而不是把交互模型改编到 DSH slot 与运行时 hook 上。

**只重绘紧凑行，不改变标记。** CSS 无法让 Search 持续可聚焦，也无法给 Workspace、状态、标题、preset 与时间提供独立的截断和操作 seat；这种做法只会复制颜色，保留层级问题。

**把所有 Workspace 压平为一条 T3 式 thread 流。** DSH Workspace 行持有创建、重命名、删除、展开、Host 持久化 Workspace 顺序，以及按记账区分的 Session 拖拽语义。移除这些行会隐藏现有产品操作，或把它们迁入没有当前需求的新选择器。

**让字标继续作为第二个 New Session 快捷操作。** 身份展示与创建会继续成为两个可访问名称相同、难以区分的控件。唯一的专用操作更清楚，也与改编后的菜单层级一致。

## Consequences

侧边栏无需额外手势即可暴露搜索与项目作用域，选中和运行中的工作以卡片呈现，同一张卡片在切换到单列表后仍然可理解。业务数据与操作仍位于运行时和 Workspace 插件中；这次呈现改写没有新增订阅、store、传输字段或 session event。

卡片每屏显示的 Session 少于 32px 行，因此现有五行分组上限与「展开其余」控件更重要。分组模式会在每张卡片中重复 Workspace 上下文，以部分密度换取与单列表、搜索结果共享的稳定卡片身份。生成的第三方声明是命令面板与侧边栏两项改编的法务事实来源。
