# Agent Note: T3-adapted Web conversation chrome

Status: implemented

[English](2026-08-18-t3-adapted-web-conversation.md) | 中文

## Problem

Web 会话已经让消息居中并浮动编辑器，但蓝灰画布、明亮正文、统一偏大的间距、实色输入卡片，以及永久可见的消息操作，让工具密集的长 Session 比其内容层级显得更重。紧凑视口还引入了一个与常驻侧边栏面板控件无关的带边框汉堡按钮；同时，56px 轨道中的 New Session 图标继承展开行对齐方式，偏离了其他图标的轴线。

直接复制 T3 ChatView 会替换 DSH 的 keyed Chat Node 注册表、常驻编辑器 chain、视图标签、滚动恢复、审批与提问 takeover、遥测和 Workspace 感知布局。改编必须保留这些持有者，同时让组装后的会话在桌面、平板和紧凑宽度下呈现为同一个平静系统。

## Decision

`ui-theme` 持有派生自 T3 Code 修订版 `a4cc1367b03ee0c1dc2b50fceac81ef5e63212e2` 的会话专用角色。浅色和深色画布分别为 `#fcfcfc` 与 `#0a0a0a`；中性消息、分隔线、编辑器表面、轮廓、高光、阴影、模糊、不透明度和饱和度角色补全这组配色。`ConversationRoot` 把这些角色限制在中栏，而不是替换产品全局基础调色板。

Session 标题栏保留 DSH 的标题、工具项和贡献式视图标签。其标题行通过 10px 顶部 padding、32px 行高和标签前由父级持有的 10px gap，遵循 T3 的 52px 垂直节奏；分隔线使用会话角色。AppFrame 提供三个互斥的渐进式显示状态：1024px 及以上使用由偏好控制的内联侧边栏，768–1023px 使用自动收起但可重新展开的 56px 轨道，低于 768px 时使用 T3 的 max-md drawer。紧凑操作是透明的 32px 按钮，使用与轨道相同的 18px panel-left 图标，并在标题行上居中；零宽度侧边栏轨道让会话占用完整的紧凑 frame。

Chat 流保留 748px 内容上限、780px 编辑器上限、sticky 滚动持有者、keyed Node 顺序和顶部 mask。父级 gap 为 12px。用户消息使用中性表面、16px 圆角、12px padding、80% 宽度上限和 15/24 排版。Assistant 正文使用同样的 15/24 节奏与 80% 前景色。时钟和上下文标签可以收缩并省略，因此其中不换行的元数据不会形成紧凑栏的宽度下限。用户与已结算 Assistant 的操作行继续挂载并可由键盘访问，但细指针设备只在消息 hover 或 focus 时显示；触摸和无 hover 设备始终显示这些控件。

`InputBar` 保留 textarea、菜单、dock、控件、拖放输入、宽度轴和 22px 圆角。它的实色填充改为 80% 调色板表面，并使用 T3 的浅色 12px 或深色 16px backdrop blur、饱和度、细轮廓、深色顶部高光和克制的调色板阴影。T3 有意把这层半透明玻璃置于实时时间线上方：阅读者离开末尾向上滚动时，文本可以从模糊卡片下方经过；测量后的编辑器留白确保到达末尾时仍可访问最后内容。无 Workspace 的虚线状态与所有编辑器 takeover 保持原有行为。

56px 轨道保留 36px 操作盒和现有过渡。收起态 New Session 行像身份、Search 与 Add Workspace 控件一样把 SVG 居中。会话壳持有一个 20px 顶部淡化高度；Trajectory 将其用作顶部 padding，使 sticky 工具栏从 mask 下方开始。[`THIRD_PARTY_NOTICES.md`](../../../../THIRD_PARTY_NOTICES.md) 保留已评审修订版以及完整的 T3 MIT 许可与担保文本。

## Testing

会话 CSS 测试固定 token 持有关系、作用域画布、标题节奏、编辑器玻璃效果、消息密度、紧凑元数据收缩、父级持有的间距，以及细指针操作可见性。布局、侧边栏与 Trajectory 测试固定 768px 轨道转 drawer 边界、互斥模式标记、共享面板图标、透明紧凑操作、居中的 New Session 控件和顶部淡化 padding。无密钥 `conversation-skin` Web journey 冷启动一个真实 Session，并通过组装 profile 记录浅色／深色计算颜色、三种侧边栏状态及其控件、紧凑 Chat 零溢出和 Trajectory 工具栏留白。实时 Chromium 检查覆盖深色桌面 Session 与响应式 frame 几何。

## Alternatives considered

**复制 T3 的 ChatView、MessagesTimeline 和 ChatComposer。** 这些组件结合了 T3 路由、provider 状态、Git worktree、LegendList 虚拟化和 Tailwind primitive。替换 DSH 的 slot 与 projection 持有者会让呈现层耦合到第二套运行时模型。

**把全局深色调色板改为 `#0a0a0a`。** 这会在没有评审对比度的情况下重绘设置、详情、对话框、终端与第三方插件表面。会话专用画布只在目标位置提供该层级。

**用 `display: none` 隐藏操作行。** 从布局或 accessibility 中移除操作会在 hover 时移动 transcript 几何，并让键盘发现变得不可靠。不透明度保留该行，并通过 hover 或 focus 显示；粗指针绝不会进入隐藏状态。

**把紧凑汉堡按钮保留为单独的移动端 chrome。** 独有的带边框控件让标题行显得更高，并为同一操作教授第二个符号。复用面板图标让桌面、平板和紧凑导航保持一致。

## Consequences

深色配色中的中栏明显深于侧边栏，浅色配色中的中栏则略带灰白，因此导航与会话无需更强边框也能区分。消息和工具在长 Session 中更舒适，但 15px 正文比此前的 16px 呈现更紧凑。

Backdrop filtering 比实色卡片需要更多绘制成本，但它只限于一个有界编辑器，并归约为调色板常量。hover 隐藏控件在减少静止噪声的同时保留布局占位，因此指针进入前，消息下方可能存在一条空白区域。此改编不改变任何 Session 事件、wire 字段、模型输入、store、插件注册或编辑器操作。
