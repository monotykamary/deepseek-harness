# Agent Note: Stable reordering for pending Session input

Status: implemented

[English](2026-08-23-stable-pending-input-reordering.md) | 中文

## Problem

待处理用户提示已经归 Agent inbox 所有，并通过持久 `agent/inbox/spliced` 事件存续，但 Web 客户端只能编辑、移除或 steering。把这些提示呈现为任务评论的外部应用，需要在 Agent 认领前改变其投递顺序。由应用持有第二套专用队列会把持久化、竞态与模型可见准入分裂到两个权威来源。

## Decision

`Inbox.moveNextTurn(messageId, direction)` 会把一条 queued turn 与相邻项交换。它追加一条 remove-and-reinsert `agent/inbox/spliced` 事件，在新顺序中保留相同的稳定消息标识，再把该事件应用到实时投影。移动不会发出 `agent/inbox/inserted` 或 `agent/inbox/discarded` 通知，因为这两种生命周期事实都未发生。越过任一边缘的移动会成功，但不会追加冗余事件；不在 `next-turn` 中的消息返回 false。

`QueueAction` 包含 `{ kind: 'move', direction: 'earlier' | 'later' }`。只有被寻址的单次入队项仍位于 `next-turn` 时，`session.updateQueue` 才接受该操作；已认领、已移除或已进入 steering 的项返回 `queue-item-not-found`。Host 通过与每次 inbox splice 相同的路径广播完整 `session/queue` 快照，因此重连与并发客户端无需乐观排序状态即可收敛。

Queue consumer 只为 `queued` placement 渲染移动操作。QueueDock 提供相邻的提前／延后控制，并禁用不可能的边缘方向。外部应用可订阅同一 Session face，在自身工作流中呈现 `queued` 与 `steering` placement，并通过 `session.prompt` 提交提示，而无需持久化另一套队列。行进入 steering 或成为持久 `user/message` 后，就不能再通过队列控制修改。

## Alternatives considered

**持久化一套 Factory 所有的评论队列。** 这能让单个任务 UI 在不改变 Session API 的情况下重排，但每次认领、取消、重启与交接失败后都需要第二个 dispatcher 和对账机制。Agent inbox 仍是唯一的待处理输入权威。

**移除再重新发送一行。** 客户端可以用两次操作近似移动，但中间状态可能被认领，消息标识会改变，重新发送失败还会丢失原位置。一次由 Host 持有的 splice 让移动具备原子性并可重放。

**由客户端替换完整队列顺序。** 全数组写入会让一个标签页的陈旧快照覆盖并发准入的提示。按标识寻址的相邻移动把每次操作限制为用户请求的变更，并由 Host 串行化竞态。

## Consequences

移动后，queued 提示仍保留稳定标识、附件、来源元数据与 FIFO 投递。持久重放可重建用户选定的顺序，生命周期观察方也不会收到虚假的插入或丢弃。移动刻意采用相邻操作，而非任意索引写入；拖放 consumer 可以连续发出多次移动，键盘或按钮 consumer 每次只需一个操作。行在认领或 steering 时变为不可重排，因此界面必须显示权威 placement，而不能承诺迟到的移动已成功。

## Verification

Agent 测试覆盖边缘无操作、两个方向、重放与通知中立性。API schema 与 Host 测试覆盖 queued 移动成功及进入 steering 后的拒绝。QueueDock 测试覆盖控制、边缘禁用、精确标识与失败反馈。无密钥的已组合 Web 场景通过真实 HTTP 与流路径，验证可见重排会改变之后持久 `user/message` 的顺序。
