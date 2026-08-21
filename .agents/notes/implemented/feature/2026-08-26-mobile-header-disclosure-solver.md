# Agent Note: Pretext-measured mobile header disclosure

Status: implemented

English | [中文](2026-08-26-mobile-header-disclosure-solver.zh.md)

## Problem

The session header above the chat (title crumb, slot-contributed action buttons, panel toggles, tab strip) had no progressive disclosure: on mobile the elements inside it overflowed instead of yielding. Breakpoints for this row are fragile because both bands are plugin-composed — how wide they render only becomes known after they render — and hand-tuned CSS breakpoints drift from true text widths.

## Decision

`header-layout.ts` in `ui-conversation` is the testable solver kernel of the lesson borrowed from localterm (`compute-header-layout.ts`): a three-rung tier ladder (FULL / NO_ACTIONS / TITLE_ONLY) ordered widest-first, with the title crumb and tab labels measured via `@chenglou/pretext` rather than breakpoint guesses. The containing component measures the rendered header box and the two slot bands with one `ResizeObserver`, and the solver reads those observed widths (hidden bands keep their last measurement) — no per-entry 32px estimate. Hysteresis restores a richer tier only when that tier clears a margin beyond its own required width, so a reflow across a boundary cannot bounce. The crumb is sized from the room the fixed bands leave, down to a one-ellipsis floor, and the tabs row always renders when there are tabs.

## Alternatives considered

- **CSS-one-breakpoint collapse.** Any single cutoff either sheds controls on a desktop-wide column or lets a long localized label overflow between breakpoints; it cannot track text that the slots own.
- **Per-entry width estimates in the solver.** Slot buttons are not uniform icons: the session-log control is ~3x a toggle button, so estimates either reserve wasted room or undercount and overflow.
- **Horizontal scroll in the header.** Hides controls behind a scroll gesture the user did not ask for and breaks the sticky row's single-gesture affordances.

## Consequences

- The header renders whole bands at the widest tier that fits measured reality, so a justified row never overflows; `data-header-tier` exposes the resolved rung for tests.
- The solver bias is one frame: a band's width is unknown until it first renders, then its measured box feeds the next pass.
- The solver is a pure function of measured inputs and is audited without a browser.
- Header element spacing stays parent-owned: bands remain siblings separated by the row's flex gap.

## Testing

`header-layout.client.spec.ts` sweeps widths 200–1280 under adversarial titles and measured full-band boxes asserting fit, asserts the shed order (actions before utilities, title last), honesty on oversized measured bands, and the hysteresis property around a real fit boundary; `skeleton.client.spec.tsx` pins the rendered tier attribute. The keyless `conversation-skin` web e2e adds the mobile header tier and row-overflow facts to its golden (tier 1, overflow 0 at 390px).

## Related

- [Plan mode narrow-viewport regression](../bug-fix/2026-08-06-plan-narrow-viewport-regression.md) — the earlier mobile row fix this replaces.
- localterm `apps/terminal/src/utils/compute-header-layout.ts` — upstream of the measured-text pattern.
