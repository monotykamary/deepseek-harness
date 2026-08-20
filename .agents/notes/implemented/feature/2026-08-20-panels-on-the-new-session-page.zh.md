# Agent Note: 新会话页可用的面板

Status: implemented

[English](2026-08-20-panels-on-the-new-session-page.md) | 中文

## 问题

空白新会话页——新会话操作在第一条提示之前打开的空白 Session——会隐藏整个会话页头，并把空白 Session 视为不拥有 Details 区域，因此底部终端和右侧工作台在第一条消息之前完全不可达。Details 缩放边界的悬停提示是 12x32 的浮动胶囊，与底部拆分 32x2 的发丝条相比过于醒目，而侧边栏边界完全没有提示。

## 决策

- AppFrame：任何当前 Session 都拥有 Details 区域，包括空白 Session。选择不同会话（含空白会话）仍会在绘制前关闭 Details；无会话的空状态仍把渲染宽度派生为零，且不触碰存储的偏好。
- ConversationSessionHeader：空白 hero 渲染精简页头——只保留 `conversation.session.header.utilities` 席位、右对齐，去掉标题行、操作、标签页与底部分隔线。同一组件、一个 `reduced` 分支，让同一套页头同时服务完整会话与新会话页。
- session-log-export：Session 为空白时隐藏 Session log 按钮，因为此时还不存在可导出的持久日志。
- 两个栏边界与底部拆分共用同一种拖拽提示：8px 命中条带，外加垂直居中的 2x32 发丝条（`--dsw-alias-border-l3`），在悬停所属栏、条带本身或拖拽时淡入。这恢复了[已归档的简化](../../archived/simplification/2026-07-30-sidebar-resize-without-visible-pill.md)移除的侧边栏提示——该归档记录的目标（侧边栏边界上没有醒目的胶囊）仍然成立，因为发丝条与底部拆分的提示一样微妙。

## 后果

用户可以直接从新会话页打开底部终端与右侧工作台。在宿主为空白会话实例化 agent 时，终端会附着到该空白会话；没有 agent 的宿主（回放 scaffold）会显示终端自身的错误／空状态，而不是隐藏面板。精简页头去掉了面包屑与操作；工作区名仍显示在 hero chip 中，第一条消息落地后页头会扩展为完整页头。

## 验证

app-frame 单元 spec 固定空白 Session 的 Details 资格与切换即关闭规则；skeleton spec 固定仅工具区的精简页头；session-log-export spec 固定空白时隐藏按钮。无密钥 web 通道在 `details-session-lifecycle` 中扩展了新会话面板流程（开关可达、右侧面板以约定宽度打开、底部面板可切换），并刷新 handles、lifecycle-chrome hero/plan-active/reloaded、goal-command 与 agent-preset 页头金样至当前页头组合（Files 操作、面板开关、精简 hero 横幅）。

## 备选方案

**在空白 hero 显示完整页头。** 拒绝：产品只想要两个面板按钮，不要菜单边框、面包屑或操作。

**把面板开关移入 hero 主体。** 拒绝：页头工具区是它们既有的归宿，且页头已为该会话挂载；复制开关会把一个手势拆到两个表面。

**在页头侧过滤 utilities 席位来隐藏 Session log。** 拒绝：utilities 席位是独立注册方的列表；每个条目知道自身的有效性，且无论谁渲染该席位，空白 Session 都没有持久日志。
