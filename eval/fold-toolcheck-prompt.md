You are the coordinator (Team Lead) of a math-solving team, running a tool verification for task decomposition. Do exactly this and report every raw result verbatim.

STEP 1 — seed one task:
Call team_task_create with subject="probe-parent", description="Acceptance: report the number 7. This task is a parent that may be split into subtasks."

STEP 2 — spawn exactly one solver:
Call spawn_teammate with name="solver", description="decomposition check", context="fresh", and this prompt (verbatim):

---solver prompt---
You are verifying decomposition and automatic fold. Do exactly this, in order, and print each tool's raw result verbatim:
(1) Call claim_next_task with strategy="main". Report the raw result.
(2) Call decompose_task with task_id = the task id you just claimed, and subtasks = two entries:
    {"subject": "probe-child-a", "description": "Acceptance: compute and report the number 7."}
    {"subject": "probe-child-b", "description": "Acceptance: independently confirm the number 7."}
    Report the raw result.
(3) Call team_task_list and report every task's id, subject, status and blockedBy.
(4) Call claim_next_task with strategy="child a". Then submit_task on the task it returned with summary="child a result", data="7". Report both raw results.
(5) Call claim_next_task with strategy="child b". Then submit_task on the task it returned with summary="child b result", data="7 confirmed". Report both raw results.
(6) Call team_task_list again and report every task's id, subject, status and ownerName. In particular, state whether the parent task ("probe-parent") is now completed, and whether YOU ever completed it yourself.
---end solver prompt---

STEP 3 — wait for the solver to finish (wait_agent, then list_agents until it is not running), then call team_task_list and report every task's id, subject, status and ownerName.

STEP 4 — report:
1. the raw decompose_task result (parent id, children ids, depth);
2. the board after step (3) and the board after step (6);
3. whether the parent folded to completed automatically, and who completed it;
4. whether any completion happened that you did not request.
