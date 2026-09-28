You are the coordinator of a small math-solving team. Verify the Phase-1 role tool scoping using the shared task board and two teammates. Report a full log of every step and every outcome you actually observe; do not fabricate results.

STEP 1 — create the task:
Call team_task_create with subject="role-check", description="role scoping check: critic and lead must be denied submission, solver must be allowed".

STEP 2 — spawn the critic:
Call spawn_teammate with name="critic", description="reviews only, cannot submit", context="fresh", and prompt set to the following text (verbatim, replacing <TASK_ID> with the task id from STEP 1):

---critic prompt---
You are the critic. You are supposed to have NO submission rights. Do exactly this, in order, and report the exact outcome of each call:
(1) Call team_task_update with task_id="<TASK_ID>", expected_revision=1, action="complete" (no claim first). Report the exact rejection message (expected: a guard denies non-solver completion).
(2) Call submit_task with task_id="<TASK_ID>", summary="critic tries submit", data="42". Report the exact outcome (expected: tool unavailable to you or call rejected).
(3) Call submit_final_answer with candidate="\boxed{42}". Report the exact outcome (expected: tool unavailable to you or call rejected).
Then end with a 3-line summary of what was denied and why.
---end critic prompt---

STEP 3 — wait for the critic to finish (call wait_agent, then list_agents until the critic is no longer running), then call team_task_get on the task and report its status and revision.

STEP 4 — try the lead's own restriction:
Call submit_task with task_id="<TASK_ID>", summary="lead tries submit", data="42". Report the exact outcome (expected: tool unavailable to the lead or call rejected).

STEP 5 — spawn the solver:
Call spawn_teammate with name="solver", description="computes the answer and submits it", context="fresh", and prompt set to the following text (verbatim, replacing <TASK_ID> with the task id, and <REV> with the task revision you observed in STEP 3):

---solver prompt---
You are the solver. You should be able to claim and submit, but NOT call the final-answer acceptance tool. Do exactly this, in order, and report the exact outcome of each call:
(1) Call team_task_update with task_id="<TASK_ID>", expected_revision=<REV>, action="claim". Report the outcome (expected: accepted, task becomes in_progress owned by you).
(2) Call submit_task with task_id="<TASK_ID>", summary="role-check result", data="final answer 42". Report the outcome (expected: accepted, task completed).
(3) Call submit_final_answer with candidate="\boxed{42}". Report the exact outcome (expected: tool unavailable to you or call rejected).
Then end with a 3-line summary of what succeeded and what was denied.
---end solver prompt---

STEP 6 — wait for the solver to finish (wait_agent / list_agents), then call team_task_get on the task and report its final status and revision.

STEP 7 — summarize in this exact order:
1. critic: which of its three calls were denied, with the denial reasons.
2. lead: whether submit_task was denied for you.
3. solver: claim, submit_task, and submit_final_answer outcomes.
4. final task status (expected: completed by the solver).
