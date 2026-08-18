# Agent Note: Web command palette for Session discovery and Workspace-targeted creation

Status: implemented

English | [中文](2026-08-18-web-command-palette.zh.md)

## Problem

The Web UI exposes Session navigation and content search only inside the expanded sidebar, while New Session inherits an implicit Workspace. Keyboard users cannot discover an old Session or choose a specific Workspace without moving through sidebar state, and a collapsed or mobile sidebar makes that route longer.

The command launcher also needs a distinct meaning from composer slash commands. Slash commands address one Session's agent-independent Host command directory; a global launcher navigates root application state and must remain available when no Session is selected.

## Decision

`@monotykamary/dsh-client-ui-command-palette` registers one root-scoped entry in the layout-owned `shell.overlay` list. Its component receives `useSessions` and `useWorkspaces` from the standard runtime share, while its inject factory narrows root services to open, search, and Workspace-connect callbacks. All query, highlight, accepted-Workspace, pending, and error state remains component-local because no other entry consumes it and closing the dialog ends its lifetime.

`Cmd+K` on Apple platforms and `Ctrl+K` elsewhere toggle a body-end modal dialog that holds `#root` inert for its lifetime and restores the preceding inert and focus states. The root view contains contextual and explicit New Session actions plus twelve recent visible root Sessions. Search ranks exact, prefix, and contained metadata fields, starts the existing abortable `session.search` request after 250 ms for queries of at least two characters, and merges Host-ranked snippets into the same bounded list. Archived, blank, and subagent-origin Sessions remain excluded, matching navigation ownership rather than exposing hidden implementation Sessions.

**New Session in...** enters a Workspace-only view. Arrow keys move the virtual highlight. `Tab` accepts one Workspace and displays the accepted choice without side effects; `Enter` alone commits `connectWorkspace()` followed by `sessions.open()`. This separation keeps completion reversible and prevents a conventional focus key from creating a Session. Search and creation failures stay inside the dialog without hiding usable metadata results.

The compact shell geometry and `--dsw-specific-command-palette*` semantic roles adapt T3 Code revision `a4cc1367b03ee0c1dc2b50fceac81ef5e63212e2`. The implementation keeps dsh's CSS Modules, token ownership, Cordis composition, and React 18 stack instead of importing T3's Tailwind, Base UI, Effect atoms, or monolithic command component. `scripts/gen-third-party-notices.ts` emits the pinned upstream revision, copyright, and complete MIT permission text even where the adaptation is not substantial.

The package tests pin pure ranking and visibility, keyboard and pointer interaction, cancellation races, creation failures, slot declaration arrival, HMR teardown, and light/dark token ownership at 100% per-file coverage. Keyless browser scenarios boot the shipped Web profile to search persisted message content, open its Session, and Tab-complete a real Workspace before confirming New Session creation.

## Alternatives considered

**Extend `ui-commands`.** That package owns Session-scoped slash-command discovery and execution in the composer. Giving it global navigation would combine two command meanings, force a current-Session dependency onto the no-Session launcher, and make its overlay ownership ambiguous.

**Copy T3 Code's command component and dependency stack.** The source component mixes project cloning, file browsing, theme actions, provider state, and navigation in one file and relies on React 19-era application dependencies. Copying it would bypass dsh's slot, locale, token, and object-layer rules; adapting its interaction and token roles preserves the useful decisions without importing unrelated architecture.

**Create the Session when `Tab` accepts a Workspace.** This is faster by one key but makes focus movement destructive and gives the user no visible confirmation point. `Tab` therefore completes and `Enter` commits.

**Keep search in the sidebar only.** The existing sidebar search remains useful for browsing in place, but it cannot be invoked globally or compose New Session targeting. The palette reuses the same Host search operation without changing sidebar ownership.

## Consequences

Session discovery and explicit Workspace targeting are available from any Web UI state without changing the agent loop, Session format, or model-visible context. The extra client bundle and one global key listener are root-scoped and retract with the plugin fiber; the body-end portal follows the repository's single overlay tier.

The initial action roster and shortcut are fixed. A configurable keybinding system or third-party launcher actions requires a separately owned client registry rather than widening this package speculatively. Metadata ranking and remote content search are intentionally simple and bounded; broader fuzzy ranking or event deep links remain separate behavior changes.
