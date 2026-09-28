/**
 * Pure result-sharing rules (plan T5).
 *
 * A completed task's result is shared two ways, both derived from the board:
 * 1. a **board note** appended to the task description, so any member reading
 *    the board (e.g. the critic) can see the evidence without being a message
 *    recipient;
 * 2. a **targeted durable message** to the members who actually need it —
 *    the owners of tasks that depend on this subtask (parents / consumers) and
 *    the owners of its sibling subtasks (co-blockers under the same dependent).
 *
 * The submitter, the losing copies of the same subtask, and the Team Lead (who
 * receives the result through the submission path already) are excluded.
 * @module @deepseek-ai/dsh-aimo-verifier/share
 */

import { siblingGroupKey } from './siblings.ts'

/** One task row the sharing rules need. */
export interface ShareTask {
  readonly id: string
  readonly subject: string
  readonly status: string
  readonly ownerName?: string
  readonly blockedBy: readonly string[]
}

/** Maximum characters a single board result note may add to a description. */
export const RESULT_NOTE_LIMIT = 2000

/** The board note a completed task receives, truncated to {@link RESULT_NOTE_LIMIT}. */
export function resultNote(summary: string, data: string): string {
  const text = `[result] ${summary.trim()}\n${data.trim()}`
  return text.length <= RESULT_NOTE_LIMIT ? text : `${text.slice(0, RESULT_NOTE_LIMIT)}…`
}

/**
 * Select the members who should receive a completed subtask's result.
 * @param tasks - current task board rows.
 * @param completedSubject - subject of the task that just completed.
 * @param submitterName - Team name of the submitting member (never a recipient).
 * @returns recipient names, de-duplicated and sorted.
 */
export function selectShareRecipients(
  tasks: readonly ShareTask[],
  completedSubject: string,
  submitterName: string,
): string[] {
  const live = tasks.filter(task => task.status !== 'deleted')
  const group = siblingGroupKey(completedSubject)
  const groupIds = new Set(live.filter(task => siblingGroupKey(task.subject) === group).map(task => task.id))

  // Tasks that wait on this subtask: parents / consumers.
  const dependents = live.filter(task => task.blockedBy.some(id => groupIds.has(id)))

  const recipients = new Set<string>()
  const consider = (task: ShareTask | undefined): void => {
    const owner = task?.ownerName
    if (owner === undefined || owner === submitterName || owner === 'lead') return
    recipients.add(owner)
  }
  for (const dependent of dependents) {
    consider(dependent)
    // Sibling subtasks: co-blockers of the same dependent.
    for (const blockerId of dependent.blockedBy) {
      if (groupIds.has(blockerId)) continue
      consider(live.find(task => task.id === blockerId))
    }
  }
  return [...recipients].sort()
}
