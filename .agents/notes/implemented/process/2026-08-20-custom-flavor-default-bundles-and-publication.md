# Agent Note: Custom-flavor default bundles and their publication

Status: implemented

English | [中文](2026-08-20-custom-flavor-default-bundles-and-publication.zh.md)

## Problem

This fork is a custom flavor of upstream DeepSeek Harness: the shipped profile composition stayed exactly upstream's (`dsh-base` + `dsh-web-app` / `dsh-headless`), so `dsh-fabric` and `dsh-fovea` — the capabilities this flavor exists for — reached a user only through a manual `dsh plugin --profile web add <path>` or the sibling repos' `install:local` scripts. Nothing had been published since `0.1.0-rc.5` although the repository carried `0.1.0-rc.7`, and neither `dsh-fabric`, `dsh-fovea`, nor any `@dsh-fabric/*` package existed on npm. The sibling manifests were unpublishable as written: every `@monotykamary/*` dependency used the `link:` protocol pointing into this checkout, which `pnpm pack` leaves verbatim and npm consumers resolve relative to their own tree.

## Decision

### The shipped profiles are the custom composition

`PROFILE_TEMPLATES.web` is `['@monotykamary/dsh-base', '@monotykamary/dsh-web-app', 'dsh-tool-repair', 'dsh-multiprovider', 'dsh-fabric', 'dsh-fovea', 'dsh-factory']` and `PROFILE_TEMPLATES.headless` is `['@monotykamary/dsh-base', '@monotykamary/dsh-headless', 'dsh-tool-repair', 'dsh-multiprovider', 'dsh-fabric', 'dsh-fovea']`. All five companion bundles are dependencies of the `dsh` app, so they resolve from the installation anchor like every in-box bundle, and `healProfilesModuleFallback` symlinks them and their dependency closures into `$DSH_HOME/profiles/node_modules`. `LEGACY_PROFILE_TUPLES` recognizes earlier installation-owned tuples and preserves appended user layers when assigning template ownership. A managed profile whose name matches its template also transfers every currently template-owned bundle out of `dsh.profile.bundles` on load and persists the remainder; expanding a shipped template therefore absorbs an already user-installed companion without composing it twice, while custom profiles and repeated user-only layers still fail loud.

### Local development resolves the published bundles by default

The harness workspace resolves `dsh-tool-repair`, `dsh-multiprovider`, `dsh-fabric`, `dsh-fovea`, and `dsh-factory` from npm. [npm-default custom-flavor resolution](2026-08-20-npm-default-custom-flavor-dev-install.md) keeps sibling `link:` overrides as an uncommitted opt-in. pnpm not installing the dependencies of `link:`-resolved packages remains the right property for that opt-in path: each sibling checkout carries its own complete install, and Node's symlink-following resolution reaches those packages from the linked real locations.

### The fabric packages publish unscoped

The eight Fabric packages are unscoped (`dsh-fabric-protocol`, `dsh-fabric-compaction`, `dsh-fabric-host`, `dsh-fabric-mesh`, `dsh-fabric-schema`, `dsh-fabric-system-prompt`, `dsh-fabric-code-runtime-quickjs`, `dsh-fabric-client-ui`) under the `dsh-fabric` umbrella bundle. The original `@dsh-fabric/*` scope could not be created: npm scopes are website-only artifacts and the publishing token is a granular 2FA-bypass token, so every publish to the absent scope answered `404 Scope not found`. Unscoped names publish without a scope.

### The sibling packages publish with semver ranges

Every published companion manifest carries registry-resolvable semver ranges for its Harness, Cordis, Schemastery, React, and sibling-package dependencies. A companion may keep development-only `pnpm-workspace.yaml` overrides that restore live links to adjacent checkouts; the packed manifest remains portable. Intra-workspace `workspace:` ranges stay in Fabric and Factory because `pnpm pack` rewrites them to release ranges.

### Publication order

Each companion release passes its repository check and payload inspection, then publishes to npm before the Harness app pins it. Fabric and Factory publish their workspace members in dependency order. The `dsh` app records each tested version twice — as an exact dependency and under `dsh.distribution.companions` — and the release-family verifier rejects a missing, ranged, or mismatched pin. After every exact companion version resolves and the assembled application passes, the shared dsh family version is bumped, tagged, packed, and published from that tag; stable releases take the `latest` dist-tag.

## Alternatives considered

### Make the sibling repos workspace members of the harness

Adding `../dsh-tool-repair`, `../dsh-multiprovider`, `../dsh-fabric`, `../dsh-fovea`, and `../dsh-factory` to the harness `packages:` list would let workspace ranges span repositories. It couples their installs: the harness lockfile would own every sibling dependency graph, and each repository's own `pnpm install` would fight the harness view of the same `node_modules`. Optional uncommitted `link:` overrides keep the repositories independent while resolving identically at runtime.

### Publish the `link:` manifests as-is

npm accepts a `link:` specifier at publish time, but consumers resolve it relative to their own project, so a published `dsh-fabric` would install broken links for everyone except machines that happen to share the author's `../deepseek-harness` layout.

### Rewrite manifests at publish time with a script

A prepublish transform (link: → range, publish, restore) keeps the checked-in manifests author-local, but the packed bytes would depend on the publishing machine's state and the restored tree would silently drift from what was verified and released.

## Consequences

Installing the published `@monotykamary/dsh` pulls the exact tested Tool Repair, Multiprovider, Fabric, Fovea, and Factory releases. Every auto-initialized profile composes the first four; Web also composes Factory. Upstream-sync merges must preserve the template lists, app dependencies, companion metadata, update inventory, and release verifier together. A future companion release reaches `@monotykamary/dsh@latest` only after that companion is validated and published, the app pins it exactly, and the dsh family passes its assembled release sequence. A source checkout installs and composes without sibling directories; live co-development remains an explicit local override.
