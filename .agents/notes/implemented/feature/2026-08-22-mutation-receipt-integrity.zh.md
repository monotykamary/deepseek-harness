# Agent Note: Mutation receipt integrity and repository reconciliation

Status: implemented

[English](2026-08-22-mutation-receipt-integrity.md) | 中文

## Problem

持久文件修改 receipt 已能保存文本操作事实，但会信任所有 producer 值；并行调用沿用模型结果顺序；它也无法接入 Fovea 的字节级仓库 provenance。Changes UI 可能静默省略畸形持久值；Fovea 虽能检测 shell 与外部 drift，却只通过临时前后 hash 归属名为 `write` 和 `edit` 的拦截工具。

## Decision

`FileMutation` 版本 1 携带 ToolRuntime 分配的 `commitOrder`、操作前后的完整内容 SHA-1 与 SHA-256、显示路径、文件操作和有序文本 hunk。工具提交 `FileMutationInput`；provider 提交后调用 `recordFileMutation()` 时，ToolRuntime 同步补上版本和按 Session 单调递增的顺序。恢复 Session 时，分配器从持久历史中的最大顺序之后继续。

Session append 与 seed 载入会在接受事件前验证 receipt 键、版本、顺序、hash、路径、操作和 hunk。提交顺序在整个 Session 中唯一。create 与 delete receipt 的前后 null hash 及 hunk 侧必须与操作一致。client 会再次收窄 wire 值，并按 `commitOrder` 折叠变更，因此按模型顺序发布并行结果不会覆盖提交顺序。

SHA-1 刻意与 Fovea 仓库 baseline 一致，SHA-256 则提供更强的持久字节标识。`dsh-fovea` 会消费任意直接、嵌套或第三方修改工具的最终 `tools/result` receipt，并记录其精确 SHA-1 transition；原先按工具名拦截的机制保留为旧 runtime fallback。`pi-fovea` 与 `dsh-fovea` 暴露相同的显式 transition journal API。Fovea 仍会在轮次边界 hash 仓库内容，因此 shell 与外部变更依然可检测，并保守标记为 unattributed。

## Alternatives considered

**只使用 Fovea drift。** 仓库 hash 可以检测所有字节变化，却无法保存文本 hunk、工具调用归属、嵌套归属或持久 Session 历史。

**只存储 SHA-256。** Fovea 现有 baseline 使用 SHA-1；要求第二次全仓库 hash 会让 receipt 对账引入新的索引成本。同时携带两种值可保持 drift 路径不变。

**把结果事件顺序视为提交顺序。** 并行工具结果会刻意按模型顺序发布。该顺序适合模型重建，却不能标识 provider 提交被报告的先后。

## Consequences

已接入变更现在同时具备持久文本、操作、提交顺序、字节标识、Session 归属和 Fovea 跨 Session 归属。仓库 drift 仍是完整性覆盖的权威，receipt 则是归属权威。receipt 路径仍是 provider 显示路径；大型行内 hunk 仍只受现有事件持久化上限约束；接入工具以外发生的内容变更没有文本 receipt。规范资源标识与大型内容外置仍是后续工作。
