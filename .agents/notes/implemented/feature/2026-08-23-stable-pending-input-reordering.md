# Agent Note: Stable reordering for pending Session input

Status: implemented

English | [中文](2026-08-23-stable-pending-input-reordering.zh.md)

## Problem

Pending user prompts already belong to the Agent inbox and survive through durable `agent/inbox/spliced` events, but Web clients could only edit, remove, or steer them. An external application that presents those prompts as task comments needs to change their delivery order until the Agent claims them. Owning a second application-specific queue would split persistence, races, and model-visible admission between two authorities.

## Decision

`Inbox.moveNextTurn(messageId, direction)` exchanges one queued turn with its adjacent neighbor. It appends one remove-and-reinsert `agent/inbox/spliced` event containing the same stable message identities in the new order, then applies that event to the live projection. A move emits no `agent/inbox/inserted` or `agent/inbox/discarded` notification because neither lifecycle fact occurred. Moving beyond either edge succeeds without appending a redundant event; a message outside `next-turn` returns false.

`QueueAction` includes `{ kind: 'move', direction: 'earlier' | 'later' }`. `session.updateQueue` accepts it only while the addressed occurrence remains in `next-turn`; a claimed, removed, or already-steered occurrence returns `queue-item-not-found`. The Host broadcasts the resulting complete `session/queue` snapshot through the same path as every inbox splice, so reconnects and concurrent clients converge without optimistic ordering state.

Queue consumers render movement only for `queued` placements. QueueDock exposes adjacent earlier/later controls and disables the impossible edge direction. External applications can subscribe to the same Session face, present `queued` and `steering` placements in their own workflow, and submit prompts through `session.prompt` without persisting another queue. Once a row enters steering or becomes a durable `user/message`, it is immutable through queue controls.

## Alternatives considered

**Persist a Factory-owned comment queue.** This would let one task UI reorder rows without changing the Session API, but it would require a second dispatcher and reconciliation after every claim, cancellation, restart, and failed handoff. The Agent inbox remains the only pending-input authority.

**Remove and resend a row.** A client could approximate movement through two operations, but the intermediate state can be claimed, the message identity changes, and a failed resend loses the original position. One Host-owned splice makes movement atomic and replayable.

**Replace the complete queue order from the client.** A full-array write makes one tab's stale snapshot overwrite prompts admitted concurrently. Adjacent identity-addressed movement limits each operation to the user's requested change and lets the Host serialize races.

## Consequences

Queued prompts retain stable identity, attachments, source metadata, and FIFO delivery after movement. Durable replay reconstructs the chosen order, while lifecycle observers receive no false insertion or discard. Movement is intentionally adjacent rather than an arbitrary index write; drag-and-drop consumers may issue repeated moves, and keyboard or button consumers need only one operation. A row becomes non-reorderable at claim or steering, so interfaces must show the authoritative placement instead of promising that a late movement succeeded.

## Verification

Agent tests cover edge no-ops, both directions, replay, and notification neutrality. API schema and Host tests cover accepted queued moves and rejection after steering. QueueDock tests cover controls, edge disabling, exact identities, and failure feedback. The keyless assembled Web scenario verifies that visible reordering changes the later durable `user/message` order through the real HTTP and stream paths.
