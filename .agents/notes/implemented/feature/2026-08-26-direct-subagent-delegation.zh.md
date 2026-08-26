# Agent Note: 直接与跨提供方 subagent 委派

Status: implemented

[English](2026-08-26-direct-subagent-delegation.md) | 中文

## 问题

一次性委派需要一次 parent 模型轮次以及被正确发现的工具 schema。已经明确任务的用户无法直接启动 child，而模型只能覆盖 child 的 model id：进程内 child 会继承 parent provider，因此无法表达对另一 provider 所服务模型的委派。Factory 与 Workflow 可以调度工作，但一个独立任务不需要其持久图与编排状态。

## 决策

`@monotykamary/dsh-tool-subagent` 在同一个已配置 subagent 传输与 child 策略上拥有两个 Consumer。

面向模型的工具接受可选的 child LLM `provider` 与 `model` 参数。只传 `model` 会覆盖已配置或继承 provider 上的 model。调用时传 `provider` 必须同时传 `model`；这对字段会在 subagent 服务组合 child 之前覆盖 `agentOptions`。已配置的 `provider` 仍选择 subagent 传输，因此 LLM 路由不会改变新建与 fork 语义。

可继续实例可以配置 `commandName`。当 `ctx.commands` 存在时，插件会在与其工具相同的作用域注册 `/delegate [--provider <id> --model <id>] [--fork] <task>`。该命令把文本和已准入图片直接发送给 `ctx.subagents.startContinuable()`，在 inbox 接受后返回，不会打开 parent 模型轮次。`commandForkProvider` 提供可选的 `--fork` 传输。插件 teardown 会先移除命令准入，再排空已经开始的启动；语法错误返回命令错误，因此 composer 会保留草稿与图片。

基础 bundle 只在其新建可继续实例上配置 `commandName: delegate`；其中 fork 不可用，因为该 fork 工具有意保持一次性。已交付的 Web standard、code 与 cordis preset 会配置 `commandForkProvider: fork`，因为其 fork provider 可继续。Minimal 既不组合该命令，也不组合委派工具。

## 考虑过的替代方案

**所有直接委派都使用 Factory 或 Workflow。** 否决，因为一个任务不需要依赖图、lease、重试调度器、worktree lane 或多 agent 编排记录。当工作确实需要这些能力时，它们仍然可用。

**创建独立命令包。** 否决，因为它会复制一个 `tool-subagent` 实例已经解析的传输、深度、persona、工具过滤器与 child 路由策略。可选的 `ctx.commands` 注入让无 UI 组合保持独立，而无需复制策略。

**把路由编码为一个 `provider/model` 字符串。** 否决，因为 provider 拥有的 model id 可能包含斜杠。独立字段会保留确切 id，并让必需字段对可由代码强制执行。

**在核心 Consumer 中解析部署别名。** 否决，因为 Harness 中不存在 provider-neutral 的别名 Service Definition。该操作接受确切路由；别名提供方可以增加独立解析器，而无需让 subagent 服务依赖某个部署 bundle。

## 后果

- 同 provider 委派可以只覆盖 `model`；跨 provider 委派需要同时提供两个字段。
- `/delegate` 不消耗 parent 模型 token。child 运行普通的可继续轮次，之后 parent 会收到标准结算通知。
- 人类命令输入由命令生命周期记录，child 会话仍是其提示词、路由、工作与结果的持久来源。
- 包测试固定路由校验、持久 child 请求头、命令生命周期、语法失败与 HMR dispose；基础 bundle 测试固定已交付的 `commandName` 行。
