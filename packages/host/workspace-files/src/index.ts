/** Session-authorized, provider-neutral workspace file Remote. */

import type { Context } from '@monotykamary/cordis'
import type { Agent } from '@monotykamary/dsh-agent'
import type { FileSystem, FsDirEntry, FsTarget } from '@monotykamary/dsh-fs'
import { FsError } from '@monotykamary/dsh-fs'
import { Remote, TypertRemoteService } from '@monotykamary/dsh-typert-protocol'
import z from '@monotykamary/schemastery'
// Typert-generated ./typert and ./remote artifacts import Zod at runtime.
import type {} from 'zod'
import type {
  WorkspaceDirectoryListing,
  WorkspaceFileEntry,
  WorkspaceFileLocator,
  WorkspaceFilePreview,
  WorkspaceUnavailableFilePreview,
} from './types.ts'

export type * from './types.ts'

const DEFAULT_MAX_DIRECTORY_ENTRIES = 2_000
const DEFAULT_MAX_PREVIEW_BYTES = 1024 * 1024
const DEFAULT_MAX_DEPTH = 64

/** Deployment limits for browser workspace reads. */
export interface Config {
  /** Maximum direct children returned by one directory call. Defaults to 2,000. */
  maxDirectoryEntries?: number
  /** Inclusive UTF-8 byte cap for one complete file preview. Defaults to 1 MiB. */
  maxPreviewBytes?: number
  /** Maximum locator segments traversed from the Session root. Defaults to 64. */
  maxDepth?: number
}

type ResolvedConfig = Required<Config>

function requirePositiveInteger(name: keyof ResolvedConfig, value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`workspace-files: ${name} must be a positive safe integer`)
  }
}

function locatorPath(locator: WorkspaceFileLocator): string {
  /* v8 ignore next -- every error using this label requires at least one segment. */
  return locator.segments.length === 0 ? '.' : locator.segments.join('/')
}

function unavailable(
  locator: WorkspaceFileLocator,
  maxBytes: number,
  reason: WorkspaceUnavailableFilePreview['reason'],
  byteLength?: number,
): WorkspaceUnavailableFilePreview {
  return {
    kind: 'unavailable',
    file: locator,
    name: locator.segments.at(-1) ?? '',
    reason,
    maxBytes,
    ...(byteLength === undefined ? {} : { byteLength }),
  }
}

interface WorkspaceRoot {
  readonly fs: FileSystem
  readonly target: FsTarget
}

/** Remote-only gateway over the selected Agent's filesystem execution world. */
export class WorkspaceFilesGateway extends TypertRemoteService {
  static Config: z<Config> = z.object({
    maxDirectoryEntries: z.number().default(DEFAULT_MAX_DIRECTORY_ENTRIES),
    maxPreviewBytes: z.number().default(DEFAULT_MAX_PREVIEW_BYTES),
    maxDepth: z.number().default(DEFAULT_MAX_DEPTH),
  })

  private readonly config: ResolvedConfig

  /**
   * @param ctx - Host context that registers the Remote service.
   * @param config - validated workspace listing and preview limits.
   */
  constructor(ctx: Context, config: Config) {
    super(ctx, 'workspaceFiles')
    this.config = config as ResolvedConfig
    requirePositiveInteger('maxDirectoryEntries', this.config.maxDirectoryEntries)
    requirePositiveInteger('maxPreviewBytes', this.config.maxPreviewBytes)
    requirePositiveInteger('maxDepth', this.config.maxDepth)
  }

  /**
   * List one workspace directory through the Agent's selected filesystem provider.
   * @param agent - Agent selected by the Remote Session identity lookup.
   * @param directory - provider-neutral path from the Session workspace root.
   * @param signal - aborts provider resolution, traversal, or listing.
   * @returns capped direct children; escaped targets remain name-only `other` entries.
   */
  @Remote('list')
  async list(
    agent: Agent,
    directory: WorkspaceFileLocator,
    signal: AbortSignal,
  ): Promise<WorkspaceDirectoryListing> {
    const root = await this.workspaceRoot(agent, signal)
    const target = await this.locate(root, directory, signal)
    const entries = await root.fs.listDir(target, signal)
    return {
      directory: { segments: [...directory.segments] },
      entries: entries.slice(0, this.config.maxDirectoryEntries)
        .map(entry => this.projectEntry(root, directory, entry)),
      truncated: entries.length > this.config.maxDirectoryEntries,
    }
  }

