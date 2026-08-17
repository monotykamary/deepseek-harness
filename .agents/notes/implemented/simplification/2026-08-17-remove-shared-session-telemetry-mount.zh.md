# Agent Note: 移除共享会话遥测挂载及其 DeepSeek endpoint

Status: implemented

[English](2026-08-17-remove-shared-session-telemetry-mount.md) | 中文

## 问题

共享 dsh 基础组合包在每个 profile 中都挂载了 `@monotykamary/dsh-session-telemetry-otel`，并内建生产 collector `https://harness-telemetry.deepseeksvc.com/v1/logs`。只设置 `DSH_TELEMETRY_MODE` 而未同时覆盖 endpoint 的部署，会把完整会话内容——消息文本、工具参数和结果以及 workspace 路径——导出到 DeepSeek 的内部 collector。harness 的所有权已离开 DeepSeek，因此任何随附默认值都不得指向 DeepSeek 遥测目的地；而 env seam 授权机制（`DSH_TELEMETRY_MODE`、`DSH_TELEMETRY_OTLP_URL`、`DSH_TELEMETRY_DISABLED`）存在的唯一目的就是治理那条随附行。

## 决策

基础组合包不挂载任何遥测后端，任何随附 profile 也不再引用 `DSH_TELEMETRY_*` 环境变量。`packages/bundle/base` 删除 `session-telemetry-otel` 行及其 `@monotykamary/dsh-session-telemetry-otel` 依赖；CLI 删除 `DSH_TELEMETRY_DISABLED` 启动 patch（`resolveTelemetryPatch`）、对应 spec 以及设置它的 CI workflow 条目。遥测能力本身仍随 `dsh-session-telemetry` 与 `dsh-session-telemetry-otel` 提供：需要 OTLP 会话上报的部署自行插入条目并显式提供 `exporter.url`（上传模式缺少 URL 时插件加载即失败）。因此每个随附 profile 的 `/feedback` 确认都显示 `Session sharing is not configured.`；已挂载后端的披露由 OTel 包测试覆盖，web e2e golden 则固定新的默认文案。

[默认挂载决策](../../archived/feature/2026-07-31-web-telemetry-default-mount.md)与[默认关闭决策](../../archived/feature/2026-08-10-telemetry-default-off.md)已归档：挂载及其 env 授权机制不再随附。

## 考虑过的替代方案

**保留 DISABLED 模式挂载的行，仅移除内建 endpoint。** 不采用：一个挂载但不起作用的后端行会保留 loader surface 与 env seam，其唯一目的就是已被移除的默认值；且禁用行仍会塑造 `/feedback` 确认文案，而非更简单的未配置披露。

**保留 DSH_TELEMETRY_DISABLED 作为部署新增行的通用强制关闭开关。** 不采用：插入自己行的部署控制自己的 patch 层，可以在那里禁用它；针对一个行 id 的 CLI 开关是针对一个已不存在默认值的机制。

**连同挂载一起删除遥测包。** 不采用：seam 与 OTel 后端是自托管部署显式组合的通用 OTLP 上报；移除 endpoint 默认值后，其中已没有任何 DeepSeek 专属内容。

## 后果

- 任何随附 profile 都不导出会话数据，任何随附工件都不再命名 DeepSeek 遥测 endpoint。
- `x-deepseek-harness-*` 提供方标头是另一个 surface，由[标头显式启用决策](../feature/2026-08-17-deepseek-request-headers-opt-in.md)设为默认关闭。
- 组合 `@monotykamary/dsh-session-telemetry-otel` 的部署需在行内提供自己的 endpoint 与 mode；除非挂载 `session-telemetry/record` 规则，否则导出的是未经处理的原始捕获副本。
- CI 不再设置 `DSH_TELEMETRY_DISABLED`；打包安装与 workflow spec 删除了该固定断言。
