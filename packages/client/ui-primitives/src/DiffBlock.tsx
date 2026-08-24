// DiffBlock: the inline-diff surface for a file mutation (write/edit) — a copy
// control over one or more per-file hunks, each a bold path header followed by
// the removed block (`-`, error color) and the added block (`+`, success
// color), with a dim `└ +A -R · N file(s)` footer. Unlike the TUI's exact
// changed-row comparison, this block renders the old and new sides in full.
// Both front ends share the line-terminator rule and distinct-path file count.
// Output never soft-wraps — an aligned source line keeps its indentation and
// scrolls horizontally instead of folding. Colors resolve through --dsw-*
// tokens; geometry mirrors CodeBlock.

import { useCallback, useMemo, useState } from 'react'
import clsx from 'clsx'
import { writeClipboard } from './clipboard.ts'
import css from './DiffBlock.module.css'

/**
 * Output lines shown before the height cap collapses the middle. Matches
 * {@link DEFAULT_TERMINAL_MAX_LINES} so a diff card and a terminal card cut a
 * long body at the same place.
 */
export const DEFAULT_DIFF_MAX_LINES = 16

/**
 * One file's change, in the shape {@link DiffBlock} draws. Structurally the
 * render-intent contract's `FileDiff`, redeclared here so this primitive stays
 * free of the tool contract (the terminal card's decoupling, applied to diffs).
 */
export interface DiffHunk {
  /** The changed file's path, drawn verbatim as the hunk's header (the tool's model-facing path). */
  path: string
  /** Prior content, or `null` for a new file / an overwrite (nothing on the removed side). */
  oldText: string | null
  /** Content after the change (the added side). */
  newText: string
}

/** Owner-provided labels for DiffBlock chrome. */
export interface DiffBlockLabels {
  /** Idle copy action. */
  readonly copy: string
  /** Successful copy feedback. */
  readonly copied: string
  /** Accessible expanded-state collapse action. */
  readonly collapseAria: string
  /** Accessible collapsed-state expansion action. */
  readonly expandAria: (hidden: number) => string
  /** Visible expanded-state collapse action. */
  readonly collapse: string
  /** Visible collapsed-state expansion action. */
  readonly expand: (hidden: number) => string
  /** Singular footer file unit. */
  readonly file: string
  /** Plural footer file unit. */
  readonly files: string
}

export interface DiffBlockProps {
  /** One entry per applied hunk, in file order; empty renders nothing. */
  diffs: DiffHunk[]
  /** Height cap in body lines before the middle collapses (default {@link DEFAULT_DIFF_MAX_LINES}). */
  maxLines?: number | undefined
  /** Extra class merged onto the wrapper (callers position; this component draws). */
  className?: string | undefined
  /** Localized control and footer labels. */
  labels?: DiffBlockLabels | undefined
  /** Card chrome for standalone output, or seamless content beneath an owning file header. */
  appearance?: 'card' | 'file' | undefined
}

/** A single rendered body line and its role, so the height cap slices a flat list. */
interface DiffRow {
  kind: 'path' | 'del' | 'add' | 'gap'
  text: string
}

/** Local exhaustiveness helper — this package does not depend on `dsh-llm`. */
/* closed-union backstop; only reached if a row kind is forged */
function assertNever(value: never): never {
  throw new Error(`unreachable diff row kind: ${String(value)}`)
}

/** The dim class per row kind (path/gap chrome vs the diff's own +/- colors). */
const ROW_CLASS: Record<DiffRow['kind'], string | undefined> = {
  path: css.path,
  del: css.del,
  add: css.add,
  gap: css.gap,
}

/**
 * Flatten the hunks into the body's rows plus the footer counts. A path header
 * opens each new file; a same-file second hunk (a scattered edit) opens with a
 * `⋯` gap instead of repeating the path. Every old-side line counts toward
 * `removed` and every new-side line toward `added`. The file count is of
 * DISTINCT paths, matching the TUI diff card's footer, so two hunks in one file
 * read as `1 file` on both front ends.
 * @param diffs - the hunks to render.
 * @returns the body rows, the +/- totals, and the distinct-file count.
 */
function buildRows(diffs: DiffHunk[]): { rows: DiffRow[]; added: number; removed: number; files: number } {
  const rows: DiffRow[] = []
  const paths = new Set<string>()
  let added = 0
  let removed = 0
  let prevPath: string | undefined
  for (const diff of diffs) {
    paths.add(diff.path)
    if (diff.path !== prevPath) rows.push({ kind: 'path', text: diff.path })
    else rows.push({ kind: 'gap', text: '⋯' })
    prevPath = diff.path
    if (diff.oldText !== null) {
      for (const line of contentLines(diff.oldText)) {
        rows.push({ kind: 'del', text: line })
        removed++
      }
    }
    for (const line of contentLines(diff.newText)) {
      rows.push({ kind: 'add', text: line })
      added++
    }
  }
  return { rows, added, removed, files: paths.size }
}

