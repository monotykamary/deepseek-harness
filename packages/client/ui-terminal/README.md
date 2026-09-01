# @monotykamary/dsh-client-ui-terminal

English | [中文](README.zh.md)

Dynamic Web plugin that places interactive xterm.js terminals in the right Workbench and the layout-owned bottom panel. A Session-header button toggles the resident bottom panel; the Workbench launcher opens an independent right-placement terminal. Each placement lists its own persistent Host sessions, opens one when none is running, and keeps the active attachment mounted when its panel closes. The same Host terminal may be viewed and controlled from multiple browser pages; output reaches every page while input activity transfers ownership of the shared PTY dimensions.

The bottom placement treats running terminals as groups selected from its compact tree; New Terminal adds a pane to the active group. The right placement maps each group directly to a repeatable outer Workbench panel labeled Terminal 1, Terminal 2, and so on; New Terminal creates and selects another Workbench panel instead of adding an inner terminal tab row. Horizontal and vertical split actions add up to three independently attached panes to the active group, while clicking a pane transfers terminal focus and resize ownership. Closing or shell EOF removes that pane while Host teardown continues. Both placements can expand over the complete viewport and restore their original host without ending any PTY. Without a group tree, the floating action cluster collapses to one chevron; hover or click reveals the always-mounted inert controls through a 200 ms width-and-opacity transition, while pointer leave or outside input collapses them. Reduced-motion clients skip the transition. Every action owns its separator, so mounting a hover tooltip cannot change neighboring button positions or widths. With split panes, both placements keep Expand/Restore visible in the fixed group toolbar and use the same indented guide, subtle Group pill, and inset active terminal row. Host discovery leaves the terminal surface blank until the list resolves, so creating or switching right Workbench panels never flashes the actionable empty state. The PanelBottom header control leaves the panel's future occupants generic, while terminal appearance opens in the shared modal with compact product menus and toggles instead of browser-native controls. The terminal has no theme picker: its palette follows the app appearance (light/dark/system) — the dark Harness palette while the appearance resolves to dark, the light palette otherwise. Settings are browser-local under `dsh.terminal.preferences.v1` and shared live between both placements: bundled Geist Mono, Fira Code, JetBrains Mono, Cascadia Code, Source Code Pro, IBM Plex Mono, Ubuntu Mono, Roboto Mono, Inconsolata, and Hack faces or a custom family; font size; line height; font-aware ligatures; color emoji; and cursor blink. Legacy system-font preferences resolve to bundled Geist Mono so rendering does not depend on host fonts.

## Rendering and transport

The plugin uses the exact patched xterm WebGL and image addons recorded in `bun-workspace.yaml`. The localterm-derived output scheduler parses ordinary raw binary frames immediately and, when the Host brackets a size-split redraw between `output-frame-start` and `output-frame-end`, retains those transport chunks and commits the complete logical frame as one xterm parse transaction. It preserves user scroll position, paces DEC 2026 synchronized output at rendered-frame boundaries, and consumes a bounded post-input WebGL render for low latency. WebGL context loss falls back to xterm’s DOM renderer. The terminal waits for the selected face, remeasures xterm cells, and leaves xterm's canvas dimensions unstretched. It refits through `ResizeObserver`, observes the outer viewport throughout bottom-panel transitions and the rendered xterm screen when loaded font metrics change, replays the latest grid after attachment so the PTY consumes the full panel, and sends later sizes to `@monotykamary/dsh-terminal-web`. The appearance-resolved terminal palette owns the panel body, xterm surface, scroll viewport, and one equal top/right/bottom/left padding gutter. xterm's width-reserving scrollbar is disabled; a localterm-derived overlay track consumes no grid width, appears only after the user scrolls above the buffer bottom, and supports track paging and thumb dragging. Connection setup remains visually blank until xterm is ready; only actionable connection failures render status copy and Retry.

The implementation and interaction patterns retain the [T3 Code and localterm notices](../../../THIRD_PARTY_NOTICES.md#adapted-design-sources).

## Extension points

This package occupies `bottom-panel`, registers `terminal` in `workbench.surface`, and contributes `bottom-terminal` to `conversation.session.header.utilities`. Remove its Web roster row to disable all three contributions without changing layout, Workbench, or terminal Host services.

## Model Experience

None, as the plugin is a direct human-to-PTY interface and does not alter model requests or logged conversation output.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

- Predictive local echo is not enabled. The browser does not have an authoritative prompt-versus-password state for an arbitrary native login shell, so speculative rendering could expose input that the shell intentionally suppresses; PTY echo remains authoritative.
- Appearance preferences are local to one browser profile rather than synchronized through Host user settings.
- Only panes in the active group hold WebSocket attachments; switching groups detaches the prior group but leaves every process alive.
- Named JetBrains Mono, Fira Code, and custom families must be installed in the browser’s system; unavailable choices fall back to the system monospace chain.
