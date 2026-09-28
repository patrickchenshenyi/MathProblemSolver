/**
 * Pure role classification and policy for AIMO team members. No cordis, no
 * model, no I/O — directly unit-testable.
 * @module @deepseek-ai/dsh-aimo-team-roles/roles
 */

/** Role of one Team member, as enforced by the role plugin. */
export type AgentRole = 'lead' | 'solver' | 'critic' | 'unknown'

/** Tool restrictions and completion permission for one role. */
export interface RolePolicy {
  /** Global tool names hidden from this role's scope. */
  readonly denyTools: readonly string[]
  /** Whether this role may complete a shared task via `team_task_update`. */
  readonly mayComplete: boolean
}

/**
 * Classify one Team member by its durable name prefix.
 * Teammate names follow the `solver-*` / `critic-*` convention; the bare names
 * `solver` and `critic` are accepted too. Anything else fails closed
 * (`unknown`), so a typo'd name cannot accidentally grant submission rights.
 */
export function classifyRole(role: 'lead' | 'teammate', name: string): AgentRole {
  if (role === 'lead') return 'lead'
  if (name === 'solver' || name.startsWith('solver-')) return 'solver'
  if (name === 'critic' || name.startsWith('critic-')) return 'critic'
  return 'unknown'
}

/**
 * The role policy table.
 * - lead: never submits or completes tasks; owns `submit_final_answer`.
 * - solver: the only role that may submit/complete tasks; never calls
 *   `submit_final_answer` (the Lead's job).
 * - critic: reviews only — no submission, no completion.
 * - unknown: fails closed — no submission, no completion.
 */
export function policyFor(role: AgentRole): RolePolicy {
  switch (role) {
    case 'lead': return { denyTools: ['submit_task'], mayComplete: false }
    case 'solver': return { denyTools: ['submit_final_answer'], mayComplete: true }
    case 'critic': return { denyTools: ['submit_task', 'submit_final_answer'], mayComplete: false }
    case 'unknown': return { denyTools: ['submit_task', 'submit_final_answer'], mayComplete: false }
  }
}
