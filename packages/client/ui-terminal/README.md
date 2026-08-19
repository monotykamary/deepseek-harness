# @monotykamary/dsh-client-ui-terminal

English | [中文](README.zh.md)

Dynamic Web plugin that places interactive xterm.js terminals in the right Workbench and the layout-owned bottom panel. A Session-header button toggles the resident bottom panel; the Workbench launcher opens an independent right-placement terminal. Each placement lists its own persistent Host sessions, opens one when none is running, and keeps the active attachment mounted when its panel closes. The same Host terminal may be viewed and controlled from multiple browser pages; output reaches every page while input activity transfers ownership of the shared PTY dimensions.

The toolbar provides terminal tabs, create, kill, settings, retry, and the bottom-panel close action. Hovering a terminal tab replaces its status dot with a close control; keyboard focus exposes the same action. Closing removes the tab immediately while Host teardown continues, and a shell EOF such as Ctrl+D retires the tab through the same path. The PanelBottom header control leaves the panel's future occupants generic, while terminal appearance opens in the shared modal with compact product menus and toggles instead of browser-native controls. Settings are browser-local under `dsh.terminal.preferences.v1` and shared live between both placements: Harness, Tokyo Night, Catppuccin, and light palettes; bundled Geist Mono, Fira Code, JetBrains Mono, Cascadia Code, Source Code Pro, IBM Plex Mono, Ubuntu Mono, Roboto Mono, Inconsolata, and Hack faces or a custom family; font size; line height; font-aware ligatures; color emoji; and cursor blink. Legacy system-font preferences resolve to bundled Geist Mono so rendering does not depend on host fonts.

## Rendering and transport

The plugin uses the exact patched xterm WebGL and image addons recorded in `pnpm-workspace.yaml`. The localterm-derived output scheduler parses raw binary frames immediately, preserves user scroll position, paces DEC 2026 synchronized output at rendered-frame boundaries, and consumes a bounded post-input WebGL render for low latency. WebGL context loss falls back to xterm’s DOM renderer. The terminal waits for the selected face, remeasures xterm cells, and leaves xterm's canvas dimensions unstretched. It refits through `ResizeObserver`, observes the outer viewport throughout bottom-panel transitions and the rendered xterm screen when loaded font metrics change, replays the latest grid after attachment so the PTY consumes the full panel, and sends later sizes to `@monotykamary/dsh-terminal-web`. The selected terminal palette owns the panel body, xterm surface, scroll viewport, and padding gutters.

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
- Only the active tab holds a WebSocket attachment; switching tabs detaches the prior terminal but leaves its process alive.
- Named JetBrains Mono, Fira Code, and custom families must be installed in the browser’s system; unavailable choices fall back to the system monospace chain.
