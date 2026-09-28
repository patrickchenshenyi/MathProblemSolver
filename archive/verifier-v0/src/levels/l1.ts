/**
 * L1 — constraint satisfaction (Step 3). Looks up a hand-written constraint
 * predicate at `constraints/<problemId>.py` (trusted ground truth, never
 * model-generated) and runs it against the L0-extracted answer via a plain
 * `python3` subprocess. Problems without a predicate are a no-op, so L1 never
 * rejects on problems it has not been told about.
 * @module @deepseek-ai/dsh-aimo-verifier/levels/l1
 */

import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Level, VerifyContext } from './types.ts'

const PREDICATE_TIMEOUT_MS = 10_000

/** Locate the package's `constraints/` dir from either the source or built layout. */
function constraintsDir(): string {
  let dir = dirname(fileURLToPath(import.meta.url))
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, 'constraints')
    if (existsSync(candidate)) return candidate
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  throw new Error('aimo-verifier: constraints directory not found')
}

export const l1: Level = {
  id: 'l1',
  verify(ctx: VerifyContext): string[] {
    if (ctx.answer === null) return [] // L0 failed; nothing for L1 to check
    const file = join(constraintsDir(), `${ctx.problemId}.py`)
    if (!existsSync(file)) return [] // no predicate for this problem -> no-op
    try {
      const raw = execFileSync('python3', [file, String(ctx.answer)], {
        encoding: 'utf8',
        timeout: PREDICATE_TIMEOUT_MS,
      })
      const parsed: unknown = JSON.parse(raw)
      if (!Array.isArray(parsed)) return [`L1 predicate for ${ctx.problemId} returned a non-array result`]
      return parsed.map(failure => String(failure))
    } catch (error) {
      return [`L1 predicate execution failed for ${ctx.problemId}: ${String(error)}`]
    }
  },
}
