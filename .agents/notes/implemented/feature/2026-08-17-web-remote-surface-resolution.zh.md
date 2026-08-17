# Agent Note：Web 远程表层解析（tailnet 与 portless）

Status: implemented

[English](2026-08-17-web-remote-surface-resolution.md) | 中文

## 问题

`dsh web` 只绑定回环并只公告一个 URL。通过 `tailscale serve`（Host 为 ts.net 名称）或 portless HTTPS 别名（`dsh.localhost`）访问 GUI 时，每个 RPC 都被 /api 浏览器信任栅栏以 403 拒绝：浏览器加载出了静态外壳，但会话列表和所有其他 API 调用都被拒绝，因为该栅栏只信任回环与显式声明的 `--trusted-host` 权威。

## 决策

`web-runtime` 粘合插件新增 `tailnet` 与 `portless` 配置 flag（CLI `--tailnet` / `--portless`，默认关闭）。在 Loader 配置树结算之后——此时绑定端口与 connection 栅栏所有者都已存在——`resolveRemoteSurfaces()`（src/surfaces.ts）并行探测：`tailscale serve status --json` 加 `tailscale status --json` 推导节点 DNS 名（规范 443 Web 处理器，或 TCP HTTPS 监听器，绑定端口优先），`portless alias dsh <port> --force` 加回环 :443 存活探测（任一家族）推导 `dsh.localhost` 表层。每个探测都是尽力而为的环境检测，而非配置校验：二进制缺失、节点离线、路由不匹配或代理未运行都会产生一条启动日志警告而没有表层——绝不让启动失败，解析也绝不 reject。派生的权威经新增的 `HostConnectionHandle.addTrustedAuthority()` 进入栅栏：它与配置同走 `assertTrustedAuthority` 校验，并推入 /api 路由与 WebSocket upgrade 闭包所读的、按请求读取的实时列表（路由此前捕获的是配置数组，晚到的追加无法到达）。栅栏本身与[浏览器信任边界决策](../architecture/2026-07-28-api-browser-trust-boundary.md)保持不变：这里新增的是晚到权威入口，而不是第二套策略。校验失败的派生权威会带警告从公告中剔除，而不是悄悄放宽信任。URL 行始终以规范的 `http://127.0.0.1:<port>` 开头（监控程序解析此前缀），并随解析结果追加 `LAN`、`tailnet`、`portless` 条目。

## 备选方案

**在 connection 行应用之前把派生权威写入 `webRuntime.trustedHosts`。** 否决：表层解析是异步的（二进制探测），完成于 connection 行读取静态惰性配置表达式之后；可变的服务列表加显式 add 方法保持单一所有者与单一提交点。

**不校验直接信任派生名称。** 否决：工具输出与配置同样是不可信边界；`addTrustedAuthority` 复用 `assertTrustedAuthority`，非规范名称会被明确拒绝而不是放宽信任。

**请求的表层工具缺失时让启动失败。** 否决：这些 flag 声明的是机会式部署表层，而非必需引用；localterm 自身的解析也是警告并回退，硬失败会让回环 GUI 随缺失的第三方二进制一起倒下。

**通过绑定所有网络接口暴露 GUI（`--host 0.0.0.0`）。** CLI 已出于安全拒绝。表层 flag 保持回环绑定，并经 `tailscale serve` 或 portless 代理前置——这正是 localterm 使用的远程访问姿态。

## 后果

- `dsh web --tailnet` 解析、信任并公告 `https://<node>.ts.net`（任意 serve 端口）；`--portless` 对 `https://dsh.localhost` 做同样的事。两个 flag 都关闭时行为逐字节不变：无探测，URL 行不变。
- 特权 /api 平面保持回环固定：tailnet 或 portless 权威只能到达普通 RPC，符合栅栏姿态。[Web 身份层](2026-08-17-web-identity-sso.md) 以真实主体取代了这一固定：运营者层级（回环，或运营者 Bearer 令牌）拥有特权平面，分区用户只能到达普通 RPC。
- `HostConnectionHandle.addTrustedAuthority` 是身份层将来可复用的晚到权威入口。
- 覆盖：surfaces.spec（探测矩阵与警告路径）、web-app.spec（结算、栅栏追加、URL 行、拒绝）、node-half.host.spec（实时列表栅栏与校验）。组装应用证明：tailnet-surface.e2e 在真实启动中把 `tailscale` 垫片放到 PATH 上，断言派生名称通过栅栏而未派生的权威仍 403。
