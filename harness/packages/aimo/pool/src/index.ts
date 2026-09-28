/**
 * Cordis plugin: pool dispatch and DAG housekeeping (plans T9 + T4).
 *
 * - `claim_next_task` (T9) — an idle member's single deterministic call to take
 *   work: claim a ready unowned task, or create + claim a fresh copy of an active
 *   logical subtask (at most `maxCopiesPerGroup` open copies).
 * - `decompose_task` (T4) — split a task the caller owns into subtasks, marking
 *   the parent as a fold parent and recording the subtasks as its `blockedBy`.
 * - Fold sweep (T4) — on every committed team task event, complete any in-progress
 *   fold parent whose subtasks have all completed (acting with the Team Lead's
 *   authority, CAS-safe, cascading through nested decompositions).
 *
 * Orchestration stays in the prompt: the coordinator seeds one task per logical
 * subtask, wakes idle members with `followup_task`, and decides whether a
 * subtask deserves further decomposition. This plugin makes the mechanical steps
 * reliable; nothing here starts an agent.
 * @module @deepseek-ai/dsh-aimo-pool
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { TeamTaskId } from '@deepseek-ai/dsh-experimental-agent-team'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { planNextClaim } from './plan.ts'
import type { PoolTask } from './plan.ts'
import { foldDepth, foldMarker, selectFoldableTasks, FOLD_NOTE } from './fold.ts'

export const name = 'aimo-pool'
export const inject = ['tools', 'agents']

/** Plugin configuration: pool and decomposition limits. */
export interface Config {
  /** Maximum open (pending + in_progress) copies of one logical subtask. */
  maxCopiesPerGroup: number
  /** Maximum subtasks one `decompose_task` call may create. */
  maxChildren: number
  /** Maximum nested decomposition depth. */
  maxDepth: number
}

export const Config: z<Config> = z.object({
  maxCopiesPerGroup: z.number().default(3),
  maxChildren: z.number().default(5),
  maxDepth: z.number().default(3),
})

/** Rounds of cascading fold per sweep (a chain of nested parents). */
const FOLD_ROUNDS = 5

/** Error text of one caught failure. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Canonical `claim_next_task` result. */
interface ClaimOutput {
  kind: 'claimed' | 'created' | 'none'
  reason: string
  task_id?: string
  subject?: string
  revision?: number
}

/** Canonical `decompose_task` result. */
interface DecomposeOutput {
  created: boolean
  reason: string
  parent?: string
  children?: string[]
  depth?: number
}

