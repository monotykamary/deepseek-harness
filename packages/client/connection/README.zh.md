# @monotykamary/dsh-client-connection

[English](README.md) | 中文

协议消费层：客户端插件的 apply 会挂载 `ctx.connection`（共享 API 客户端 + 当前页面的 loopback 状态 + 跟随每次握手 `host.describe` 逐请求标注的运营者可达性可观察判定 + 可观察且按 generation 生效的 `hostDescription` + 单消费方流循环启动器）；导出表层携带协议约定类型、`AbstractApiClient` 抽象，以及循环的 sink／配置类型。每次就绪握手成功后，都会在 `onConnected` 之前发布完整的 `host.describe` 值；generation 失效或显式 stop 会清空它，因此原生能力消费者不会保留已经断线的判断。重连循环使用带抖动的指数退避；文档处于隐藏状态时，代际之间暂停重试，重新可见时立即重连（已启动的 controller 首次尝试始终执行）；`stop()` 会中止当前退避或可见性等待。浏览器载体以 HTTP POST 发送 unary／respond，并为 `events.mux` 与 `events.host` 各开一条只下行的 WebSocket；进程内载体满足同一双流抽象。Host half 持有唯一 `/api` route 及其 Fetch bridge；已注册的 Typert interceptor 会先认领自己的 Remote endpoint，未认领请求再回退 API Proxy。Loopback hostname 判定逻辑留在包内部：`/api` Host fence 与 WebSocket upgrade 会直接使用它，其他客户端插件则消费派生的 `ctx.connection.isLoopback` 状态。node 半侧的 `/api` 路由让特权方法集（`host.pickDirectory`、`host.openPath`，以及整个配置面——`settings.describe`/`openDocument`/`update`/`replace`/`mutate` 与 `credentials.describe`/`set`/`unset`；读取与原生操作也在内，因为 describe 会返回已暴露的配置、打开操作会作用于 Host 桌面，而探测任意引用会报出某条凭据来自何处——以及 agent（智能体） preset 的创作面 `agentPreset.read`/`copy`/`openDocument`/`remove`，因为组装指明了一个会话所运行的插件，读取它是侦察，而 copy/remove/openDocument 管理名单并驱动宿主桌面（创作只有复制一种写入，因此这些方法都不接收组装文本或路径）；`agentPreset.list` 与 `agentPreset.select` 不在其中——名单只携带 id 与信任级别，而选择一个 preset 并不比 `session.create` 自带的 `agentPreset` 多给任何能力，何况默认 preset 本就带着 bash）限定给运营者可达面——loopback 或部署实时可信列表中的任意权威（`trustedHosts`，或 `dsh web` 派生的 tailnet/portless 权威），或配置了身份权威时的运营者 Bearer 令牌；分区用户（会话属主非 `null`）即使在 loopback 上也被拒绝。平台载体与 ConnectionController 循环属于包内部；apply 负责选择并驱动它们。下行边界见 [WebSocket 下行载体 Agent Note](../../../.agents/notes/implemented/architecture/2026-08-04-websocket-downlink-carrier.md)。

## /api 浏览器信任栅栏

