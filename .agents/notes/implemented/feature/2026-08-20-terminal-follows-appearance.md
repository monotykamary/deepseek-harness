# Agent Note: Terminal palette follows the app appearance

Status: implemented

English | [中文](2026-08-20-terminal-follows-appearance.zh.md)

## Problem

The interactive terminal had its own theme picker: four selectable xterm palettes (Harness, Tokyo Night, Catppuccin, Light) persisted per browser profile under `dsh.terminal.preferences.v1`. The choice was independent of the app's Appearance setting (light/dark/system), so a terminal could stay dark while the app is light or vice versa, and the picker was one more setting to explain and maintain for a surface whose palette should simply mirror the application it lives in.

## Decision

The terminal has no theme picker and no user-chosen palette. The palette resolves automatically from the app appearance: the theme service's resolved active color scheme (`ctx.theme.getTheme().active.colorScheme`) selects between two built-in palettes — the dark Harness palette and the light palette (`terminalTheme(colorScheme)` in `ui-terminal/src/client/themes.ts`). The browser plugin provides a shared observable, `TerminalColorSchemeSource`, in the slot `hooks` compartment next to the preference store; it reads the initial snapshot once and follows `theme/change` events (which fire on preference switches and on OS scheme flips while the preference is `system`). `XtermSurface.apply()`, the constructor palette, and the panel body background all take the resolved scheme, and `minimumContrastRatio` flips to 4.5 for the light palette.

`TerminalPreferences` no longer carries a `theme` field; the settings dialog lost the Theme select and the `settings.theme` locale keys. Legacy browser-local records that still contain a `theme` key parse unchanged and the key is ignored, so no migration runs on existing profiles. The plugin's service inject list and manifest gained the theme service (`'theme'` / `@monotykamary/dsh-client-ui-theme`), and the package README documents the appearance-following behavior.

## Alternatives considered

- **Keep the picker and add an automatic option.** Rejected: the goal is no terminal theme choice at all — one appearance authority (the app's), which the theme service already owns.
- **Read the DOM in the terminal** (`body[data-ds-dark-theme]` plus a media query). Rejected: the theme service already resolves `system` and re-emits on change; duplicating the sensing in the terminal would create a second, driftable authority.
- **Keep Tokyo Night/Catppuccin as shipped palettes without a picker.** Rejected: no consumer evidence for retaining palettes no user can select; two palettes (dark Harness, light) are the minimum that follows the appearance.

## Consequences

Terminal theming is always consistent with the application: switching Appearance (or the OS scheme under `system`) restyles every mounted terminal live, without remounting xterm. The preference surface shrinks by one field, and old localStorage `theme` values are silently dropped on the next write. The theme service dependency makes the terminal plugin wait on `ctx.theme`, which the app already provides at boot. The dark/light palette split is a deliberate product decision: third-party terminal palettes are no longer a supported surface, and adding one back means reintroducing a preference field plus the picker.

## Testing

The apply spec drives `TerminalColorSchemeSource` through `theme/change` and asserts the hook snapshot follows the resolved scheme; the viewport spec pins the background color and `surface.apply` arguments for both schemes; the preferences spec pins legacy-key tolerance (a stored `theme` field is ignored); the interactive-terminal e2e asserts the settings dialog no longer offers a Theme select and updated its accessibility golden.
