# Agent Note: Lucide icons across the web application

Status: implemented

English | [中文](2026-08-22-lucide-icons-across-web-app.zh.md)

## Problem

The web application mixed a large hand-authored SVG set with one-off SVGs, symbolic text glyphs, and a few Lucide components. Similar actions therefore used unrelated geometry and stroke rules, while changing the visual language required edits across many feature packages.

## Decision

Every interface icon uses `lucide-react`. `@monotykamary/dsh-client-ui-primitives` owns adapters that preserve the existing semantic component names, sizes, class names, and current-color behavior, and feature packages consume those adapters instead of embedding SVG paths. Existing direct Lucide consumers remain valid.

The branded whale and wordmark remain custom artwork. Illustrations, the hero glow, progress/data visualizations, and `StateDot` are not interface icons and retain their purpose-built SVG rendering.

## Alternatives considered

**Keep custom SVGs and align their styling.** Shared stroke values would not align geometry or remove the maintenance cost of copied path data and one-off glyphs.

**Import Lucide directly in every feature package.** This makes every package own a dependency and repeats sizing conventions. Shared adapters keep the visual source explicit while preserving the established UI API.

**Replace the whale with a generic Lucide animal.** The whale is product identity rather than interface chrome, so substituting a generic icon would discard the brand mark.

## Consequences

The application ships one maintained icon family and feature code no longer owns icon paths. The adapter layer remains a naming indirection, but it centralizes semantic choices and lets existing call sites migrate without unrelated API churn. Focused client tests and the client TypeScript program verify the shared exports and their consumers.
