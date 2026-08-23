/** Local Git provider for the worktree registry. */
import { createHash } from 'node:crypto'
import {
  copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, statSync,
} from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { Context } from '@monotykamary/cordis'
import z from '@monotykamary/schemastery'
import type Schema from '@monotykamary/schemastery'
import type { Agent } from '@monotykamary/dsh-agent'
import type { SubprocessRuntime } from '@monotykamary/dsh-subprocess'
import {
  WorktreeCheckoutId,
  WorktreeRepositoryId,
  type ResolvedWorktreeRequest,
  type WorktreeCheckout,
  type WorktreeCreateRequest,
  type WorktreeListRequest,
  type WorktreeLocateRequest,
  type WorktreeProvider,
  type WorktreeRemoveRequest,
  type WorktreeRepository,
  type WorktreeSweepRequest,
  type WorktreeSweepResult,
} from '@monotykamary/dsh-worktree'

/** Stable plugin name. */
export const name = 'worktree-git-local'
/** The provider registers into the capability and uses managed process/session state. */
export const inject = ['worktrees', 'subprocess', 'agents']

/** Local Git provider configuration. */
export interface Config {
  /** Absolute directory that exclusively contains provider-managed linked checkouts. */
  readonly root: string
  /** Git executable name or absolute path. */
  readonly gitCommand?: string
  /** Maximum milliseconds for each foreground Git command. */
  readonly commandTimeoutMs?: number
  /** Maximum captured bytes per Git output stream. */
  readonly outputMaxBytes?: number
  /** Milliseconds allowed for process-tree termination after cancellation. */
  readonly terminationGraceMs?: number
  /** Fetch the remote default branch before resolving a `fresh` base. */
  readonly fetchFreshBase?: boolean
  /** Maximum normalized label characters retained before the checkout id suffix. */
  readonly branchLabelMaxLength?: number
  /** Single repository-root filename containing ignored-file copy patterns. */
  readonly includeFilename?: string
  /** Maximum bytes read from the ignored-file copy pattern file. */
  readonly includeFileMaxBytes?: number
  /** Maximum accepted patterns from the ignored-file copy pattern file. */
  readonly includeMaxPatterns?: number
  /** Maximum ignored regular files copied into one new checkout. */
  readonly includeMaxFiles?: number
  /** Maximum aggregate bytes copied into one new checkout. */
  readonly includeMaxTotalBytes?: number
}

/** Validated local Git provider configuration. */
export const Config: Schema<Config> = z.object({
  root: z.string().required(),
  gitCommand: z.string().default('git'),
  commandTimeoutMs: z.number().min(1).default(30_000),
  outputMaxBytes: z.number().min(1).default(1_048_576),
  terminationGraceMs: z.number().min(1).default(3_000),
  fetchFreshBase: z.boolean().default(true),
  branchLabelMaxLength: z.number().min(1).default(48),
  includeFilename: z.string().pattern(/^(?!\.{1,2}$)[^/\\]+$/u).default('.worktreeinclude'),
  includeFileMaxBytes: z.number().min(1).default(65_536),
  includeMaxPatterns: z.number().min(1).default(64),
  includeMaxFiles: z.number().min(1).default(64),
  includeMaxTotalBytes: z.number().min(1).default(1_048_576),
})

interface ResolvedConfig {
  readonly root: string
  readonly gitCommand: string
  readonly commandTimeoutMs: number
  readonly outputMaxBytes: number
  readonly terminationGraceMs: number
  readonly fetchFreshBase: boolean
  readonly branchLabelMaxLength: number
  readonly includeFilename: string
  readonly includeFileMaxBytes: number
  readonly includeMaxPatterns: number
  readonly includeMaxFiles: number
  readonly includeMaxTotalBytes: number
}

interface GitResult {
  readonly exitCode: number | null
  readonly signal: NodeJS.Signals | null
  readonly stdout: string
  readonly stderr: string
}

interface ParsedCheckout {
  readonly path: string
  readonly head: string | null
  readonly branch: string | null
  readonly detached: boolean
  readonly locked: boolean
  readonly prunable: boolean
}

