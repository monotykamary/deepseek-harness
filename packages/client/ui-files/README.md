# @monotykamary/dsh-client-ui-files

English | [中文](README.zh.md)

Session-scoped workspace tree and autosaving source editor for the Web workbench. The browser plugin registers the **Files** `workbench.surface` entry, its icon and launcher description, and an **Open files** action in `conversation.session.header.actions`; every contribution follows the plugin effect lifetime. The header action passes its owning Session to `ctx.workbench`, opens and activates the stable `files` tab when absent, and reuses it when already open.

Each resident Session owns one transient Files store. Opening the surface lazily lists its root through `remote.workspaceFiles`; expanding a directory lists only that directory, and selecting a file requests one complete bounded text value with an opaque provider version. Directory results and file values remain cached until explicit refresh. Request generations and `AbortSignal`s prevent a stale root, child, or read response from replacing newer state. Reloading the page discards the store.

The tree presents directories before files, preserves name order within each kind, supports pointer and Up/Down/Right/Left/Home/End keyboard navigation, and disables provider entries marked `other`. Search filters only root entries and children already loaded into the store, includes each matching entry's parent path, and states that scope below the tree. A text file opens in the shared line-numbered `SourceEditor`, which uses the same lazy Shiki grammars as code rendering. Its toolbar toggles synchronized soft wrapping for the native input and highlighted backdrop, expands the editable preview over the complete viewport, restores it to the Workbench, and resets both presentation states when another file opens. The editor autosaves the latest complete value after 500 ms. Each replacement carries the latest read or save version; a concurrent provider change returns a conflict instead of being overwritten. Saving status and recoverable conflict, size, file-kind, or transport failures remain visible in the editor. `too-large`, `not-text`, and `not-file` read results remain stable unavailable states.

The compact tree rows, filter toolbar, breadcrumb editor, icon treatment, and single-flight autosave adapt T3 Code's `FileTree.tsx`, `FileTreeItem.tsx`, `FilePreviewPanel.tsx`, `PanelHeader.tsx`, and `fileSaveCoordinator.ts` at revision `a4cc1367b03ee0c1dc2b50fceac81ef5e63212e2`. DSH replaces T3's desktop RPC, router, and Zustand ownership with the session-authorized [`workspace-files`](../../host/workspace-files/README.md) Remote, Cordis slots, and per-session workbench stores. [`THIRD_PARTY_NOTICES.md`](../../../THIRD_PARTY_NOTICES.md) retains the complete MIT text; the [Files Agent Note](../../../.agents/notes/implemented/feature/2026-08-18-workspace-files-workbench.md) owns the authority and lazy-loading decisions.

The `/client` entrypoint exports the plugin body. Components, store, presentation helpers, slot prop contracts, locale dictionary, and `files` surface id remain package-internal.

## Model Experience

None, as this browser-only workspace viewer registers no prompt, tool, message, or provider request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Loaded-node search only** — search does not issue a recursive Host query, so collapsed or unvisited directories cannot contribute matches until the user expands them.
- **Complete existing text files only** — editing replaces a file that was successfully read; Files provides no creation, deletion, rename, binary editing, file watching, Git status, ignore-rule filtering, or persisted expansion state.
- **Complete previews only** — the panel does not request byte ranges or show a truncated prefix when the Host withholds an oversized or non-text file.
