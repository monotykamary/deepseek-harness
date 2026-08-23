# workspace/：workspace 实体家族

[English](README.md) | 中文

本家族拥有持久 workspace 和由 provider 支持的仓库 worktree。

| 包 | 职责 | ctx 键 |
|---|---|---|
| [`workspace/`](workspace/README.zh.md) | 注册 workspace 并记录其会话归属 | `ctx.workspaceRegistry` |
| [`worktree/`](worktree/README.zh.md) | 选择并分派仓库 worktree provider | `ctx.worktrees` |
| [`worktree-git-local/`](worktree-git-local/README.zh.md) | 实现有界的本地 Git worktree | provider `git-local` |

[workspace 包参考](workspace/README.zh.md)负责 workspace 持久化；[worktree 参考](worktree/README.zh.md)负责 checkout 分派和 provider 职责。

子系统参考——实体、realpath 规范、注册/解析——见 [docs/subsystems/workspace.md](../../docs/subsystems/workspace.zh.md)；存储设计见 [domain KV 存储 Agent Note](../../.agents/notes/proposed/architecture/2026-07-24-domain-kv-storage-and-workspace.zh.md)。
