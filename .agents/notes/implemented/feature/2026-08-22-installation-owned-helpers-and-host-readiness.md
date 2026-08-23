# Agent Note: Installation-owned helpers and host readiness

Status: implemented

English | [中文](2026-08-22-installation-owned-helpers-and-host-readiness.zh.md)

## Problem

The npm closure carried the Harness plugins but left some first-run capabilities discoverable only when a user invoked them. Portless depended on an unrelated PATH installation, shell and sandbox failures appeared at the first tool call, and `dsh doctor` reported package versions without deciding whether the host could run the default profile. Treating every host integration as installable would also be false: Tailscale, language servers, MCP servers, credentials, browsers, and operating-system facilities remain separately administered.

## Decision

The Web bundle pins the newest portless release compatible with the supported Node 22 floor and resolves its CLI from the installed package, never from PATH. `dsh portless setup` is the explicit interactive operation that installs and starts portless's privileged HTTPS service; `--portless` only registers the application alias and reports the setup command when the service is absent.

`@monotykamary/dsh-distribution-update` samples network-free host diagnostics once when its service mounts: DSH-home writability, the platform shell, the default sandbox chain, and desktop handoff. Every non-ready result is logged before Web readiness, the stable snapshot reaches the Updates page, and `dsh doctor` renders the same vocabulary. Blocking results make doctor exit 2. They do not stop the Web server because Settings and browser-based remediation must remain reachable.

The Updates client registers an onboarding step after the product welcome and before model credentials. Blocking diagnostics hold the application inert until the user explicitly continues; all results and remediation remain visible on the Updates page. Model credentials keep their existing dedicated onboarding step. Bash command and terminal defaults both resolve `bash` through PATH, so the shell diagnostic checks the executable the default profile uses.

Tailscale, configured LSP and MCP commands, model credentials, and desktop applications remain external integrations. User-facing references label those prerequisites rather than implying that the DSH package installs or configures them.

## Alternatives considered

**Automatically elevate from `--portless`.** Rejected because a serving flag must not unexpectedly prompt for sudo or alter system startup and trust stores. The dedicated setup command makes that privileged transition explicit.

**Fail Web startup on a blocking diagnostic.** Rejected because it removes the Settings UI and remediation path users need. Doctor provides the automation-friendly nonzero result; Web provides an explicit human override.

**Bundle every external integration.** Rejected because system daemons, provider credentials, arbitrary language and MCP servers, and desktop applications have independent owners and security lifecycles. DSH owns only helpers that are part of its default or named built-in behavior.

## Consequences

A normal installation carries the portless executable and invokes one consistent Bash name. First-run host failures are visible before tool execution without preventing access to configuration. Portless remains pinned below its latest release while DSH supports Node 22 because portless 0.14 and newer require Node 24; raising the Harness engine floor permits updating that pin. Diagnostic probes add bounded local process work at startup and report capability, not a guarantee that later host state cannot change.
