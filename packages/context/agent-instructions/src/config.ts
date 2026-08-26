/**
 * Configuration normalization for workspace instruction discovery and rendering.
 *
 * @module @monotykamary/dsh-agent-instructions/config
 */

import { relative } from 'node:path'
import z from '@monotykamary/schemastery'
import { resolveDshHome } from '@monotykamary/dsh-home-paths'

const DEFAULT_PROJECT_ROOT_MARKERS = ['.git'] as const
const DEFAULT_INSTRUCTION_FILE_CANDIDATES = ['AGENTS.md', 'CLAUDE.md'] as const
const DEFAULT_LOCAL_INSTRUCTION_FILE_CANDIDATES = ['AGENTS.local.md', 'CLAUDE.local.md'] as const
const DEFAULT_MAX_SOURCE_BYTES = 1_048_576
const DEFAULT_TRUSTED_SYSTEM_FILE = 'APPEND_SYSTEM.md'
const DEFAULT_TRUSTED_SYSTEM_MAX_BYTES = 65_536
const RESERVED_PATH_SEGMENTS = new Set(['', '.', '..'])

/** User-facing workspace instruction loader configuration. */
export interface Config {
  /** Harness home containing user-global guidance and trusted system instructions; defaults to `$DSH_HOME` or `~/.dsh`. */
  dshHome?: string
  /** Same-directory file under the Harness home loaded as trusted system instructions. */
  trustedSystemFile?: string
  /** Maximum UTF-8 bytes accepted from the trusted system-instruction file. */
  trustedSystemMaxBytes?: number
  /** Directory entries that identify the project root while walking upward from the session cwd. */
  projectRootMarkers?: string[]
  /** UTF-8 byte cap for one rendered baseline or dynamic batch; non-positive or non-finite disables loading. */
  maxBytes: number
  /** Maximum UTF-8 bytes read from one instruction file; larger files are ignored. */
  maxSourceBytes?: number
  /**
   * Ordered same-directory project candidates; every existing file loads, with
   * per-directory trimmed-content duplicates collapsed to the earliest candidate.
   */
  instructionFileCandidates?: string[]
  /**
   * Ordered same-directory local-overlay candidates loaded after the base files
   * under the same per-directory trimmed-content dedup; empty disables the overlay.
   */
  localInstructionFileCandidates?: string[]
}

export const Config: z<Config> = z.object({
  dshHome: z.string(),
  trustedSystemFile: z.string().default(DEFAULT_TRUSTED_SYSTEM_FILE),
  trustedSystemMaxBytes: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(DEFAULT_TRUSTED_SYSTEM_MAX_BYTES),
  projectRootMarkers: z.array(z.string()).default([...DEFAULT_PROJECT_ROOT_MARKERS]),
  maxBytes: z.number().required(),
  maxSourceBytes: z.number().step(1).min(1).default(DEFAULT_MAX_SOURCE_BYTES),
  instructionFileCandidates: z.array(z.string()).default([...DEFAULT_INSTRUCTION_FILE_CANDIDATES]),
  localInstructionFileCandidates: z.array(z.string()).default([...DEFAULT_LOCAL_INSTRUCTION_FILE_CANDIDATES]),
})

/** Normalized instruction discovery configuration. */
export interface ResolvedDiscoveryConfig {
  dshHome: string
  projectRootMarkers: string[]
  instructionFileCandidates: string[]
  localInstructionFileCandidates: string[]
}

/** Normalized configuration used by discovery and reconciliation. */
export interface ResolvedConfig extends ResolvedDiscoveryConfig {
  maxBytes: number
  maxSourceBytes: number
  trustedSystemFile: string
  trustedSystemMaxBytes: number
}

/**
 * Identify the discovery, precedence, and budget semantics of one baseline.
 * @param config - normalized plugin configuration.
 * @param cwd - absolute session working directory.
 * @param projectRoot - project root selected for the current baseline.
 * @returns stable serialized identity for compatibility checks on resume.
 */
export function workspaceBaselineIdentity(
  config: ResolvedConfig,
  cwd: string,
  projectRoot: string,
): string {
  return JSON.stringify({
    projectRoot: relative(cwd, projectRoot),
    projectRootMarkers: config.projectRootMarkers,
    maxBytes: config.maxBytes,
    maxSourceBytes: config.maxSourceBytes,
    instructionFileCandidates: config.instructionFileCandidates,
    localInstructionFileCandidates: config.localInstructionFileCandidates,
  })
}

/**
 * Resolve defaults, the harness home, and valid same-directory candidates.
 * @param config - user-facing plugin configuration.
 * @returns normalized runtime configuration.
 */
export function resolveConfig(config: Config): ResolvedConfig {
  const trustedSystemFile = config.trustedSystemFile ?? DEFAULT_TRUSTED_SYSTEM_FILE
  if (RESERVED_PATH_SEGMENTS.has(trustedSystemFile) || /[\\/]/u.test(trustedSystemFile)) {
    throw new TypeError('agent-instructions: trustedSystemFile must be a same-directory file name')
  }
  const trustedSystemMaxBytes = config.trustedSystemMaxBytes ?? DEFAULT_TRUSTED_SYSTEM_MAX_BYTES
  if (!Number.isSafeInteger(trustedSystemMaxBytes) || trustedSystemMaxBytes < 1) {
    throw new TypeError('agent-instructions: trustedSystemMaxBytes must be a positive safe integer')
  }
  return {
    ...resolveDiscoveryConfig(config),
    maxBytes: config.maxBytes,
    maxSourceBytes: config.maxSourceBytes ?? DEFAULT_MAX_SOURCE_BYTES,
    trustedSystemFile,
    trustedSystemMaxBytes,
  }
}

/**
 * Resolve the subset of configuration used before instruction content is rendered.
 * @param config - optional discovery controls.
 * @returns normalized home, root markers, and instruction candidates.
 */
export function resolveDiscoveryConfig(
  config: Pick<Config, 'dshHome' | 'projectRootMarkers' | 'instructionFileCandidates' | 'localInstructionFileCandidates'>,
): ResolvedDiscoveryConfig {
  return {
    dshHome: resolveDshHome(config.dshHome),
    projectRootMarkers: config.projectRootMarkers ?? [...DEFAULT_PROJECT_ROOT_MARKERS],
    instructionFileCandidates: resolveInstructionFileCandidates(
      config.instructionFileCandidates,
      DEFAULT_INSTRUCTION_FILE_CANDIDATES,
    ),
    localInstructionFileCandidates: resolveInstructionFileCandidates(
      config.localInstructionFileCandidates,
      DEFAULT_LOCAL_INSTRUCTION_FILE_CANDIDATES,
    ),
  }
}

function resolveInstructionFileCandidates(candidates: string[] | undefined, fallback: readonly string[]): string[] {
  return (candidates ?? [...fallback]).filter(candidate => (
    !RESERVED_PATH_SEGMENTS.has(candidate) && !/[\\/]/.test(candidate)
  ))
}
