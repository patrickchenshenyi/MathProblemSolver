# @deepseek-ai/dsh-aimo-python

English | [中文](README.zh.md)

Temporary model-facing `run_python` tool for the AIMO math-solver workshop. It runs a
short Python 3 snippet through the [`@deepseek-ai/dsh-subprocess`](../subprocess/subprocess/README.md)
seam (`python3 -c <code>`) and returns collected stdout/stderr plus the exit code.

> **Temporary by design.** This is the M0 unlock ("let the model run Python").
> M1.5 replaces it with a container-isolated `code-runtime-docker` provider; once
> that lands, `run_code` and the Python SDK are generated for free and this tool is retired.

## Service API

The package is a Cordis plugin (`name: 'aimo-python'`, `inject: ['tools', 'subprocess']`).

### Tool: `run_python`

- `code: string` (required) — Python 3 source to execute.
- `timeout_seconds: number` (optional, default 30) — wall-clock cap.

Returns `{ stdout: string, stderr: string, exitCode: number }`. `exitCode` is `-1`
when the tree died from a signal (timeout/cancellation). A spawn-level failure
(e.g. missing `python3`) surfaces as a tool error.

## Design notes

- **No shell interpretation.** The subprocess seam runs `argv` directly, so the
  snippet is never piped through a shell.
- **Tree-scoped termination.** The seam owns the process group and escalates
  SIGTERM → grace → SIGKILL, so an infinite loop cannot outlive the timeout.
- **Hostile-input posture.** `code` is treated as untrusted: bounded collected
  output, wall-clock deadline, and no ambient credential/`DSH_*` environment leak.

## Model Experience

### `run_python` tool schema

#### What the model sees

The tool's name, description, and JSON schema (the `code` and `timeout_seconds`
parameters plus the `{ stdout, stderr, exitCode }` output). See the generated
[tool catalog](../../../docs/tool-catalog.md) for the exact schema once catalogued.

#### Token effect

Fixed per-request cost proportional to this one tool's schema.

#### KV Cache effect

Prefix-stable while this definition and its order are unchanged.

## Known Limitations and Deferred Work

- **No isolation** — the snippet runs as the host `python3` with the harness's
  working directory and resource limits are only bounded output plus a timeout;
  a container boundary arrives with `code-runtime-docker` (M1.5).
- **No persistence / REPL** — each call is a fresh process; no cross-call state.
