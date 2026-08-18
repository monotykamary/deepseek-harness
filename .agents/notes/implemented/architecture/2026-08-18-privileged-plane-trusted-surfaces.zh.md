# Agent Note：特权面信任部署的表面

Status: implemented

[English](2026-08-18-privileged-plane-trusted-surfaces.md) | 中文

## 问题

`dsh web` 通过远程表面（tailnet、portless、`--trusted-host`）到达普通 `/api` 浏览器信任栅栏，但特权方法面（`packages/client/connection` 里的 `PRIVILEGED_METHODS`）拒绝了所有这些表面：那道门用空信任列表重跑了栅栏，把 settings、credentials、宿主对话框与 agent-preset 创作调用都钉在 loopback 上。部署通过 `https://dsh.localhost` 或 `https://<node>.ts.net` 访问自己的 GUI 时，能列会话，却无法加载或保存 Models 提供方目录（`settings.describe`）、编辑任何 settings 命名空间（`settings.update`）、管理凭据或创作 agent preset——这类调用一律回答 HTTP 403。[Web 身份层](../feature/2026-08-17-web-identity-sso.md) 增加了一条受认可的远程路径（运营者 Bearer 令牌），但未配置身份时，配置页在任何表面上都没有可用的通道。passkey 登录还会困住首次使用的运营者：注册或登录 passkey 会创建分区用户，而这类用户即使在 loopback 上也拿不到特权方法——只有登录页的运营者表单会保存令牌。

## 决策

像普通栅栏一样接纳特权面：**loopback 或部署实时可信列表中的任意权威**（`trustedHosts`，或 `dsh web` 派生的 tailnet/portless 权威），外加配置了身份权威时的既有运营者 Bearer 令牌授予。这道门现在读取 `connection.trustedAuthorities` 而不是硬编码空列表，晚到的派生表面无需重启便生效。两条不变量保持不变：**分区用户**（会话属主非 `null`）即使在 loopback 上也被拒绝特权方法；最外层 DNS 重绑定与跨站标记仍绑定每个调用者——授予的是部署点名信任的表面，而不是新的认证层。

这项授予是刻意的：`--tailnet`、`--portless`、`--trusted-host` 都是运营者的显式选择，跨站栅栏又挡住了恶意远程页面。部署放弃的是面向其他主体的可达性：任何能到达可信表面的设备（例如 tailnet 上的另一台机器）都能读取和修改 settings 与凭据、驱动宿主对话框、发起 `llm.discoverModels` 探测——这和部署早已授予普通 RPC 的信任是同一层。需要按用户隔离的部署仍用身份提供方来保证——分区用户整体上仍被拒于该面之外。

## 备选方案

- **保持 loopback-only 并修 UX**——否决：不配置身份时 Models/settings 页没有任何可用的远程路径，而且 passkey 登录会把用户困进即使在被信任表面上也被拒绝的分区会话。
- **仅当未配置身份时才放宽**——否决：这会让平面的形态随配置改动而翻转，而运营者令牌已是身份感知的逃生通道。
- **为分区用户另设特权面**——否决：[身份 SSO 笔记](../feature/2026-08-17-web-identity-sso.md) 已经拒绝；那会让一个租户读取或修改另一个租户的 settings 与凭据。

## 后果

- `dsh web --tailnet`/`--portless` 表面无需身份提供方即可加载和保存 Models 提供方目录，并可使用全部 `settings.*`、`credentials.*`、`host.*` 与 agent-preset 创作调用。
- 配置了身份提供方会收窄表面：分区用户（属主非 `null`）处处被拒绝；运营者层级保留 loopback、每个可信表面与运营者 Bearer 令牌。
- 表面解析与身份 SSO 笔记中“特权 /api 面保持 loopback 钉扎”的后果被取代；两者都交叉链接到本文。
- 覆盖：node-half.host.spec 断言被声明的权威现在能到达每个特权方法而未声明的权威仍 403；identity-gate.host.spec 新增 legacy 层可信表面授予并保留分区用户拒绝。