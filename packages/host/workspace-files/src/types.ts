/**
 * JSON-safe workspace file vocabulary exposed by the Host Remote.
 * @module @monotykamary/dsh-host-workspace-files/types
 */

import type { Branded } from '@monotykamary/dsh-brand'

/** Opaque freshness token returned with one browser-visible workspace file. */
export type WorkspaceFileVersion = Branded<'WorkspaceFileVersion'>

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
  /** Provider freshness token required by the next replacement write. */
  readonly version: WorkspaceFileVersion
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

/** Version-guarded complete-file replacement accepted by the provider. */
export interface WorkspaceSavedFile {
  readonly kind: 'saved'
  /** File that was replaced. */
  readonly file: WorkspaceFileLocator
  /** Provider-normalized complete UTF-8 content after the write. */
  readonly content: string
  /** Exact UTF-8 byte length of `content`. */
  readonly byteLength: number
  /** Freshness token required by the next replacement write. */
  readonly version: WorkspaceFileVersion
}

/** Expected replacement refusal that the editor can recover from. */
export interface WorkspaceFileWriteRefusal {
  readonly kind: 'conflict' | 'too-large' | 'not-file'
  /** File whose replacement was refused. */
  readonly file: WorkspaceFileLocator
  /** Configured inclusive write byte cap. */
  readonly maxBytes: number
  /** Submitted UTF-8 byte length for `too-large`. */
  readonly byteLength?: number
}

/** Complete result of one version-guarded browser file replacement. */
export type WorkspaceFileWriteResult = WorkspaceSavedFile | WorkspaceFileWriteRefusal
