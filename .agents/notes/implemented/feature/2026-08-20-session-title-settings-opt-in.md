# Agent Note: Session-title settings opt-in

Status: implemented

English | [中文](2026-08-20-session-title-settings-opt-in.zh.md)

## Problem

The shipped Web composition enabled automatic LLM session titles unconditionally: every fresh session paid one auxiliary model call (up to 64 output tokens) to title the sidebar row. The title model was never the user's choice — it silently followed the session's main-request route — and the auxiliary request had no kill switch short of editing the bundle patch. Product and user needed the capability off by default, with a first-class toggle in the settings modal.

## Decision

Automatic title generation is opt-in everywhere. The shared `SessionTitleLlmConfig` schema carries `enabled` with the product default `false`; the base bundle restates `enabled: false` on the `session-title-llm` row for explicitness, and the ACP session-title example opts in with `enabled: true`.

The provider plugins register through a new settings-gated helper, `registerSessionTitleLlmSettingsProvider()`, in `dsh-session-title-llm`. It owns one `session-title-llm` settings namespace and mounts the provider only while the resolved section has `enabled: true`, judged from the composition entry when no settings provider exists and live through `installSettingsSection` when one does. A disable settles only after in-flight title calls quiesce, and a re-enable inside that window waits for the old registration to release before mounting again, because the title service rejects a registration while one is closing. `registerSessionTitleLlmProvider()` now returns the registration disposer.

The Web surface owns a General settings row contributed by a new `ui-session-title` client plugin: title, description, and an `aria-pressed` toggle bound to the same `session-title-llm` namespace through `settingsScope`. One gesture publishes the live value and writes the `enabled` field; the Host provider mounts or unmounts from the same commit, so the toggle is the shipped opt-in. The web e2e scaffold no longer disables the provider row — the default-off gate already prevents its fire-and-forget title call from racing the replay cursor — and the settings-chrome scenario toggles the row through the persisted document.

## Consequences

Disabling automatic titles costs nothing: the deterministic fallback still titles every session, and no model-visible input changes. Enabling costs one auxiliary call per fresh session, at most 64 output tokens, using the session's own route unless the deployment pins `provider`/`model`. The `session-title-llm` section joins `$DSH_HOME/settings.yaml`, hot-reloaded like every other namespace. Deployments that want titles on by default set `enabled: true` in a patch layer instead of editing the plugin.

## Verification

The first-prompt settings spec pins the default-off behavior, live mount/unmount through a real settings provider, and the pending-disposal re-registration race. Provider specs and the ACP session-title snapshot exercise the enabled path unchanged. The client row specs cover the toggle gesture and scope adoption, and the settings-chrome e2e flips the row and asserts the persisted document.

## Alternatives considered

**Keep the row disabled via composition only.** A disabled bundle row renders no namespace, so the settings toggle could not bind it; the opt-in has to be a live setting for the GUI to exist.

**Enable through a per-session flag.** Titles are a fresh-session cadence; a document-level opt-in matches the shipped `first-prompt` provider and keeps the toggle in one place.
