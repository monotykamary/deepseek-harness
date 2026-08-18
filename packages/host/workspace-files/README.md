# @monotykamary/dsh-host-workspace-files

English | [中文](README.zh.md)

Session-authorized, provider-neutral Host Remote for workspace directory listings, bounded text reads, and version-guarded replacements. `WorkspaceFilesGateway` registers the `workspaceFiles` namespace with three generated direct methods: `workspaceFiles/list`, `workspaceFiles/read`, and `workspaceFiles/write`. The browser supplies a Session id and a `WorkspaceFileLocator`; Typert resolves the Session's Agent before invoking the methods, so the gateway never accepts a browser-supplied absolute path or filesystem provider.

Every call resolves the selected Session's `cwd` through that Agent's current `ctx.fs`. A locator is an array of exact child names relative to that root. Traversal lists each parent and follows only the matching provider-owned `FsDirEntry.target`; `fs.contains(root, target)` rejects escaped children before traversal, reading, or writing. Root-escaping entries remain visible as disabled `other` rows without exposing their target metadata. Missing filesystem service, missing Session cwd, malformed or over-depth locators, missing entries, cancellation, and unexpected provider failures reject the Remote call.

`list` returns direct children in provider order, caps the array, and reports `truncated`. `read` returns complete UTF-8 text and an opaque `WorkspaceFileVersion` only when its exact streamed byte count remains within the inclusive limit. Regular-file size metadata can reject an oversized file before streaming; streaming remains authoritative when size is absent. Expected unsupported states return `unavailable` with `too-large`, `not-text`, or `not-file`; the service never returns partial content. `write` accepts only a complete text replacement within its own byte cap and passes the latest browser-held version as `replaceIfVersion` to `fs.writeText`. A concurrent provider change returns `conflict`; a successful result returns provider-normalized content and the next version.

## Configuration

| Field | Default | Meaning |
|---|---:|---|
| `maxDirectoryEntries` | `2000` | Maximum direct children returned by one `list` call. |
| `maxPreviewBytes` | `1048576` (1 MiB) | Inclusive UTF-8 byte limit for one complete `read` result. |
| `maxWriteBytes` | `1048576` (1 MiB) | Inclusive UTF-8 byte limit for one complete `write` replacement. |
| `maxDepth` | `64` | Maximum locator segments traversed from the Session root. |

All four values must be positive safe integers; invalid self-contained configuration fails during plugin construction.

The package root exports `WorkspaceFilesGateway`, `Config`, and the JSON-safe locator, entry, listing, read, version, and write-result types. `./types` exports only that payload vocabulary; Typert-generated Host and Client artifacts live under `./typert` and `./remote`. Browser packages consume the latter through the explicit [`api-remotes`](../../api/remotes/README.md) assembly. The [Files Agent Note](../../../.agents/notes/implemented/feature/2026-08-18-workspace-files-workbench.md) owns the authority and bounded-read rationale.

## Model Experience

None, as this Host-only file projection registers no prompt, tool, message, or provider request.

#### KV Cache effect

None; this package never assembles model input.

## Known Limitations and Deferred Work

- **No recursive query or pagination** — each call lists one directory and returns only its first configured number of provider-ordered children; a truncated directory has no continuation cursor.
- **No ranged or binary preview** — oversized, non-UTF-8, binary, and non-regular targets return an unavailable reason rather than bytes or a partial prefix.
- **No create, delete, or rename** — `write` only replaces a regular text file observed by `read`; the provider version rejects stale browser content.
- **No independent filesystem lifetime** — calls require a resolvable Session Agent with a selected filesystem provider and workspace cwd; this Remote is not a general Host file browser.
