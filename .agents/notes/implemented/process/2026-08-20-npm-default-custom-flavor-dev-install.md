# Agent Note: Custom-flavor bundles resolve from npm in the harness workspace

Status: implemented

English | [中文](2026-08-20-npm-default-custom-flavor-dev-install.zh.md)

## Problem

Fresh harness checkouts could not compose the `web` or `headless` profiles: the workspace `overrides` pinned `dsh-fabric` and `dsh-fovea` to sibling `link:` checkouts that a stranger does not have, and pnpm 11 silently skips missing `link:` override targets — install exits 0, neither bundle lands in `node_modules`, and the first failure surfaces at profile boot as a bare module-resolution error nowhere near the cause. Verified with a clean clone in a node:24 container: install exit 0, `dsh-fabric` absent from every `node_modules`, and `require.resolve('dsh-fabric')` from `apps/cli` throwing. A downstream consumer hit this in the wild and guessed the layout, nesting their dsh-fabric checkout at `apps/web/dsh-fabric`. The pinning predated the bundles' publication; both are on npm now (`dsh-fabric@0.1.0`, `dsh-fovea@0.2.0`), so a public default became possible. [Custom-flavor default bundles and publication](2026-08-20-custom-flavor-default-bundles-and-publication.md) owns the sibling-link design this note partially supersedes.

## Decision

The workspace declares no custom-flavor overrides: `dsh-fabric` and `dsh-fovea` resolve from npm through `apps/cli`'s published ranges (`^0.1.0`, `^0.2.0`), exactly as they do for an installed `@monotykamary/dsh`. Nothing in the monorepo imports either package statically — both are boot-time patch layers — so source gates always ran this configuration implicitly. Co-developing the sibling repos is opt-in: with `dsh-fabric` and `dsh-fovea` checked out beside this repository, the developer re-adds the two `link:` overrides shown in the comment in `pnpm-workspace.yaml` without committing them; each sibling workspace carries the symmetric `@monotykamary/*` overrides back to this checkout.

## Alternatives considered

**Keep the sibling overrides and add a preinstall guard that fails loudly.** That keeps every fresh developer on a mandatory two-repo layout for a failure mode only co-developers of the flavor ever need; publication made npm resolution viable, so the guard would protect a workflow most contributors never use.

**Assume pnpm fails on missing link targets** (the earlier note's premise). Disproved empirically: pnpm 11.7 logs nothing and links nothing, so the requirement stayed invisible until boot.

## Consequences

The README `git clone … && pnpm install && pnpm dsh web` flow composes from a single clone. Co-developers of the flavor lose the always-on live link: after pulling this change, a maintainer with sibling checkouts re-adds the overrides manually, and booting without them exercises the npm-published bundles — including `dsh-fabric@0.1.0`'s two stale patch-entry warnings against the rc.7 lineup — rather than local checkouts. The publication-order parts of the sibling note still stand.
