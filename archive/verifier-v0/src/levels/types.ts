/**
 * Shared verification vocabulary. Pure types only — no cordis, no model, no I/O.
 * @module @deepseek-ai/dsh-aimo-verifier/levels/types
 */

/** Verification levels, in cascade order. */
export type LevelId = 'l0' | 'l1' | 'l2'

/** Mutable state threaded through the level cascade. */
export interface VerifyContext {
  /** Problem identifier (used by L1/L2; ignored by L0). */
  problemId: string
  /** The raw candidate submission text (may contain `\boxed{...}`). */
  raw: string
  /** Integer answer extracted by L0; `null` until L0 succeeds. */
  answer: number | null
}

/** One verification level: returns failure reasons (empty array = pass). */
export interface Level {
  id: LevelId
  verify(ctx: VerifyContext): string[]
}

/** One failed check, attributed to its level. */
export interface VerdictFailure {
  level: LevelId
  reason: string
}

/** Structured, deterministic outcome of the level cascade. */
export interface Verdict {
  /** True only when every level passed. */
  ok: boolean
  /** First failing level, or the last level run when `ok`. `null` for an empty level list. */
  level: LevelId | null
  failures: VerdictFailure[]
  /** Human-readable summary (first failure reason, or `accepted`). */
  reason: string
  /** The extracted integer answer, when L0 succeeded. */
  answer: number | null
}
