/**
 * Self-test for the verifier engine. Run with:
 *   pnpm exec tsx packages/aimo/verifier/tests/verifier.test.ts
 * Three classes: correct → accept, error → reject, cheat → reject (L0),
 * plus L1 constraint cases (correct vs in-range-but-constraint-violating).
 */

import assert from 'node:assert/strict'
import { verify, DEFAULT_LEVELS } from '../src/engine.ts'

function v(candidate: string) {
  return verify('aime-0000-00', candidate)
}

// ---- L0: correct (legal integer answer) ----
assert.equal(v('The answer is \\boxed{60}').ok, true, 'boxed 60 accepted')
assert.equal(v('\\boxed{0}').ok, true, 'boxed 0 accepted')
assert.equal(v('\\boxed{99999}').ok, true, 'boxed 99999 accepted')
assert.equal(v('\\boxed{1,234}').ok, true, 'commas stripped')
assert.equal(v('\\boxed{ 60 }').ok, true, 'spaces stripped')
assert.equal(v('\\boxed{1} then \\boxed{60}').answer, 60, 'last boxed wins')

// ---- L0: error (out of range / non-integer / no boxed) ----
assert.equal(v('\\boxed{100000}').ok, false, 'out of range rejected')
assert.equal(v('no boxed answer here').ok, false, 'no boxed rejected')
assert.equal(v('\\boxed{3.14}').ok, false, 'non-integer rejected')

// ---- L0: cheat ----
assert.equal(v('\\boxed{答案见上一题}').ok, false, 'non-numeric content rejected')
assert.equal(v('\\boxed{}').ok, false, 'empty boxed rejected')
assert.equal(v('\\boxed{-3}').ok, false, 'negative rejected')

// ---- L0: structural ----
assert.equal(DEFAULT_LEVELS.length, 3, 'L0/L1/L2 all wired')
assert.equal(DEFAULT_LEVELS.map(l => l.id).join(','), 'l0,l1,l2', 'cascade order')
assert.equal(verify('x', '\\boxed{60}', DEFAULT_LEVELS).level, 'l2', 'full cascade runs through to l2')
assert.equal(verify('x', '\\boxed{60}', DEFAULT_LEVELS).answer, 60, 'answer extracted through cascade')

// ---- L1: constraint satisfaction (per-problem hand-written predicates) ----
const l1Cases: { id: string; correct: number; wrong: number }[] = [
  { id: 'aime-1983-01', correct: 60, wrong: 61 },
  { id: 'aime-1986-02', correct: 104, wrong: 105 },
  { id: 'aime-1987-05', correct: 588, wrong: 589 },
  { id: 'aime-1988-03', correct: 7, wrong: 8 },
  { id: 'aime-1991-01', correct: 146, wrong: 147 },
  { id: 'aime-1993-01', correct: 728, wrong: 729 },
]
for (const { id, correct, wrong } of l1Cases) {
  const good = verify(id, `\\boxed{${correct}}`, DEFAULT_LEVELS)
  assert.equal(good.ok, true, `${id}: correct answer ${correct} must pass L0+L1`)

  const bad = verify(id, `\\boxed{${wrong}}`, DEFAULT_LEVELS)
  assert.equal(bad.ok, false, `${id}: wrong in-range answer ${wrong} must fail L1`)
  const l1Failure = bad.failures.find(f => f.level === 'l1')
  assert.ok(l1Failure !== undefined, `${id}: failure must be attributed to L1`)
  assert.ok(l1Failure!.reason.length > 0, `${id}: L1 failure must name the constraint`)
}

// ---- L1: unknown problem is a no-op (no predicate -> pass) ----
assert.equal(verify('aime-9999-99', '\\boxed{42}', DEFAULT_LEVELS).ok, true, 'no-predicate problem passes')

console.log('verifier self-test: all assertions passed')
