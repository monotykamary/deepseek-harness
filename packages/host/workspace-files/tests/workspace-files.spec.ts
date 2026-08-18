import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@monotykamary/cordis'
import type { Agent } from '@monotykamary/dsh-agent'
import {
  FileSystem, FsError, FsTargetKey, FsVersion,
} from '@monotykamary/dsh-fs'
import type {
  FsDirEntry, FsEditOutcome, FsEditRequest, FsInfo, FsPathInfo, FsTarget, FsWriteIntent, FsWriteOutcome,
} from '@monotykamary/dsh-fs'
import { remoteMethods } from '@monotykamary/dsh-typert-protocol'
import WorkspaceFilesGateway, { type Config } from '../src/index.ts'
import type { WorkspaceFileLocator } from '../src/types.ts'

interface FakeNode {
  readonly type: 'file' | 'directory' | 'other'
  readonly target: FsTarget
  readonly children?: readonly string[]
  readonly text?: string
  readonly size?: number
  readonly streamError?: FsError
  readonly abortOnStream?: AbortController
}

function target(path: string): FsTarget {
  return { targetKey: FsTargetKey(path), displayPath: path }
}

class FakeFileSystem extends FileSystem {
  readonly nodes = new Map<string, FakeNode>()
  streamCalls = 0

  constructor(ctx: Context) {
    super(ctx)
    this.add('/work', 'directory', { children: ['a.txt', 'escape.txt', 'special', 'src'] })
    this.add('/work/a.txt', 'file', { text: 'hello', size: 5 })
    this.add('/outside/secret.txt', 'file', { text: 'secret', size: 6 })
    this.nodes.set('/work/escape.txt', {
      type: 'file', target: target('/outside/secret.txt'), text: 'secret', size: 6,
    })
    this.add('/work/special', 'other')
    this.add('/work/src', 'directory', { children: ['binary.bin', 'changed.txt', 'index.ts', 'large.txt', 'unknown.txt'] })
    this.add('/work/src/binary.bin', 'file', {
      size: 2, streamError: new FsError('not text', 'FS_NOT_TEXT'),
    })
    this.add('/work/src/changed.txt', 'file', {
      size: 1, streamError: new FsError('not a file', 'FS_NOT_REGULAR_FILE'),
    })
    this.add('/work/src/index.ts', 'file', { text: 'abcde', size: 5 })
    this.add('/work/src/large.txt', 'file', { text: 'oversized', size: 9 })
    this.add('/work/src/unknown.txt', 'file', { text: 'abcdef' })
  }

  add(path: string, type: FakeNode['type'], rest: Omit<FakeNode, 'type' | 'target'> = {}): void {
    this.nodes.set(path, { type, target: target(path), ...rest })
  }

  override async resolve(path: string, opts?: { cwd?: string; signal?: AbortSignal }): Promise<FsTarget> {
    opts?.signal?.throwIfAborted()
    return target(path)
  }

  override processPath(value: FsTarget): string { return value.displayPath }
  override fileUrl(value: FsTarget): string { return `file://${value.displayPath}` }
  override contains(parent: FsTarget, child: FsTarget): boolean {
    return child.targetKey === parent.targetKey || String(child.targetKey).startsWith(`${String(parent.targetKey)}/`)
  }

  override async stat(value: FsTarget, signal?: AbortSignal): Promise<FsInfo | undefined> {
    signal?.throwIfAborted()
    const node = this.nodes.get(String(value.targetKey))
    return node === undefined ? undefined : {
      version: FsVersion(`v:${String(value.targetKey)}`), type: node.type,
      ...(node.size === undefined ? {} : { size: node.size }),
    }
  }

  override async lstat(path: string): Promise<FsPathInfo | undefined> {
    const node = this.nodes.get(path)
    return node === undefined ? undefined : { version: FsVersion(`v:${path}`), type: node.type }
  }

  override async readText(value: FsTarget): Promise<string> {
    return this.nodes.get(String(value.targetKey))?.text ?? ''
  }

  override async streamText(value: FsTarget, signal?: AbortSignal): Promise<AsyncIterable<string>> {
    this.streamCalls += 1
    const node = this.nodes.get(String(value.targetKey))
    return (async function* () {
      signal?.throwIfAborted()
      if (node?.streamError !== undefined) throw node.streamError
      node?.abortOnStream?.abort()
      yield node?.text ?? ''
    })()
  }

  override async readBytes(): Promise<Uint8Array> { return new Uint8Array() }

