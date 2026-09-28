/**
 * Cordis plugin: the two acceptance tools of the multi-agent pipeline.
 *
 * - `submit_task` — every solving agent submits its task result (summary + data,
 *   with a reserved `lean` slot) and completes the shared task iff the caller is
 *   its owner (owner/CAS enforced by the agent-team task board). The result is
 *   recorded as a durable message to the Team Lead. On success the plugin also
 *   terminates the remaining open copies of the same logical subtask (subjects
 *   sharing the `<logical-name> #<k>` group, see `siblings.ts`): it interrupts
 *   each copy's owner and deletes the copy task, acting through the agent-team
 *   service with the Team Lead's authority — the runtime's `interrupt` is
 *   Lead-only, so the submitting owner cannot do this via the model tools.
 * - `submit_final_answer` — reserved for the coordinator (Team Lead): the L0
 *   acceptance of the final answer (boxed integer in the configured range).
 *
 * Role discipline (who may call what) is enforced by `aimo-team-roles`. Lean
 * proof verification inside `submit_task` is deferred (plan T2): the `lean`
 * field is accepted but not checked today.
 * @module @deepseek-ai/dsh-aimo-verifier
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { TeamTaskId } from '@deepseek-ai/dsh-experimental-agent-team'
import type { TeamTaskView } from '@deepseek-ai/dsh-experimental-agent-team'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { validateAnswer, DEFAULT_ANSWER_CONFIG } from './answer.ts'
import type { AnswerConfig } from './answer.ts'
import { selectSiblingCopies } from './siblings.ts'
import { resultNote, selectShareRecipients } from './share.ts'

export const name = 'aimo-verifier'
export const inject = ['tools']

/** Plugin configuration: the accepted final-answer range (cordis.yml). */
export interface Config extends AnswerConfig {}

export const Config: z<Config> = z.object({
  answerMin: z.number().default(DEFAULT_ANSWER_CONFIG.answerMin),
  answerMax: z.number().default(DEFAULT_ANSWER_CONFIG.answerMax),
})

