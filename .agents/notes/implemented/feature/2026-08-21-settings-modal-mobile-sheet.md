# Agent Note: Mobile sheet layout for the settings modal

Status: implemented

English | [中文](2026-08-21-settings-modal-mobile-sheet.zh.md)

## Problem

The settings modal is the one surface with no compact treatment. Below 768px the app retires the sidebar rail into a portaled drawer, but Settings stayed a centered two-column dialog: an 188px nav rail beside a content column, capped at `calc(100vw - 48px)`. At a 375px viewport the panel shrinks to 327px and the rail consumes 188px of it, leaving the section a ~70px slit — every section list and editor renders unusably narrow, and the 24px side margins waste phone real estate. The command palette and terminal solved compact viewports with media-query layouts; settings never got one.

## Decision

`ui-settings-general` renders the sheet through a pure `@media (max-width: 767px)` block in `SettingsRoot.module.css`, aligned with the compact drawer boundary (`SIDEBAR_DRAWER_VIEWPORT = 768`). Below the breakpoint the modal becomes a full-bleed 375px sheet: the overlay stretches to the viewport, the panel drops its 800px cap, corner radius, and 48px inset, and `flex-direction: column-reverse` keeps the header row (actions + close) on top while the nav owns the sheet foot. The desktop DOM is untouched — same markup, same roles, same accessible names, so every existing dialog switch and close assertion still passes.

The 188px rail becomes a 36px-pill chip strip across the sheet foot, horizontally scrollable with the workbench/trajectory scrollbar-suppression idiom. The active and hover fills are the same `--dsw-specific-sidebar-nav-item-*` tokens as the rail, so one section vocabulary reads on both breakpoints. The title node (the dialog's `aria-labelledby` target) stays mounted but is clipped like the close seat, keeping the accessible name while the visual title leaves the strip flow. Safe-area insets pad the top of the sheet and track the strip's bottom so notched phones do not clip either edge.

The section body keeps its desktop layout; only the sheet chrome changes. The change is CSS-only in one module.

## Testing

- A new `styles.client.spec.ts` in the package pins the sheet contract: breakpoint presence, full-bleed panel, column reversal, safe-area pads, horizontal scrollbar-free nav strip, and the untouched desktop 800px/188px geometry.
- A new geometry test in `apps/web/tests/settings-chrome.e2e.ts` opens the drawer at a 375x812 viewport, opens settings through it, and measures the sheet: panel fills the viewport, nav bottom touches the panel bottom, the options column ends above the strip, and the page gains no horizontal scroll — then switches sections from the strip and closes via Escape.
- The existing command-palette and settings e2e goldens run at 1680px; the media query does not activate there, so those surfaces are untouched.

## Alternatives considered

- **Keep the two-column panel and only widen it on phones.** Shrinking the rail or the content simply relocates the collapse; at 375px there is no combination that leaves both a legible rail and a usable section.
- **A JS `useMediaQuery` switch rendering a separate mobile component.** The shell has zero JS layout logic and every sibling overlay (modal, palette, sheet) keeps its responsive rules in CSS; a second component tree would duplicate slots, a11y wiring, and tests for no behavior gain.
- **Bottom-sheet gesture with drag handling.** The app's Sheet, Modal, and palette all mount at full overlay height; a draggable partial-height sheet would be the only one of its kind and needs gesture plumbing for no product need stated.

## Consequences

- The settings modal is usable on phones: a full-height sheet, chip navigation at the thumb, and the section column at full width.
- The modal keeps one DOM and one set of accessible names across breakpoints; only geometry differs.
- Desktop geometry is byte-identical — the media query does not reach it.
- The strip scrolls horizontally when nav rows overflow; with the current section roster the pill row fits in one pass.