node 半侧在桥接或 upgrade 前守卫 `/api` 下的每个入口（`src/api-request-trust.ts`）。每个请求——无论是否带浏览器标记——`Host` 都必须是回环地址权威，或与某个 `trustedHosts` 条目匹配：带端口的 `host:port` 条目精确匹配，不带端口的条目匹配任意端口，两侧均经 WHATWG 归一化后比较（DNS rebinding 防御）。刻意不为无浏览器标记的 HTTP 请求开捷径：明文 HTTP 下浏览器的图片与导航读取既不带 `Origin` 也不带 Fetch-Metadata，因此无标记请求仍可能是被重绑页面发起的、响应可被读走的读取，而 Host 是重绑唯一伪造不了的请求头；WebSocket 浏览器握手会带 `Origin` 并通过同一道比较。非浏览器客户端经由回环地址、部署推导的 LAN IP 字面量或已声明的权威通过同一道栅栏。当标记存在时，如附带 `Origin`，则它必须与 Host 权威完全一致；显式的 `sec-fetch-site: cross-site` 标记一律拒绝。不是纯的、规范形 `host[:port]` 权威的 `trustedHosts` 条目——即 WHATWG 解析读回后与原文不完全一致的——会让插件加载明确报错：否则解析会悄悄授权 `harness.internal/path` 这类笔误里的 hostname，或把悬空冒号、补零端口放大成任意端口授权。HTTP 失败在任何 RPC 分发之前以纯 403 应答，upgrade 失败在启动任何事件流前拒绝握手。非回环组合必须显式信任其服务权威：Web 运行时从全接口服务器配置推导 LAN IP 字面量，cordis.yml 中的 `trustedHosts` 与 CLI（命令行界面）的 `--trusted-host` flag 则声明具名权威。`dsh web --tailnet`/`--portless` 表层 flag 在配置树结算后通过 `ctx.connection.addTrustedAuthority` 追加其解析出的权威（与配置相同的规范权威校验，写入按请求读取的实时列表），因此派生的 tailnet 或 portless 名称无需重启即生效。`dsh web --host 0.0.0.0` 在远程访问具备认证层之前有意不受支持。这道栅栏是可达性策略，而不是认证；Web 载体不提供认证层。特权方法面读取同一条实时可信权威列表，因此 `--trusted-host`、`--tailnet`、`--portless` 表面无需身份提供方即可管理 settings、凭据与 agent-preset 名单；配置了身份权威时，这些方法仍对分区用户一律拒绝，并新增运营者 Bearer 令牌作为任意表面授予。决策记录：[api 浏览器信任边界 Agent Note](../../../.agents/notes/implemented/architecture/2026-07-28-api-browser-trust-boundary.md)。

## `/api` WebSocket 下行

`/api/events.mux` 与 `/api/events.host` 各接受一条 WebSocket upgrade，并只向浏览器发送对应的 `ServerRequest` 文本消息；客户端不会在这些 socket 上发送业务数据。任一 socket 结束都会使当前 connection generation 失败并重建两条流，连接就绪仍要求两条 socket 均已打开且 `host.describe` HTTP 调用成功。Host teardown 会终止两条 socket、中止各自的 source，并等待 source 清理完成后再返回。普通网络 GET 这些路径会返回 426，不保留 SSE（Server-Sent Events）回退；`toFetchHandler` 的 SSE 编解码只服务进程内同构载体。

## 受信任的自定义 WebSocket upgrade

Host Consumer 可调用 `ctx.connection.upgrade(path, handler, { authority })`，在共享 Web server 上注册一个精确的绝对 pathname。Connection 会应用与 `/api` 相同的 Host／Origin 栅栏，执行可选 Web 身份准入，并将获准的 owner／operator 信息连同原始 request、socket 与 head 字节交给 Consumer。回调执行后，Consumer 负责协议协商与已接受 socket。注册跟随调用方 fiber，并返回异步显式 disposer，因此自定义全双工协议可与两条内置下行共存，而无需共享其消息 codec。

浏览器安全的 RPC 类型保留在 client compiler face；原始 Node request／socket 类型，以及把 `upgrade` 合并进 `HostConnectionHandle` 的声明，位于 Host face。

## 模型体验

无。协议消费层只在浏览器与主机之间搬运已经组合好的消息；这里没有任何内容进入模型请求。

#### KV Cache 影响

无；该包既不组装也不发送提供方请求。

## 已知限制与暂缓事项

- **History 会恢复未附加的会话**：打开 history 可能创建宿主侧 agent，并增加首次打开的延迟；没有仅从持久化读取的路径。
- **`/api` 桥把每个请求体整体缓冲在内存里**：`maxRequestBodyBytes`（默认 160 MiB，按默认 100 MiB 图片总量上限经 base64 膨胀加信封余量得出）因此同时是单请求的驻留内存上界；要降低它而不缩小图片限额，需要流式请求体路径。