/** Error text of one caught failure. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function apply(ctx: Context, config: Config): void {
  const { answerMin, answerMax } = config
  if (
    !Number.isSafeInteger(answerMin)
    || !Number.isSafeInteger(answerMax)
    || answerMin < 0
    || answerMin > answerMax
  ) {
    throw new Error(`aimo-verifier: config requires safe integers 0 <= answerMin <= answerMax (got ${answerMin}, ${answerMax})`)
  }

  ctx.tools.register(defineTool({
    name: 'submit_final_answer',
    description:
      'Final answer acceptance, reserved for the coordinator (Team Lead). Extracts the last \\boxed{...} '
      + 'integer, strips commas/spaces, and checks it is within the configured answer range. This validates '
      + 'format and range only — mathematical correctness comes from the solving agents and, in the future, '
      + 'Lean proofs. Role enforcement is prompt-level for now.',
    parameters: {
      candidate: { type: 'string', required: true, description: 'Final answer text (may contain \\boxed{...}).' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          accepted: { type: 'boolean', required: true },
          reason: { type: 'string', required: true },
          answer: { type: 'integer' },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.accepted ? `accepted: ${value.answer}` : `rejected: ${value.reason}`,
      }],
    },
    execute(args) {
      const verdict = validateAnswer(args.candidate, { answerMin, answerMax })
      return Promise.resolve({
        accepted: verdict.ok,
        reason: verdict.reason,
        ...(verdict.answer !== null ? { answer: verdict.answer } : {}),
      })
    },
  }))

  ctx.tools.register(defineTool({
    name: 'submit_task',
    description:
      'Submit a completed task\'s result and complete the shared task iff the caller is its owner. '
      + 'Pass the result as summary (what was found or proved) and data (formulas, data, or propositions). '
      + 'The optional lean field is reserved for a future Lean proof and is not checked today. '
      + 'The result is recorded as a durable message to the Team Lead. On success, remaining open copies '
      + 'of the same logical subtask (same subject group "<name> #<k>") are terminated automatically.',
    parameters: {
      task_id: { type: 'string', required: true, description: 'Shared task id the caller owns and has finished.' },
      summary: { type: 'string', required: true, description: 'Result summary: what was found or proved.' },
      data: { type: 'string', required: true, description: 'Result details: formulas, data, or propositions.' },
      lean: { type: 'string', description: 'Reserved for a future Lean proof; leave empty.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          completed: { type: 'boolean', required: true },
          reason: { type: 'string', required: true },
          task: { type: 'string' },
          resultRecorded: { type: 'string' },
          resultOnBoard: { type: 'boolean', required: true },
          sharedWith: { type: 'array', required: true, items: { type: 'string' } },
          siblingsTerminated: { type: 'array', required: true, items: { type: 'string' } },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.completed
          ? `${value.task ?? 'completed'} (result: ${value.resultRecorded ?? 'not recorded'}; on board: ${String(value.resultOnBoard)}; shared with: ${value.sharedWith.join(', ') || 'none'}; siblings terminated: ${value.siblingsTerminated.join(', ') || 'none'})`
          : `rejected: ${value.reason}`,
      }],
    },
    async execute(args, exec) {
      const rejected = (reason: string) => ({
        completed: false,
        reason,
        resultOnBoard: false,
        sharedWith: [] as string[],
        siblingsTerminated: [] as string[],
      })
      const agent = exec.agent
      if (agent === undefined) return rejected('submit_task requires an agent context (a Team member)')
      if (args.summary.trim().length === 0 || args.data.trim().length === 0) {
        return rejected('summary and data must be non-empty')
      }
      const teams = ctx.get('agentTeams')
      if (teams === undefined) return rejected('agent-team service is not mounted')
      const taskId = TeamTaskId(args.task_id)
      let current: TeamTaskView
      try {
        current = teams.getTask(agent, taskId)
      } catch (error) {
        return rejected(messageOf(error))
      }
      // Owner/CAS completion: agent-team rejects non-owners, stale revisions,
      // and non-in-progress tasks; a rejected call never changes task state.
      try {
        await teams.updateTask(agent, { taskId, expectedRevision: current.revision, action: 'complete' })
      } catch (error) {
        return rejected(messageOf(error))
      }
      const record = {
        type: 'task-result',
        task_id: args.task_id,
        summary: args.summary.trim(),
        data: args.data.trim(),
        lean: args.lean?.trim() || null,
      }
      let resultRecorded = 'not recorded'
      try {
        const sent = await teams.sendMessage(agent, {
          target: 'lead',
          content: [{ type: 'text', text: JSON.stringify(record) }],
          delivery: 'quiet',
          signal: exec.signal,
        })
        resultRecorded = `sent to lead (${sent.status})`
      } catch (error) {
        resultRecorded = `send failed: ${messageOf(error)}`
      }
      // Board-visible result note (plan T5): any member reading the board — the
      // critic in particular — can see the evidence without being a recipient.
      let resultOnBoard = false
      try {
        const fresh = teams.getTask(agent, taskId)
        if (!fresh.description.includes('[result]')) {
          await teams.updateTask(agent, {
            taskId,
            expectedRevision: fresh.revision,
            action: 'edit',
            description: `${fresh.description}\n\n${resultNote(record.summary, record.data)}`,
          })
          resultOnBoard = true
        }
      } catch (error) {
        ctx.logger.warn(`aimo-verifier: result note for "${args.task_id}" failed: ${messageOf(error)}`)
      }

      // Targeted share (plan T5) + first-completed-wins cleanup (plan T3) share
      // one board read. `interrupt` is Lead-only in the runtime, so the cleanup
      // acts with the Team Lead's authority on behalf of the submitting owner.
      // Neither step can fail the submission itself.
      const sharedWith: string[] = []
      const siblingsTerminated: string[] = []
      try {
        const membership = teams.membership(agent)
        const root = membership.root
        const completed = teams.getTask(root, taskId)
        try {
          const rows = teams.listTasks(root).map(task => ({
            id: String(task.id),
            subject: task.subject,
            status: task.status,
            ...(task.ownerName === undefined ? {} : { ownerName: task.ownerName }),
            blockedBy: task.blockedBy.map(String),
          }))
          for (const name of selectShareRecipients(rows, completed.subject, membership.name)) {
            try {
              await teams.sendMessage(agent, {
                target: name,
                content: [{
                  type: 'text',
                  text: JSON.stringify({ ...record, subject: completed.subject }),
                }],
                delivery: 'quiet',
                signal: exec.signal,
              })
              sharedWith.push(name)
            } catch (error) {
              ctx.logger.warn(`aimo-verifier: share with "${name}" failed: ${messageOf(error)}`)
            }
          }
        } catch (error) {
          ctx.logger.warn(`aimo-verifier: share computation failed: ${messageOf(error)}`)
        }
        for (const copy of selectSiblingCopies(teams.listTasks(root), taskId, completed.subject)) {
          if (copy.ownerName !== undefined && copy.ownerName !== membership.name) {
            try {
              teams.interrupt(root, copy.ownerName)
            } catch (error) {
              ctx.logger.warn(`aimo-verifier: interrupt of "${copy.ownerName}" for sibling ${copy.id} failed: ${messageOf(error)}`)
            }
          }
          try {
            await teams.updateTask(root, {
              taskId: TeamTaskId(copy.id),
              expectedRevision: copy.revision,
              action: 'delete',
            })
            siblingsTerminated.push(copy.id)
          } catch (error) {
            ctx.logger.warn(`aimo-verifier: delete of sibling ${copy.id} failed: ${messageOf(error)}`)
          }
        }
      } catch (error) {
        ctx.logger.warn(`aimo-verifier: share/cleanup skipped: ${messageOf(error)}`)
      }
      return {
        completed: true,
        reason: 'accepted',
        task: `task ${args.task_id} completed`,
        resultRecorded,
        resultOnBoard,
        sharedWith,
        siblingsTerminated,
      }
    },
  }))
}

export { validateAnswer, DEFAULT_ANSWER_CONFIG } from './answer.ts'
export type { AnswerConfig, AnswerVerdict } from './answer.ts'
export { siblingGroupKey, selectSiblingCopies } from './siblings.ts'
export type { SiblingTaskCandidate } from './siblings.ts'
export { resultNote, selectShareRecipients, RESULT_NOTE_LIMIT } from './share.ts'
export type { ShareTask } from './share.ts'
