/**
 * Pure DAG fold rules (plan T4).
 *
 * A decomposer marks the task it split into subtasks with {@link FOLD_MARKER}
 * (written by the `decompose_task` tool) and records those subtasks as that
 * task's `blockedBy`. The runtime then completes the parent automatically once
 * every subtask is completed — the parent's own "work" is assembling results
 * that its subtasks already produced.
 *
 * The marker is what distinguishes a fold parent from an ordinary task that
 * merely happens to have satisfied dependencies: a task can only be claimed when
 * its blockers are already completed, so "in_progress + blockers" alone is not
 * enough evidence that the task was decomposed.
 * @module @deepseek-ai/dsh-aimo-pool/fold
 */

/** Marker prefix written into a fold parent's description. */
export const FOLD_MARKER = '[fold-parent'

/**
 * Audit note appended when the runtime folds a parent, so the board itself
 * records why the task completed (agent-visible evidence).
 */
export const FOLD_NOTE = '[folded: all subtasks completed]'

const MARKER_PATTERN = /\[fold-parent(?:\s+depth=(\d+))?\]/

/** One task row the fold rules need. */
export interface FoldTask {
  readonly id: string
  readonly revision: number
  readonly subject: string
  readonly description: string
  readonly status: string
  readonly blockedBy: readonly string[]
}

/** Whether a description declares its task as a fold parent. */
export function isFoldParent(description: string): boolean {
  return MARKER_PATTERN.test(description)
}

/** Declared decomposition depth of a fold parent (`0` when unmarked or unequipped). */
export function foldDepth(description: string): number {
  const match = MARKER_PATTERN.exec(description)
  const raw = match?.[1]
  return raw === undefined ? 0 : Number(raw)
}

/** The marker text that declares a fold parent at `depth`. */
export function foldMarker(depth: number): string {
  return `${FOLD_MARKER} depth=${depth}]`
}

/**
 * Select tasks that must complete automatically: marked fold parents that are
 * in progress and whose every subtask has completed.
 * @param tasks - current task board rows.
 * @returns the parents to fold, in board order.
 */
export function selectFoldableTasks(tasks: readonly FoldTask[]): FoldTask[] {
  const completed = new Set(tasks.filter(task => task.status === 'completed').map(task => task.id))
  return tasks.filter(task =>
    task.status === 'in_progress'
    && task.blockedBy.length > 0
    && isFoldParent(task.description)
    && task.blockedBy.every(id => completed.has(id)))
}
