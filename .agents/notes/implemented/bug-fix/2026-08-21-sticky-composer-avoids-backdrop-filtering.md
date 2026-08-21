# Agent Note: Sticky composer avoids backdrop filtering

Status: implemented

English | [中文](2026-08-21-sticky-composer-avoids-backdrop-filtering.zh.md)

## Problem

The active composer is a sticky child of the conversation scrollport. Its textarea paints a native caret but keeps text transparent; an aligned sibling backdrop paints the visible draft. Chromium on some Linux Wayland GPU stacks can stop repainting a sticky filtered subtree while the transcript scrolls. The card then disappears during scrolling, and later draft updates can leave only the first repainted character visible while the remaining transparent textarea value still accepts input.

## Decision

The composer card keeps its translucent color-mixed surface, outline, isolation, and shadow but applies no `backdrop-filter` or `-webkit-backdrop-filter`. The solid lower band of the sticky composer seat remains behind the card, so the translucent surface does not expose transcript text at rest. Removing the filtered stacking operation leaves the browser to paint the sticky card and its textarea/backdrop layers through the ordinary compositing path.

The conversation style test rejects either filter property on the card. The long-chat browser scenario also reads the assembled card's computed `backdrop-filter` after opening a populated session, alongside its existing scroll-away and composer-resize coverage.

## Alternatives considered

- **Keep the blur and force another compositor layer.** Rejected because `will-change`, a 3D transform, or paint containment changes layer allocation but does not remove the driver-dependent filtered-sticky path; these hints can reproduce the same loss on a different GPU stack.
- **Disable blur only for Linux user agents.** Rejected because browser identity does not identify the compositor, graphics driver, Wayland/X11 mode, or whether hardware acceleration is active, and the failure can affect other platforms.
- **Make the textarea text opaque.** Rejected because the aligned backdrop owns range colors and reference glyph substitution; painting the complete draft twice would produce fringed text and obscure substituted glyphs.

## Consequences

The composer loses background blur and saturation while retaining the translucent T3 treatment. In return, visible draft text and the sticky card no longer depend on filtered-subtree repainting. Headless Chromium cannot reproduce every desktop GPU path, so the tests prove removal of the triggering CSS operation rather than emulating a specific Arch Linux graphics stack.
