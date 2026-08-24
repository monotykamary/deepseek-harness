# Agent Note: 树外工具调用修复 Companion

Status: implemented

[English](2026-08-24-out-of-tree-tool-call-repair.md) | 中文

## 问题

提供方与模型的工具语法可能产出这样的最终调用：语法损坏、已解析键或值中夹带语法标签，或与请求发送的 JSON Schema 不符。ToolRuntime 会在执行前正确拒绝无效参数，但可恢复的序列化错误会额外消耗一次模型往返，并可能重复发生。若在 assistant message 记录后才修复，历史与执行会不一致；若为每条修复规则修改 agent loop，则会把提供方特殊行为耦合到 Harness 发布家族。

修复语料的演进独立于 DSH 约 240 个发布包。若将其作为另一个 workspace 成员，每条规则或模型匹配模式的发布都必须参与共享版本、校验与发布周期，尽管该插件只消费既有公开扩展点。

## 决策

[`dsh-tool-repair`](https://github.com/monotykamary/dsh-tool-repair) 是外部 Cordis Bundle，也是 `@monotykamary/dsh` 应用精确固定并测试的依赖。Web 与 Headless 的安装所有模板会在 DSH base／应用层之后、Fabric 与 Fovea 之前挂载它。发行版清单、更新比较与发布校验会像处理 Fabric、Fovea 与 Factory Companion 一样处理其固定版本。

该插件包装提供方中立的 `llm/stream` waterfall，并且只调用一次 `next()`。它只解释最终的 `tool-call` block end，依据该请求中不可变的 schema 快照进行校验，并且只在 DSH 公开 JSON Schema 校验器接受唯一确定性候选项后才发出修改后的 block。任何已修改响应都会失去提供方 replay 元数据，因为这些元数据描述的是原始内容。ToolRuntime 仍会依据实时定义重新校验结果，并拥有策略与执行。

修复保持保守：平衡容器内的 JSON 语法、经配置的语法包装、完整 GLM 键值对、无效的可选 null 属性、schema 接受的字符串化集合，以及显式工具字段别名。插件绝不会编造必需值、模糊匹配键、删除未知属性，也不会补全被截断的字符串、集合、代码、命令或文件内容。经配置的语法标记若在边界规范化后仍然存在，则会按 session 与 call id 关联到一个有界的 ToolRuntime guard 交接，并在函数体之前被拒绝。

Fabric 的推导式 `run_code` 标签属于独立的呈现策略。它让装饰性元数据可选，并根据已记录代码派生标题；修复 Companion 处理提供方序列化，但不会把该标题写入模型生成的参数。

## 曾考虑的替代方案

**把修复放进 ToolRuntime 参数解析。** 否决，因为 `assistant/message` 与 `tool/call` 会保留损坏的提供方输出，而函数体取得另一份值。最终 stream block 是持久记录前第一个完整位置。

**只在 dsh-fabric 中实现修复。** 否决，因为原生调用和其他 preset 中的 Code Mode 调用具有相同的提供方来源。Fabric 拥有其呈现与压缩行为，而不拥有提供方中立的 LLM 规范化。

**把 `dsh-tool-repair` 加入 monorepo 发布家族。** 否决，因为既有 `llm/stream` 与 ToolRuntime guard API 已提供所需集成。外部精确 Companion 能保持已测试发行版的一致性，而无需让仅修复规则的发布经过每个 DSH 包。

**运行通用 JSON 修复并执行一切通过校验的结果。** 否决，因为 JSON 库可以补全被截断的命令或文件正文，而其 schema 仍可能有效。语法修复要求容器平衡，语义变化仍须经过 allowlist 并由 schema 指导。

## 后果

已安装的 DSH 依赖闭包保持可复现：每个应用版本指定一个精确修复版本，托管 profile 从安装中取得它，而不会自行固定副本。Companion 可以独立发布，因此提供方匹配模式或修复规则更新不会自动提升 DSH 包家族版本；维护者会明确选择并测试该版本。

全新的 Harness checkout 在所选 Companion 版本发布到 npm 前无法解析它。外部仓库拥有构建、100% 覆盖率、包校验及真实 profile 安装／卸载检查；这些检查通过且版本发布后，Harness lockfile 才会选择该版本。

有效调用不增加提示词、token、schema 或 KV-cache 成本，并逐字节透传。修改后的调用只改变新生成的 assistant 后缀，并丢弃 replay 元数据。不完整或含糊的工作仍表现为普通失败工具调用，而不会变成猜测出的副作用。
