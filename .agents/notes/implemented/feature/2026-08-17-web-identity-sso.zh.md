# Agent Note: Web 身份与按用户会话分区（SSO）

Status: implemented

[English](2026-08-17-web-identity-sso.md) | 中文

## 问题

浏览器界面已经通过 [Web 远程面解析](2026-08-17-web-remote-surface-resolution.md) 到达了远程源（tailnet、portless），但 `/api` 浏览器信任栅栏是 DNS 重绑定防御，明确不是身份认证层：任何通过栅栏的调用者都能看到所有会话，特权面因为没有其他可授予的主体而只能钉在 loopback 上。共享网关——多个人访问同一个 `dsh web`——需要远程用户只能到达自己的会话、运营者层级保持完全访问，以及一套登录故事。localterm 的身份设计（其身份文档与 server 身份源码）正是这套姿态经过验证的参考实现。

## 决策

把 localterm 的身份层移植到 `dsh web`，成为新包 `@monotykamary/dsh-web-identity` 与可选的 `ctx.identity` 服务，并在这三个开放的产品决策上采用 localterm 的默认值：

- **特权面** —— 运营者层级（属主 `null`）就是特权面。认证后的非运营者用户无论来自哪个源都只能到达普通 RPC；`PRIVILEGED_METHODS` 集合还要求属主为 `null` 且（来自 loopback，或经运营者 Bearer 令牌放行）。分区用户即使在 loopback 上也拿不到特权方法——passkey 模式下运营者通过令牌工作。
- **按用户分区（而非共享）** —— 会话在创建时把持久的 `owner` 记在会话头上；`session.list`/`search` 只返回请求用户的会话；其他所有按会话寻址的 RPC 与 typert `session`/`agent` 查找对跨租户 id 一律回答 `session-not-found`，与未知 id 无法区分。
- **运营者 Bearer 令牌** —— `header`：无（`denyUnauthenticated: false`；来自受信代理、未带头部的请求即运营者层级）。`passkey`：未配置时首次启动自动生成，持久化在状态目录，只打印一次，任何来源均可通过 `Authorization: Bearer` 使用。

共发布两种提供者：**`header`**（默认 `x-forwarded-user`，只接受来自来源白名单（默认 `loopback`）的请求）与 **`passkey`**（`/auth/passkey/*` 下的 WebAuthn 注册/登录、HMAC 签名会话 Cookie、`denyUnauthenticated: true`——门禁以 401 拒绝未认证的 `/api` 请求与 WebSocket 升级，静态 `/auth` 登录页运行整个仪式）。OIDC 留待后续。

执行点：门禁位于 `client-connection` 的 `/api` 路由与两个 WebSocket 升级处（读取 `ctx.identity.admit`）；放行结果通过 `AsyncLocalStorage` 传递，供下游分发读取（api-proxy 与会话查找中的 `ctx.identity.current()` / `mayAccess`）；mux/host 流以显式参数携带升级时的属主，因为它们的监听器在请求上下文展开很久之后才触发。连接层的浏览器半边附加已存储的运营者令牌（`localStorage['dsh.operatorToken']`），并在 401 时跳转到 `/auth/passkey/login`。`dsh web` 新增 `--identity header|passkey` 旗标族（`--identity-header`、`--identity-trusted-proxy`、`--identity-registration`、`--identity-rp-name`），通过 web-app 束补丁接入。

持久化格式：`SessionHeader` 增加可选且受校验的 `owner` 字符串——JSONL 头部行与新的 SQLite `sessions.owner` 列（`SCHEMA_VERSION` 15→16）。`SESSION_FORMAT_VERSION` 依发布前立场保持 `0`（没有外部消费者、没有兼容性承诺）；版本注释中的“由写入方决定”规则约束已发布的读取器。

## 已考虑的替代方案

- **保留 loopback 钉扎、不加身份层** —— 否决：远程面保持单一权威，共享网关目标无从谈起。
- **信任任意来源 IP 的身份头** —— 否决：直接调用者可伪造头部；`trustedProxy` 白名单（默认 `loopback`）正是 localterm 设计的做法。
- **共享会话池加按用户元数据** —— 否决：分区的意义正在于此；localterm 按属主分区注册表，并把跨租户 id 呈现为 not-found。
- **为认证后的远程用户另设特权面** —— 否决：localterm 只把特权层级授予运营者（属主 `null`）；给远程用户第二个特权面会在没有用例的情况下扩大攻击面。
- **只门禁 `/api`，不管 WebSocket 升级** —— 否决：mux/host 流会泄露会话事件与工作区快照，没有门禁的流会让分区形同虚设。
- **`header` 也自动生成 `operatorToken`** —— 否决：`header` 没有门禁（代理作保），令牌会成为死配置；localterm 在此保持 `operatorToken: null`。

## 后果

- 未配置 `identity` 时插件不提供任何服务：每个请求都是运营者层级，行为与没有身份层的部署逐字节一致。
- passkey 模式下连 loopback 浏览器也必须登录（passkey 或运营者令牌）；运营者令牌生成时只打印一次，存储在 harness home 的 `identity/` 状态目录下（`auth-secret`、`users.json`、`credentials.json`、`operator-token`）。
- 实时的 `host/workspace-changed` 推送仅限运营者；分区用户的工作区选择器通过过滤后的 `workspace.list` RPC 重新建立基线（记录在包 README 的已知限制中）。
- Passkey 绑定 RP 源（loopback 与 tailnet/portless 面需要分别注册；`127.0.0.1` 不是可注册的 RP ID）。
- 此前面解析笔记中的结论“特权 /api 面保持 loopback 钉扎”已被本层取代；该笔记现已交叉链接到本文。
- 覆盖：新包内的提供者/Cookie/白名单/门禁单元套件、`identity-gate.host.spec`（真实身份插件经连接路由）、`api-proxy-identity.spec`（真实 api-proxy 上的 list/create/rename/mux/workspace 分区）、客户端半边的令牌/跳转规格、JSONL/SQLite 持久化套件中的属主往返，以及 `identity-header.e2e.ts`（真实 `dsh web` 启动按代理头分区列表/创建/历史）。
