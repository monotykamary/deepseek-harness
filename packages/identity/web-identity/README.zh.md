# `@monotykamary/dsh-web-identity`

[English](README.md) | 中文

`dsh web` 的 Web 身份权威：一个函数插件，为每个请求解析身份，以可选的 `ctx.identity` 服务暴露给连接层做门禁，按用户分区会话，并在 passkey 模式下挂载 `/auth/*` 登录流程。未配置 `identity` 时插件不提供任何服务，每个请求都是运营者层级——行为与不安装本包完全一致。

两种提供者，沿用 localterm 身份设计确立的默认值：

- **`header`** 只信任来自受信代理来源白名单（默认 `loopback`）的代理身份头（默认 `x-forwarded-user`）。没有门禁：来自受信代理、未带头部的请求即运营者层级，因此反向代理（Cloudflare Access、Pomerium、Authelia）可以直接挡在服务器前面，无需应用内登录。
- **`passkey`** 让 dsh 通过 WebAuthn 成为自己的身份权威。`/auth/passkey/*` 下的注册/登录流程签发 HMAC 签名会话 Cookie，门禁以 401 拒绝未认证的 `/api` 请求与 WebSocket 升级。运营者 Bearer 令牌——可配置，或首次启动时自动生成、持久化到状态目录并只打印一次——可从任何来源以运营者层级进入。

每个以非运营者用户身份放行的请求都被限制在该用户的分区内：`session.list` 与搜索只返回该用户的会话，其他所有按会话寻址的 RPC 对跨租户 id 一律回答 `session-not-found`，mux/host 流只携带该用户的帧，新会话把属主持久化在会话头里，分区跨重启存活。运营者层级（属主 `null`）看到一切并保有特权方法面；分区用户即使在 loopback 上也拿不到特权方法——在 passkey 模式下运营者通过令牌工作。

连接层的浏览器半边会把已存储的运营者令牌（`localStorage['dsh.operatorToken']`，由登录页的运营者表单写入）作为 `Authorization: Bearer` 头附加，并在 HTTP 401 时跳转到 `/auth/passkey/login`。

## 模型体验

无：本包只做 HTTP 门禁与会话分区，没有任何内容进入模型请求。

#### KV 缓存影响

无：本包既不组装也不发送任何提供者请求。

## 已知限制与后续工作

- **工作区实时推送仅限运营者** —— 分区用户的工作区选择器通过过滤后的 `workspace.list` RPC 重新建立基线，而不是接收 `host/workspace-changed` 帧。
- **Passkey 绑定 RP 源** —— 在 loopback 面上注册的 passkey 不能在 tailnet/portless 面上使用，反之亦然（WebAuthn 的固有属性）；且 `127.0.0.1` 不是可注册的 RP ID（请用 `localhost` 或 tailnet/portless 的 https 源）。
- **OIDC 待后续** —— 提供者联合类型目前覆盖 `header` 与 `passkey`；OIDC 提供者将在同一签名 Cookie 之上增加重定向流程。