/**
 * Split a side's text into its content lines. Empty text is zero lines (a full
 * deletion's `newText` or a create's absent `oldText` side draws nothing), and a
 * single trailing newline is a line terminator rather than an extra empty line —
 * the same terminator rule TerminalBlock applies to command output. An interior
 * blank line (a genuine `\n\n`) survives.
 * @param text - the removed or added side's text.
 * @returns the content lines, without the terminating newline.
 */
function contentLines(text: string): string[] {
  if (text === '') return []
  const body = text.endsWith('\n') ? text.slice(0, -1) : text
  return body.split('\n')
}

/**
 * The diff text a reader copies: each row's `-`/`+`/path/gap prefix and its
 * content, exactly what the card shows. The removed and added blocks are the
 * change; the path headers keep a multi-file copy attributable.
 * @param rows - the flattened body rows.
 * @returns the diff as plain text.
 */
function copyText(rows: DiffRow[]): string {
  return rows.map((row) => {
    switch (row.kind) {
      case 'del': return `- ${row.text}`
      case 'add': return `+ ${row.text}`
      case 'path': return row.text
      case 'gap': return row.text
      /* closed-union backstop; only reached if a row kind is forged */
      default: return assertNever(row.kind)
    }
  }).join('\n')
}

/**
 * Render a file mutation as an inline diff surface.
 * @param props - see {@link DiffBlockProps}.
 * @returns the diff block element.
 */
const DEFAULT_LABELS: DiffBlockLabels = {
  copy: 'Copy',
  copied: 'Copied',
  collapseAria: 'Collapse diff',
  expandAria: hidden => `Expand the remaining ${hidden} diff lines`,
  collapse: 'Collapse',
  expand: hidden => `… ${hidden} more lines`,
  file: 'file',
  files: 'files',
}

export function DiffBlock({
  diffs, maxLines = DEFAULT_DIFF_MAX_LINES, className, labels = DEFAULT_LABELS, appearance = 'card',
}: DiffBlockProps) {
  const { rows, added, removed, files } = useMemo(() => buildRows(diffs), [diffs])
  const visibleRows = appearance === 'file' ? rows.filter(row => row.kind !== 'path') : rows
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)

  const onCopy = useCallback(() => {
    if (copied) return
    void writeClipboard(copyText(rows)).then((ok) => {
      if (!ok) return
      setCopied(true)
      window.setTimeout(() => { setCopied(false) }, 1000)
    })
  }, [copied, rows])

  const onToggle = useCallback(() => { setExpanded(value => !value) }, [])

  if (rows.length === 0) return null

  const hidden = visibleRows.length - maxLines
  const capped = hidden > 0 && !expanded
  // Same split arithmetic as TerminalBlock and the TUI transcript's collapsed
  // card, so a body's head and tail slices agree across the front ends.
  const headLines = Math.ceil(maxLines / 2)
  const tailLines = maxLines - headLines
  const head = capped ? visibleRows.slice(0, headLines) : visibleRows
  const tail = capped ? visibleRows.slice(visibleRows.length - tailLines) : []

  return (
    <div className={clsx(css.block, className)} data-diff="" data-appearance={appearance}>
      <button type="button" className={css.copyButton} onClick={onCopy}>
        {copied ? labels.copied : labels.copy}
      </button>
      <div className={css.body}>
        {head.map((row, index) => (
          <div key={index} className={clsx(css.line, ROW_CLASS[row.kind])}>{row.text}</div>
        ))}
        {hidden > 0 && (
          <button
            type="button"
            className={css.expand}
            aria-expanded={expanded}
            aria-label={expanded ? labels.collapseAria : labels.expandAria(hidden)}
            onClick={onToggle}
          >
            {expanded ? labels.collapse : labels.expand(hidden)}
          </button>
        )}
        {tail.map((row, index) => (
          <div key={index} className={clsx(css.line, ROW_CLASS[row.kind])}>{row.text}</div>
        ))}
      </div>
      {appearance === 'card' && (
        <div className={css.footer}>└ +{added} -{removed} · {files} {files === 1 ? labels.file : labels.files}</div>
      )}
    </div>
  )
}
