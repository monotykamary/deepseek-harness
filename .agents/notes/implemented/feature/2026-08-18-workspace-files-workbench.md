# Agent Note: Session-authorized Files workbench

Status: implemented

English | [中文](2026-08-18-workspace-files-workbench.zh.md)

## Problem

The Workbench could host feature-owned tabs, but the Web application had no file explorer. The browser cannot safely derive a Session workspace from an absolute path, and the directory-picker Remote lists Host directories for workspace selection rather than reading through the filesystem provider selected by an Agent. Reusing it would bypass provider choice and filesystem containment policy. Loading a complete tree eagerly would also make one panel request scale with the whole workspace.

## Decision

`@monotykamary/dsh-host-workspace-files` publishes direct `workspaceFiles/list`, `workspaceFiles/read`, and `workspaceFiles/write` Remotes. Typert resolves the browser's Session id to the Session Agent; the gateway takes that Agent's current `ctx.fs` and `session.header.cwd` as the only filesystem authority. Browser requests carry provider-neutral arrays of child names relative to that root, never absolute paths or serialized provider targets.

Traversal lists each parent and follows only the matching provider-owned child target. Every followed target must satisfy `fs.contains(sessionRoot, target)`. An escaped child is projected as a name-only `other` entry and cannot be traversed or previewed. The Host caps direct children, locator depth, complete UTF-8 read bytes, and complete UTF-8 replacement bytes through validated `maxDirectoryEntries`, `maxDepth`, `maxPreviewBytes`, and `maxWriteBytes` configuration. A read exceeding the cap, containing non-text data, or naming a non-file returns a stable unavailable reason; no partial content crosses the Remote. A successful text read carries an opaque provider version. `write` resolves and contains the same target, requires a regular file, and passes that version as `replaceIfVersion` to the provider's atomic `writeText`; stale content returns `conflict` rather than overwriting a concurrent Agent or external change.

`@monotykamary/dsh-client-ui-files` registers the stable `files` Workbench surface, its icon, and its launcher description. Conversation's generic Session-header control reads AppFrame's live Details state and toggles the empty Workbench through the same mirrored panel glyph. Each resident Session owns a transient Files store. Root and child directories load on demand; directory and file results remain cached until explicit refresh, while request generations and cancellation prevent stale responses from replacing current state. Search covers loaded nodes only and labels each result with its parent path. Selecting a supported file renders the complete value in the shared line-numbered `SourceEditor`. A T3-adapted single-flight coordinator waits 500 ms, saves only the newest complete value, uses the returned version for the next write, and flushes the newest pending value when the editor unmounts. The same Files component and editor render in the compact right Sheet.

The tree, filter toolbar, breadcrumb editor, icons, and save coordinator adapt T3 Code's `FileTree.tsx`, `FileTreeItem.tsx`, `FilePreviewPanel.tsx`, `PanelHeader.tsx`, and `fileSaveCoordinator.ts` at revision `a4cc1367b03ee0c1dc2b50fceac81ef5e63212e2`. The implementation retains T3's compact information hierarchy but replaces its desktop RPC, route state, and Zustand store with Cordis registrations, session-scoped state, and the existing DSH filesystem provider.

## Verification

Host tests pin direct Remote registration, provider-order projection, escaped-target suppression, traversal depth, configurable read/write caps, complete UTF-8 reads, guarded provider write intents, saved versions, conflicts, unavailable reasons, cancellation, and loud missing-authority failures. Client tests pin per-Session cache and cancellation behavior, loaded-node filtering, keyboard tree navigation, SourceEditor behavior, single-flight autosave, all save outcomes, and presentation/header registration. The keyless Web journey boots the shipped composition; opens, collapses, and reopens the empty panel through one header toggle; lists and expands a real temporary workspace through the Remote; edits syntax-highlighted source; observes the saved value on disk; filters loaded rows; verifies tab icon/close swapping; and retains inline and compact hosting.

## Alternatives considered

**Reuse the directory picker.** Its authority is Host path selection, it lists directories only, and it does not execute through the Session Agent's selected filesystem provider. Extending it would couple workspace adoption to file reading and bypass the policy point used by agent tools.

**Send absolute paths to a generic Host file endpoint.** This would expose Host path identity to the browser, fail for non-local providers, and let callers choose a filesystem target outside the Session-derived authority.

**Fetch the complete tree recursively.** A single open action could traverse an unbounded workspace, retain unused nodes, and delay the first useful rows. Lazy direct-child calls bound each request and make loaded-node search scope explicit.

**Implement Files inside `ui-workbench`.** The shell would gain filesystem data, Remote dependencies, and feature state. A registered feature package keeps tab hosting independent from file authority and lets plugin disposal remove the complete contribution.

**Overwrite without a version guard.** Sending only the latest editor value is simpler, but an Agent tool or external editor can change the same file while the panel remains open. Carrying the provider's opaque version makes the atomic filesystem write reject stale browser content instead of silently losing that change.

## Consequences

Files presents and edits the same filesystem world selected for the Session Agent without giving the browser an independent path authority. Work scales with directories the user expands and files the user opens, and deployment limits bound each read and replacement. The cost is one Host gateway, one Client feature package, explicit `api-remotes` assembly, version-aware complete-file autosave, and traversal that may list each path parent. Search is not a server-wide query; creation, deletion, rename, binary or ranged editing, watching, ignore rules, Git status, and continuation pagination remain outside this feature.
