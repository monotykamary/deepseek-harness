# @monotykamary/dsh-client-ui-command-palette

English | [中文](README.zh.md)

Global Web command palette registered into the layout-owned `shell.overlay` list slot. `Cmd+K` on macOS and `Ctrl+K` elsewhere toggle one body-end dialog over every application column; the palette keeps `#root` inert while open, restores its preceding inert state and focus when it closes, and keeps keyboard focus in its search input.

The root view shows New Session actions and up to twelve recent visible root Sessions. A non-blank query ranks exact, prefix, and contained matches over Session titles, Workspace titles, and paths immediately. Queries of at least two characters also issue the existing abortable `session.search` request after 250 ms and merge Host-ranked message snippets into the bounded Session list. Archived Sessions, blank Sessions, and subagent-origin Sessions remain hidden. A failed content request leaves metadata matches available, and the Host result bound drives the refine-query notice.

**New Session in...** opens a Workspace-only view. Arrow keys move the virtual highlight, `Tab` accepts the highlighted Workspace without creating anything, and `Enter` creates or reuses that Workspace's blank Session and opens it. `Backspace` on an empty Workspace query returns to the root view; `Escape` closes the dialog. An unscoped New Session uses the runtime's current-Workspace then recent-Workspace policy, and with no Workspace enters the existing New Session view.

The compact shell geometry, grouped-result hierarchy, keyboard-hint footer, and exact/prefix/contains ranking adapt [T3 Code](https://github.com/pingdotgg/t3code) at revision `a4cc1367b03ee0c1dc2b50fceac81ef5e63212e2`. T3 Code is MIT-licensed, Copyright (c) 2026 T3 Tools Inc.; the repository's generated third-party notices retain the complete permission notice.

The `/client` entrypoint exports only the Cordis plugin body, injected/component contract types, and locale key type. The component and projection helpers remain package-internal.

## Model Experience

None, as the command palette selects or creates browser Sessions; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **The shortcut and action roster are fixed** — configurable keybindings and third-party palette actions need an owning client command registry before this package can expose them.
- **Workspace rows create Sessions** — the initial palette has no project landing page, so selecting a Workspace is explicitly a New Session action rather than navigation to an existing Session.
