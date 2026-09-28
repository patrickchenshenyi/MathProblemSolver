/**
 * Self-test for the Phase-0 acceptance layer (answer validation only).
 * Run with:
 *   pnpm exec tsx packages/aimo/verifier/tests/verifier.test.ts
 * Classes: accept (well-formed in-range integer), reject (out of range /
 * non-integer / non-numeric / no boxed), plus custom-bound configuration.
 */

import assert from 'node:assert/strict'
import { validateAnswer } from '../src/answer.ts'
import { siblingGroupKey, selectSiblingCopies } from '../src/siblings.ts'
import { resultNote, selectShareRecipients, RESULT_NOTE_LIMIT } from '../src/share.ts'

// ---- accept (default range [0, 99999]) ----
assert.equal(validateAnswer('The answer is \\boxed{60}').ok, true, 'boxed 60 accepted')
assert.equal(validateAnswer('\\boxed{0}').answer, 0, 'boxed 0 accepted')
assert.equal(validateAnswer('\\boxed{99999}').ok, true, 'boxed 99999 accepted (AIMO3 5-digit bound)')
assert.equal(validateAnswer('\\boxed{1,234}').answer, 1234, 'commas stripped')
assert.equal(validateAnswer('\\boxed{ 60 }').answer, 60, 'spaces stripped')
assert.equal(validateAnswer('\\boxed{1} then \\boxed{60}').answer, 60, 'last boxed wins')

// ---- reject ----
assert.equal(validateAnswer('\\boxed{100000}').ok, false, 'out of range rejected')
assert.equal(validateAnswer('no boxed answer here').ok, false, 'no boxed rejected')
assert.equal(validateAnswer('\\boxed{3.14}').ok, false, 'non-integer rejected')
assert.equal(validateAnswer('\\boxed{答案见上一题}').ok, false, 'non-numeric rejected')
assert.equal(validateAnswer('\\boxed{}').ok, false, 'empty boxed rejected')
assert.equal(validateAnswer('\\boxed{-3}').ok, false, 'negative rejected')

// ---- custom bounds ----
assert.equal(
  validateAnswer('\\boxed{60}', { answerMin: 100, answerMax: 99999 }).ok,
  false,
  'below custom min rejected',
)
assert.equal(
  validateAnswer('\\boxed{1200}', { answerMin: 0, answerMax: 999 }).ok,
  false,
  'above custom max rejected',
)
assert.equal(
  validateAnswer('\\boxed{1200}', { answerMin: 0, answerMax: 9999 }).ok,
  true,
  'custom range accepts',
)

// ---- sibling grouping (Phase 3 T3) ----
assert.equal(siblingGroupKey('subtask-a #2'), 'subtask-a', 'copy index stripped')
assert.equal(siblingGroupKey('subtask-a'), 'subtask-a', 'no suffix unchanged')
assert.equal(siblingGroupKey('  subtask-a #3  '), 'subtask-a', 'whitespace trimmed')

const completedCopy = { id: 'task-1', revision: 3, subject: 'prove-x #1', status: 'completed', ownerName: 'solver-1' }
const board = [
  completedCopy,
  { id: 'task-2', revision: 2, subject: 'prove-x #2', status: 'in_progress', ownerName: 'solver-2' },
  { id: 'task-3', revision: 1, subject: 'prove-x #3', status: 'pending' },
  { id: 'task-4', revision: 1, subject: 'prove-y #1', status: 'pending' },
  { id: 'task-5', revision: 4, subject: 'prove-x #2', status: 'completed' },
]
const copies = selectSiblingCopies(board, completedCopy.id, completedCopy.subject)
assert.deepEqual(
  copies.map(t => t.id),
  ['task-2', 'task-3'],
  'open copies of the same group selected; other groups and closed copies excluded',
)

// ---- result sharing (Phase 3 T5) ----
assert.equal(resultNote('found 60', 'log_z(w) = 60'), '[result] found 60\nlog_z(w) = 60', 'note text')
assert.equal(
  resultNote('s'.repeat(10), 'd'.repeat(RESULT_NOTE_LIMIT * 2)).length,
  RESULT_NOTE_LIMIT + 1,
  'long note truncated with an ellipsis',
)

const shareBoard = [
  { id: 'p', subject: 'prove-x', status: 'completed', ownerName: 'solver-1', blockedBy: [] },
  { id: 'dep', subject: 'assemble', status: 'in_progress', ownerName: 'solver-9', blockedBy: ['p', 'sib'] },
  { id: 'sib', subject: 'prove-y', status: 'in_progress', ownerName: 'solver-2', blockedBy: [] },
  { id: 'copy', subject: 'prove-x #1', status: 'in_progress', ownerName: 'solver-3', blockedBy: [] },
  { id: 'unrelated', subject: 'other', status: 'pending', ownerName: 'solver-4', blockedBy: [] },
]
assert.deepEqual(
  selectShareRecipients(shareBoard, 'prove-x', 'solver-1'),
  ['solver-2', 'solver-9'],
  'dependents and sibling subtasks receive the result; copies, the submitter and unrelated tasks do not',
)
assert.deepEqual(
  selectShareRecipients(shareBoard, 'other', 'solver-4'),
  [],
  'a task nobody depends on shares with nobody',
)

console.log('verifier self-test: all assertions passed')
