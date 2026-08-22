# `@monotykamary/dsh-client-ui-settings-updates`

English | [中文](README.zh.md)

Web Settings Consumer for `distributionUpdate`: it adds an Updates page, checks the registry when its trigger badge mounts, and marks Settings when any managed package differs from its latest registry tag. The page shows the installation channel, installed and latest versions, the channel-specific command, and the detached update action where supported. Cards and status text use the shared theme tokens, while retry, check, and update actions use the shared `Button` variants.

## Model Experience

None, as this browser-only Settings package registers no prompt, tool, message, or provider request.

#### KV Cache effect

None; this package never assembles model input.

## Known Limitations and Deferred Work

- Completion of a detached npm update requires restarting DSH; the old page does not stream the worker status file.
