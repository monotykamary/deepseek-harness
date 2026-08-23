# Agent Note: 有界的已完成助手历史

Status: implemented

[English](2026-08-23-bounded-settled-assistant-history.md) | 中文

## Problem

`session.history` 与 `subagent.history` 会在已经包含已完成步骤内容和 usage 的追加来源 `assistant/message` 旁返回全部持久化 `assistant/chunk`。一个较长的代码模式响应可能让单页包含数千个冗余 token 事件，使手机把一元请求的超时与堆内存预算消耗在下载和解析重开转录不需要的数据上。

删除全部已完成分片也会丢失历史 TTFT 所需的首 token 时间戳，并可能让首个返回 seq 越过原始切页位置。浏览器会把该 seq 用作下一次 `beforeSeq`；移动它会让上一页重新取回已省略分片，从而抵消缩减效果。

## Decision

网关先对完整事件区间分页，再把每个拥有追加来源 `assistant/message` 的步骤投影为该消息加首个 token delta。当原始页面以同一已完成步骤的另一个分片开头时，该首事件也会保留为稳定分页游标。一个分片可以同时满足两条规则。

没有最终追加来源消息的步骤保留全部分片，从而保存进行中与中断输出。`session.history` 和 `subagent.history` 通过 `historyPage` 共用该投影；实时 mux 帧、持久化、分叉与会话日志导出保留完整事件流。

## Alternatives considered

**提高一元请求超时。** 更长的超时仍会传输并解析冗余 token 带，增加移动端延迟与峰值内存，而不是限制 payload。

**删除全部已完成分片。** 这会丢失历史 TTFT；当最旧消息组以分片开始时，还会把 `beforeSeq` 移过原始切页位置，导致加载更早内容时重新取回该分片带。

**重写或压缩持久化日志。** 分片流仍是导出、重放、诊断及非浏览器 Consumer 的权威证据；浏览器历史投影才是更窄的归属位置。

## Consequences

一个历史页面为每个已完成步骤最多携带两个小型分片锚点，仅为未完成输出保留全部分片。重开的 Chat 与 Trajectory 从 `assistant/message` 完成内容和 usage，首 token 计时仍然可用，向前翻页也不会取回已省略的已完成分片带。工具 code-dispatch 事件及其他大型记录不在此次缩减范围内。
