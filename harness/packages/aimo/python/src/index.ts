/**
 * Minimal model-facing `run_python` tool. Temporary: M1.5 replaces it with a
 * container-isolated code-runtime provider. Runs `python3 -c <code>` through the
 * subprocess seam and returns collected stdout/stderr and the exit code.
 * @module @deepseek-ai/dsh-aimo-python
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
// Type-only: resolves ctx.subprocess for the spawn call below.
import type {} from '@deepseek-ai/dsh-subprocess'

export const name = 'aimo-python'
export const inject = ['tools', 'subprocess']

/** Default wall-clock timeout, in seconds. */
const DEFAULT_TIMEOUT_SECONDS = 30
/** Collected-stream in-memory byte cap (the tail is kept on overflow). */
const MAX_OUTPUT_BYTES = 1_000_000
/** SIGTERM→SIGKILL escalation grace for the subprocess tree. */
const GRACE_MS = 1_000

export function apply(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'run_python',
    description: 'Run a short Python 3 snippet and return its stdout, stderr, and exit code.',
    parameters: {
      code: { type: 'string', required: true, description: 'Python 3 source to execute.' },
      timeout_seconds: { type: 'number', description: `Wall-clock timeout in seconds (default ${DEFAULT_TIMEOUT_SECONDS}).` },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          stdout: { type: 'string', required: true },
          stderr: { type: 'string', required: true },
          exitCode: { type: 'integer', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `exit code ${value.exitCode}\nstdout:\n${value.stdout}\nstderr:\n${value.stderr}`,
      }],
    },
    async execute(args, exec) {
      const timeoutMs = (args.timeout_seconds ?? DEFAULT_TIMEOUT_SECONDS) * 1000
      // One deadline combines the caller's cancellation with the wall-clock cap.
      const controller = new AbortController()
      const onAbort = (): void => controller.abort()
      exec.signal.addEventListener('abort', onAbort, { once: true })
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      try {
        const handle = ctx.subprocess.spawn({
          argv: ['python3', '-c', args.code],
          cwd: process.cwd(),
          stdio: {
            stdin: 'ignore',
            stdout: { maxBytes: MAX_OUTPUT_BYTES },
            stderr: { maxBytes: MAX_OUTPUT_BYTES },
          },
          graceMs: GRACE_MS,
          signal: controller.signal,
        })
        const outcome = await handle.done
        const stdout = handle.collected.stdout?.readFrom(0).text ?? ''
        const stderr = handle.collected.stderr?.readFrom(0).text ?? ''
        // A null exit code means the tree died from a signal (timeout) — map to -1.
        return { stdout, stderr, exitCode: outcome.exitCode ?? -1 }
      } finally {
        clearTimeout(timer)
        exec.signal.removeEventListener('abort', onAbort)
      }
    },
  }))
}
