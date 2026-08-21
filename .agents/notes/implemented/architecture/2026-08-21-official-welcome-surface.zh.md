# 官方欢迎界面

[English](2026-08-21-official-welcome-surface.md) | 中文


## 决策

常驻会话 Hero 将 `conversation.hero.welcome` 声明为 root scope 的 single slot，并只传递一个 owner 事实：当前 Hero 是否是真正的无会话落地状态。官方品牌插件与现有品牌标记一起占用该 slot，并在已经连接的空白 Session 中不渲染任何内容。

欢迎内容与 Workspace 选择和编辑器保持分离。它说明组装后产品中受 T3 启发的导航、终端和文件工作台、Fovea 代码智能以及 Fabric 执行层，但不引入重复操作。Feature 样式只消费 `ui-theme` 现有的语义 alias；该 contribution 不添加全局样式或字面量调色板。

## 结果

替代发行版可以让该 seat 保持为空，或提供自己的欢迎 occupant。会话包只拥有位置与落地状态；官方产品文案、归属信息和展示仍由 `ui-brand-official` 拥有。欢迎 occupant 在所有构建 profile 中随自己的声明安装；三个官方品牌标记仍作为事务组仅在 official profile 中安装，因此 HMR 不会留下部分官方标记组合。
