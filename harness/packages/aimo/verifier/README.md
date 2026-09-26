# @deepseek-ai/dsh-aimo-verifier

English | [中文](README.zh.md)

Deterministic answer verifier for the AIMO math-solver workshop. This package owns
the "strong verifier" — machine-judged, reproducible, model-independent — that the
project treats as its highest priority (see `MyProject/强验收器实现.md`).

> **Scope.** This release implements **L0** (answer-string validation) and reserves
> L1 (constraint satisfaction) and L2 (numeric/symbolic cross-validation) as no-op
> placeholders in the cascade. L3/L4 (proof checking / Lean) are out of scope.

## Architecture

The verifier is split so the plugin surface never changes when a level goes live:

- `src/levels/l0.ts` — L0: extract the last `\boxed{...}`, strip commas/spaces, require
  a non-negative integer in `[0, 99999]`.
- `src/levels/l1.ts` — L1 placeholder (Step 3: handwritten sympy constraint predicates).
- `src/levels/l2.ts` — L2 placeholder (Step 4: identity / high-precision / counterexample / reproof).
- `src/engine.ts` — `verify(problemId, candidate, levels?) -> Verdict`, a pure function
  that runs the level cascade and stops at the first failure.
- `src/index.ts` — the Cordis plugin; registers `verify_answer` and `submit_answer`.

Adding a level = implement `src/levels/<id>.ts` + list it in `DEFAULT_LEVELS`
(`engine.ts`); `index.ts` is unchanged.

## Tools

- `verify_answer(problem_id, candidate)` — returns `{ ok, level, reason, answer?, failures[] }`.
- `submit_answer(problem_id, candidate)` — the future submission gate; returns
  `{ accepted, reason, answer? }` and accepts only when the cascade passes.

## Design principles

- **Independent of the model.** L0–L2 are deterministic code, never LLM-as-judge.
- **Reproducible.** `verify` is a pure function of its inputs.
- **Anti-cheat (this release).** Rejects out-of-range, non-integer, and non-numeric
  `\boxed{}` submissions (the "answer is out of bounds / hard-coded" family).

## Model Experience

### `verify_answer` / `submit_answer` tool schemas

#### What the model sees

Each tool's name, description, and JSON schema (`problem_id` + `candidate` input;
the structured verdict output). See the generated
[tool catalog](../../../docs/tool-catalog.md) for the exact schemas once catalogued.

#### Token effect

Fixed per-request cost proportional to the two tool schemas.

#### KV Cache effect

Prefix-stable while these definitions and their order are unchanged.

## Known Limitations and Deferred Work

- **L0 verifies the answer, not the reasoning** — a correct integer with bogus
  justification passes; that is the L0–L2 range boundary by design.
- **L1/L2 are no-ops** — constraint and cross-validation checks land in Steps 3/4.
