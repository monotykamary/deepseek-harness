/** Measured localterm renderer constants retained as fixed xterm performance invariants. */

/** Initial reusable raw-output staging capacity. */
export const OUTPUT_BATCHER_INITIAL_CAPACITY_BYTES = 8 * 1024
/** Consumed write slots retained before queue compaction. */
export const OUTPUT_PENDING_WRITE_COMPACTION_THRESHOLD_WRITES = 1024
/** DEC 2026 synchronized-output termination sequence. */
export const SYNCHRONIZED_OUTPUT_END_SEQUENCE = '\u001b[?2026l'
/** Completed successors proving a synchronized-output backlog. */
export const SYNCHRONIZED_OUTPUT_PREEMPTION_MINIMUM_COMPLETED_FRAMES = 2
/** Largest post-input response rendered synchronously through WebGL. */
export const INTERACTIVE_OUTPUT_RENDER_MAX_BYTES = 8 * 1024
/** Maximum input-to-response latency receiving interactive render treatment. */
export const INTERACTIVE_OUTPUT_RENDER_WINDOW_MS = 500
/** Output-idle interval retaining Chromium's compositor frame loop. */
export const OUTPUT_KEEP_WARM_MS = 150
/** Smallest known programming-ligature candidate length. */
export const MINIMUM_LIGATURE_SEQUENCE_CHARACTERS_COUNT = 2
/** Exact Fira Code `www` candidate length. */
export const WWW_LIGATURE_SEQUENCE_CHARACTERS_COUNT = 3
/** Bounded active-font ligature support cache entries. */
export const LIGATURE_SUPPORT_CACHE_MAX_ENTRIES_COUNT = 512
/** Candidate length above which pixel support probing is bypassed. */
export const LIGATURE_SUPPORT_PROBE_MAX_CHARACTERS_COUNT = 256
