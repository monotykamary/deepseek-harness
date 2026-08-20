# @monotykamary/dsh-client-ui-session-title

English | [中文](README.zh.md)

Web session-title preference plugin: its browser half registers the `session-title` row in the General settings section. The row binds the host-owned `session-title-llm` settings namespace and toggles the automatic LLM title opt-in; the Host-side provider plugins (`dsh-session-title-first-prompt-llm`, `dsh-session-title-all-prompts-llm`) mount from the same section, so this toggle is the shipped opt-in. Automatic generation is off by default, and disabling it leaves the deterministic fallback title in place. The host half is empty on purpose — the browser-only surface needs no host behavior.

The row renders a title, a description, and an `aria-pressed` toggle whose state follows the persisted section. One gesture publishes the live value and writes the `enabled` field through the settings scope's `set`; a host-side change (another surface, the settings document, a reconnect) re-adopts the accepted value. A composition that serves no `session-title-llm` namespace renders the off state and writes fail quietly.

Copy is bilingual: the plugin registers zh/en dictionaries under the `settings.sessionTitle` namespace of `dsh-client-locale`.

## Model Experience

Indirectly, through the host title provider the toggle opts in, whose auxiliary request is documented by [dsh-session-title-llm](../../session/session-title-llm/README.md#model-experience).

#### KV Cache effect

No direct invalidation; the host provider owns any auxiliary cache effect.

## Known Limitations and Deferred Work

- The row shows a single opt-in toggle; the target length and route policy of the mounted provider stay composition-level fields.
