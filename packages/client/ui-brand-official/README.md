# @monotykamary/dsh-client-ui-brand-official

English | [中文](README.zh.md)

This package always registers the first `settings.onboarding` step. It fills `sidebar.brand.mark`, `sidebar.brand.name`, and `conversation.hero.brand.mark` only when `DSH_CLIENT_BUILD_PROFILE` is `official`; other builds retain the shell brand fallbacks.

The welcome and the transactional three-mark set install through declaration-aware `slots.inject()` calls. The package therefore works whether its row activates before or after the settings, sidebar, and conversation declarers, withdraws each contribution with its declaration, and leaves no partial mark mix during HMR. The node half is an empty Loader seat, and the browser title remains a build-environment concern outside this package.

The welcome renders as a blocking modal after the Session directory becomes ready and remains mounted when existing Sessions load. Settings-eligible browsers, including trusted tailnet access, persist its current version in `ui-onboarding.welcomeNoticeVersion`; ineligible browsers acknowledge it for the current process. Its token-native cards explain the major additions around the upstream shell: T3-inspired Workspace and Session navigation, the persistent terminal and file workbench, Fovea code-graph navigation, and Fabric typed execution. The T3-derived UI attribution remains in [`THIRD_PARTY_NOTICES.md`](../../../THIRD_PARTY_NOTICES.md).

## Model Experience

None, as the package contributes browser presentation only; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **The package supplies one occupant set** — alternative presentation belongs in another Cordis package occupying the same slots.
- **The welcome is informational** — it does not duplicate Workspace selection, Settings, or Workbench actions already available in the shell.
- **The browser title is independent** — `DSH_CLIENT_TITLE` selects title text at build time rather than through a UI slot.
