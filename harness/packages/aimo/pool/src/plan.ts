/**
 * Pure pool-dispatch planning: what should one idle member take next (plan T9).
 *
 * Two ways to find work, in order:
 * 1. claim an existing ready, unowned task (cheapest);
 * 2. otherwise extend an active logical subtask with a fresh copy — but only
 *    while that group has fewer than `maxCopiesPerGroup` open copies, and only
 *    when its dependencies are already satisfied.
 *
 * Grouping uses the shared copy-subject contract (`<logical-name> #<k>`) owned
 * by the verifier package, so scheduling and termination can never disagree
 * about which tasks are copies of one subtask.
 * @module @deepseek-ai/dsh-aimo-pool/plan
 */

import { siblingGroupKey } from '@deepseek-ai/dsh-aimo-verifier'

/** One task row the planner needs. */
export interface PoolTask {
  readonly id: string
  readonly revision: number
  readonly subject: string
  readonly description: string
  readonly status: string
  readonly ownerName?: string
  readonly ready: boolean
  readonly blockedBy: readonly string[]
}

/** Pool limits. */
export interface PoolConfig {
  /** Maximum open (pending + in_progress) copies of one logical subtask. */
  readonly maxCopiesPerGroup: number
}

/** The next action for one idle member. */
export type PoolPlan =
  | { readonly kind: 'claim'; readonly taskId: string }
  | {
    readonly kind: 'create-copy'
    readonly group: string
    readonly index: number
    readonly description: string
    readonly blockedBy: readonly string[]
  }
  | { readonly kind: 'none'; readonly reason: string }

/** Copy index of a subject (`x #2` → 2); `0` when the subject carries none. */
export function copyIndexOf(subject: string): number {
  const match = /\s+#(\d+)$/.exec(subject.trim())
  return match === null ? 0 : Number(match[1])
}

/**
 * Plan the next unit of work for an idle member.
 * @param tasks - current task board rows.
 * @param config - pool limits.
 * @returns the plan; `none` when the caller should stay idle.
 */
export function planNextClaim(tasks: readonly PoolTask[], config: PoolConfig): PoolPlan {
  // 1) Cheapest work: an existing ready, unowned task (lowest copy index first).
  const claimable = tasks
    .filter(task => task.status === 'pending' && task.ownerName === undefined && task.ready)
    .sort((left, right) => copyIndexOf(left.subject) - copyIndexOf(right.subject) || left.id.localeCompare(right.id))
  const first = claimable[0]
  if (first !== undefined) return { kind: 'claim', taskId: first.id }

  // 2) Otherwise extend an active group below the copy cap.
  const completed = new Set(tasks.filter(task => task.status === 'completed').map(task => task.id))
  const groups = new Map<string, PoolTask[]>()
  for (const task of tasks) {
    if (task.status === 'deleted') continue
    const key = siblingGroupKey(task.subject)
    const list = groups.get(key)
    if (list === undefined) groups.set(key, [task])
    else list.push(task)
  }

  const candidates: Array<{ group: string; index: number; description: string; blockedBy: readonly string[] }> = []
  for (const [group, list] of groups) {
    // The group already produced an accepted result — no further copies.
    if (list.some(task => task.status === 'completed')) continue
    const open = list.filter(task => task.status === 'pending' || task.status === 'in_progress')
    if (open.length === 0) continue
    if (open.length >= config.maxCopiesPerGroup) continue
    // The new copy must be claimable immediately: reuse a workable copy's
    // dependencies (all blockers completed) and its description.
    const workable = open.find(task => task.blockedBy.every(id => completed.has(id)))
    if (workable === undefined) continue
    const maxIndex = list.reduce((max, task) => Math.max(max, copyIndexOf(task.subject)), 0)
    candidates.push({
      group,
      index: maxIndex + 1,
      description: workable.description,
      blockedBy: [...workable.blockedBy],
    })
  }
  const candidate = candidates.sort((left, right) => left.group.localeCompare(right.group))[0]
  if (candidate === undefined) {
    return { kind: 'none', reason: 'no ready unowned task, and no active subtask below the copy cap' }
  }
  return { kind: 'create-copy', ...candidate }
}
