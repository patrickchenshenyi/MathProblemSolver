/**
 * Pure final-answer validation — the project's only runtime acceptance layer
 * (the "L0" check). Extracts the LAST `\boxed{...}`, strips commas and spaces,
 * requires a non-negative integer, and bounds it to the configured
 * `[answerMin, answerMax]` range.
 *
 * Defaults `[0, 99999]` cover both AIME (3-digit) and AIMO3 (`mod 10^5`,
 * 5-digit) answers.
 *
 * This check validates FORMAT AND RANGE ONLY — it never judges mathematical
 * correctness. Correctness is the solving agents' job today and Lean formal
 * proofs' job in the future (submitted through `submit_task`).
 * @module @deepseek-ai/dsh-aimo-verifier/answer
 */

/** Configurable answer bounds. */
export interface AnswerConfig {
  /** Smallest accepted integer answer (default 0). */
  answerMin: number
  /** Largest accepted integer answer (default 99999). */
  answerMax: number
}

export const DEFAULT_ANSWER_CONFIG: AnswerConfig = { answerMin: 0, answerMax: 99999 }

/** Structured, deterministic outcome of final-answer validation. */
export interface AnswerVerdict {
  /** True only when the text carries a well-formed in-range integer answer. */
  ok: boolean
  /** Human-readable summary (`accepted`, or the first failure reason). */
  reason: string
  /** The extracted integer answer, or `null` when extraction failed. */
  answer: number | null
}

/**
 * Validate one final-answer text. Pure: a deterministic function of its inputs.
 * @param raw - candidate text (may contain `\boxed{...}`).
 * @param config - answer bounds; defaults to {@link DEFAULT_ANSWER_CONFIG}.
 */
export function validateAnswer(raw: string, config: AnswerConfig = DEFAULT_ANSWER_CONFIG): AnswerVerdict {
  const matches = [...raw.matchAll(/\\boxed\s*\{([^{}]*)\}/g)]
  const last = matches[matches.length - 1]
  if (last === undefined) return { ok: false, reason: 'no boxed answer', answer: null }
  // Last boxed wins (matches the original L0 behaviour).
  const inner = (last[1] ?? '').trim()
  const candidate = inner.replace(/[, ]/g, '')
  if (!/^\d+$/.test(candidate)) {
    return { ok: false, reason: `not an integer: ${JSON.stringify(inner)}`, answer: null }
  }
  const n = Number(candidate)
  if (n < config.answerMin || n > config.answerMax) {
    return {
      ok: false,
      reason: `out of range: ${n} (expected ${config.answerMin}..${config.answerMax})`,
      answer: null,
    }
  }
  return { ok: true, reason: 'accepted', answer: n }
}
