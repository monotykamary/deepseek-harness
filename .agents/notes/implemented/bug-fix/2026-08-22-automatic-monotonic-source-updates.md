# Agent Note: Source updates are automatic and monotonic

Status: implemented

English | [中文](2026-08-22-automatic-monotonic-source-updates.zh.md)

## Problem

The update inventory treated every unequal registry value as an available update. A source checkout at `0.1.0-rc.11` therefore offered `0.1.0-rc.8` as a target, while dependency ranges such as `^0.1.0` appeared as changes from an installed `0.1.0`. Activating the source action returned a command for the operator to copy instead of applying the update.

## Decision

Distribution targets use semantic-version ordering. An exact target is actionable only when it is greater than the installed version; a range is actionable only when its minimum is greater than the installed version. Older targets, equal targets, and ranges already at or below the installed version never trigger the badge or action and are not rendered as transitions.

Source checkouts and npm-global installations use the owner-only detached worker. The source worker locates the repository containing the running app manifest, then runs `git pull --ff-only`, `pnpm install`, and `pnpm run build` sequentially from that root. It stops at the first failure, preserves the existing checkout when Git cannot fast-forward, strips credential-like environment variables, and records completion under `$DSH_HOME/updates/status.json`. Nix, npx, and unknown channels remain externally managed.

This decision partially supersedes the source-channel exception in [the cohesive distribution decision](../architecture/2026-08-12-cohesive-distribution.md).

## Testing

Provider tests pin prerelease downgrade suppression, satisfied dependency ranges, source-root discovery, detached launch, command order, stop-on-failure behavior, and owner-only status. The assembled Web snapshot uses a local registry to prove that a source upgrade offers `Update DSH`, omits manual Git guidance, and does not present tested companion ranges as upgrades.

## Alternatives considered

**Continue displaying a source command.** Rejected because the running source manifest identifies the checkout and the detached worker can apply the same bounded operation without requiring terminal work.

**Compare version strings for inequality.** Rejected because inequality cannot distinguish upgrades from prerelease downgrades or exact installed versions from compatible dependency ranges.

**Reset or rebase source checkouts before updating.** Rejected because an updater must not rewrite local history or discard work. Fast-forward-only pull fails without changing divergent history.

## Consequences

The Updates page performs supported source and npm-global updates from one action and never offers a semantically older target. Source updates can fail on dirty or divergent checkouts, missing executables, install failures, or build failures; the worker records that failure and leaves history intact. A completed update still requires restarting the running Harness process.
