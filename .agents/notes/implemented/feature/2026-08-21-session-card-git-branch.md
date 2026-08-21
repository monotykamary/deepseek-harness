# Agent Note: Session card shows the working tree's git branch

Status: implemented

English | [中文](2026-08-21-session-card-git-branch.zh.md)

## Problem

The left sidebar's Session card foot showed the agent preset (an icon plus the preset id) as its stable execution-context label. The preset is a harness-composition fact — most users never change it per session — and it displaces the fact users actually identify a working tree by when they glance at a card: the git branch. The branch label is what distinguishes "the session that changed the checkout" from "the other session in the same repo" at a glance.

## Decision

The card foot now shows the git branch of the Session's working tree instead of the preset. The host resolves the branch per distinct cwd while serving `session.list` (a per-cwd memo makes a multi-session repo pay one probe), reads the enclosing repository's `HEAD` symref directly (new `git-branch.ts` module: directory walk-up, worktree/submodule `gitdir:` pointer files, linked-worktree own HEAD), and ships it on the wire as the optional `branch` field of `SessionSummary` and the `host/session-added` frame. The client runtime tunnels it through the list store and `SessionNode`, and the card renders it in the foot with the branch icon. Detached HEAD, non-repository cwds, and unrecorded cwds carry no label.

The agent preset stays on the wire: the preset switcher UI (ui-agent-preset) still reads `SessionSummary.agentPreset`, and the host still writes it on create/select. Only the card label changed.

Bulk paths never probe: branch resolution sits only in the `sessions.list` handler (search shares the visibility collector, so a 30k-session corpus search pays no per-row stats). A missing cwd is one `stat`, not a climb to the filesystem root.

## Alternatives considered

- **Keep the preset and add the branch as a second tag.** The foot row is one line; showing both reads as noise, and the branch is the contextual fact after the workspace title is already in the card's top row.
- **Query `git branch --show-current` from the host.** Correct but forks a process per distinct cwd on every list refresh; reading `HEAD` directly is the same fact at a stat+read cost.
- **Client-side resolution.** The browser has no cwd guarantee beyond the workspace path and would run a git subprocess per card; the host already derives summary rows and owns the working-tree facts.

## Consequences

- Cards in repositories show the current branch (updated on the next list baseline; the frame carries it at create time).
- Sessions outside a repo, cwd-less, or on a detached HEAD show no foot label — the same empty seat as before when no preset existed.
- The preset switcher in settings keeps its own summary passthrough; nothing depended on the card's preset label.

## Testing

The new `git-branch.spec.ts` and `api-proxy-branch.spec.ts` cover repo/plain/worktree/detached cwds and the list payload; the runtime service spec covers the summary passthrough and the frame path; rows/tree specs cover the rendered card.
