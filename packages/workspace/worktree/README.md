# @monotykamary/dsh-worktree

English | [中文](README.zh.md)

Provider registry and provider-neutral vocabulary for repository worktrees. `ctx.worktrees` resolves an explicit deployment default, delegates locate/list/create/remove/sweep operations, and gives every checkout and repository a branded identity.

## Service API

- `registerProvider(provider)` contributes one implementation for the calling fiber's lifetime.
- `resolve(request)` materializes the configured provider before execution.
- `locate` and `list` inspect repositories without mutation.
- `create` allocates a checkout id when the caller omits one.
- `remove` and `sweep` delegate safety decisions to the selected provider.

The service requires `config.provider`; no provider is universally correct. Calling an operation before that provider is registered fails loud.

## Model Experience

None, as this package registers no tools, prompts, or session events.

#### KV Cache effect

None; worktree registry operations do not enter model requests.

## Known Limitations and Deferred Work

- **No provider capability negotiation** — a consumer selects a provider by name and receives that provider's failures; mixed local and remote repositories need an explicit routing provider.
