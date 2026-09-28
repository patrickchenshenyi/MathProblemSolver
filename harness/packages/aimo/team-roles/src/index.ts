/**
 * Cordis plugin: hard per-role tool scoping for AIMO Team members (plan Phase 1,
 * T1). On every live Team member (Lead included) it applies:
 *
 * - `tools.restrict({ deny })` — hides submission tools from roles that may not
 *   submit: lead and critic never see `submit_task`; everyone but the lead is
 *   denied `submit_final_answer`; unknown roles fail closed.
 * - `tools.guard` — rejects `team_task_update action=complete` from every role
 *   except `solver`, so completing a shared task requires the owner solver.
 *
 * Roles are classified from the teammate's durable name prefix (`solver-*` /
 * `critic-*`, see `roles.ts`). Non-Team agents are left untouched. If the
 * agent-team service or the verifier tools are not mounted, the plugin degrades
 * to a warning instead of failing startup.
 * @module @deepseek-ai/dsh-aimo-team-roles
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-experimental-agent-team'
import { classifyRole, policyFor } from './roles.ts'

export const name = 'aimo-team-roles'
export const inject = ['agents']

/** `tool-agent-team`'s task mutation tool; `action` is one of its enum values. */
const TEAM_TASK_UPDATE = 'team_task_update'

/** Denial text the model sees when a non-solver tries to complete a task. */
const COMPLETE_DENIAL = 'only solver teammates may complete a shared task; submit results through submit_task'

export function apply(ctx: Context): void {
  const installed = new Set<Agent>()
  const disposers = new Map<Agent, Array<() => void>>()

  const maybeInstall = (agent: Agent): void => {
    if (installed.has(agent)) return
    let teams
    try {
      teams = ctx.get('agentTeams')
    } catch {
      return
    }
    if (teams === undefined) return
    const membership = teams.tryMembership(agent)
    if (membership === undefined) return
    installed.add(agent)

    const role = classifyRole(membership.role, membership.name)
    const policy = policyFor(role)
    const agentDisposers: Array<() => void> = []

    if (policy.denyTools.length > 0) {
      try {
        agentDisposers.push(agent.ctx.tools.restrict({ deny: [...policy.denyTools] }))
      } catch (error) {
        ctx.logger.warn(
          `aimo-team-roles: restriction for "${membership.name}" (${role}) failed: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }
    if (!policy.mayComplete) {
      agentDisposers.push(agent.ctx.tools.guard((exec) => {
        if (exec.name !== TEAM_TASK_UPDATE) return undefined
        const args = exec.arguments
        if (typeof args === 'object' && args !== null && (args as { action?: unknown }).action === 'complete') {
          return `${COMPLETE_DENIAL} (role: ${role})`
        }
        return undefined
      }))
    }

    disposers.set(agent, agentDisposers)
  }

  for (const agent of ctx.agents.list()) maybeInstall(agent)
  ctx.on('agent/created', ({ agent }) => { maybeInstall(agent) })
  ctx.on('agent/disposed', ({ agent }) => {
    installed.delete(agent)
    const agentDisposers = disposers.get(agent)
    if (agentDisposers !== undefined) {
      for (const dispose of agentDisposers) {
        dispose()
      }
      disposers.delete(agent)
    }
  })
}

export { classifyRole, policyFor } from './roles.ts'
export type { AgentRole, RolePolicy } from './roles.ts'