/** Stable failure categories surfaced by the local Git provider. */
export type WorktreeGitErrorCode =
  | 'not-repository'
  | 'git-failed'
  | 'git-timeout'
  | 'output-limit'
  | 'unsafe-path'
  | 'busy'
  | 'dirty'
  | 'protected'
  | 'not-found'

/** Error from one local Git provider decision or command. */
export class WorktreeGitError extends Error {
  constructor(readonly code: WorktreeGitErrorCode, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'WorktreeGitError'
  }
}

function canonical(path: string): string {
  try {
    return realpathSync(path)
  } catch {
    return resolve(path)
  }
}

function inside(root: string, path: string): boolean {
  const rel = relative(root, path)
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)
}

function hash(value: string, length: number): string {
  return createHash('sha256').update(value).digest('hex').slice(0, length)
}

function safeSegment(value: string, fallback: string): string {
  const normalized = value.normalize('NFKD').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  return normalized || fallback
}

function checkoutId(path: string, managed: boolean, repositoryId: string, main: boolean) {
  if (main) return WorktreeCheckoutId(`main-${repositoryId}`)
  if (managed) return WorktreeCheckoutId(basename(path))
  return WorktreeCheckoutId(`external-${hash(canonical(path), 16)}`)
}

/**
 * Parse `git worktree list --porcelain` while ignoring future fields.
 * @param raw - Complete bounded porcelain output.
 * @returns parsed checkout records in Git order.
 */
export function parseWorktreePorcelain(raw: string): readonly ParsedCheckout[] {
  const entries: ParsedCheckout[] = []
  let current: ParsedCheckout | undefined
  const commit = (): void => {
    if (current !== undefined) entries.push(current)
    current = undefined
  }
  for (const line of raw.split('\n')) {
    if (line === '') {
      commit()
      continue
    }
    const split = line.indexOf(' ')
    const field = split < 0 ? line : line.slice(0, split)
    const value = split < 0 ? '' : line.slice(split + 1)
    if (field === 'worktree') {
      commit()
      current = {
        path: value,
        head: null,
        branch: null,
        detached: false,
        locked: false,
        prunable: false,
      }
      continue
    }
    if (current === undefined) continue
    if (field === 'HEAD') current = { ...current, head: value || null }
    else if (field === 'branch') current = {
      ...current,
      branch: value.startsWith('refs/heads/') ? value.slice('refs/heads/'.length) : value || null,
    }
    else if (field === 'detached') current = { ...current, detached: true }
    else if (field === 'locked') current = { ...current, locked: true }
    else if (field === 'prunable') current = { ...current, prunable: true }
  }
  commit()
  return entries
}

function sessionPath(agent: Agent): string | undefined {
  const cwd = agent.session.header.cwd
  return cwd === undefined ? undefined : canonical(cwd)
}

function sessionsInside(agents: readonly Agent[], path: string) {
  const root = canonical(path)
  return agents.flatMap((agent) => {
    const cwd = sessionPath(agent)
    return cwd !== undefined && (cwd === root || inside(root, cwd)) ? [agent.id] : []
  })
}

function parseIncludePatterns(path: string, config: ResolvedConfig): readonly string[] {
  let stat
  try {
    stat = statSync(path)
  } catch {
    return []
  }
  if (!stat.isFile() || stat.size > config.includeFileMaxBytes) return []
  const lines = readFileSync(path, 'utf8').split('\n')
  const patterns: string[] = []
  for (const line of lines) {
    const pattern = line.trim().replace(/^\/+/, '')
    if (pattern === '' || pattern.startsWith('#') || pattern.startsWith('!')) continue
    if (isAbsolute(pattern) || pattern.split('/').some(segment => segment === '..' || segment === '')) continue
    patterns.push(pattern)
    if (patterns.length === config.includeMaxPatterns) break
  }
  return patterns
}

function collectText(result: ReturnType<SubprocessRuntime['spawn']>, maxBytes: number): { stdout: string; stderr: string } {
  const stdout = result.collected.stdout?.readFrom(0)
  const stderr = result.collected.stderr?.readFrom(0)
  if (stdout?.lossy === true || stderr?.lossy === true) {
    throw new WorktreeGitError('output-limit', `git output exceeded ${String(maxBytes)} bytes`)
  }
  return { stdout: stdout?.text ?? '', stderr: stderr?.text ?? '' }
}

