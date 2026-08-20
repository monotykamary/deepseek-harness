# Agent Note: Web running rows shimmer text-only with a high-contrast neutral band

Status: implemented

English | [中文](2026-08-20-web-running-row-text-shimmer.zh.md)

## Problem

The running signal on transcript rows — tool rows (ToolRow and the Bash toolview), the Skill row, the Think (reasoning) rows, and the generic command card — was a fixed-width glare band gliding over the entire row: a 300px semi-transparent strip animated `left: -300px → 100%` on top of the row content. The band washed the icon, separator, and background as it passed and visually spanned the full chat column width. When the sweep was first converted to a text-clipped shimmer, it used a one-step-brighter neutral band (tertiary → secondary) that was too subtle to read as an in-flight signal; a brand-blue variant (the turn-status band colors) was rejected because the running language of these rows stays neutral — blue is the visual identity of Deep Diving's shimmer, not of the harness transcript.

## Decision

Every running row carries the in-flight signal **exclusively in its own text**, through a text-clipped (background-clip: text) neutral gradient band that peaks at `--dsw-alias-label-primary` between each element's resting color — `--dsw-alias-label-secondary` for titles (and file links), `--dsw-alias-label-tertiary` for summaries and suffix fragments. The band is `background-size: 250% 100%` and sweeps `background-position: 100% 0 → 0 0` on a 1.4s linear loop (`dsh-*-row-text-shimmer` keyframes). The icon, separator, and row background stay untouched, so the tool identity and the row chrome remain static while only the glyphs shimmer.

The rules live in six surfaces that must stay in lockstep: `ToolRow.module.css` and `bash-sample.module.css` (ui-tool), `SkillRow.module.css` (ui-skill), `ReasoningRow.module.css` and `GenericCommandCard.module.css` (ui-conversation), and the injected stylesheet in dsh-codex's `CodexAssistantStyles.ts` — the codex repository renders its own Think rows with its own copy of the reasoning chrome, so the same text-only treatment is mirrored there (its markdown body rules are untouched; only the collapsed-row title/summary selectors changed). `prefers-reduced-motion` restores each element's resting color statically, and assistive technology state is unchanged: the visually hidden running label and the `data-state` attributes carry the state, the animation is colour-only.

## Alternatives considered

- **Keep the full-row glare band.** Rejected: the band washes the icon and background as it passes and spans the whole chat width, which reads as noisy chrome rather than a text signal.
- **One-step-brighter neutral band** (summary tertiary → secondary). Rejected: the contrast step is too small, especially in light mode; the running state was hard to see.
- **Brand-blue band** (the turn-status row's `--dsw-static-deepseek-500/200` sweep). Rejected: the harness transcript rows keep a neutral running language; blue is the identity of Deep Diving's shimmer, which the user explicitly did not want copied.
- **Whole-row dimming mask** (the pre-2026-07-28 implementation). Rejected earlier: the mask dims the entire row content including state dots.

## Consequences

The in-flight signal is confined to the row's own glyphs: the tool icon remains a stable identity while the text shimmers, and the row never paints over its background. The peak at `label-primary` gives a two-step contrast jump for summaries and a one-step jump for titles — clearly visible in both light and dark themes without introducing a hue. The cost is that every row renderer owns a copy of the rule set; a future row type (or a third renderer repository) must mirror it, and any future change to the running signal must update all six surfaces together. Reduced-motion users see static resting colors, and the animation remains colour-only so screen-reader behavior is unchanged.

## Testing

The component suites pin the `data-state` chrome (running/error/stopped) and the visually hidden labels, which this change does not alter; all ui-tool, ui-skill, ui-conversation, and dsh-codex renderer suites pass unchanged. The rebuilt bundles were verified in the live GUI: the served ui-tool/ui-skill/ui-conversation/dsh-codex bundles contain the `*-row-text-shimmer` keyframes and no `*-row-sweep` rules.
