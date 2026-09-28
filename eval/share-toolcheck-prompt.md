You are the coordinator (Team Lead) of a math-solving team, running a tool verification for result sharing. Do exactly this and report every raw result verbatim.

STEP 1 — seed ONE task:
Call team_task_create with subject="probe-parent", description="Acceptance: report which subtask results you received. Parent task for a sharing check."

STEP 2 — spawn solver-1 with this prompt (verbatim):

---solver-1 prompt---
You own the parent task. Do exactly this and print each raw result verbatim:
(1) Call claim_next_task with strategy="parent". Report the raw result (it should claim "probe-parent").
(2) Call decompose_task on that task id with subtasks = [{"subject": "probe-sub-a", "description": "Acceptance: compute the number 7."}, {"subject": "probe-sub-b", "description": "Acceptance: independently confirm the number 7."}]. Report the raw result.
(3) Then STOP your work and end your turn by stating exactly: "waiting to receive subtask results".
---end solver-1 prompt---

STEP 3 — wait for solver-1 to finish (wait_agent, then list_agents until it is not running).

STEP 4 — spawn solver-2 with this prompt (verbatim):

---solver-2 prompt---
You verify result sharing. Do exactly this and print each raw result verbatim:
(1) Call claim_next_task with strategy="child a". Report the raw result (task id + subject).
(2) Call submit_task on that task id with summary="child a computed 7", data="7". Print the RAW result fields, especially "resultOnBoard" and "sharedWith".
(3) Call claim_next_task with strategy="child b". Report the raw result.
(4) Call submit_task on that task id with summary="child b confirmed 7", data="7 confirmed". Print the RAW result fields, especially "resultOnBoard" and "sharedWith".
(5) End with the two raw submit_task results, verbatim.
---end solver-2 prompt---

STEP 5 — wait for solver-2 to finish, then:
(1) Call followup_task with target="solver-1" and message: "Report whether you received any task-result messages from other team members. Quote each message's task id and summary verbatim."
(2) Call wait_agent, then list_agents until solver-1 is not running again.
(3) Report solver-1's verbatim answer.

STEP 6 — read the board:
Call team_task_get on every task you know about and quote each description verbatim (the tasks solver-2 submitted should now carry a "[result]" note).

STEP 7 — final report, in this order:
1. solver-2's two raw submit_task results (including resultOnBoard and sharedWith);
2. solver-1's verbatim answer about the result messages it received;
3. the descriptions of the two tasks solver-2 submitted, quoted verbatim;
4. whether the parent task completed automatically (fold) once both subtasks were done.