/** Local Git provider implementation. */
export class LocalGitWorktreeProvider implements WorktreeProvider {
  readonly name = 'git-local'
  private readonly config: ResolvedConfig
  private gitExecutable: Promise<string> | undefined

  constructor(private readonly ctx: Context, config: Config) {
    if (!isAbsolute(config.root)) throw new Error('worktree-git-local: root must be absolute')
    this.config = {
      root: canonical(config.root),
      gitCommand: config.gitCommand ?? 'git',
      commandTimeoutMs: config.commandTimeoutMs ?? 30_000,
      outputMaxBytes: config.outputMaxBytes ?? 1_048_576,
      terminationGraceMs: config.terminationGraceMs ?? 3_000,
      fetchFreshBase: config.fetchFreshBase ?? true,
      branchLabelMaxLength: config.branchLabelMaxLength ?? 48,
      includeFilename: config.includeFilename ?? '.worktreeinclude',
      includeFileMaxBytes: config.includeFileMaxBytes ?? 65_536,
      includeMaxPatterns: config.includeMaxPatterns ?? 64,
      includeMaxFiles: config.includeMaxFiles ?? 64,
      includeMaxTotalBytes: config.includeMaxTotalBytes ?? 1_048_576,
    }
  }

  async locate(request: ResolvedWorktreeRequest<WorktreeLocateRequest>): Promise<WorktreeRepository | undefined> {
    const insideResult = await this.git(request.cwd, ['rev-parse', '--is-inside-work-tree'], request.signal)
    if (insideResult.exitCode !== 0 || insideResult.stdout.trim() !== 'true') return undefined
    const common = await this.gitChecked(request.cwd, ['rev-parse', '--git-common-dir'], request.signal)
    const mainPath = canonical(dirname(resolve(request.cwd, common.stdout.trim())))
    const id = WorktreeRepositoryId(hash(mainPath, 24))
    return { id, provider: this.name, name: basename(mainPath), mainPath }
  }

  async list(request: ResolvedWorktreeRequest<WorktreeListRequest>): Promise<readonly WorktreeCheckout[]> {
    const repository = await this.requireRepository(request)
    const [listed, current] = await Promise.all([
      this.gitChecked(request.cwd, ['worktree', 'list', '--porcelain'], request.signal),
      this.gitChecked(request.cwd, ['rev-parse', '--show-toplevel'], request.signal),
    ])
    const currentPath = canonical(current.stdout.trim())
    const agents = this.ctx.agents.list()
    return parseWorktreePorcelain(listed.stdout).map((entry) => {
      const path = canonical(entry.path)
      const main = path === repository.mainPath
      const managed = inside(this.config.root, path)
      return {
        id: checkoutId(path, managed, repository.id, main),
        repositoryId: repository.id,
        path,
        branch: entry.detached ? null : entry.branch,
        head: entry.head,
        kind: main ? 'main' : 'linked',
        managed,
        current: path === currentPath,
        locked: entry.locked,
        prunable: entry.prunable,
        activeSessionIds: sessionsInside(agents, path),
      }
    })
  }

  async create(request: ResolvedWorktreeRequest<WorktreeCreateRequest>): Promise<WorktreeCheckout> {
    const repository = await this.requireRepository(request)
    const requestedId = request.checkoutId ?? WorktreeCheckoutId(hash(`${request.label}:${String(Date.now())}`, 24))
    const project = `${safeSegment(repository.name, 'repository')}-${String(repository.id).slice(0, 8)}`
    const idSegment = `${safeSegment(String(requestedId), 'checkout')}-${hash(String(requestedId), 8)}`
    const projectPath = join(this.config.root, project)
    const target = join(projectPath, idSegment)
    mkdirSync(projectPath, { recursive: true, mode: 0o700 })

    const existing = (await this.list(request)).find(checkout => canonical(checkout.path) === canonical(target))
    if (existing !== undefined) return { ...existing, id: requestedId }
    if (existsSync(target)) {
      throw new WorktreeGitError('unsafe-path', `managed worktree target already exists: ${target}`)
    }

    const label = safeSegment(request.label, 'task').slice(0, this.config.branchLabelMaxLength)
    const branch = `dsh/${label}-${hash(String(requestedId), 8)}`
    const start = await this.startRef(repository, request)
    const args = ['worktree', 'add', '-b', branch, target, ...start === undefined ? [] : [start]]
    await this.gitChecked(request.cwd, args, request.signal)
    const copiedFiles = await this.copyIncludes(repository, target, request.signal)
    const created = (await this.list(request)).find(checkout => canonical(checkout.path) === canonical(target))
    if (created === undefined) {
      throw new WorktreeGitError('git-failed', `git created ${target} but did not list it as a worktree`)
    }
    return { ...created, id: requestedId, copiedFiles }
  }

