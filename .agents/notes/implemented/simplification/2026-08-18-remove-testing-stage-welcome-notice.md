# Agent Note: Remove the internal-testing welcome notice

Status: implemented

English | [中文](2026-08-18-remove-testing-stage-welcome-notice.zh.md)

## Problem

Every GUI first launch opened with the shared-modal internal-testing notice (内测声明): "DeepSeek Harness 0.1 remains in testing for Harness developers", preceding the DeepSeek credential step. The notice is pre-release framing with no action for a user who is not a Harness developer, and the product no longer presents itself as internal-testing.

## Decision

Remove the `welcome-notice` step from `settings.onboarding` rather than rewording it. `ui-settings-models` no longer registers the step; its component (`WelcomeNotice`), acknowledgement store (`welcome-store.ts`), copy owner (`onboarding-copy.ts`), locale keys, and their package and browser-e2e coverage are deleted. `ui-settings-general` keeps registering the `ui-onboarding` namespace and its `welcomeNoticeVersion` field so stored settings documents remain valid, exactly as the earlier [first-run beta notice removal](2026-08-13-remove-first-run-beta-notice.md) kept it. The `deepseek-official` credential step and the shared `OnboardingModal` remain unchanged; a fresh loopback GUI boots straight to the credential step (or the ready app) with no interstitial.

## Alternatives considered

**Keep the step dormant behind a config flag.** Rejected: the notice is pre-release framing the product no longer presents, and a dormant step would keep its acknowledgement seam, copy, tests, and schema surface in the shipped bundle for a dialog nobody sees. Reintroduction can register a fresh `settings.onboarding` step on the unchanged field instead.

**Deregister the `ui-onboarding` namespace and field as well.** Rejected on the earlier removal's precedent: stored settings documents already carry the section, and the settings seam validates stored documents against registered namespaces; keeping the registration keeps those documents valid at no cost.

## Consequences

A fresh profile never sees the internal-testing interstitial; the DeepSeek credential step remains the only onboarding dialog. The `ui-onboarding.welcomeNoticeVersion` field stays registered host-side for document compatibility. The [versioned welcome onboarding](../feature/2026-07-30-versioned-gui-welcome-onboarding.md) and [shared-modal product onboarding](../feature/2026-08-13-shared-modal-product-onboarding.md) decisions are partially superseded for the welcome step and stay active for their remaining surface; this note owns the removal rationale. Reintroduction follows the same seam: a new step in `settings.onboarding` reusing the unchanged versioned field.