  /**
   * Read one complete UTF-8 workspace file when it fits the configured byte cap.
   * @param agent - Agent selected by the Remote Session identity lookup.
   * @param file - provider-neutral path from the Session workspace root.
   * @param signal - aborts provider resolution, traversal, or reading.
   * @returns text content or an expected unavailable reason; other provider failures reject.
   */
  @Remote('read')
  async read(
    agent: Agent,
    file: WorkspaceFileLocator,
    signal: AbortSignal,
  ): Promise<WorkspaceFilePreview> {
    const root = await this.workspaceRoot(agent, signal)
    const target = await this.locate(root, file, signal)
    const info = await root.fs.stat(target, signal)
    if (info?.type !== 'file') {
      return unavailable(file, this.config.maxPreviewBytes, 'not-file')
    }
    if (info.size !== undefined && info.size > this.config.maxPreviewBytes) {
      return unavailable(file, this.config.maxPreviewBytes, 'too-large', info.size)
    }
    try {
      const stream = await root.fs.streamText(target, signal)
      const encoder = new TextEncoder()
      const chunks: string[] = []
      let byteLength = 0
      for await (const chunk of stream) {
        signal.throwIfAborted()
        byteLength += encoder.encode(chunk).byteLength
        if (byteLength > this.config.maxPreviewBytes) {
          return unavailable(file, this.config.maxPreviewBytes, 'too-large')
        }
        chunks.push(chunk)
      }
      return {
        kind: 'text',
        file: { segments: [...file.segments] },
        name: file.segments.at(-1) ?? '',
        content: chunks.join(''),
        byteLength,
      }
    } catch (error: unknown) {
      if (error instanceof FsError && error.code === 'FS_NOT_TEXT') {
        return unavailable(file, this.config.maxPreviewBytes, 'not-text')
      }
      if (error instanceof FsError && error.code === 'FS_NOT_REGULAR_FILE') {
        return unavailable(file, this.config.maxPreviewBytes, 'not-file')
      }
      throw error
    }
  }

  private async workspaceRoot(agent: Agent, signal: AbortSignal): Promise<WorkspaceRoot> {
    const fs = agent.ctx.get('fs')
    if (fs === undefined) throw new Error('workspace-files: selected Agent has no filesystem provider')
    const cwd = agent.session.header.cwd
    if (cwd === undefined) throw new Error('workspace-files: selected Session has no workspace cwd')
    return { fs, target: await fs.resolve(cwd, { signal }) }
  }

  private async locate(
    root: WorkspaceRoot,
    locator: WorkspaceFileLocator,
    signal: AbortSignal,
  ): Promise<FsTarget> {
    if (locator.segments.length > this.config.maxDepth) {
      throw new Error(`workspace-files: path exceeds maxDepth: ${locatorPath(locator)}`)
    }
    let target = root.target
    for (const segment of locator.segments) {
      if (segment.length === 0 || segment === '.' || segment === '..') {
        throw new Error(`workspace-files: invalid path segment in ${locatorPath(locator)}`)
      }
      const entries = await root.fs.listDir(target, signal)
      const entry = entries.find(candidate => candidate.name === segment)
      if (entry === undefined) {
        throw new FsError(`workspace path not found: ${locatorPath(locator)}`, 'FS_NOT_FOUND')
      }
      if (!root.fs.contains(root.target, entry.target)) {
        throw new FsError(`workspace path leaves the Session root: ${locatorPath(locator)}`, 'FS_PERMISSION_DENIED')
      }
      target = entry.target
    }
    return target
  }

  private projectEntry(
    root: WorkspaceRoot,
    directory: WorkspaceFileLocator,
    entry: FsDirEntry,
  ): WorkspaceFileEntry {
    const contained = root.fs.contains(root.target, entry.target)
    return {
      name: entry.name,
      locator: { segments: [...directory.segments, entry.name] },
      kind: contained ? entry.type : 'other',
      ...(contained && entry.type === 'file' && entry.size !== undefined ? { size: entry.size } : {}),
    }
  }
}

export default WorkspaceFilesGateway
