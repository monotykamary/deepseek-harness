# Agent Note: Lucide web icon system

Status: implemented

English | [中文](2026-08-22-lucide-web-icon-system.zh.md)

## Problem

The shipped web client mixed 70 hand-authored `ic_ds_*` glyphs, feature-local SVG action icons, Unicode control symbols, and a few direct `lucide-react` imports. The linked `dsh` web CLI therefore exposed different stroke weights and visual vocabularies across the sidebar, composer, messages, settings, terminal, and trajectory views. Adding an ordinary action also required choosing between extending the private glyph file and importing another icon source.

## Decision

Lucide is the only source for product-authored web interface icons. `@monotykamary/dsh-client-ui-primitives` owns the `lucide-react` dependency and re-exports the canonical Lucide component names from `src/icons/index.tsx`; consuming packages import those names from ui-primitives and pass the size required by their layout. The migration removes the `ic_ds_*` implementation and compatibility names rather than retaining aliases during the pre-release period.

Feature-local action SVGs and Unicode expand/collapse symbols use the corresponding Lucide components, including composer send/stop, permission shields, todo states, message actions, file controls, terminal split/fullscreen controls, and trajectory glyphs. Filled states set `fill="currentColor"` on the Lucide component while preserving its stroke.

Brand artwork remains product-specific: `FishLogo` and `BrandWordmark` retain their SVG geometry. `DropOverlay` and `EmptyHero` remain illustrations, and `ContextMeter` remains a proportional data visualization; they are not icon alternatives. `verify-web-icons` pins these non-icon SVG files, rejects new inline SVGs elsewhere, rejects direct `lucide-react` imports outside the barrel, and rejects the removed legacy component names.

## Alternatives considered

- **Give every feature package a direct Lucide dependency**: rejected because it duplicates dependency ownership and permits versions or import policy to drift. The zero-Cordis ui-primitives package already owns shared visual atoms and provides one published browser dependency path.
- **Keep `Icon*` compatibility aliases backed by Lucide**: rejected because there are no external consumers to protect before the first tagged release, aliases preserve the obsolete design vocabulary, and native Lucide names make icon selection searchable in upstream documentation.
- **Keep the Figma glyphs where a close Lucide icon exists**: rejected because preserving local approximations is the inconsistency this change removes. Product identity artwork and non-icon visualizations remain explicit exceptions rather than an open-ended glyph allowlist.

## Consequences

The interface adopts Lucide geometry and stroke weight throughout, so browser snapshots can change even when control dimensions and accessible labels do not. Existing icon sites retain explicit dimensions to avoid Lucide's 24px default changing layout. A new interface icon must exist in Lucide, be re-exported by ui-primitives, and pass `verify-web-icons`; a genuinely product-specific illustration or visualization requires a named gate exemption.
