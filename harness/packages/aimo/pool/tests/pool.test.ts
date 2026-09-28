/**
 * Self-test for the pool planner (plan T9). Run with:
 *   pnpm exec tsx packages/aimo/pool/tests/pool.test.ts
 */

import assert from 'node:assert/strict'
import { copyIndexOf, planNextClaim } from '../src/plan.ts'
import type { PoolTask } from '../src/plan.ts'
import { foldDepth, foldMarker, isFoldParent, selectFoldableTasks } from '../src/fold.ts'
import type { FoldTask } from '../src/fold.ts'


function task(overrides: Partial<PoolTask> & Pick<PoolTask, 'id' | 'subject'>): PoolTask {
  return {
    revision: 1,
    description: 'solve it',
    status: 'pending',
    ready: true,
    blockedBy: [],
    ...overrides,
  }
}

// ---- copyIndexOf ----
assert.equal(copyIndexOf('prove-x'), 0, 'no index')
assert.equal(copyIndexOf('prove-x #2'), 2, 'index parsed')
assert.equal(copyIndexOf('  prove-x #12  '), 12, 'trimmed, multi-digit')

// ---- 1) prefers claiming an existing ready unowned task ----
assert.deepEqual(
  planNextClaim([task({ id: 'task-1', subject: 'prove-x' })], { maxCopiesPerGroup: 3 }),
  { kind: 'claim', taskId: 'task-1' },
  'claims a ready unowned task',
)

// owned or not-ready tasks are not claimable, so it extends the group instead
const busy = planNextClaim([
  task({ id: 'task-1', subject: 'prove-x', ownerName: 'solver-1', status: 'in_progress', ready: false }),
], { maxCopiesPerGroup: 3 })
assert.equal(busy.kind, 'create-copy', 'extends a group whose only copy is in progress')
assert.equal(busy.kind === 'create-copy' ? busy.group : '', 'prove-x', 'group key')
assert.equal(busy.kind === 'create-copy' ? busy.index : 0, 1, 'first copy index')
assert.deepEqual(busy.kind === 'create-copy' ? busy.description : '', 'solve it', 'description inherited')

// ---- 2) copy cap ----
const capped = planNextClaim([
  task({ id: 'task-1', subject: 'prove-x #1', ownerName: 'solver-1', status: 'in_progress', ready: false }),
  task({ id: 'task-2', subject: 'prove-x #2', ownerName: 'solver-2', status: 'in_progress', ready: false }),
  task({ id: 'task-3', subject: 'prove-x #3', ownerName: 'solver-3', status: 'in_progress', ready: false }),
], { maxCopiesPerGroup: 3 })
assert.equal(capped.kind, 'none', 'cap reached -> stay idle')

// ---- 3) a completed copy closes the group ----
const closed = planNextClaim([
  task({ id: 'task-1', subject: 'prove-x #1', status: 'completed' }),
  task({ id: 'task-2', subject: 'prove-x #2', ownerName: 'solver-2', status: 'in_progress', ready: false }),
], { maxCopiesPerGroup: 3 })
assert.equal(closed.kind, 'none', 'answered subtask gets no new copies')

// ---- 4) blocked groups are skipped ----
const blocked = planNextClaim([
  task({ id: 'task-1', subject: 'prove-y', blockedBy: ['task-0'], ready: false, ownerName: 'solver-1', status: 'in_progress' }),
], { maxCopiesPerGroup: 3 })
assert.equal(blocked.kind, 'none', 'unmet dependency -> no copy')

// ---- 5) unowned non-ready tasks are claimable once ready; index ordering ----
const ordering = planNextClaim([
  task({ id: 'task-9', subject: 'prove-z #2', ready: true }),
  task({ id: 'task-4', subject: 'prove-z', ready: true }),
], { maxCopiesPerGroup: 3 })
assert.deepEqual(ordering, { kind: 'claim', taskId: 'task-4' }, 'lowest copy index first')

// ---- 6) deleted rows are ignored ----
const deleted = planNextClaim([
  task({ id: 'task-1', subject: 'prove-x', status: 'deleted' }),
], { maxCopiesPerGroup: 3 })
assert.equal(deleted.kind, 'none', 'deleted tasks are not work')

// ---- 7) fold rules (T4) ----
function foldTask(overrides: Partial<FoldTask> & Pick<FoldTask, 'id'>): FoldTask {
  return {
    revision: 1,
    subject: 'parent',
    description: 'do the thing',
    status: 'in_progress',
    blockedBy: [],
    ...overrides,
  }
}

assert.equal(isFoldParent('x\n\n[fold-parent depth=1]'), true, 'marker detected')
assert.equal(isFoldParent('plain description'), false, 'no marker')
assert.equal(foldDepth('x [fold-parent depth=2]'), 2, 'depth parsed')
assert.equal(foldDepth('plain'), 0, 'unmarked depth is 0')
assert.equal(foldMarker(3), '[fold-parent depth=3]', 'marker text')

const foldBoard: FoldTask[] = [
  foldTask({ id: 'c1', subject: 'sub-a', status: 'completed' }),
  foldTask({ id: 'c2', subject: 'sub-b', status: 'completed' }),
  foldTask({ id: 'p1', subject: 'parent', description: 'combine\n\n[fold-parent depth=1]', blockedBy: ['c1', 'c2'] }),
  foldTask({ id: 'p2', subject: 'other parent', description: 'waiting\n\n[fold-parent depth=1]', blockedBy: ['c1', 'c3'] }),
  foldTask({ id: 'p3', subject: 'unmarked', description: 'plain description', blockedBy: ['c1', 'c2'] }),
]
assert.deepEqual(
  selectFoldableTasks(foldBoard).map(task => task.id),
  ['p1'],
  'only a marked parent with every subtask completed folds',
)

assert.deepEqual(
  selectFoldableTasks([foldTask({ id: 'p4', subject: 'pending parent', description: '[fold-parent depth=1]', status: 'pending', blockedBy: [] })]),
  [],
  'a pending parent never folds',
)
assert.deepEqual(
  selectFoldableTasks([foldTask({ id: 'p5', subject: 'no children', description: '[fold-parent depth=1]', blockedBy: [] })]),
  [],
  'a marked parent without subtasks never folds',
)

console.log('pool self-test: all assertions passed')
