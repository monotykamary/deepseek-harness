# @monotykamary/dsh-attachment-local

English | [中文](README.zh.md)

The private local implementation of [`@monotykamary/dsh-attachment`](../attachment). Objects land at `<DSH_HOME>/attachments/v1/objects/<sha256-prefix>/<sha256>` and are addressed by an opaque `sha256:` id. Each process proves a home durable once by syncing every ancestor entry to the filesystem root, so a directory another process created but has not yet synced is never mistaken for a safe boundary. Writes then use a private staging directory, owner-only files, a synced temporary file, an atomic exclusive hard-link publish, and directory syncs on the publication path (POSIX; Windows relies on filesystem metadata journaling) so the reported reference survives a crash. Write admission and reads fully decode the raster before accepting its format and dimensions; reads also re-check the digest and logged metadata. Byte limits stay write-time admission policy, so a later policy reduction does not make already-admitted history unreadable. An image whose intrinsic dimensions exceed the configured pixel or per-side limits is resampled into them before commit (animated GIFs keep every frame), so the stored raster — which rides every later model request of its session — never exceeds what deployed model routes accept; the per-side default (2000px) matches the strictest bound those routes enforce. The stored reference always describes the stored raster exactly.

`DSH_HOME` resolves through the shared path policy: explicit config, `$DSH_HOME`, then `~/.dsh`. Session logs contain only the reference and verified metadata, never this host path. `readImage` forwards optional cancellation into the filesystem read, observes it around verification, and preserves it instead of wrapping it as `ATTACHMENT_READ_FAILED`.

## Model Experience

Indirectly, through durable replay of historical user images and structured model image output after restart and fork.

#### KV Cache effect

None beyond the image block owned by the requesting adapter.

## Known Limitations and Deferred Work

- Objects are retained indefinitely; reference-aware garbage collection is deferred.
- The local backend assumes the host and provider adapter share this filesystem service.
- Animated GIF metadata is validated from the logical screen; frame-level decoding policy is provider-owned.
