# Agent Note: Read-only media thumbnail rails

Status: implemented

English | [中文](2026-08-23-read-only-media-thumbnail-rails.zh.md)

## Problem

Browser features outside conversation need the same compact, horizontally paged visual-review rail as pasted chat images. Reimplementing its 64px geometry, wheel handling, edge arrows, and responsive behavior in each consumer would drift, while the existing atom required image markup and a remove action even when the owner exposes immutable generated artifacts.

## Decision

`@monotykamary/dsh-client-ui-attachment/client` keeps one `AttachmentRail` atom for mutable composer drafts and read-only owner-supplied media. `AttachmentRailItem.previewKind` selects image or video markup, with image as the compatibility default; video rows render the supplied URL with a play marker. `onRemove` and `removeLabel` are optional together, so omitting removal produces no hidden or disabled delete chrome. The owner remains responsible for authorization, loading, media lifetime, opening behavior, and fullscreen presentation.

The conversation attachment pipeline remains image-only. Read-only video presentation does not add video ingestion, durable attachment fields, Session events, or a chat-history video renderer.

## Alternatives considered

**Copy the rail into each consumer.** This avoids widening the shared atom but duplicates non-trivial scrolling, resize, reduced-motion, touch, and accessibility behavior and lets the visual pattern diverge.

**Add a separate artifact rail atom.** A second component would differ only in thumbnail kind and removal, creating parallel maintenance for the same interaction.

**Expand conversation attachments to videos.** That requires host limits, durable media records, model/provider capability decisions, and Session projection changes that read-only review does not need.

## Consequences

External features can reuse the exact chat-paste thumbnail geometry for immutable images and videos without pretending they are composer drafts. Existing callers retain image and remove behavior. Video bytes are not interpreted or persisted by the rail, and fullscreen carousel policy stays with the consuming feature. Attachment atom tests pin video markup, the play marker, read-only omission of remove controls, and the existing paging behavior.
