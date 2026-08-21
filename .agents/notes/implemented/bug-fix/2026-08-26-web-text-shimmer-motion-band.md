# Agent Note: running rows sweep on a motion-driven TextShimmer band instead of text-clipped gradients

Status: implemented

English | [中文](2026-08-26-web-text-shimmer-motion-band.zh.md)

## Problem

The text-clipped running shimmer introduced in [2026-08-20-web-running-row-text-shimmer](2026-08-20-web-running-row-text-shimmer.md) re-rasterizes every glyph of a running row each animation frame (background-position on `background-clip: text`); with several tool rows streaming at once the transcript pays one per-row text raster per frame, which showed up as sustained CPU in a long harness session. The pre-clip fixed-width glare band (the `left: -300px → 100%` sweep, 7cc554ef1 heritage) ran as a single painted layer over static glyphs and was noticeably smoother, but washed the icon, separator, and full row width.

## Decision

Replace the per-surface text-clipped rules with one compositor-only atom, `TextShimmer` in `dsh-client-ui-primitives`, animated by `motion` (motion.dev). The band is a plain 340px gradient strip absolutely positioned inside the row's own text box and translated with `transform: translateX` on a loop — one layer per row, glyphs rasterized once, same neutral wash that never escapes the text box (each surface keeps a two-property `position: relative; overflow: hidden` rule under `[data-state='running']`). The runtime: `motion` is a new dependency of the primitive package; `useReducedMotion()` replaces the per-surface reduced-motion CSS blocks (static resting colors, no band). The six lockstep surfaces (ToolRow, bash-sample, SkillRow, ReasoningRow, GenericCommandCardCSS + toolview TSX) now import the atom; the Codex mirror keeps its own copy and remains a mirror. The turn-status/retry shimmers (ChatView, MessageItem) are upstream visuals and are untouched.

## Alternatives considered

- **Text-clip with tail-row gating only.** Keeps the glyph rasters (still per-frame for the one running row) and keeps six copies; rejected because the band pattern is both cheaper and single-source.
- **CSS-only glare band.** Same painted-layer cost and the design already exists in history, but re-introduces per-surface duplication and loses the dependency-policy argument for motion.
- **Keep the whole-row glare band.** Rejected in the original note (washes icon/separator/background); the atom scopes the band to the text boxes instead.

## Consequences

Running signal stays color-only and aria-hidden, state rides `data-state` and the visually hidden labels, exactly as before; reduced-motion users see static resting colors. The bundle adds motion (~20 kB gz) to the web session, deleting the five shimmer CSS blocks and their media queries. Test suites pin the data-state chrome, which this change does not alter; TextShimmer carries its own client spec.

## Testing

`pnpm vitest run packages/client/ui-tool packages/client/ui-skill packages/client/ui-conversation packages/client/ui-primitives` passes (73 files). `tsc -b tsconfig.client.json` and oxlint on the touched files are clean. The served transcript was verified in the live GUI: running rows show the sweep band confined to the text boxes and reduced-motion stalizes them.
