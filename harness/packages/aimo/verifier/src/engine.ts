/**
 * Pure verification engine. `verify` is a deterministic function of its inputs
 * (problem id + candidate text + level list) with no model, UI, or I/O
 * dependency, so it can be unit-tested and reused as the submission gate.
 * @module @deepseek-ai/dsh-aimo-verifier/engine
 */

import type { Level, LevelId, Verdict, VerifyContext } from './levels/types.ts'
import { l0 } from './levels/l0.ts'
import { l1 } from './levels/l1.ts'
import { l2 } from './levels/l2.ts'

/**
 * The verification cascade, in order. Adding a level = implement it in
 * `levels/<id>.ts` and list it here; `index.ts` (the plugin) never changes.
 * L1/L2 are no-op placeholders until Steps 3/4.
 */
export const DEFAULT_LEVELS: readonly Level[] = [l0, l1, l2]

/**
 * Run the level cascade over one candidate. Levels run in order and stop at the
 * first failure (L0 extracts the integer answer; L1/L2 read it). The result is a
 * pure, reproducible {@link Verdict}.
 * @param problemId - problem identifier, threaded to L1/L2.
 * @param candidate - raw submission text (may contain `\boxed{...}`).
 * @param levels - cascade to run; defaults to {@link DEFAULT_LEVELS}.
 * @returns the structured verdict.
 */
export function verify(problemId: string, candidate: string, levels: readonly Level[] = DEFAULT_LEVELS): Verdict {
  const ctx: VerifyContext = { problemId, raw: candidate, answer: null }
  const failures: Verdict['failures'] = []
  let stopped: LevelId | null = null
  let lastRun: LevelId | null = null
  for (const level of levels) {
    lastRun = level.id
    const reasons = level.verify(ctx)
    if (reasons.length > 0) {
      for (const reason of reasons) failures.push({ level: level.id, reason })
      stopped = level.id
      break
    }
  }
  const ok = failures.length === 0
  return {
    ok,
    level: ok ? lastRun : stopped,
    failures,
    reason: ok ? 'accepted' : (failures[0]?.reason ?? 'rejected'),
    answer: ctx.answer,
  }
}

export type { Level, LevelId, Verdict, VerifyContext, VerdictFailure } from './levels/types.ts'
