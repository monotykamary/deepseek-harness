# @monotykamary/dsh-tool-session-mutations

English | [中文](README.zh.md)

Bounded model reader over the current Agent's durable file-mutation receipts. The package registers `changes_read`; its pure `./ledger` entry exports the same commit-ordered projection for external automation without evaluating the plugin.

A list call returns summaries after an optional `after_commit_order` cursor. An exact `commit_order` call returns the recorded replacement hunks in UTF-16 pages. Every result states that the ledger covers receipt-aware tools only. It never reads or writes the workspace, and its output is recorded intent rather than unified-patch syntax or repository state.

## Configuration

| Key | Meaning |
|---|---|
| `maxListItems` | Required positive integer limiting one summary page. |
| `maxDiffChars` | Required positive integer limiting mutation text in one detail page. |

## Model Experience

### Mutation-ledger reader

#### What the model sees

The generated [`changes_read` schema](../../../docs/tool-catalog.md#monotykamarydsh-tool-session-mutations) lists direct and nested receipt-aware mutations from the complete current Session, or returns one mutation's path, hashes, and recorded replacement hunks. Results explicitly exclude shell and external changes.

#### Token effect

One fixed schema is present while the plugin is mounted. List pages are capped by `maxListItems`; detail pages are capped by `maxDiffChars` and continue from the returned offset.

#### KV Cache effect

The schema remains prefix-stable while its definition is unchanged. Each called result appends after the reusable prefix like an ordinary tool result.

## Known Limitations and Deferred Work

- **The ledger records instrumented tools, not repository state** — terminal commands, external edits, file modes, and uncommitted Git state are absent.
- **Hunks are presentation-oriented replacement intent** — callers must read current files before reconciling and cannot apply the output as a patch.
- **Only a live Agent Session is readable** — persisted sessions must be resumed before the tool can inspect their complete event history.
