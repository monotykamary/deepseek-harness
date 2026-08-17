# Agent Note: Remove the shared session-telemetry mount and its DeepSeek endpoint

Status: implemented

English | [中文](2026-08-17-remove-shared-session-telemetry-mount.zh.md)

## Problem

The shared dsh base bundle mounted `@monotykamary/dsh-session-telemetry-otel` in every profile with a baked-in production collector, `https://harness-telemetry.deepseeksvc.com/v1/logs`. A deployment that set `DSH_TELEMETRY_MODE` without also overriding the endpoint therefore exported complete session content — message text, tool arguments and results, and workspace paths — to DeepSeek's internal collector. The harness ownership moved away from DeepSeek, so no shipped default may name a DeepSeek telemetry destination, and the env-seam consent machinery (`DSH_TELEMETRY_MODE`, `DSH_TELEMETRY_OTLP_URL`, `DSH_TELEMETRY_DISABLED`) existed only to govern that shipped row.

## Decision

The base bundle mounts no telemetry backend, and no shipped profile references any `DSH_TELEMETRY_*` environment variable. `packages/bundle/base` drops the `session-telemetry-otel` row and its `@monotykamary/dsh-session-telemetry-otel` dependency; the CLI deletes the `DSH_TELEMETRY_DISABLED` boot patch (`resolveTelemetryPatch`), its spec, and the CI workflow entries that set it. The telemetry capability itself remains shipped in `dsh-session-telemetry` and `dsh-session-telemetry-otel`: a deployment that wants OTLP session reporting inserts its own row with an explicit `exporter.url` (uploading modes fail plugin load without one). The `/feedback` acknowledgement therefore discloses `Session sharing is not configured.` on every shipped profile; the mounted-backend disclosures stay covered by the OTel package tests and the web e2e golden pins the new default sentence.

The [default-mount decision](../../archived/feature/2026-07-31-web-telemetry-default-mount.md) and the [default-off decision](../../archived/feature/2026-08-10-telemetry-default-off.md) are archived: the mount and its env consent machinery no longer ship.

## Alternatives considered

**Keep the row mounted in DISABLED mode and only remove the baked-in endpoint.** Rejected: a mounted-but-inert backend row keeps loader surface and env seams whose only purpose was the removed default, and a disabled row still shapes the `/feedback` acknowledgement instead of the simpler not-configured disclosure.

**Keep DSH_TELEMETRY_DISABLED as a universal kill switch for deployment-added rows.** Rejected: a deployment that inserts its own row controls its own patch layer and can disable it there; a CLI-recognized switch targeting one row id is machinery for a default that no longer exists.

**Delete the telemetry packages with the mount.** Rejected: the seam and the OTel backend are generic OTLP reporting a self-hosted deployment composes explicitly; nothing in them is DeepSeek-specific once the endpoint default is gone.

## Consequences

- No shipped profile exports session data, and no shipped artifact names a DeepSeek telemetry endpoint.
- The `x-deepseek-harness-*` provider headers are a separate surface, defaulted off by the [headers-opt-in decision](../feature/2026-08-17-deepseek-request-headers-opt-in.md).
- A deployment composing `@monotykamary/dsh-session-telemetry-otel` supplies its own endpoint and mode in the row; exports are the raw captured copy unless it mounts `session-telemetry/record` rules.
- CI no longer sets `DSH_TELEMETRY_DISABLED`; the packed-install and workflow specs dropped that pin.
