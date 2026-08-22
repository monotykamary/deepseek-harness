# `@monotykamary/dsh-client-ui-settings-updates`

English | [中文](README.zh.md)

Web Settings Consumer for `distributionUpdate`: it adds an Updates page, checks the registry when its trigger badge mounts, and marks Settings when the tested distribution has a semantic upgrade. Before model setup, its ordered onboarding step reads the startup diagnostic snapshot and blocks the application when shell, sandbox, or DSH-home readiness is unavailable; the user may explicitly continue, while the Updates page retains every check and remediation. The page shows the installation channel and upgrades, offers the detached update action for npm-global and source installations, and shows channel guidance only for externally managed installations. Cards and status text use the shared theme tokens, while retry, check, and update actions use the shared `Button` variants.

## Model Experience

None, as this browser-only Settings package registers no prompt, tool, message, or provider request.

#### KV Cache effect

None; this package never assembles model input.

## Known Limitations and Deferred Work

- Completion of a detached update requires restarting DSH; the old page does not stream the worker status file.
