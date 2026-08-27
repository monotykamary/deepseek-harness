# Agent Note: Web 默认端口冲突恢复

Status: implemented

[English](2026-08-27-web-default-port-recovery.md) | 中文

## Problem

Web profile 优先使用回环端口 3080，但一个长生命周期或单独启动的 Web 进程可能已经占用该端口。此时载体会以 EADDRINUSE 拒绝整个 Loader 树，即使 Web profile 可以安全使用另一个回环端口，并且启动完成后已经会报告实际绑定的 URL。

## Decision

webserver 配置新增可选的 `busyPort: 'error' | 'random'`，默认值为 `error`，因此通用载体 consumer 仍保持失败即报告的绑定语义。`random` 只在 EADDRINUSE 之后使用端口 0 精确重试一次；重试沿用相同的绑定宿主，实时的 `ctx.webServer.port` 会把实际结果提供给 URL 展示、信任派生和其他 consumer。

Web startup provider 在省略 `--port` 时选择 `random`，显式提供 `--port` 时选择 `error`。随附的 Web patch 把该策略传入载体。因此 `dsh web` 保留 3080 的优先选择，在默认端口被占用时恢复并打印备用 URL；显式请求的端口仍是严格要求。

## Alternatives considered

**始终把默认端口改为 0。** 放弃，因为可用时 3080 仍应是稳定的首选 URL，远程表层集成也应继续看到配置的默认值。

**在 Loader 激活前探测端口。** 放弃，因为预检存在检查时与使用时之间的竞态；应由真正的 bind 操作决定端口是否可用。

**对每个配置端口都重试。** 放弃，因为显式 `--port` 是操作员要求，静默改用其他端口会隐藏部署错误。

## Consequences

第二次普通 Web 启动不再仅因首选本地端口被占用而失败；它的 URL 行和依赖绑定的表层会使用 OS 实际分配的端口。其他 WebServer consumer 若需要该恢复行为，必须选择 `busyPort: 'random'`；非 EADDRINUSE 的监听失败仍然是致命错误。
