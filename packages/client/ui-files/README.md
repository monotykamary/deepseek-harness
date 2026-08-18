# @monotykamary/dsh-client-ui-files

English | [中文](README.zh.md)

Session-scoped, read-only workspace tree and source preview for the Web workbench. The browser plugin registers the **Files** `workbench.surface` entry and an **Open files** action in `conversation.session.header.actions`; both registrations follow the plugin effect lifetime. The header action opens and activates the stable `files` tab through `ctx.workbench`.

Each resident Session owns one transient Files store. Opening the surface lazily lists its root through `remote.workspaceFiles`; expanding a directory lists only that directory, and selecting a file requests one complete bounded preview. Directory results and previews remain cached until their explicit refresh action. Request generations and `AbortSignal`s prevent a stale root, child, or preview response from replacing newer state. Reloading the page discards the store.

The tree presents directories before files, preserves name order within each kind, supports pointer and Up/Down/Right/Left/Home/End keyboard navigation, and disables provider entries marked `other`. Search filters only root entries and children already loaded into the store, includes each matching entry's parent path, and states that scope below the tree. The preview maps known source extensions to the shared syntax-highlighted `CodeBlock`; `too-large`, `not-text`, and `not-file` Remote results render as stable unavailable states. Unexpected Remote failures expose a retry instead of an empty tree or preview.

The compact tree rows, filter toolbar, breadcrumb preview, and icon treatment adapt T3 Code's `FileTree.tsx`, `FileTreeItem.tsx`, `FilePreview.tsx`, and `PanelHeader.tsx` at revision `a4cc1367b03ee0c1dc2b50fceac81ef5e63212e2`. DSH replaces T3's desktop RPC, router, and Zustand ownership with the session-authorized [`workspace-files`](../../host/workspace-files/README.md) Remote, Cordis slots, and per-session workbench stores. [`THIRD_PARTY_NOTICES.md`](../../../THIRD_PARTY_NOTICES.md) retains the complete MIT text; the [Files Agent Note](../../../.agents/notes/implemented/feature/2026-08-18-workspace-files-workbench.md) owns the authority and lazy-loading decisions.

The `/client` entrypoint exports the plugin body. Components, store, presentation helpers, slot prop contracts, locale dictionary, and `files` surface id remain package-internal.

## Model Experience

None, as this browser-only workspace viewer registers no prompt, tool, message, or provider request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Loaded-node search only** — search does not issue a recursive Host query, so collapsed or unvisited directories cannot contribute matches until the user expands them.
- **Read-only transient view** — Files provides no editing, creation, deletion, file watching, Git status, ignore-rule filtering, or persisted expansion state.
- **Complete previews only** — the panel does not request byte ranges or show a truncated prefix when the Host withholds an oversized or non-text file.
