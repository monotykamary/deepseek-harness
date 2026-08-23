# @monotykamary/dsh-worktree-git-local

English | [中文](README.zh.md)

Local Git provider `git-local` for `ctx.worktrees`.

## Behavior

- Repository identity is a SHA-256 prefix of the canonical main-worktree path; linked worktrees resolve the same identity through `git rev-parse --git-common-dir`.
- Listing parses `git worktree list --porcelain`, marks main/current/locked/prunable checkouts, identifies paths below the configured managed root, and includes every live DSH Session whose cwd is inside a checkout.
- Creation uses a collision-resistant managed directory and `dsh/<label>-<id>` branch. `fresh` prefers `origin/HEAD`, performs one bounded non-interactive fetch when configured, and falls back to local HEAD. `head` uses local HEAD; an explicit ref must resolve.
- `.worktreeinclude` is an allowlist over ignored untracked regular files. Absolute, parent-traversing, negated, symlink, oversized, and over-count entries are skipped. Copy failures do not roll back a Git worktree that already exists.
- Removal accepts only clean, unoccupied, unlocked, non-current managed linked worktrees and calls `git worktree remove` without `--force` as a second cleanliness check.
- Sweeps additionally require a caller-supplied age and count bound. Branch refs are retained.

All Git commands use `ctx.subprocess`, disable terminal prompts and pagers, cap output, inherit caller cancellation, and terminate on the configured deadline.

## Configuration

`root` is required and absolute. Command deadline, output limit, termination grace, fresh-base fetch, branch label length, include filename, include-file size, pattern count, copied-file count, and copied-byte limit are configurable Cordis fields.

## Model Experience

None, as this provider registers no tool or request context.

#### KV Cache effect

None; worktree operations are host-side.

## Known Limitations and Deferred Work

- **Git only** — repositories without a Git worktree model require another provider.
- **Current-process occupancy** — active Session guards use `ctx.agents`; a cross-process consumer must add its own shared-presence guard before invoking removal.
- **Setup hooks are consumer-owned** — creation reports copied files but does not execute repository commands; an autonomous scheduler runs its explicitly configured setup through the shell capability.
