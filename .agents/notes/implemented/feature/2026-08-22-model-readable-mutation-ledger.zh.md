# Agent Note: Model-readable mutation ledger

Status: implemented

[English](2026-08-22-model-readable-mutation-ledger.md) | 中文

## Problem

Web Changes 视图会呈现已提交的 `FileMutation` receipt，但原始工具结果离开模型的有效上下文后，模型无法再次查看这些持久事实。把 ledger 转换成用户可导出的 patch，需要源坐标、完整文件状态、路径规范化、存储 retention 与 patch 应用语义，这会复制版本控制系统承担的职责。当前需求更窄：让当前 Session 的模型检查之前由工具记录的意图，并在产生新的向前修改前，用普通当前文件读取进行比较。

## Decision

Host package `@monotykamary/dsh-tool-session-mutations` 注册 `changes_read`，并为外部自动化导出纯 `./ledger` 投影。该工具读取调用 agent 的完整内存 Session log，合并直接 `tool/result` 与嵌套 `tool/code-dispatch` receipt，并按持久 `commitOrder` 排序每个修改；它不从浏览器分页的 Changes 投影派生。正式 Web patch 将它挂载在 Client 持有的 `@monotykamary/dsh-client-ui-deliverables` Changes 功能旁边，无需把该 Client package 加入 Host compiler face。

不带 `commit_order` 的调用会在可选 `after_commit_order` 之后列出有界摘要。每条摘要报告路径、操作、receipt 新增与删除行，以及可用的完整内容 SHA-256 标识。带 `commit_order` 的调用返回该修改记录的 replacement hunk、hash 与路径，并用不透明 UTF-16 `offset` 分页。部署必须提供 `maxListItems` 与 `maxDiffChars`，二者控制这些上限。

每个结果都会说明 ledger 只覆盖 receipt-aware 工具修改。输出是记录的意图，不是 unified-patch 语法、仓库状态，也不能证明没有 shell 或外部编辑。模型使用普通文件系统读取检查当前内容，并把任何对账结果写成另一条普通文件修改；`changes_read` 永远不读写工作区。

正式 Web 组合会在 deliverables 插件旁按 process scope 加载该工具，因此每个 Web preset 都会看到它的 schema，执行时再解析所属 Session。没有此读取器的 headless 组合不承担 schema 成本。工具结果沿用普通 Session 记录，因此模型可见 ledger 页面无需新增 Session event 类型即可重建。

## Alternatives considered

**导出 Git-compatible patch。** 拒绝，因为正确实现需要完整 base 与 final 状态、规范路径、换行与文件 mode 语义、应用测试和存储生命周期。该范围会重新实现版本控制职责，而不是服务模型审阅。

**在 content-addressed service 中存储每个完整文件状态。** 暂缓，因为当前审阅流程可由上下文 receipt hunk 与 hash 满足，无需新增持久存储 capability 或提交后的存储失败模式。

**从浏览器 Changes 视图生成模型上下文。** 拒绝，因为浏览器 history 会分页，UI 状态也不是模型可见的持久来源。

**自动注入每个修改。** 拒绝，因为重复 diff 文本会使之后的每次请求增长。有界工具让 schema 前缀保持稳定，并只在模型需要时载入细节。

## Consequences

模型可以列出并再次查看完整 live Session 中的修改，包括嵌套 Code Mode 修改，然后通过向前写入与当前文件对账。Host 持有的 package 为 Web 模型请求增加一个固定工具 schema，并且只在调用时增加有界结果文本；完整 DSH package 构建后，外部 scheduler 可以消费 `./ledger`。现有 receipt 限制保持明确：路径是 producer display path；hunk 文本面向展示而不是可应用 patch；terminal 与外部修改缺席；持久 Session 必须先作为 live agent 载入，工具才能检查。
