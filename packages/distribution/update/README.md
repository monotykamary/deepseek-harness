# `@monotykamary/dsh-distribution-update`

English | [中文](README.zh.md)

Host provider for installed distribution inventory, cached npm registry checks, installation-channel guidance, and detached npm-global or source-checkout updates. `appManifest` is required and points at the running `@monotykamary/dsh` manifest. `registryUrl`, `checkOnStartup`, `checkIntervalMs`, and `requestTimeoutMs` are deployment-configurable.

Registry failures remain cached diagnostics and never stop the harness. A target is actionable only when its semantic version is greater than the installed version; compatible dependency ranges and older prereleases never offer a downgrade. Detected npm-global and source installations self-update through the detached worker; source updates run a fast-forward-only pull, install, and build from the repository root. Npx, Nix, and unknown installations remain externally managed. The worker strips credential-like environment variables, stops on the first failure, writes owner-only progress under `$DSH_HOME/updates/status.json`, and never restarts the harness.

## Model Experience

None, as this operator-only update provider registers no prompt, tool, message, or provider request.

#### KV Cache effect

None; this package never assembles model input.

## Known Limitations and Deferred Work

- The detached worker records completion but the current browser page does not stream worker progress after installation replaces the running package.
- Rollback remains an explicit package-manager or source-control operation.
