# Agent Note: Trusted user system instructions

Status: implemented

English | [中文](2026-08-26-trusted-user-system-instructions.zh.md)

## Problem

Workspace `AGENTS.md` and `CLAUDE.md` files are repository-controlled input. DeepSeek Harness intentionally records them as lower-authority user messages, so a cloned repository cannot elevate its text above direct user, developer, or system instructions. The user-global `$DSH_HOME/AGENTS.md` followed the same durable message path, which left no simple user-owned location for a standing policy that genuinely belongs in the system prompt.

## Decision

`@monotykamary/dsh-agent-instructions` reads `$DSH_HOME/APPEND_SYSTEM.md` once at plugin load and registers its trimmed UTF-8 content as the `user:system-instructions` system-prompt section at order 1, immediately after the deployment persona and before tool guidance. `dshHome` determines the trusted directory; `trustedSystemFile` changes only the same-directory file name, and `trustedSystemMaxBytes` bounds the complete source with a 65,536-byte default.

The file is optional. Absence or whitespace contributes an empty section. Oversize content, malformed UTF-8, invalid same-directory configuration, and I/O failures reject plugin load rather than installing partial policy. Reloading changed content requires plugin or process reload; each assembled request header logs the effective system prompt, preserving request reconstruction.

Repository and user-global `AGENTS.md` files remain durable user-role guidance with their existing discovery, precedence, refresh, and compaction behavior. The trusted file is not part of that baseline, is never discovered inside a repository, and receives no touch-driven refresh.

## Alternatives considered

**Elevate every `AGENTS.md` file to the system prompt.** Rejected because repository-controlled text would gain system authority and could override the user's request or deployment safety policy.

**Elevate only `$DSH_HOME/AGENTS.md`.** Rejected because one filename would carry two authority models and existing users could unknowingly promote prose written for the lower-authority contract. A separate name makes the trust decision explicit.

**Store trusted policy as inline Cordis configuration.** Rejected as the only interface because multiline policy becomes awkward to edit and share across profiles. The file still remains patchable through its directory, name, and byte-cap config.

**Refresh the trusted file on every request.** Rejected because standing system text should remain prefix-stable during a process lifetime, and synchronous repeated host reads would make prompt assembly depend on file timing. Reload is the explicit application point.

## Consequences

- Users can place routing or delegation policy in `$DSH_HOME/APPEND_SYSTEM.md` when it must have system authority.
- Cloned repository instructions retain their lower-authority security posture.
- A changed trusted file invalidates the system-prompt prefix only after reload; absence costs no model tokens.
- Unit tests pin authority placement, separation from `AGENTS.md`, byte and UTF-8 failures, absence, and effect disposal.