  override async listDir(value: FsTarget, signal?: AbortSignal): Promise<FsDirEntry[]> {
    signal?.throwIfAborted()
    const node = this.nodes.get(String(value.targetKey))
    if (node?.type !== 'directory') throw new FsError('not a directory', 'FS_NOT_DIRECTORY')
    return (node.children ?? []).map((name) => {
      const child = this.nodes.get(`${value.displayPath}/${name}`)
        ?? this.nodes.get(String(this.nodes.get(`${value.displayPath}/${name}`)?.target.targetKey))
      if (child === undefined) throw new Error(`missing fake child ${name}`)
      return {
        name,
        type: child.type,
        target: child.target,
        ...(child.size === undefined ? {} : { size: child.size }),
      }
    })
  }

  override async writeText(
    _target: FsTarget, _content: string, _expected?: FsWriteIntent,
  ): Promise<FsWriteOutcome> { throw new Error('unused') }

  override async editText(
    _target: FsTarget, _edit: FsEditRequest, _expected?: { version: ReturnType<typeof FsVersion> },
  ): Promise<FsEditOutcome> { throw new Error('unused') }
}

const contexts: Context[] = []
const ROOT: WorkspaceFileLocator = { segments: [] }
const SRC: WorkspaceFileLocator = { segments: ['src'] }
const INDEX: WorkspaceFileLocator = { segments: ['src', 'index.ts'] }

function agent(ctx: Context, cwd: string | null = '/work'): Agent {
  return {
    ctx,
    session: { header: { ...(cwd === null ? {} : { cwd }) } },
  } as Agent
}

function bench(config: Config = {
  maxDirectoryEntries: 10,
  maxPreviewBytes: 5,
  maxDepth: 2,
}): { ctx: Context; fs: FakeFileSystem; gateway: WorkspaceFilesGateway; agent: Agent } {
  const ctx = new Context()
  contexts.push(ctx)
  const fs = new FakeFileSystem(ctx)
  const gateway = new WorkspaceFilesGateway(ctx, config)
  return { ctx, fs, gateway, agent: agent(ctx) }
}

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
})

