# Agent Note: T3-adapted Web conversation chrome

Status: implemented

English | [中文](2026-08-18-t3-adapted-web-conversation.zh.md)

## Problem

The Web conversation already centered messages and floated the composer, but its blue-grey canvas, bright prose, uniformly large spacing, solid input card, and permanently visible message actions gave long tool-rich Sessions more visual weight than their content hierarchy required. Compact viewports also introduced a bordered hamburger unrelated to the panel control used by the persistent sidebar, while the New Session glyph in the 56px rail inherited expanded-row alignment and sat off the other icons' axis.

A direct T3 ChatView copy would replace DSH's keyed Chat Node registry, resident composer chain, view tabs, scroll restoration, approval and question takeovers, telemetry, and Workspace-aware layout. The adaptation needs to preserve those owners while making the assembled conversation read as one calm system across desktop, tablet, and compact widths.

## Decision

`ui-theme` owns conversation-specific roles derived from T3 Code revision `a4cc1367b03ee0c1dc2b50fceac81ef5e63212e2`. The light and dark canvases are `#fcfcfc` and `#0a0a0a`; neutral message, divider, composer surface, outline, highlight, shadow, blur, opacity, and saturation roles complete the pair. `ConversationRoot` scopes those roles to the center column instead of replacing the product-wide base palette.

The Session header keeps DSH's title, utilities, and contributed view tabs. Its title row follows T3's 52px vertical rhythm through 10px top padding, a 32px row, and a 10px parent-owned gap before the tabs; the divider uses the conversation role. AppFrame exposes three exclusive disclosure states: the preference-controlled inline sidebar at 1024px and above, the auto-collapsed but re-openable 56px rail from 768px through 1023px, and T3's max-md drawer below 768px. The compact action is a transparent 32px button with the same 18px panel-left glyph as the rail, centered on the title row; the zero-width sidebar track gives the conversation the complete compact frame.

The Chat flow keeps its 748px content cap, 780px composer cap, sticky scroll owner, keyed Node order, and top mask. Its parent gap is 12px. User messages use a neutral surface, 16px radius, 12px padding, 80% width cap, and 15/24 typography. Assistant narration uses the same 15/24 rhythm with 80% foreground. Clock and context labels can shrink and elide, so their unbroken metadata never establishes a compact-column width floor. User and settled Assistant action rows remain mounted and keyboard reachable, but fine pointers reveal them only on message hover or focus; touch and non-hover devices keep the controls visible.

`InputBar` retains its textarea, menus, docks, controls, drag intake, width axis, and 22px radius. Its solid fill becomes an 80% palette surface with T3's 12px light or 16px dark backdrop blur, saturation, faint outline, dark top highlight, and restrained palette shadow. T3 intentionally positions this translucent glass above the live timeline: while a reader scrolls away from the end, text can pass beneath the blurred card; the measured composer clearance keeps the terminal content reachable at the end. The no-Workspace dashed state and all composer takeovers keep their existing behavior.

The 56px rail retains 36px action boxes and the existing transition. The collapsed New Session row centers its SVG like the identity, Search, and Add Workspace controls. The conversation shell owns one 20px top-fade height; Trajectory consumes it as top padding so its sticky toolbar starts below the mask. [`THIRD_PARTY_NOTICES.md`](../../../../THIRD_PARTY_NOTICES.md) retains the reviewed revision and complete T3 MIT permission and warranty text.

## Testing

Conversation CSS tests pin token ownership, scoped canvas, title rhythm, composer glass, message density, compact metadata shrinkage, parent-owned spacing, and fine-pointer action visibility. Layout, sidebar, and Trajectory tests pin the 768px rail-to-drawer boundary, exclusive mode markers, shared panel glyph, transparent compact action, centered New Session control, and top-fade padding. The keyless `conversation-skin` Web journey cold-seeds a real Session and records computed light/dark colors, all three sidebar states and their controls, zero compact Chat overflow, and Trajectory toolbar clearance through the assembled profile. Live Chromium inspection covers the dark desktop Session and responsive frame geometry.

## Alternatives considered

**Copy T3's ChatView, MessagesTimeline, and ChatComposer.** Those components combine T3 routing, provider state, Git worktrees, LegendList virtualization, and Tailwind primitives. Replacing DSH's slot and projection owners would couple presentation to a second runtime model.

**Change the global dark palette to `#0a0a0a`.** That would restyle settings, details, dialogs, terminals, and third-party plugin surfaces without reviewing their contrast. A conversation-specific canvas delivers the hierarchy where intended.

**Hide action rows with `display: none`.** Removing them from layout or accessibility would move transcript geometry on hover and make keyboard discovery unreliable. Opacity preserves the row and reveals it through hover or focus; coarse pointers never enter the hidden state.

**Keep the compact hamburger as separate mobile chrome.** A unique bordered control made the title row look taller and taught a second symbol for the same action. Reusing the panel glyph makes desktop, tablet, and compact navigation consistent.

## Consequences

The center column is substantially darker than the sidebar in the dark palette and slightly off-white in the light palette, making navigation and conversation distinct without a stronger border. Messages and tools fit more comfortably in long Sessions, while 15px prose is denser than the previous 16px presentation.

Backdrop filtering costs more paint than a solid card, but it is confined to one bounded composer and reduced to palette constants. Hover-hidden controls reduce resting noise while retaining their layout footprint, so a blank strip can exist beneath a message until the pointer enters it. The adaptation changes no Session event, wire field, model input, store, plugin registration, or composer operation.
