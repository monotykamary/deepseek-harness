# Agent Note: Menu check before trailing adornment

Status: implemented

English | [中文](2026-08-23-menu-check-before-trailing-adornment.zh.md)

## Problem

A selected `Menu` row always appended its check after the complete owner-provided label. Drilldown owners placed their chevron inside that label, so the resulting order was label, chevron, check. Moving the check before the whole label would put it beside the leading icon instead of keeping both right-side indicators together.

## Decision

`MenuItem.trailing` carries a non-interactive row adornment such as a drilldown chevron. `Menu` renders the leading icon, flexible label, selected check, then `trailing`; an unselected row omits the check without moving the adornment. Factory New Session Task, Flow, and named-flow rows use this slot instead of embedding chevrons in their labels.

## Alternatives considered

**Let each owner render its own check.** Owners would have to suppress `selectedId`, duplicate the canonical selected marker, and lose one shared ordering rule.

**Inspect or rearrange label children.** `label` is an opaque `ReactNode`; depending on its internal markup would make Menu behavior owner-specific and brittle.

**Render the check before the label.** This fixes DOM order only by moving selection away from the right-side controls and breaks ordinary rows without chevrons.

## Consequences

Drill rows consistently show check before chevron while ordinary selected rows retain a trailing check. The optional field widens `MenuItem` without changing existing callers. Primitive and assembled Factory tests pin the marker order.
