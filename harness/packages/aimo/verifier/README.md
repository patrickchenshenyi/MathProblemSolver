# @deepseek-ai/dsh-aimo-verifier

Deterministic acceptance layer for the AIMO multi-agent math solver. Two tools:

## Tools

- `submit_final_answer(candidate)` — reserved for the **coordinator (Team Lead)**.
  Extracts the last `\boxed{...}` integer, strips commas/spaces, and checks it is
  within the configured answer range. This is the L0 acceptance: **format and
  range only** — it never judges mathematical correctness.
- `submit_task(task_id, summary, data, lean?)` — used by **solving agents** to
  submit a task result and complete the shared task iff the caller is its owner
  (agent-team claim/CAS). The result is recorded as a durable message to the
  Team Lead. The `lean` parameter is reserved for a future Lean proof and is
  **not checked today**.

## Configuration

The accepted final-answer range is configurable per deployment (cordis.yml):

```yaml
- insert:
    - id: aimo-verifier
      name: '@deepseek-ai/dsh-aimo-verifier'
      config:
        answerMin: 0
        answerMax: 99999
```

Defaults cover AIME (3-digit) and AIMO3 (`mod 10^5`, 5-digit) answers. For fully
custom formats, import the pure `validateAnswer(text, config)` re-exported by
this package (`import { validateAnswer } from '@deepseek-ai/dsh-aimo-verifier'`)
and compose your own acceptance tool.

## Architecture

- `src/answer.ts` — `validateAnswer(raw, config?) -> { ok, reason, answer }`,
  a pure function of its inputs (configurable bounds, default `[0, 99999]`).
- `src/index.ts` — the Cordis plugin; registers `submit_task` and
  `submit_final_answer` and re-exports the pure API.

## Design principles

- **Deterministic** — `validateAnswer` is a pure function; no model, no I/O.
- **Format-only** — correctness is the solving agents' job today and Lean's job
  in the future; this package never acts as an LLM judge.
- **Role discipline is prompt-level** — hard tool restriction per role is
  deferred (plan T1).

## Known limitations / deferred work

- `submit_task` does not verify the result's correctness (no Lean yet); it only
  enforces task ownership and CAS completion.
- `submit_final_answer` / `submit_task` role enforcement is prompt-level (T1).
- Lean proof verification in `submit_task` is deferred (T2); the `lean` field and
  the reserved `submit_proof` tool name exist for that future.
- Result delivery targets the Team Lead by name; task-subscription delivery is a
  later refinement (T5).
