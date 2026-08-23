# Agent Note: Reusable receipt and attachment presentation atoms

Status: implemented

English | [中文](2026-08-23-reusable-receipt-and-attachment-atoms.zh.md)

## Problem

A composed application outside the conversation tree can own image drafts and receipt-backed task output, but the main chat attachment rail, image lightbox, and changed-files hierarchy were reachable only through conversation slots. Copying those components would split interaction, accessibility, and receipt-projection behavior. Importing the deliverables Node plugin only to read its ledger would also evaluate unrelated prompt and tool registration code.

## Decision

`@monotykamary/dsh-client-ui-attachment/client` exports the pure `AttachmentRail` and `ImageLightbox` atoms used by its conversation slot entries. Consumers own files, object-URL lifetime, removal, preview selection, limits, and localized labels; document drag state and conversation draft ownership remain private to the slot plugin.

`@monotykamary/dsh-client-ui-deliverables/client` exports `ProducedFilesCard`. It renders the same receipt-backed hierarchy as the chat turn tail from owner-supplied mutation groups and labels. Complete-diff navigation is optional: the chat wrapper supplies the Changes action, while a consumer without that destination gets folder controls and non-interactive file rows instead of inert buttons.

`ProducedFilesCard` and every recursive tree/group own `width: 100%`, `max-width: 100%`, and border-box clipping. Indentation consumes the row’s existing width instead of increasing a nested flex item’s intrinsic width, so addition/deletion totals remain inside the card at every path depth.

`Menu` accepts an optional non-selectable `header` above its internally scrolling item viewport. Search consumers own query, focus, filtering, pointer/keyboard highlight, and empty-state behavior; Menu retains portal placement, viewport clamping, dismissal, and selection.

`@monotykamary/dsh-tool-session-mutations/ledger` is a pure Node entry for `mutationLedger`, `renderMutation`, `boundedText`, and their types. Automation captures receipts from a settled Session without evaluating the deliverables plugin. Each consumer owns persistence and model-context bounds; the ledger remains receipt-only and does not claim shell or external changes.

## Alternatives considered

**Copy the chat components into each application.** This avoids new exports but creates independent thumbnail geometry, paging, lightbox behavior, changed-file grouping, and accessibility fixes.

**Import the plugin root everywhere.** The root registers model guidance and a tool and carries Cordis dependencies unrelated to receipt projection. A pure ledger entry preserves the package owner without those effects.

**Route non-chat state through conversation slots.** Slots carry conversation ownership and Session scope. An independent application already owns its drafts and durable output, so projecting that state into a hidden conversation would create false lifecycle coupling.

## Consequences

Attachment and changed-file presentation have one implementation across composed applications, nested totals stay contained, searchable pickers reuse Menu placement without nesting an input inside a menuitem, and automation can reuse the mutation projection without plugin side effects. The exported atoms widen the packages' supported client API, so their pure-props behavior and package artifacts are tested and documented. Read-only changed-file cards deliberately omit full-diff actions; consumers that need navigation must supply a real destination. Receipt handoff remains incomplete for shell and external changes and must state that limit wherever it becomes model-visible.
