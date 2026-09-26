/**
 * Direct smoke test for the docker code runtime. Boots the provider in a bare
 * cordis context and runs five programs: a normal sympy computation, a
 * print+return, an infinite loop, a network attempt, and a big allocation.
 * Run with: pnpm exec tsx packages/aimo/code-runtime-docker/tests/smoke.ts
 */

import { Context } from '@deepseek-ai/cordis'
import DockerCodeRuntime from '../src/index.ts'

const ctx = new Context()

async function run(label: string, program: string): Promise<void> {
  const started = Date.now()
  const result = await ctx.codeRuntime.run({ program, bindings: [] })
  const elapsed = ((Date.now() - started) / 1000).toFixed(1)
  console.log(`\n=== ${label} (${elapsed}s) ===`)
  console.log(JSON.stringify(result))
}

async function main(): Promise<void> {
  // Register the runtime service BEFORE the first run: ctx.plugin() is async,
  // and ctx.codeRuntime is only available once the plugin fiber has resolved.
  const fiber = await ctx.plugin(DockerCodeRuntime, { computeMs: 3_000, maxWallMs: 15_000 })
  await run('sympy', `from sympy import symbols, diff\nx = symbols('x')\nreturn int(diff(x**2, x).subs(x, 3))`)
  await run('print+return', `print('hello', 1 + 1)\nreturn 42`)
  await run('infinite-loop', `while True:\n    pass`)
  await run('network', `import socket\ns = socket.create_connection(('1.1.1.1', 80), timeout=5)\nreturn 'connected'`)
  await run('big-alloc', `x = bytearray(2 * 10**9)\nreturn len(x)`)
  await fiber.dispose()
}

void main()
