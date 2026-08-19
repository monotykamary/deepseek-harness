# Agent Note: Terminal latency parity

Status: implemented

[English](2026-08-19-terminal-latency-parity.md) | 中文

## Problem

浏览器 renderer 采用 LocalTerm 的 xterm 版本、WebGL 路径、输出 scheduler、scroll anchoring、Unicode 修正与 ligature 处理，但交互式 echo 仍会经过八毫秒 Host batch timer 和两层 promise-tail queue，之后才到达本地 PTY write。该 timer 可能使小型 shell echo 错过当前 compositor frame；promise-tail dispatch 则会把原本同步的 `node-pty` write 推迟到后续 microtask。Kernel PTY write 在进入 WebSocket batcher 前还会产生多次仅用于恢复同一 `Buffer` 类型的复制。后端保留文本会在每个 chunk 上 split 并重新 join 完整有界历史，原始 replay 则用 `Array.shift()` 移除 leading chunk；持续 animation 因此会累积与历史长度成比例的工作，并且在同一 PTY 内重置应用后仍会保留。

## Decision

Terminal Web 输出采用 LocalTerm 的两毫秒 trailing idle 窗口：每个 kernel fragment 都会重置 timer，达到 65,536 字节时立即刷新，`outputStreamThresholdMs` 默认把连续部分 burst 限制在 100 毫秒内。`TerminalOutputBatcher` 在 WebSocket backpressure 之外独立持有该 timing，使 fake-clock 测试固定 idle 与 stream 两种情况。不可变 Node stream buffer 会通过 raw replay 与浏览器 fan-out 路径传递，不执行仅用于恢复同一 `Buffer` 类型的复制。原始 replay 与面向行的 retention 使用 leading-trim deque：append 与 eviction 只处理新增或丢弃的 chunk，已消费 prefix 分批 compact，只有 snapshot／read 操作才拼接保留数据。

`SerialOperationQueue` 取代 Web Consumer 与终端后端中的 promise-tail serialization。首项操作在接收 task 中启动，因此本地 provider 无需 microtask 延迟即可到达同步 `node-pty.write()`。异步或远程 provider 仍会持有 queue 直至结算；后续操作保持 FIFO，单项失败不会阻塞 successor，`idle()` 仍是 teardown quiescence 点。后端 queue 对所有查看方保持权威，Web queue 则维持单个 socket 的 input、resize 与 kill 顺序。

## Consequences

小型本地 echo 会在两毫秒 idle edge 后到达浏览器，并可在当前 compositor frame 中使用已移植的有界 input 后 WebGL render 路径。连续部分输出无法无限期滞留，较大输出保留既有 size 与 backpressure 上限。Animation 成本不会再随保留文本或原始 chunk 数增长，在同一 PTY 中重新启动 animation 也不会继承全历史 append 工作。公开 queue utility 让终端 provider 与 Consumer 采用同一个排序实现，而不是维护并行 promise-tail 变体。

Predictive local echo 被有意排除。任意原生 login shell 不会向浏览器公开权威 prompt／password 状态；渲染 speculative character 可能泄露 `read -s`、password prompt 或其他 shell builtin 抑制的输入。在 shell integration 能够发布该状态且不替换用户 startup 行为之前，PTY echo 保持唯一权威。

## Verification

终端包测试固定同步首项 dispatch、失败后的 FIFO settlement、quiescence、两毫秒 trailing reset、100 毫秒 stream 上限、异步 frame 顺序、多查看方 resize 所有权、已接受 input 的 draining、跨 newline 与 UTF-8 chunk boundary 的增量 retention 等价性、deque compaction、WebSocket backpressure 与 protocol cleanup。Interactive Web terminal journey 继续作为原生 login-shell input、持久 attachment 与跨查看方输出的 assembled 测试。

## Alternatives considered

**只修改 timer 默认值。** 否决，因为 idle 本地 write 仍会经过两层 promise-tail microtask，并且每个 PTY chunk 仍会保留可避免的复制。

**在没有 shell 状态时移植 LocalTerm 的 predictive echo。** 否决，因为 normal-buffer 状态无法区分 shell prompt 与有意隐藏的输入。

**为本地 provider 移除 serialization。** 否决，因为远程 subprocess provider 与并发查看方需要统一排序规则；synchronous-first FIFO dispatch 可以消除本地延迟而不削弱该规则。