  async remove(request: ResolvedWorktreeRequest<WorktreeRemoveRequest>): Promise<WorktreeCheckout> {
    const target = canonical(request.path)
    const checkout = (await this.list(request)).find(candidate => canonical(candidate.path) === target)
    if (checkout === undefined) throw new WorktreeGitError('not-found', `worktree is not attached: ${target}`)
    if (checkout.kind === 'main' || checkout.current || checkout.locked) {
      throw new WorktreeGitError('protected', `worktree is protected from removal: ${target}`)
    }
    if (!checkout.managed || !inside(this.config.root, target)) {
      throw new WorktreeGitError('unsafe-path', `worktree is outside the managed root: ${target}`)
    }
    if (checkout.activeSessionIds.length > 0) {
      throw new WorktreeGitError('busy', `worktree has active DSH sessions: ${target}`)
    }
    if (!(await this.clean(target, request.signal))) {
      throw new WorktreeGitError('dirty', `worktree has uncommitted or untracked files: ${target}`)
    }
    await this.gitChecked(request.cwd, ['worktree', 'remove', target], request.signal)
    return checkout
  }

  async sweep(request: ResolvedWorktreeRequest<WorktreeSweepRequest>): Promise<WorktreeSweepResult> {
    if (!Number.isSafeInteger(request.limit) || request.limit < 0) {
      throw new RangeError('worktree sweep limit must be a non-negative safe integer')
    }
    if (!Number.isFinite(request.olderThanMs) || request.olderThanMs < 0) {
      throw new RangeError('worktree sweep age must be a non-negative finite number')
    }
    const now = request.now ?? Date.now()
    const removed: WorktreeCheckout[] = []
    for (const checkout of await this.list(request)) {
      if (removed.length === request.limit) break
      if (checkout.kind === 'main' || checkout.current || checkout.locked || !checkout.managed) continue
      if (checkout.activeSessionIds.length > 0) continue
      let age
      try {
        age = now - statSync(checkout.path).mtimeMs
      } catch {
        continue
      }
      if (age < request.olderThanMs || !(await this.clean(checkout.path, request.signal))) continue
      try {
        removed.push(await this.remove({ ...request, path: checkout.path }))
      } catch (error) {
        if (!(error instanceof WorktreeGitError)) throw error
      }
    }
    return { removed }
  }

  private async requireRepository(request: ResolvedWorktreeRequest<WorktreeLocateRequest>): Promise<WorktreeRepository> {
    const repository = await this.locate(request)
    if (repository === undefined) {
      throw new WorktreeGitError('not-repository', `directory is not inside a Git worktree: ${request.cwd}`)
    }
    return repository
  }

  private async clean(path: string, signal?: AbortSignal): Promise<boolean> {
    const result = await this.git(path, ['status', '--porcelain', '-uall'], signal)
    return result.exitCode === 0 && result.stdout.trim() === ''
  }

