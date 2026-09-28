/**
 * Self-test for the pure role policy. Run with:
 *   pnpm exec tsx packages/aimo/team-roles/tests/team-roles.test.ts
 */

import assert from 'node:assert/strict'
import { classifyRole, policyFor } from '../src/roles.ts'

// ---- classifyRole ----
assert.equal(classifyRole('lead', 'lead'), 'lead', 'lead classified')
assert.equal(classifyRole('teammate', 'solver'), 'solver', 'bare solver name')
assert.equal(classifyRole('teammate', 'solver-1'), 'solver', 'solver prefix')
assert.equal(classifyRole('teammate', 'critic'), 'critic', 'bare critic name')
assert.equal(classifyRole('teammate', 'critic-2'), 'critic', 'critic prefix')
assert.equal(classifyRole('teammate', 'proposer'), 'unknown', 'unknown fails closed')

// ---- policyFor ----
const lead = policyFor('lead')
assert.deepEqual(lead.denyTools, ['submit_task'], 'lead denied submit_task only')
assert.equal(lead.mayComplete, false, 'lead cannot complete')

const solver = policyFor('solver')
assert.deepEqual(solver.denyTools, ['submit_final_answer'], 'solver denied submit_final_answer only')
assert.equal(solver.mayComplete, true, 'solver may complete')

const critic = policyFor('critic')
assert.deepEqual(critic.denyTools, ['submit_task', 'submit_final_answer'], 'critic denied both submits')
assert.equal(critic.mayComplete, false, 'critic cannot complete')

const unknown = policyFor('unknown')
assert.deepEqual(unknown.denyTools, ['submit_task', 'submit_final_answer'], 'unknown denied both submits')
assert.equal(unknown.mayComplete, false, 'unknown cannot complete')

console.log('team-roles self-test: all assertions passed')
