/**
 * JSON-safe workspace file vocabulary exposed by the Host Remote.
 * @module @monotykamary/dsh-host-workspace-files/types
 */

/** Provider-neutral path inside one Session workspace. */
export interface WorkspaceFileLocator {
  /** Exact child names traversed from the Session workspace root. */
  readonly segments: readonly string[]
}

/** File kind visible to the browser tree. */
export type WorkspaceFileKind = 'file' | 'directory' | 'other'

/** One direct child of a listed workspace directory. */
export interface WorkspaceFileEntry {
  /** Basename inside the listed directory. */
  readonly name: string
  /** Provider-neutral locator for follow-up listing or reading. */
  readonly locator: WorkspaceFileLocator
  /** Usable file/directory kind, or `other` for unsupported or escaped entries. */
  readonly kind: WorkspaceFileKind
  /** Byte size when the provider reports it for a contained regular file. */
  readonly size?: number
}

/** Bounded direct-child listing for one workspace directory. */
export interface WorkspaceDirectoryListing {
  /** Directory that was listed. */
  readonly directory: WorkspaceFileLocator
  /** Stable provider order, capped by Host configuration. */
  readonly entries: readonly WorkspaceFileEntry[]
  /** Whether additional direct children were omitted by the configured cap. */
  readonly truncated: boolean
}

/** Readable UTF-8 preview retained within the Host byte cap. */
export interface WorkspaceTextFilePreview {
  readonly kind: 'text'
  /** File that was read. */
  readonly file: WorkspaceFileLocator
  /** File basename. */
  readonly name: string
  /** Complete UTF-8 content. */
  readonly content: string
  /** Exact UTF-8 byte length of `content`. */
  readonly byteLength: number
}

/** Expected file kind or size that cannot enter the browser preview. */
export interface WorkspaceUnavailableFilePreview {
  readonly kind: 'unavailable'
  /** File locator requested by the browser. */
  readonly file: WorkspaceFileLocator
  /** File basename. */
  readonly name: string
  /** Stable reason the Host withheld content. */
  readonly reason: 'too-large' | 'not-text' | 'not-file'
  /** Configured inclusive preview byte limit. */
  readonly maxBytes: number
  /** Provider-reported byte size when known. */
  readonly byteLength?: number
}

/** Complete result of reading one workspace file for browser presentation. */
export type WorkspaceFilePreview = WorkspaceTextFilePreview | WorkspaceUnavailableFilePreview
