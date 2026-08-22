# Agent Note: The DSH app owns its tested distribution

Status: implemented

English | [中文](2026-08-12-cohesive-distribution.zh.md)

## Problem

A shipped profile persisted the same bundle names that a user-managed profile used. The launcher could recognize a few exact historical tuples, but after Fabric and Fovea joined the shipped profile it could not distinguish the current installation-owned layers from user configuration. A DSH update could therefore update the executable while a profile or independently ranged companion remained stale.

The installation also exposed no common version inventory. npm, npx, Nix, and source checkouts require different update operations, so a generic update button would replace the wrong installation or imply success where the package manager remained authoritative.

## Decision

The `@monotykamary/dsh` app is one tested distribution. Its manifest pins exact Fabric and Fovea versions and records the same versions under `dsh.distribution.companions`; release verification rejects drift between those fields. Shipped profiles persist `dsh.profile.template` plus user-managed `bundles`. The launcher resolves the current template from its own installation on every boot and migrates recognized legacy prefixes while preserving appended user bundles.

`@monotykamary/dsh-distribution-update` projects installed package versions, caches bounded npm registry checks, detects the installation channel, and exposes status to CLI and Web Settings. npm-global installations and source checkouts launch the detached worker; the source-channel change is owned by [the automatic monotonic update decision](../bug-fix/2026-08-22-automatic-monotonic-source-updates.md). The worker strips credential-like environment variables, writes owner-only status, and never restarts the harness. Nix, npx, and unknown channels return externally managed guidance.

The Settings Consumer registers an Updates page and a badge seat inside the existing Settings trigger. A registry failure is an operator-visible diagnostic, not an application startup failure.

## Testing

Profile tests cover fresh template manifests, both historical tuple migrations, preservation of appended user bundles, unknown templates, and duplicate layers. Distribution tests cover channel detection, installed closure inventory, registry success and failure, in-flight folding, cached status, and detached-launch refusal outside npm-global installs. CLI tests cover every new command parse and JSON output path. The assembled Web snapshot covers the Updates section and trigger badge through the real profile composition.

## Alternatives considered

**Keep the complete shipped tuple in each profile.** Rejected because tuple equality cannot distinguish a stale managed profile from deliberate user composition after the first customization.

**Let every companion follow its own latest tag.** Rejected because newest does not mean mutually tested. The app release manifest is the compatibility authority.

**Run npm directly inside the Host process.** Rejected because replacing loaded package files is platform-sensitive and couples installation lifetime to the running harness. A detached worker owns installation and reports completion independently.

**Offer self-update for every channel.** Rejected because Nix and source installations belong to external state managers, while an npx invocation is already disposable. DSH reports the correct command instead of taking ownership it does not have.

## Consequences

Updating the app updates the default profile stack without editing user configuration. User-added bundles and patch layers remain stable across releases. Companion releases become available to DSH only after a DSH release pins and tests them.

Registry checks add bounded background network traffic to the Web profile. Operators can change the registry, interval, startup behavior, and timeout in a later patch layer. npm-global updates require an explicit action and a manual restart; rollback remains a package-manager operation.
