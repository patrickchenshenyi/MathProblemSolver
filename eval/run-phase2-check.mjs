/**
 * Phase 2 live check: run the full-team coordinator on 3 problems (easy /
 * medium / hard), one headless run each, saving the run log per problem.
 *
 * Usage: node run-phase2-check.mjs [tag]
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
// 自包含默认值：harness/ 与 eval/ 在仓库内同级；用环境变量可指向工坊实例。
const CLONE_ROOT = process.env.AIMO_HARNESS ?? resolve(__dirname, '..', 'harness')
const DSH_HOME = process.env.DSH_HOME ?? join(homedir(), '.dsh')
const PER_RUN_TIMEOUT_MS = 30 * 60_000 // 30 min per problem run

const runTag = process.argv[2] ?? new Date().toISOString().replace(/[:.]/g, '-')

const coordinator = readFileSync(resolve(__dirname, 'coordinator-prompt.md'), 'utf8')
const dataset = JSON.parse(readFileSync(resolve(__dirname, 'aime-baseline.json'), 'utf8'))

const problems = [
  { id: 'easy-aime-1983-01', answer: 60, statement: dataset.problems.find(p => p.id === 'aime-1983-01').statement },
  { id: 'medium-aime-1991-01', answer: 146, statement: dataset.problems.find(p => p.id === 'aime-1991-01').statement },
  {
    id: 'hard-aimo3-p1-sweets',
    answer: 50,
    statement: 'Alice and Bob are each holding some integer number of sweets. Alice says to Bob: "If we each added the number of sweets we\'re holding to our (positive integer) age, my answer would be double yours. If we took the product, then my answer would be four times yours." Bob replies: "Why don\'t you give me five of your sweets because then both our sum and product would be equal." What is the product of Alice and Bob\'s ages?',
  },
]

const results = []
for (const p of problems) {
  const prompt = `${coordinator}\n\nProblem: ${p.statement}`
  console.log(`\n===== [${p.id}] running (answer ${p.answer}) =====`)
  let out
  try {
    out = execFileSync('pnpm', ['dsh', '--profile', 'headless', prompt], {
      cwd: CLONE_ROOT,
      env: { ...process.env, DSH_HOME },
      timeout: PER_RUN_TIMEOUT_MS,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (error) {
    out = `__ERROR__ ${error.message ?? error}`
  }
  const logPath = resolve(__dirname, `phase2-livecheck-${p.id}-${runTag}.log`)
  writeFileSync(logPath, out)
  const boxed = [...String(out).matchAll(/\\boxed\s*\{\s*([^}]*)\s*\}/g)].map(m => m[1].trim())
  const finalBoxed = boxed[boxed.length - 1] ?? null
  const solved = finalBoxed !== null && finalBoxed.replace(/[, ]/g, '') === String(p.answer)
  results.push({ id: p.id, answer: p.answer, finalBoxed, solved })
  console.log(`[${p.id}] final boxed=${finalBoxed} solved=${solved} log=${logPath}`)
  console.log(String(out).slice(-1500))
}

console.log('\n===== PHASE 2 SUMMARY =====')
console.log(JSON.stringify({ runTag, results }, null, 2))
