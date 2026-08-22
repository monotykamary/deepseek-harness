# Agent Note: Durable tool mutation receipts

Status: implemented

[English](2026-08-22-durable-tool-mutation-receipts.md) | 中文

## Problem

Web Changes 面板曾从工具呈现元数据推断文件修改。这会把 UI 卡片声明当作执行证据，遗漏嵌套 Code Mode 调用，并排除呈现内容不含 diff 的修改工具。Git 状态可以列出仓库差异，却无法把已提交操作归属到具体 Session、Turn、工具调用或执行顺序。

## Decision

`ToolRunContext.recordFileMutation()` 只在工具提交工作区文件操作后记录一份分离的 `FileMutation` receipt。receipt 包含路径、文件级 `create`、`modify` 或 `delete` 操作，以及有序文本 hunk。registry 会在 post-execute 策略与内容终结之后，把已记录 receipt 附到最终 `ToolExecutionResult`，因此后续结果替换或策略阻止无法抹去已提交操作。

agent loop 为每个根执行提供所属 `{ turn, step }` location。直接调用的 receipt 存入 `tool/result`；Code Mode 把根 location 传给子分发，并把每个嵌套调用的 receipt 存入其自身 `tool/code-dispatch` 事件。外层 `run_code` 结果不会重复嵌套 receipt。

收尾轮次会把 receipt 呈现为低对比度的已更改文件卡片，而非 basename 标签 lane。卡片报告汇总行数统计，保持目录树可见，报告逐目录与逐文件统计，通过克制的文字操作统一收起文件夹，并可从标题栏或任一文件行打开完整 Changes Workbench。Workbench 把每个 disclosure 标题栏直接连接到无缝 diff 正文，不再重复路径、嵌套圆角卡片或页脚。Diff chrome 的标签由 locale 属主提供；英文界面不再继承 primitive 的中文默认值。

`@monotykamary/dsh-client-ui-deliverables` 只从这些持久 receipt 派生产出文件与已载入 Changes。呈现元数据仍可提供显示标题，但不能创建修改条目。删除会继续显示在 Changes 中，但不会生成可打开文件标签。第一方 `write`、`edit` 与 `str_replace_editor` 修改工具会在文件系统成功提交点发出 receipt。已链接的 dsh-fabric `schema_commit` 集成会在权威工作区 generation 前进后记录每个已提交事务的净文本变更。

## Verification

工具 runtime 测试固定 receipt 分离，以及 receipt 在阻止型 post-execute 决定后仍被保留。agent loop 与 Code Mode 测试固定直接和嵌套事件的持久记录及 Turn／step 归属。文件系统工具测试固定创建、完整写入、字面替换、文本删除和插入的 receipt。Deliverables 测试固定直接与嵌套 receipt 投影、删除处理、畸形 wire 数据拒绝、回放和增量更新。

## Alternatives considered

**继续从呈现 intent 派生变更。** 渲染 intent 只描述执行前后如何显示调用，并不能证明修改已经提交；它还让组合 transport 与通用修改工具依赖无关的 UI 约定。

**从 Git 状态与 diff 派生面板。** Git 可以汇总当前工作树，包括终端和外部修改，但会丢失 Session 归属、工具调用顺序、重复编辑，以及 agent 工作与外部工作的区别；它也无法用于非 Git 工作区。

**为每种修改工具增加专用 Session 事件。** 独立事件会重复排序、失败和 Code Mode 关联规则，并要求客户端知道每个修改工具名。统一的执行级 receipt API 允许任意工具报告同一持久事实。

**把嵌套 receipt 聚合到 `run_code`。** 聚合便于查看外层结果，却会在日志中重复每项操作，并抹去实际提交操作的嵌套调用。将 receipt 保留在子分发事件上可维持精确归属。

## Consequences

Session 日志无需查询 Git 或工具呈现元数据，即可按执行顺序重建 agent 发起的文本修改；后续 consumer 也能把相同 receipt 折叠成 patch 式导出或审计视图。代价是持久 receipt 中存在重复文本、每个修改工具都必须显式接入，而且终端命令、外部进程、浏览器文件编辑、二进制变更或未调用 recorder 的工具不会自动纳入。Git 仍是仓库级当前状态的权威；receipt ledger 则是已接入 Session 修改的权威。
