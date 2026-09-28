# @deepseek-ai/dsh-aimo-pool

Pool dispatch and DAG housekeeping for the AIMO team (plans T9 + T4).

## `claim_next_task(strategy?)` (T9)

Lets any idle Team member pull the next piece of work in **one deterministic
call**:

1. claim an existing **ready, unowned** task (lowest copy index first); else
2. create a fresh **copy** of an active logical subtask — keeping at most
   `maxCopiesPerGroup` open copies — and claim it; else
3. return `kind="none"` (stay idle).

Grouping reuses the verifier's copy-subject contract (`<logical-name> #<k>`), so
scheduling and the automatic sibling termination of `submit_task` can never
disagree about which tasks are copies of one subtask. A subtask that already has
a completed copy is closed and never extended.

## `decompose_task(task_id, subtasks)` (T4)

Splits a task you own into subtasks: creates one board task per subtask (the pool
can pick them up immediately), marks the parent as a **fold parent** in its
description (`[fold-parent depth=<n>]`), and sets the parent's `blockedBy` to the
children. Limits: `maxChildren` per call, `maxDepth` nesting levels.

## Fold sweep (T4)

On every committed `team/task` event the plugin completes any **in-progress fold
parent whose subtasks all completed**, acting with the Team Lead's authority and
CAS-safe (stale revisions are skipped). Cascades through nested parents (up to
5 rounds per sweep) without starting any agent.

The marker is what distinguishes a fold parent from an ordinary task that merely
has satisfied dependencies: a task can only be claimed once its blockers are
complete, so "in_progress + blockers" alone is not evidence of decomposition.

## Configuration

```yaml
- insert:
    - id: aimo-pool
      name: '@deepseek-ai/dsh-aimo-pool'
      config:
        maxCopiesPerGroup: 3
        maxChildren: 5
        maxDepth: 3
```

## Why it exists

Task readiness never starts an owner, and `wait_agent` never wakes a member, so
an idle teammate otherwise has no reliable way to find work. This package makes
the mechanical steps atomic and correct; *when* to wake a member and *whether* to
decompose further stay orchestration decisions in the coordinator prompt
(`followup_task`, `decompose_task`).

## Self-test

```sh
pnpm exec tsx packages/aimo/pool/tests/pool.test.ts
```
