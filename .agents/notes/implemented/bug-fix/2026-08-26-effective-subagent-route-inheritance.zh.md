# Agent Note: subagent 有效路由继承

Status: implemented

[English](2026-08-26-effective-subagent-route-inheritance.md) | 中文

## 问题

进程内子 agent 过去继承 `parent.options.provider` 与 `parent.options.model`。这些字段是创建时回退值，不一定是父级当前使用的路由：Web 会安装可变的每会话模型选择，请求 waterfall 也可以在模型发起委派前解析出另一条路由。因此，正在运行已选模型的父级可能仍在部署默认模型上启动子级。可继续创建还会在提供方准备前派生描述符字段，却在准备后重新计算 Agent options；父级并发切换可能使冷恢复路由与初始子级不一致。

## 决策

`@monotykamary/dsh-agent` 让 `installModelSelection()` 在 `ctx.agents` 中注册 Agent 作用域来源，并公开 `resolveAgentModelSelection(agent)` 解析器。注册表以稳定的 `Session` 对象作为来源键，因此同一 Agent 的不同作用域代理会汇合；注册 dispose 时只删除该确切来源。Agent 运行时，活跃已组装步骤捕获的模型选择优先；Agent 空闲时，在线的下一步骤模型选择优先。没有带作用域的来源，或来源未声明模型选择时，解析依次回退到最新持久化 `request/header` 与完整静态 Agent options。来源返回分离值，并在 Agent 变为空闲时清除已组装值。

共享进程内子级解析器会先采用这组有效 provider/model，再采用父级静态字段，然后叠加显式子级 `agentOptions` 并写入委派深度。一次性 spawn 与可继续 spawn/fork 都使用同一辅助函数。可继续创建会在第一次等待提供方之前只解析一次，并把同一个对象用于 Agent 创建与描述符 provider/model 字段；即使父级并发切换，冷恢复仍保留已选路由。

## 考虑过的替代方案

**继续读取 `Agent.options`。** 拒绝，因为 Web 与请求 waterfall 会有意遮蔽创建默认值，而不会修改这些字段。

**直接从 `Agent.ctx` 提供 `ctx.agentModelSelection`。** 拒绝，因为 `Agent.ctx` 通过 dsh-scope 限定注册作用域，但不会创建独立的 Cordis 服务 realm；并发 Agent 会在同一服务键上冲突。共享注册表改用每个 Agent 稳定的 `Session` 对象。

**只读取最新请求 header。** 拒绝，因为 `/delegate` 可能在空闲空白会话具有尚未产生请求的进程内模型选择时运行。

**在提供方准备后再次解析。** 拒绝，因为提供方准备是异步过程；较晚的父级模型选择属于较晚的父级步骤，不得让子级初始路由与持久描述符分裂。

## 后果

- 省略子级 provider/model 时，运行步骤会继承发起委派的模型；`/delegate` 在空闲时则继承下一步骤已选模型。
- 显式工具参数、命令 flag 与已配置子级选项仍然覆盖继承值。
- 父级运行步骤期间发生的模型切换用于之后的父级工作，不会追溯性重定向由活跃模型启动的子级。
- 可继续描述符会在提供方工作前持久化已解析 provider/model，因此冷恢复会重建原始路由。
- 无密钥组装快照让静态为 flash 的父级实际通过 pro 路由，并证明生成子级的描述符与请求也使用 pro。