  private async startRef(
    repository: WorktreeRepository,
    request: ResolvedWorktreeRequest<WorktreeCreateRequest>,
  ): Promise<string | undefined> {
    if (request.baseRef === 'head') return undefined
    if (request.baseRef !== 'fresh') {
      const verify = await this.git(request.cwd, ['rev-parse', '--verify', '-q', request.baseRef.ref], request.signal)
      if (verify.exitCode !== 0) {
        throw new WorktreeGitError('git-failed', `worktree base ref does not resolve: ${request.baseRef.ref}`)
      }
      return request.baseRef.ref
    }
    const readOriginHead = async (): Promise<string | undefined> => {
      const symbolic = await this.git(repository.mainPath, ['symbolic-ref', '-q', 'refs/remotes/origin/HEAD'], request.signal)
      if (symbolic.exitCode !== 0) return undefined
      const full = symbolic.stdout.trim()
      if (!full.startsWith('refs/remotes/')) return undefined
      const short = full.slice('refs/remotes/'.length)
      const verify = await this.git(repository.mainPath, ['rev-parse', '--verify', '-q', short], request.signal)
      return verify.exitCode === 0 ? short : undefined
    }
    const direct = await readOriginHead()
    if (direct !== undefined || !this.config.fetchFreshBase) return direct
    const fetch = await this.git(repository.mainPath, ['fetch', '--no-tags', '--no-recurse-submodules', 'origin'], request.signal)
    return fetch.exitCode === 0 ? await readOriginHead() : undefined
  }

  private async copyIncludes(
    repository: WorktreeRepository,
    target: string,
    signal?: AbortSignal,
  ): Promise<readonly string[]> {
    const patterns = parseIncludePatterns(join(repository.mainPath, this.config.includeFilename), this.config)
    if (patterns.length === 0) return []
    const listed = await this.git(repository.mainPath, [
      'ls-files', '--others', '--ignored', '--exclude-standard', '-z', '--', ...patterns,
    ], signal)
    if (listed.exitCode !== 0) return []
    const copied: string[] = []
    let bytes = 0
    for (const item of listed.stdout.split('\0')) {
      if (item === '' || copied.length === this.config.includeMaxFiles) continue
      if (isAbsolute(item) || item.split('/').some(segment => segment === '..' || segment === '')) continue
      const source = join(repository.mainPath, item)
      const destination = join(target, item)
      if (!inside(repository.mainPath, source) || !inside(target, destination)) continue
      let stat
      try {
        stat = lstatSync(source)
      } catch {
        continue
      }
      if (!stat.isFile() || bytes + stat.size > this.config.includeMaxTotalBytes) continue
      try {
        mkdirSync(dirname(destination), { recursive: true, mode: 0o700 })
        copyFileSync(source, destination)
      } catch {
        continue
      }
      copied.push(item)
      bytes += stat.size
    }
    return copied
  }

  private gitChecked(cwd: string, args: readonly string[], signal?: AbortSignal): Promise<GitResult> {
    return this.git(cwd, args, signal).then((result) => {
      if (result.exitCode !== 0) {
        const detail = result.stderr.trim() || result.stdout.trim() || `exit ${String(result.exitCode)}`
        throw new WorktreeGitError('git-failed', `git ${args.join(' ')} failed: ${detail}`)
      }
      return result
    })
  }

  private async git(cwd: string, args: readonly string[], signal?: AbortSignal): Promise<GitResult> {
    signal?.throwIfAborted()
    this.gitExecutable ??= this.ctx.subprocess.resolveExecutable(this.config.gitCommand)
    const executable = await this.gitExecutable
    signal?.throwIfAborted()
    const deadline = new AbortController()
    const forward = (): void => { deadline.abort(signal?.reason) }
    signal?.addEventListener('abort', forward, { once: true })
    const timer = setTimeout(() => {
      deadline.abort(new WorktreeGitError('git-timeout', `git command exceeded ${String(this.config.commandTimeoutMs)}ms`))
    }, this.config.commandTimeoutMs)
    timer.unref()
    try {
      const handle = this.ctx.subprocess.spawn({
        argv: [executable, ...args],
        cwd,
        stdio: {
          stdin: 'ignore',
          stdout: { maxBytes: this.config.outputMaxBytes },
          stderr: { maxBytes: this.config.outputMaxBytes },
        },
        graceMs: this.config.terminationGraceMs,
        signal: deadline.signal,
        env: { GIT_PAGER: '', GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' },
      })
      const outcome = await handle.done
      signal?.throwIfAborted()
      if (deadline.signal.aborted) throw deadline.signal.reason
      return { ...outcome, ...collectText(handle, this.config.outputMaxBytes) }
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', forward)
    }
  }
}

/** Register the local Git provider. */
export function apply(ctx: Context, config: Config): void {
  ctx.worktrees.registerProvider(new LocalGitWorktreeProvider(ctx, config))
}
