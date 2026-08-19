# @monotykamary/dsh-terminal-web

[English](README.md) | 中文

该 Host Consumer 在同源 Web 客户端的 `/api/terminal` 上暴露 Agent 拥有的持久终端。它通过 `ctx.connection` 注册全双工 WebSocket upgrade，因此 Host／Origin 检查与可选身份准入会先于本包接收 socket 执行。每项操作都会解析选中的 Agent，并把授权委托给 Host 的 `ctx.terminals` 注册表；浏览器客户端无法附加模型工具创建的终端会话。

## 操作与帧

新 socket 以一条 JSON 文本握手开始：`list`、`open`、`attach` 或 `kill`。`open` 会在所选 Session cwd 中创建带位置名称的原生交互式 login shell，并转发请求的初始网格；`list` 只返回该浏览器位置拥有的终端。任意数量的 socket 都可以附加同一 PTY：每个 socket 都会收到有界 replay 与实时输出，查看方之间的输入保持有序，最近发生交互的查看方控制共享 PTY 网格。附加后的 socket 使用客户端二进制帧传送 UTF-8 终端输入，使用 Host 二进制帧传送原始 PTY 输出，并使用 JSON 文本帧传送 `resize`、`kill`、`ready`、`exit`、`pong` 或失败控制。关闭 socket 只会分离该查看方，不会终止持久进程。

输出采用 LocalTerm 的两毫秒 trailing idle 窗口与连续 burst 上限：每个 kernel fragment 都会重置 idle timer，达到 65,536 字节时立即刷新，部分 stream 会在 `outputStreamThresholdMs` 内刷新。发送方会保留不可变 stream buffer，避免中间复制。慢速浏览器会在 WebSocket 队列超过 `maxBufferedBytes` 前断开；wire 解析器会限制输入大小、握手时间和 PTY 尺寸。共享终端操作队列会同步启动 idle 输入、在异步 provider 与查看方之间保持 FIFO 顺序，并让插件释放等待 quiescence。

## 配置

| 字段 | 默认值 | 含义 |
|---|---:|---|
| `backendType` | `shell` | `open` 使用的 `ctx.terminals` 后端。 |
| `maxInputBytes` | 65,536 | 单个客户端输入／控制帧的最大字节数。 |
| `outputBatchBytes` | 65,536 | 立即刷新前可合并的最大输出字节数。 |
| `outputBatchWindowMs` | 2 | 部分输出批次的 trailing idle 延迟。 |
| `outputStreamThresholdMs` | 100 | 连续部分输出 burst 的最长持续时间。 |
| `maxBufferedBytes` | 4,194,304 | 断开前允许的 WebSocket 队列上限。 |
| `handshakeTimeoutMs` | 10,000 | 首帧截止时间。 |
| `maxCols` / `maxRows` | 1,000 | 可接受的 PTY 尺寸上限。 |

## 模型体验

无，因为该浏览器传输不会增加模型可见的输入或输出。

#### KV Cache 影响

无；WebSocket 输入不经过模型请求。

## 已知限制与暂缓事项

- 终端字节与 attachment 仅存在于进程内；Host 重启会结束所有浏览器终端。
- wire 发送未经应用层压缩的原始输出。
- 一个 socket 只附加一个终端；多个查看方共享同一 PTY 时使用独立 socket，而不是在一个 socket 上复用多个 PTY。
