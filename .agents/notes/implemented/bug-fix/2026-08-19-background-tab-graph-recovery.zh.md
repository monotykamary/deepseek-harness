# Agent Note: Background tab graph recovery

Status: implemented

[English](2026-08-19-background-tab-graph-recovery.md) | 中文

## Problem

Chromium 可能暂停后台标签的 EventSource。如果开发 Host 在暂停期间重启或重建多个客户端插件，该标签会错过有序 HMR 帧。重新连接当前 stream 无法回放这些帧，之后的依赖方 reload 可能 dispose root slot provider，却无法成功重建它，最终只留下空白应用 canvas。

## Decision

HMR 浏览器会比较每个连接时的 `graph` 帧与 `window.__DSH_BOOT__` 中嵌入的完整图 revision。Revision 相等时继续普通的逐插件 HMR；revision 不同时只 reload document 一次，从当前 Host 获取一致 manifest 与完整 bundle roster。不可 reload 的 Web boot kernel 还会观察其自有 mount point 的 child list 与 document visibility：可见时变空的 `#root` 会立即 reload，隐藏时变空的 `#root` 会在重新可见时 reload，因为两者都违反 AppRoot 生命周期 invariant；即使可 reload 的 HMR 插件本身已经丢失，该恢复机制仍然有效。

Graph revision 是 stream 一致性的权威关系，外壳自有 AppRoot 子项是 render 生命周期的权威关系。隐藏时长、EventSource error 时机与单个 module response 都不会触发恢复；它们无法证明 graph 被错过或 root 已丢失。

## Alternatives considered

**回放错过的 rebuild 帧。** SSE endpoint 不保留有序 event log；加入该能力需要 sequence id、有界 retention、重连 cursor 与兼容处理，而这些仅服务于开发 HMR。

**每次 visibility change 或 SSE reconnect 都 reload。** 即使后台期间图没有变化，或 proxy 只是重新连接一个仍然最新的 stream，这也会丢弃有效浏览器状态。

**只 retry 缺失的 root provider。** Revision 不一致可能横跨任意 provider 及其 dependency cascade；只重建一个可见 slot 可能让运行时图保持内部不一致。

## Consequences

过期或 rootless 标签会自动恢复，而不是保持空白。完整图不同时，恢复有意丢弃插件本地 React 状态；相等 revision 的重连仍会保留状态。Unit 覆盖固定 revision 比较，浏览器验证覆盖 Host 重启后的 EventSource 重连。
