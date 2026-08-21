# Agent Note: New Session 在首条提示词之前保持为临时页面

Status: implemented

[English](2026-08-20-new-session-ephemeral-until-first-prompt.md) | 中文

## Problem

点击 New Session（壳行、Workspace 分组内的加号、hero 选择器或命令面板里的 **New Session in...**）会物化一个空白 Session，而侧边栏 Session 树会立刻把该空白会话显示为选中的「New Session」行——一个尚未开始的对话竟然出现在列表里。[Workspace 浏览器列表投影](../architecture/2026-07-25-web-client-session-scope-and-provide-channel.zh.md)刻意保留一条可见的空白行（当前 Session），并把标题强制为「New Session」；[Workspace UI 产品动线](../feature/2026-07-25-workspace-ui-product-flow.zh.md)也带有同样的条款。用户会把这一行读作已有的对话，而其占位呈现（无时间、无行操作、悬停复制只读）只是为了支撑一个导航列表本就不该展示的状态。

## Decision

Workspace 浏览器的统一可见性投影现在隐藏所有空白 Session——包括当前 Session。`sessionVisible` 去掉了 `session.id === current` 例外：分组行、平铺列表、搜索和分组计数一律无条件排除 `blank`，与早已存在的冷空白行为（[有界验证冷空白会话](../bug-fix/2026-08-13-bounded-cold-blank-verification.zh.md)）以及命令面板保持一致。New Session 因此是纯粹的临时页面：只有当会话转正——首条 `prompt()` 成功响应或 `running: true` 状态帧翻转镜像中的 `blank` 位——这一行才会出现，翻转机制与[会话作用域 Note](../architecture/2026-07-25-web-client-session-scope-and-provide-channel.zh.md) 所述保持一致。

随之移除的还有已死的占位呈现：`SessionNode` 不再携带 `blank`，`Rows.tsx` 删除本地化「新会话」标题替换以及无菜单/无时间/悬停时间守卫，`session.new` locale 键从 `ui-workspace` 中移除（侧边栏壳保留自己的 New Session 按钮文案）。host、wire 与 client 运行时均未改动：`SessionSummary.blank` 镜像语义（单调下降、`connectWorkspace` 复用资格、首条提示词被拒后的保留）保持不变。

## Alternatives considered

**保留当前的临时空白行（维持现状）。** 否决：导航列表中出现尚未开始的对话条目正是被报告的缺陷，而占位呈现（无操作、无时间）恰恰是为了支撑该状态而存在的脚手架。

**composer 出现草稿后就显示该行。** 否决：「已开始」是持久日志事实，不是本地草稿事实——草稿可以丢弃，而 host 的 `blank` 位已经精确编码了开始语义（仅在提示词被受理或运行时翻转）。

**离开页面时删除空白 Session。** 否决：空白 Session 按 Workspace 有意复用（`connectWorkspace` 复用），其他 tab 的镜像也依赖该实体存在；需要改动的只是投影。

## Consequences

任何列表表面——分组树、平铺列表、搜索结果或计数——都不再显示空白行；唯一 Session 为空白的工作区会渲染出零个子 Session 行的分组行，与冷空白情形完全一致。首条提示词被受理后该行出现。不打开 turn 的命令（例如 `/plan`）仍然不会翻转该位，因此也不会物化出行，与 host 的转正判据一致。临时页面模型现在跨表面一致：布局层早已把空白当前 Session 视为无详情 Session，命令面板也早已排除空白行。单元测试覆盖分组/平铺/搜索对当前 Session 的隐藏，keyless Web 回放 golden 也从 `lifecycle-chrome`（hero、plan-active）和 `sidebar-subagent-activity` 中删除了「New Session」treeitem。