describe('WorkspaceFilesGateway', () => {
  it('publishes cancellable list and read methods under the workspaceFiles namespace', () => {
    const { gateway } = bench()
    expect(gateway.typertRemote).toMatchObject({
      serviceKey: 'workspaceFiles', namespace: 'workspaceFiles',
    })
    expect(remoteMethods(gateway)).toEqual([
      { method: 'list', invocation: { kind: 'direct' } },
      { method: 'read', invocation: { kind: 'direct' } },
    ])
  })

  it('projects direct children without exposing escaped target metadata and caps the result', async () => {
    const { gateway, agent: selected } = bench()
    const listing = await gateway.list(selected, ROOT, new AbortController().signal)
    expect(listing).toEqual({
      directory: ROOT,
      entries: [
        { name: 'a.txt', locator: { segments: ['a.txt'] }, kind: 'file', size: 5 },
        { name: 'escape.txt', locator: { segments: ['escape.txt'] }, kind: 'other' },
        { name: 'special', locator: { segments: ['special'] }, kind: 'other' },
        { name: 'src', locator: { segments: ['src'] }, kind: 'directory' },
      ],
      truncated: false,
    })

    const capped = bench({ maxDirectoryEntries: 2, maxPreviewBytes: 5, maxDepth: 2 })
    await expect(capped.gateway.list(capped.agent, ROOT, new AbortController().signal)).resolves.toMatchObject({
      entries: [{ name: 'a.txt' }, { name: 'escape.txt' }], truncated: true,
    })
  })

  it('traverses only authoritative contained children and rejects malformed, missing, escaped, or deep locators', async () => {
    const { gateway, agent: selected } = bench()
    const listing = await gateway.list(selected, SRC, new AbortController().signal)
    expect(listing.directory).toEqual(SRC)
    expect(listing.entries).toEqual(expect.arrayContaining([expect.objectContaining({
      name: 'index.ts', kind: 'file',
    })]))
    await expect(gateway.list(selected, { segments: ['a.txt'] }, new AbortController().signal))
      .rejects.toMatchObject({ code: 'FS_NOT_DIRECTORY' })
    await expect(gateway.read(selected, { segments: ['missing'] }, new AbortController().signal))
      .rejects.toMatchObject({ code: 'FS_NOT_FOUND' })
    await expect(gateway.read(selected, { segments: ['escape.txt'] }, new AbortController().signal))
      .rejects.toMatchObject({ code: 'FS_PERMISSION_DENIED' })
    await expect(gateway.read(selected, { segments: [''] }, new AbortController().signal))
      .rejects.toThrow('invalid path segment')
    await expect(gateway.read(selected, { segments: ['src', 'nested', 'file'] }, new AbortController().signal))
      .rejects.toThrow('path exceeds maxDepth')
  })

  it('returns complete bounded text and expected unavailable states', async () => {
    const { ctx, gateway, agent: selected, fs } = bench()
    await expect(gateway.read(selected, INDEX, new AbortController().signal)).resolves.toEqual({
      kind: 'text', file: INDEX, name: 'index.ts', content: 'abcde', byteLength: 5,
    })
    await expect(gateway.read(selected, ROOT, new AbortController().signal)).resolves.toMatchObject({
      kind: 'unavailable', reason: 'not-file', name: '',
    })
    await expect(gateway.read(agent(ctx, '/work/a.txt'), ROOT, new AbortController().signal)).resolves.toEqual({
      kind: 'text', file: ROOT, name: '', content: 'hello', byteLength: 5,
    })
    await expect(gateway.read(selected, { segments: ['src', 'large.txt'] }, new AbortController().signal))
      .resolves.toEqual({
        kind: 'unavailable', file: { segments: ['src', 'large.txt'] }, name: 'large.txt',
        reason: 'too-large', maxBytes: 5, byteLength: 9,
      })
    expect(fs.streamCalls).toBe(2)
    await expect(gateway.read(selected, { segments: ['src', 'unknown.txt'] }, new AbortController().signal))
      .resolves.toEqual({
        kind: 'unavailable', file: { segments: ['src', 'unknown.txt'] }, name: 'unknown.txt',
        reason: 'too-large', maxBytes: 5,
      })
    await expect(gateway.read(selected, { segments: ['src', 'binary.bin'] }, new AbortController().signal))
      .resolves.toMatchObject({ reason: 'not-text' })
    await expect(gateway.read(selected, { segments: ['src', 'changed.txt'] }, new AbortController().signal))
      .resolves.toMatchObject({ reason: 'not-file' })
    await expect(gateway.read(selected, SRC, new AbortController().signal))
      .resolves.toMatchObject({ reason: 'not-file', name: 'src' })
  })

  it('propagates cancellation and unexpected provider failures', async () => {
    const { gateway, agent: selected, fs } = bench()
    const cancelled = new AbortController()
    cancelled.abort()
    await expect(gateway.list(selected, ROOT, cancelled.signal)).rejects.toMatchObject({ name: 'AbortError' })

    fs.add('/work/src/io.txt', 'file', {
      size: 1, streamError: new FsError('provider failed', 'FS_IO_ERROR'),
    })
    const src = fs.nodes.get('/work/src')!
    fs.nodes.set('/work/src', { ...src, children: [...(src.children ?? []), 'io.txt'] })
    await expect(gateway.read(selected, { segments: ['src', 'io.txt'] }, new AbortController().signal))
      .rejects.toMatchObject({ code: 'FS_IO_ERROR' })
  })

  it('fails loud for invalid limits, missing Agent filesystem, or missing Session cwd', async () => {
    for (const [key, config] of [
      ['maxDirectoryEntries', { maxDirectoryEntries: 0, maxPreviewBytes: 5, maxDepth: 2 }],
      ['maxPreviewBytes', { maxDirectoryEntries: 2, maxPreviewBytes: Number.NaN, maxDepth: 2 }],
      ['maxDepth', { maxDirectoryEntries: 2, maxPreviewBytes: 5, maxDepth: 1.5 }],
    ] as const) {
      const ctx = new Context()
      contexts.push(ctx)
      expect(() => new WorkspaceFilesGateway(ctx, config)).toThrow(`${key} must be a positive safe integer`)
    }

    const noFs = new Context()
    contexts.push(noFs)
    const gateway = new WorkspaceFilesGateway(noFs, {
      maxDirectoryEntries: 2, maxPreviewBytes: 5, maxDepth: 2,
    })
    await expect(gateway.list(agent(noFs), ROOT, new AbortController().signal))
      .rejects.toThrow('selected Agent has no filesystem provider')
    new FakeFileSystem(noFs)
    await expect(gateway.list(agent(noFs, null), ROOT, new AbortController().signal))
      .rejects.toThrow('selected Session has no workspace cwd')
  })
})
