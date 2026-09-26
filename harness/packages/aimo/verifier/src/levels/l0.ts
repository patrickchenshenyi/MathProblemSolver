/**
 * L0 — answer-string validation. Extracts the last `\boxed{...}`, strips commas
 * and spaces, requires a non-negative integer, and bounds it to `[0, 99999]`.
 * Aligns with `MyProject/强验收器实现.md` §1. Problem-agnostic.
 * @module @deepseek-ai/dsh-aimo-verifier/levels/l0
 */

import type { Level, VerifyContext } from './types.ts'

const MAX_ANSWER = 99999

export const l0: Level = {
  id: 'l0',
  verify(ctx: VerifyContext): string[] {
    const matches = [...ctx.raw.matchAll(/\\boxed\s*\{([^{}]*)\}/g)]
    const last = matches[matches.length - 1]
    if (last === undefined) return ['no boxed answer']
    // Last boxed wins (matches the reference implementation).
    const inner = (last[1] ?? '').trim()
    const candidate = inner.replace(/[, ]/g, '')
    if (!/^\d+$/.test(candidate)) return [`not an integer: ${JSON.stringify(inner)}`]
    const n = Number(candidate)
    if (n > MAX_ANSWER) return [`out of range: ${n}`]
    ctx.answer = n
    return []
  },
}
