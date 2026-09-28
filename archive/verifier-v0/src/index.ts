/**
 * Cordis plugin: registers `verify_answer` and `submit_answer`, both backed by
 * the pure {@link verify} engine. `submit_answer` is the future submission gate
 * (currently L0-only); it reports "accepted" only when the cascade passes.
 * @module @deepseek-ai/dsh-aimo-verifier
 */

import type { Context } from '@deepseek-ai/cordis'
import { TeamTaskId } from '@deepseek-ai/dsh-experimental-agent-team'
import type { TeamService } from '@deepseek-ai/dsh-experimental-agent-team'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { verify, type Verdict } from './engine.ts'

export const name = 'aimo-verifier'
export const inject = ['tools']

/** Project the verdict into the tool's canonical JSON value (null-safe). */
function verdictOutput(verdict: Verdict) {
  return {
    ok: verdict.ok,
    level: verdict.level ?? 'l0',
    reason: verdict.reason,
    failures: verdict.failures,
    ...(verdict.answer !== null ? { answer: verdict.answer } : {}),
  }
}

export function apply(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'verify_answer',
    description: 'Deterministically verify a candidate answer for a problem. Extracts the last \\boxed{...} integer and checks it is in [0, 99999] (L0).',
    parameters: {
      problem_id: { type: 'string', required: true, description: 'Problem identifier (e.g. aime-1983-01).' },
      candidate: { type: 'string', required: true, description: 'Candidate submission text (may contain \\boxed{...}).' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          level: { type: 'string', required: true },
          reason: { type: 'string', required: true },
          answer: { type: 'integer' },
          failures: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                level: { type: 'string', required: true },
                reason: { type: 'string', required: true },
              },
            },
          },
        },
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    execute(args) {
      return Promise.resolve(verdictOutput(verify(args.problem_id, args.candidate)))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'submit_answer',
    description: 'Submit a final answer for a problem and, when a task_id is given, complete that shared task iff the verifier accepts the answer. A rejected answer never changes task state.',
    parameters: {
      problem_id: { type: 'string', required: true, description: 'Problem identifier.' },
      candidate: { type: 'string', required: true, description: 'Final answer text (may contain \\boxed{...}).' },
      task_id: { type: 'string', description: 'Optional shared-task id to complete iff the answer verifies.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          accepted: { type: 'boolean', required: true },
          reason: { type: 'string', required: true },
          answer: { type: 'integer' },
          task: { type: 'string' },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.accepted
          ? `accepted: ${value.answer}${value.task === undefined ? '' : ` (${value.task})`}`
          : `rejected: ${value.reason}`,
      }],
    },
    async execute(args, exec) {
      const verdict = verify(args.problem_id, args.candidate)
      // Submission gate: only a fully-passing verdict may complete the task.
      let task: string | undefined
      if (verdict.ok && typeof args.task_id === 'string' && exec.agent !== undefined) {
        const teams = ctx.get('agentTeams') as TeamService | undefined
        if (teams !== undefined) {
          const taskId = TeamTaskId(args.task_id)
          try {
            const current = teams.getTask(exec.agent, taskId)
            await teams.updateTask(exec.agent, { taskId, expectedRevision: current.revision, action: 'complete' })
            task = `task ${args.task_id} completed`
          } catch (error) {
            task = `verification passed but task completion failed: ${error instanceof Error ? error.message : String(error)}`
          }
        }
      }
      return {
        accepted: verdict.ok,
        reason: verdict.reason,
        ...(verdict.answer !== null ? { answer: verdict.answer } : {}),
        ...(task !== undefined ? { task } : {}),
      }
    },
  }))
}

export { verify, DEFAULT_LEVELS } from './engine.ts'
export type { Level, LevelId, Verdict, VerifyContext, VerdictFailure } from './levels/types.ts'
