# Agent Note: Custom-flavor default bundles and their publication

Status: implemented

English | [中文](2026-08-20-custom-flavor-default-bundles-and-publication.zh.md)

## Problem

This fork is a custom flavor of upstream DeepSeek Harness: the shipped profile composition stayed exactly upstream's (`dsh-base` + `dsh-web-app` / `dsh-headless`), so `dsh-fabric` and `dsh-fovea` — the capabilities this flavor exists for — reached a user only through a manual `dsh plugin --profile web add <path>` or the sibling repos' `install:local` scripts. Nothing had been published since `0.1.0-rc.5` although the repository carried `0.1.0-rc.7`, and neither `dsh-fabric`, `dsh-fovea`, nor any `@dsh-fabric/*` package existed on npm. The sibling manifests were unpublishable as written: every `@monotykamary/*` dependency used the `link:` protocol pointing into this checkout, which `pnpm pack` leaves verbatim and npm consumers resolve relative to their own tree.

## Decision

### The shipped profiles are the custom composition

`PROFILE_TEMPLATES.web` is `['@monotykamary/dsh-base', '@monotykamary/dsh-web-app', 'dsh-fabric', 'dsh-fovea', 'dsh-factory']` and `PROFILE_TEMPLATES.headless` is `['@monotykamary/dsh-base', '@monotykamary/dsh-headless', 'dsh-fabric', 'dsh-fovea']`. All three companion bundles are dependencies of the `dsh` app, so they resolve from the installation anchor like every in-box bundle, and `healProfilesModuleFallback` symlinks them and their dependency closures into `$DSH_HOME/profiles/node_modules`. `LEGACY_PROFILE_TUPLES` recognizes earlier installation-owned tuples and preserves appended user layers when assigning template ownership. A managed profile whose name matches its template also transfers every currently template-owned bundle out of `dsh.profile.bundles` on load and persists the remainder; expanding a shipped template therefore absorbs an already user-installed companion without composing it twice, while custom profiles and repeated user-only layers still fail loud.

### Local development resolves the published bundles by default

The harness workspace resolves `dsh-fabric` and `dsh-fovea` from npm; the sibling `link:` override pair originally documented here is superseded by [npm-default custom-flavor resolution](2026-08-20-npm-default-custom-flavor-dev-install.md), which keeps live-linking as an uncommitted opt-in. pnpm not installing the dependencies of `link:`-resolved packages remains the right property for that opt-in path: each sibling checkout carries its own complete install (its own overrides pin `@monotykamary/*` back to this checkout), and Node's symlink-following resolution reaches those packages from the linked real locations.

### The fabric packages publish unscoped

The seven fabric packages are unscoped (`dsh-fabric-protocol`, `dsh-fabric-compaction`, `dsh-fabric-host`, `dsh-fabric-mesh`, `dsh-fabric-system-prompt`, `dsh-fabric-code-runtime-quickjs`, `dsh-fabric-client-ui`) under the `dsh-fabric` umbrella bundle. The original `@dsh-fabric/*` scope could not be created: npm scopes are website-only artifacts and the publishing token is a granular 2FA-bypass token, so every publish to the absent scope answered `404 Scope not found`. Unscoped names publish without a scope.

### The sibling packages publish with semver ranges

Every `link:` spec in `dsh-fabric` (root and seven packages) and `dsh-fovea` became a real range: `@monotykamary/cordis` `^4.0.1`, `@monotykamary/schemastery` `^3.18.1`, every `@monotykamary/dsh-*` `^0.1.0-rc.7`. Their `pnpm-workspace.yaml` files carry overrides restoring the live links, so the dev flow is unchanged while the packed manifests are consumable. Intra-fabric `workspace:` ranges are untouched — `pnpm pack` rewrites them.

### Publication order

The harness family publishes first (`release:pack` + `release:publish` for the `dsh` family at `0.1.0-rc.7`, prerelease `--tag next`, with `latest` moved to `0.1.0-rc.7` afterwards), then the seven `dsh-fabric-*` packages and the `dsh-fabric` umbrella (topological, `workspace:` rewritten to `^0.1.0`), then `dsh-fovea` (`0.2.0`). The harness CLI's `dsh-fabric: ^0.1.0` and `dsh-fovea: ^0.2.0` dependencies only resolve once those publishes land.

## Alternatives considered

### Make the sibling repos workspace members of the harness

Adding `../dsh-fabric`, `../dsh-fabric/packages/*`, and `../dsh-fovea` to the harness `packages:` list would let `workspace:` ranges span the repos. It couples the two installs: the harness lockfile would own the sibling repos' dependency graphs, and each repo's own `pnpm install` would fight the harness's view of the same `node_modules`. The `link:` overrides keep the repos independent while resolving identically at runtime.

### Publish the `link:` manifests as-is

npm accepts a `link:` specifier at publish time, but consumers resolve it relative to their own project, so a published `dsh-fabric` would install broken links for everyone except machines that happen to share the author's `../deepseek-harness` layout.

### Rewrite manifests at publish time with a script

A prepublish transform (link: → range, publish, restore) keeps the checked-in manifests author-local, but the packed bytes would depend on the publishing machine's state and the restored tree would silently drift from what was verified and released.

## Consequences

Installing the published `@monotykamary/dsh` now pulls `dsh-fabric` and `dsh-fovea` and every auto-initialized profile composes them; upstream-sync merges must keep the template lists and the app dependencies in mind, and any future fabric/fovea release requires a coordinated publish of the harness family first. A harness checkout installs and composes profiles without the sibling directories, resolving both bundles from npm; pinning them requires the opt-in overrides in [npm-default custom-flavor resolution](2026-08-20-npm-default-custom-flavor-dev-install.md). The pinned variant's claimed hard failure never existed — pnpm 11 silently skips missing `link:` override targets — so a checkout without the siblings installed cleanly but booted with both bundles missing. The sibling repos' own `install:local` scripts pin `@monotykamary/dsh@0.1.0-rc.7`, which exists only after the harness publish.
