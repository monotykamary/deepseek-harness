# Agent Note: Terminal workspace groups

Status: implemented

[English](2026-08-19-terminal-workspace-groups.md) | 中文

## Problem

在 Workbench 标签行内部再嵌套终端专用标签行，会把同一面板层级呈现两次。它还会让「新建终端」看起来像 pane 局部操作，尽管新的右侧终端实际上是另一个同级面板。水平与垂直拆分仍然需要独立的 group-local 目标。

## Decision

Workbench 界面注册仍是静态插件声明，但 presentation 可以声明为 repeatable。每 Session 的 Workbench store 在这一个注册之上拥有 panel instance。每个 instance 都有稳定且会复用空缺的序号，通过已注册的 surface id 渲染，并以 owner prop 接收序号。`openNew(sessionId, id)` 会在指定 Session 中创建同级面板，`ensureCount(sessionId, id, count)` 则为已运行资源恢复足够数量的 panel instance，而无需把应用数据动态注册为 slot。

`ui-terminal` 把右侧 surface 标记为 repeatable。每个右侧终端 group 直接映射为外层 Workbench 面板，并依次标记为 Terminal 1、Terminal 2 等；「新建终端」会请求另一个 Workbench 面板。恢复时，第 N 个面板 attach 第 N 个运行中终端；每个 Session 的首次 discovery 只会执行一次面板数量恢复，因此后续活动面板切换不会重新创建用户已关闭的面板。底部位置继续在紧凑树中展示 group，「新建终端」会向活动 group 添加 pane。水平与垂直拆分控件在两个位置都始终向活动 group 添加 pane，三个 pane 是视觉上限。

每个已挂载 pane 都拥有独立 WebSocket attachment 与 xterm surface。关闭 Workbench 面板会卸载浏览器 attachment，但不会终止 Host PTY；重新打开可复用序号时可通过有界 Host replay attach。每个已打开 Workbench panel 都会保留全尺寸 body 与 xterm DOM；非活动 body 不可见且 inert，因此切换序号会直接展示已 attach 的终端，不会经过中间 canvas、list 请求或 reconnect。首次 Host list discovery 与连接建立期间保持视觉空白；list 已解析为空以及连接 error 时仍然可见且可操作。选择 pane 会转移输入焦点与 Host resize-owner 活动。全屏只改变 CSS 呈现，因此终端扩展与恢复时 attachment 和 xterm instance 都保持挂载。Group shelf 会为包括底部专属关闭操作在内的完整控件组保留足够宽度，因此显示 split pane 时不会裁切展开／恢复或其他工具栏操作；两个位置使用相同的缩进引导线与 pill 状 Group 标题。没有 shelf 时，浮动操作默认只显示一个 chevron，并通过 200 ms 的宽度与透明度 transition，在 hover、点击或键盘交互时展示始终挂载但 inert 的控件；pointer 离开与外部输入会将其收起，reduced-motion 客户端则跳过 transition。每个操作按钮都拥有持久 separator，而不依赖 sibling adjacency，因此 Tooltip 的临时 fixed sibling 不会移动工具栏 geometry。xterm surface 的四边使用同一个 inset，使外部可见 gutter 保持对称。xterm 会占用宽度的 scrollbar 始终禁用；implicit overlay thumb 只会在滚离 buffer 底部后出现，并支持 pointer 翻页与拖动，且不会改变 fit 后的列数。

Group tree、拆分控件与紧凑分段操作改编自 T3 Code 修订版 `a4cc1367b03ee0c1dc2b50fceac81ef5e63212e2`，主要参考 `ThreadTerminalDrawer.tsx` 与 `terminalUiStateStore.ts`；[`THIRD_PARTY_NOTICES.md`](../../../../THIRD_PARTY_NOTICES.md) 保留完整 MIT 声明。

## Alternatives considered

**在 Workbench 面板内嵌套终端标签。** 这种方式会重复现有面板层级，并使同级终端看起来从属于活动 Terminal surface。

**为每个 PTY 动态注册一个 Workbench surface。** Workbench 注册是具有 effect 生命周期的插件声明，而不是每 Session 的应用数据。Repeatable instance 在允许一个声明拥有多个面板的同时保留这一所有权。

**把每个 split pane 当作外层面板。** 这种方式无法同时显示拆分终端，也无法为水平与垂直操作提供 group-local 目标。

## Consequences

右侧创建会产生同级 Workbench 面板，底部面板创建继续保持 group-local，而拆分操作在两个位置都保持 pane-local。隐藏的右侧面板保留浏览器 attachment 与 xterm DOM；关闭面板会释放 attachment，同时保留 Host 进程。聚焦覆盖固定 repeatable 面板创建、序号恢复、精确面板激活、两个拆分方向、全屏恢复、implicit scrollbar 可见性与 pointer 行为、独立 IO、exit、retry 与 teardown；组装后的交互终端浏览器 journey 覆盖真实 Host 路径与不占宽度的 scrollbar geometry。