export function apply(ctx: Context, config: Config): void {
  const { maxCopiesPerGroup, maxChildren, maxDepth } = config
  for (const [label, value] of [['maxCopiesPerGroup', maxCopiesPerGroup], ['maxChildren', maxChildren], ['maxDepth', maxDepth]] as const) {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new Error(`aimo-pool: config requires a positive safe integer ${label} (got ${value})`)
    }
  }

  ctx.tools.register(defineTool({
    name: 'claim_next_task',
    description:
      'Take the next piece of work for the calling member, in one call. Claims a ready unowned task if one '
      + `exists; otherwise creates a fresh copy of an active logical subtask (at most ${maxCopiesPerGroup} open copies per subtask) and claims it. `
      + 'Returns kind="none" when no work is available, in which case stay idle and report. '
      + 'Pass a short strategy so a new copy attacks the subtask differently from its siblings.',
    parameters: {
      strategy: { type: 'string', description: 'Short description of the approach this copy will take (used when a new copy is created).' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          kind: { type: 'string', required: true, enum: ['claimed', 'created', 'none'] },
          reason: { type: 'string', required: true },
          task_id: { type: 'string' },
          subject: { type: 'string' },
          revision: { type: 'integer' },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.kind === 'none'
          ? `no work: ${value.reason}`
          : `${value.kind === 'created' ? 'created and claimed' : 'claimed'} ${value.task_id} "${value.subject}" (revision ${value.revision})`,
      }],
    },
    async execute(args, exec): Promise<ClaimOutput> {
      const agent = exec.agent
      if (agent === undefined) return { kind: 'none', reason: 'claim_next_task requires an agent context (a Team member)' }
      const teams = ctx.get('agentTeams')
      if (teams === undefined) return { kind: 'none', reason: 'agent-team service is not mounted' }

      let plan
      try {
        const rows: PoolTask[] = teams.listTasks(agent).map(task => ({
          id: task.id,
          revision: task.revision,
          subject: task.subject,
          description: task.description,
          status: task.status,
          ...(task.ownerName === undefined ? {} : { ownerName: task.ownerName }),
          ready: task.ready,
          blockedBy: [...task.blockedBy],
        }))
        plan = planNextClaim(rows, { maxCopiesPerGroup })
      } catch (error) {
        return { kind: 'none', reason: messageOf(error) }
      }
      if (plan.kind === 'none') return { kind: 'none', reason: plan.reason }

      if (plan.kind === 'claim') {
        try {
          const taskId = TeamTaskId(plan.taskId)
          const current = teams.getTask(agent, taskId)
          const claimed = await teams.updateTask(agent, {
            taskId,
            expectedRevision: current.revision,
            action: 'claim',
          })
          return {
            kind: 'claimed',
            reason: 'claimed a ready unowned task',
            task_id: String(claimed.id),
            subject: claimed.subject,
            revision: claimed.revision,
          }
        } catch (error) {
          return { kind: 'none', reason: `claim failed: ${messageOf(error)}` }
        }
      }

      // Extend the subtask with a fresh copy and claim it.
      const hint = args.strategy?.trim()
      const description = hint === undefined || hint.length === 0
        ? plan.description
        : `${plan.description}\n\nStrategy hint for this copy: ${hint}`
      try {
        const created = await teams.createTask(agent, {
          subject: `${plan.group} #${plan.index}`,
          description,
          blockedBy: plan.blockedBy.map(TeamTaskId),
        })
        const claimed = await teams.updateTask(agent, {
          taskId: created.id,
          expectedRevision: created.revision,
          action: 'claim',
        })
        return {
          kind: 'created',
          reason: `created copy #${plan.index} of "${plan.group}" and claimed it`,
          task_id: String(claimed.id),
          subject: claimed.subject,
          revision: claimed.revision,
        }
      } catch (error) {
        return { kind: 'none', reason: `create-copy failed: ${messageOf(error)}` }
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'decompose_task',
    description:
      'Split a task you own into subtasks. Creates one board task per subtask (they become available to the '
      + 'pool immediately), then marks this task as a fold parent and makes it depend on them, so it is '
      + `completed automatically as soon as every subtask completed. Limits: at most ${maxChildren} subtasks per call, nesting depth at most ${maxDepth}. `
      + 'Give each subtask a description that states, in plain words, what counts as done.',
    parameters: {
      task_id: { type: 'string', required: true, description: 'The task you own and want to split.' },
      subtasks: {
        type: 'array',
        required: true,
        description: 'Subtasks to create; each needs a distinct subject and a description stating its acceptance criteria.',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            subject: { type: 'string', required: true, description: 'Short distinct subtask title.' },
            description: { type: 'string', required: true, description: 'What counts as done for this subtask.' },
          },
        },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          created: { type: 'boolean', required: true },
          reason: { type: 'string', required: true },
          parent: { type: 'string' },
          children: { type: 'array', items: { type: 'string' } },
          depth: { type: 'integer' },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.created
          ? `decomposed ${value.parent} into ${String(value.children?.length ?? 0)} subtasks (depth ${String(value.depth)}): ${(value.children ?? []).join(', ')}`
          : `rejected: ${value.reason}`,
      }],
    },
    async execute(args, exec): Promise<DecomposeOutput> {
      const agent = exec.agent
      if (agent === undefined) return { created: false, reason: 'decompose_task requires an agent context (a Team member)' }
      const teams = ctx.get('agentTeams')
      if (teams === undefined) return { created: false, reason: 'agent-team service is not mounted' }
      const subtasks = args.subtasks
      if (subtasks.length === 0) return { created: false, reason: 'at least one subtask is required' }
      if (subtasks.length > maxChildren) return { created: false, reason: `at most ${maxChildren} subtasks per call (got ${subtasks.length})` }
      if (subtasks.some(subtask => subtask.subject.trim().length === 0 || subtask.description.trim().length === 0)) {
        return { created: false, reason: 'every subtask needs a non-empty subject and description' }
      }
      const parentId = TeamTaskId(args.task_id)
      let parent
      try {
        parent = teams.getTask(agent, parentId)
      } catch (error) {
        return { created: false, reason: messageOf(error) }
      }
      const depth = foldDepth(parent.description) + 1
      if (depth > maxDepth) {
        return { created: false, reason: `decomposition depth ${depth} exceeds the configured maximum ${maxDepth}` }
      }
      const children: string[] = []
      try {
        for (const subtask of subtasks) {
          const child = await teams.createTask(agent, {
            subject: subtask.subject.trim(),
            description: subtask.description.trim(),
          })
          children.push(String(child.id))
        }
      } catch (error) {
        return { created: false, reason: `child creation failed after ${children.length} of ${subtasks.length}: ${messageOf(error)}` }
      }
      try {
        const current = teams.getTask(agent, parentId)
        // Mark the parent as a fold parent (idempotent for repeat calls).
        if (foldDepth(current.description) !== depth) {
          await teams.updateTask(agent, {
            taskId: parentId,
            expectedRevision: current.revision,
            action: 'edit',
            description: `${current.description}\n\n${foldMarker(depth)}`,
          })
        }
        const marked = teams.getTask(agent, parentId)
        await teams.updateTask(agent, {
          taskId: parentId,
          expectedRevision: marked.revision,
          action: 'set_dependencies',
          blockedBy: children.map(TeamTaskId),
        })
      } catch (error) {
        return {
          created: false,
          reason: `subtasks ${children.join(', ')} were created, but attaching them to the parent failed: ${messageOf(error)}`,
        }
      }
      return {
        created: true,
        reason: `parent ${args.task_id} now folds on ${children.length} subtask(s)`,
        parent: args.task_id,
        children,
        depth,
      }
    },
  }))

  // ---- Fold sweep (T4): complete marked parents once every subtask completed ----
  const sweeping = new Set<string>()

  const sweepFold = (root: Agent): void => {
    if (sweeping.has(root.id)) return
    sweeping.add(root.id)
    void Promise.resolve().then(async () => {
      try {
        const teams = ctx.get('agentTeams')
        if (teams === undefined) return
        for (let round = 0; round < FOLD_ROUNDS; round++) {
          const rows = teams.listTasks(root).map(task => ({
            id: task.id,
            revision: task.revision,
            subject: task.subject,
            description: task.description,
            status: task.status,
            blockedBy: [...task.blockedBy],
          }))
          const foldable = selectFoldableTasks(rows)
          if (foldable.length === 0) return
          for (const task of foldable) {
            try {
              await teams.updateTask(root, {
                taskId: TeamTaskId(task.id),
                expectedRevision: task.revision,
                action: 'complete',
              })
              ctx.logger.info(`aimo-pool: folded ${task.id} "${task.subject}" — all its subtasks completed`)
            } catch (error) {
              ctx.logger.warn(`aimo-pool: fold of ${task.id} failed: ${messageOf(error)}`)
              continue
            }
            // Leave an agent-visible audit note on the board explaining why this
            // parent completed without a submission of its own.
            try {
              const folded = teams.getTask(root, TeamTaskId(task.id))
              if (!folded.description.includes(FOLD_NOTE)) {
                await teams.updateTask(root, {
                  taskId: TeamTaskId(task.id),
                  expectedRevision: folded.revision,
                  action: 'edit',
                  description: `${folded.description}\n\n${FOLD_NOTE}`,
                })
              }
            } catch (error) {
              ctx.logger.warn(`aimo-pool: fold note for ${task.id} failed: ${messageOf(error)}`)
            }
          }
        }
      } finally {
        sweeping.delete(root.id)
      }
    })
  }

  const maybeSweep = (agent: Agent): void => {
    const teams = ctx.get('agentTeams')
    if (teams === undefined) return
    let membership
    try {
      membership = teams.tryMembership(agent)
    } catch {
      return
    }
    if (membership === undefined || membership.role !== 'lead') return
    sweepFold(membership.root)
  }

  ctx.on('session/event', (session, event) => {
    if ((event as { type?: unknown }).type !== 'team/task') return
    const agent = ctx.agents.get(session.id)
    if (agent === undefined) return
    maybeSweep(agent)
  })
  for (const agent of ctx.agents.list()) maybeSweep(agent)
}

export { planNextClaim, copyIndexOf } from './plan.ts'
export type { PoolConfig, PoolPlan, PoolTask } from './plan.ts'
export { FOLD_MARKER, FOLD_NOTE, foldDepth, foldMarker, isFoldParent, selectFoldableTasks } from './fold.ts'
export type { FoldTask } from './fold.ts'
