# Use the Web UI

English | [中文](index.zh.md)

Start the Web UI through the [root README](../../../README.md#run); the command prints its URL. This guide begins after that server is running. The `dsh` process uses its invoking directory as the default filesystem location, but a fresh Web UI has no selected workspace until you add one.

## Resolve host readiness

DSH checks its writable home, shell, sandbox, and desktop handoff at startup. A blocking readiness dialog appears before model setup when reliable tool execution is unavailable; follow its remediation or explicitly continue, and revisit every result under **Settings → Updates → Host readiness**. `dsh doctor` prints the same checks and exits 2 while any blocking result remains.

## Configure a model

Open **Settings → Models**, enter a [DeepSeek API key](https://platform.deepseek.com/), and save it. The model route becomes usable immediately without restarting the server.

The [model configuration guide](./providers.md) covers other providers and custom OpenAI-compatible endpoints.

## Choose a workspace

Click **Choose workspace**, add the project directory where you started `dsh`, and select it. The session composer remains unavailable until a workspace is selected.

## Find or start a session

The expanded sidebar keeps **Search** visible above **All Workspaces**. Search filters Session titles, Workspace names and paths, and persisted message text; Session cards show Workspace, live status, title, agent preset, and relative time. Use **View options** beside All Workspaces to switch grouping or ordering.

Press `Cmd+K` on macOS or `Ctrl+K` elsewhere to open the command palette. Type a Session title, Workspace name or path, or text from a previous user or assistant message, then select the matching Session.

Choose **New Session in...** to target a Workspace. Use the arrow keys to highlight it, press `Tab` to accept the choice without creating anything, then press `Enter` to create or reuse that Workspace's blank Session.

## Run a task

Start a session and send:

> Summarize this repository and identify its main packages.

The agent can read and edit workspace files, run commands, delegate work, and maintain a plan. The Web UI asks before operations that require approval under the active permission policy.

## Delegate one task directly

Enter `/delegate <task>` to start one fresh background child without asking the current model to schedule it. Use `/delegate --model <id> <task>` for another model on the current provider, or `/delegate --provider <id> --model <id> <task>` for an exact cross-provider route. The command returns the child Session id; its conversation appears in the subagent tree, and the parent receives a settlement notice when the child finishes. Deployments with a continuable fork provider may also enable `--fork`.

Use Factory or Workflow instead when the work needs dependencies, retries, schedules, worktrees, or several coordinated agents.

## Set trusted personal policy

Put user-owned standing policy that must have system authority in `$DSH_HOME/APPEND_SYSTEM.md` (normally `~/.dsh/APPEND_SYSTEM.md`), then restart the profile. Keep repository conventions in `AGENTS.md`: those files intentionally remain lower-authority user guidance so cloned repositories cannot install system instructions.

## Use interactive terminals

Open a Session, then use **Toggle bottom panel** in the Session header to reveal a resizable terminal below the conversation. Closing this panel hides it without ending the shell; reopening it returns to the same terminal tab. Use **New terminal** for another persistent shell and **Kill terminal** when the process should end.

Open the right panel and choose **Terminal** to run a separate terminal beside the conversation. On compact screens the right Workbench moves into a Sheet while the bottom terminal remains attached below the conversation.

Use **Terminal settings** in either placement to select the theme, font or custom font family, font size, line height, ligatures, color emoji, and cursor blinking. These appearance choices apply to both placements and stay in the current browser profile.

## Continue

- [Configure models](./providers.md)
- [Use the Python SDK](./python-sdk.md)
- [Use other CLI modes](../../../apps/cli/README.md)
- [Develop a plugin](../develop/basic/index.md)
