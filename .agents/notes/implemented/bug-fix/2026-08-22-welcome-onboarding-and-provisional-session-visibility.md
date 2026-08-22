# Agent Note: welcome onboarding and provisional Session visibility

Status: implemented

English | [中文](2026-08-22-welcome-onboarding-and-provisional-session-visibility.zh.md)

## Problem

The official welcome occupied the no-session Conversation Hero, so Session hydration replaced it before a returning user could read it. The distribution Updates page used fallback colors and native buttons that diverged from the shared dark-theme tokens and controls. A merged tree projection also exposed the current blank Session as a sidebar **New Session** card even though the New Session route is provisional.

## Decision

The official-brand plugin owns the first `settings.onboarding` entry. The settings coordinator starts after the Session directory is ready and does not dismiss an active entry when an existing Session becomes current. The welcome owns its blocking modal and app-root `inert` lifetime, persists version `2026-08-22.1` through the retained `ui-onboarding.welcomeNoticeVersion` field on eligible connections, and uses process-local acknowledgement elsewhere. Completion transfers ownership to later onboarding entries such as DeepSeek credential setup.

The Updates page uses shared `Button` variants and `--dsw-*` theme tokens for cards, labels, statuses, borders, and badges. Workspace projections exclude every `blank` Session in grouped, flat, and search views. Browser order may promote the provisional id so the ordinary row appears at the intended position after the first prompt, but no provisional card renders.

## Alternatives considered

| Alternative | Rejected because |
|---|---|
| Keep the welcome in the Conversation Hero | Session hydration replaces the Hero before the copy can be read. |
| Keep onboarding limited to a blank current Session | Selecting a restored Session would still dismiss an active product step. |
| Show the current blank Session as a sidebar card | It duplicates the provisional New Session route and exposes actions before a first prompt exists. |

## Verification

Package tests cover welcome registration, host and process-local acknowledgement, onboarding persistence across a non-blank current Session, shared update controls, hidden blank rows, and post-prompt materialization. The keyless DeepSeek onboarding Web scenario captures the welcome modal, acknowledges it, and then continues through credential setup.

## Consequences

Welcome copy no longer competes with the Conversation Hero or disappears during Session hydration. A changed welcome version can deliberately reopen the modal. Blank Sessions remain addressable runtime state without becoming sidebar navigation entries.
