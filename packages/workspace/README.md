# workspace/ — workspace entity family

English | [中文](README.zh.md)

This family owns persistent workspaces and provider-backed repository worktrees.

| Package | Role | ctx key |
|---|---|---|
| [`workspace/`](workspace/README.md) | Registers workspaces and accounts for their sessions | `ctx.workspaceRegistry` |
| [`worktree/`](worktree/README.md) | Selects and dispatches repository worktree providers | `ctx.worktrees` |
| [`worktree-git-local/`](worktree-git-local/README.md) | Implements bounded local Git worktrees | provider `git-local` |

The [workspace package reference](workspace/README.md) owns workspace persistence; the [worktree reference](worktree/README.md) owns checkout dispatch and provider roles.

The subsystem reference — the entity, realpath canon, registration/resolution — is [docs/subsystems/workspace.md](../../docs/subsystems/workspace.md); storage design in the [domain KV storage Agent Note](../../.agents/notes/proposed/architecture/2026-07-24-domain-kv-storage-and-workspace.md).
