# Agent Note: DeepSeek 请求关联标头默认关闭

Status: implemented

[English](2026-08-17-deepseek-request-headers-opt-in.md) | 中文

## 问题

每个已授权的 DeepSeek 提供方请求都携带 `x-deepseek-harness-user-id`（与遥测和反馈共享的 harness home 匿名 UUID）、调用方提供会话 id 时的 `x-deepseek-harness-session-id`，以及压缩用途调用上的 `x-deepseek-harness-compact: 1`。[请求身份决策](2026-08-11-deepseek-request-user-id-header.zh.md)在未经部署选择的情况下于每个请求发送用户 id，且首个已授权请求会顺带创建 `$DSH_HOME/.anonymous-user-id`。harness 的所有权已离开 DeepSeek，因此对提供方的出站关联必须改为显式启用。

## 决策

`dsh-llm-deepseek` 新增 `requestHeaders` 配置组，包含布尔字段 `userId`、`sessionId` 与 `compact`，全部默认关闭；该组在 `cordis.yml` 条目与 `llm-deepseek:` settings 分区中均有效（settings 编辑无需重启即可在下一个请求生效）。只有当对应字段启用、且请求携带匹配事实时，请求才发送该 harness 关联标头：`userId` 发送 `x-deepseek-harness-user-id`；`sessionId` 在存在 `GenerateOptions.sessionId` 时发送 `x-deepseek-harness-session-id`；`compact` 为 `purpose: 'compaction'` 发送 `x-deepseek-harness-compact: 1`。适配器仅在 `userId` 启用时解析匿名 id，因此关闭状态下的部署绝不会因请求而创建 `$DSH_HOME/.anonymous-user-id`。`attributionHeaders()` 的强制 `User-Agent` 归属保持不变——`requestHeaders` 只控制 harness 关联标头。

请求身份决策保持有效并随本组更新：其惰性解析与构造函数依赖机制不变，`requestHeaders` 正是其替代方案表中有意推迟的授权开关。

## 考虑过的替代方案

**用一个开关控制全部三个标头。** 不采用：用户 id 是稳定的逐用户身份，而 session-id 与 compact 标记是逐请求的运维事实；部署可能只需其一。

**用遥测后端的共享状态控制标头。** 不采用：提供方请求与遥测导出的接收方和生命周期不同；请求级字段在发出点直接表达边界。

**彻底删除这些标头。** 不采用：内部部署与已配置网关仍用它们做轨迹关联；显式启用保留了能力而不附带默认行为。

## 后果

- 除非部署显式启用，任何随附 profile 的请求都不发送 `x-deepseek-harness-*` 标头；`userId` 关闭时，提供方请求绝不会创建匿名 id。
- 测试固定三个标头的默认缺省、逐字段启用、关闭时解析器绝不会被调用，以及通过 settings 文档编辑实时启用并作用于下一个请求。
- Web Models 页的 settings 写入路径用同一 `Config` schema 校验，因此该组无需 UI 改动即可被接受；生成的配置目录会记录这些字段。
