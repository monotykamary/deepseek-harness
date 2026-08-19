# Agent Note: Terminal 原子输出帧传输

Status: implemented

[English](2026-08-19-atomic-terminal-transport-frames.md) | 中文

## Problem

Host 已经会批量处理 PTY 输出，浏览器也早已批量提交 xterm 写入，但每个 binary payload 在 Host 到浏览器之间仍以独立的 replay 或 live event 调度。一次显示器 redraw（trimmed frame）因此可能在浏览器正在购买 server batch、active stamp 和 client debounce window 时与别的输出交错。聊天记录 list request 会让无关输出通过；带活动 pane 的完整终端 attachment 也可能在先前 replay bytes 之后才发送 creation `ready` control。

## Decision

把 localterm 的 atomic output transport framing 改造成现有 WebSocket protocol 的扩展，而不是改变 PTY port contract。Host 会为每个发布的 PTY event 输出一个连续的 binary `chunkId`，并用 `output-frame-start` / `output-frame-end` 划定逻辑输出帧。`attachHistory` 会在 `ready` 后立即发出一个空 bracket，让 client 结束首个 replay staging pass，同时不转发任何 bytes。Terminal-state replay 会在发布时购买 staged attachment history，并把每个 pane 的 advancement pass 标记为已交付。浏览器会把两个 control 之间的所有 payload 放入 staging buffer，拼接 bytes，并在 `output-frame-end` 上精准提交一次 xterm write；connect 前的 boundary control 会播种空 pass，而 readiness 前的 binary bytes 则继续排队。wire bound 使用调用方原先就已接受的明确 128 KiB payload-size 默认值，因此 Host 关闭 replay staging 的同时也会关闭连接。

这套 atomic framing transport policy 改编自 localterm 修订版 `8de7394eb06cf562985d8f82d5a8145863cb8ecd`；[`THIRD_PARTY_NOTICES.md`](../../../../THIRD_PARTY_NOTICES.md) 保留完整 MIT 声明。

## Alternatives considered

**改变 Host port event contract。** Agent 订阅的是 `port/output`；把每 attachment batch 一个事件改成每 atomic frame 一个事件，会为了一个 transport-only 问题改变 durable replay unit 以及所有订阅方。

**等待专用 output-id collector。** Atomicity 属于 transport protocol。Frame delimiter 可以保留现有 output event，同时保证每个 attachment 都会收到 start、payload 和 end 序列，而不需要共享 cache。

## Consequences

浏览器 attachment 在 readiness、replay 和 live delivery 期间保留 server event 顺序：`ready` 之前的 bracket control 不会与 binary payload 交错，replay 也不会把 resized split pane 从 live frame 中暴露出来。terminal list request 不再需要序列化无关 pane 的 replay。128 KiB output bound 依然明确，并以 transport error 拒绝 oversized frame，而不是写入部分 trimmed frame。Host 和 Client 的聚焦测试覆盖了 boundary presentation、creation-before-replay 顺序、oversized-stage closure、stale client server frame、非法 control rejection，并覆盖修改过的两个 transport 文件的完整语句、分支、函数与行覆盖。
