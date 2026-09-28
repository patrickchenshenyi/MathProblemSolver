# @deepseek-ai/dsh-aimo-team-roles

Hard per-role tool scoping for AIMO Team members (plan Phase 1 / T1). Load it
after `@deepseek-ai/dsh-aimo-verifier` and `@deepseek-ai/dsh-experimental-tool-agent-team`.

## What it enforces

Role is classified from the teammate's durable name prefix (`solver-*` /
`critic-*`; bare `solver` / `critic` also match). Unknown names fail closed.

| role | `submit_task` | `submit_final_answer` | `team_task_update action=complete` |
|---|---|---|---|
| lead (coordinator) | ❌ denied | ✅ allowed | ❌ guarded |
| solver | ✅ allowed | ❌ denied | ✅ allowed (owner) |
| critic | ❌ denied | ❌ denied | ❌ guarded |
| unknown | ❌ denied | ❌ denied | ❌ guarded |

- Denials via `tools.restrict({ deny })` hide the tools from the role's scope
  entirely (the model never sees them).
- The complete guard rejects raw `team_task_update` completions from non-solver
  roles with an actionable reason; agent-team's own owner/CAS rules still apply
  to solvers.
- Non-Team agents are untouched. Missing agent-team / verifier mounts degrade
  to a warning, not a startup failure.

## Self-test

```sh
pnpm exec tsx packages/aimo/team-roles/tests/team-roles.test.ts
```
