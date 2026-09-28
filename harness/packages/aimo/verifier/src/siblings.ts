/**
 * Pure sibling-copy grouping for parallel attempt tasks (plan E1 / Phase 3 T3).
 *
 * Coordinator convention: copies of one logical subtask are separate tasks
 * whose subjects share the form `<logical-name> #<k>` (k = 1..3). When the
 * first copy completes, the plugin terminates the remaining open copies of the
 * same group — the owner-side cleanup that keeps task submission decoupled
 * from the coordinator's acceptance loop.
 * @module @deepseek-ai/dsh-aimo-verifier/siblings
 */

/** Strip a trailing copy index (` #<n>`) from a task subject. */
export function siblingGroupKey(subject: string): string {
  const trimmed = subject.trim()
  const match = /^(.*?)\s+#\d+$/.exec(trimmed)
  return (match?.[1] ?? trimmed).trim()
}

/** Minimal task row needed for copy selection. */
export interface SiblingTaskCandidate {
  readonly id: string
  readonly revision: number
  readonly subject: string
  readonly status: string
  readonly ownerName?: string
}

/**
 * Select the still-open copies of the same logical subtask as `completed`.
 * @param tasks - current task board rows.
 * @param completedId - the task that just completed.
 * @param completedSubject - its subject.
 * @returns pending / in_progress tasks sharing the completed task's group key,
 *   excluding the completed task itself.
 */
export function selectSiblingCopies(
  tasks: readonly SiblingTaskCandidate[],
  completedId: string,
  completedSubject: string,
): SiblingTaskCandidate[] {
  const group = siblingGroupKey(completedSubject)
  return tasks.filter(task =>
    task.id !== completedId
    && (task.status === 'pending' || task.status === 'in_progress')
    && siblingGroupKey(task.subject) === group)
}
