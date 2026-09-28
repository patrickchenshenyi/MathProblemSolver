/**
 * M0 baseline runner.
 *
 * For each AIME problem, runs `dsh --profile headless "<prompt>"` K_MAX times
 * (deepseek-v4-pro + the run_python tool via the harness llm seam), extracts the
 * \boxed{...} answer from each sample, then reports pass@1 / pass@4 / pass@8 and
 * a coarse failure classification.
 *
 * Usage:
 *   node run-baseline.mjs [maxProblems] [maxSamples] [seedNote]
 *
 * Deterministic in mechanics (fixed problem order, fixed prompt, deterministic
 * extraction); the underlying model sampling is API-controlled, so pass@k is
 * best-effort reproducible rather than bit-identical.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
// 自包含默认值：harness/ 与 eval/ 在仓库内同级；用环境变量可指向工坊实例
// （例如 AIMO_HARNESS=…/deepseek-harness-aimo DSH_HOME=~/.dsh-build）。
const CLONE_ROOT = process.env.AIMO_HARNESS ?? resolve(__dirname, '..', 'harness')
const DSH_HOME = process.env.DSH_HOME ?? join(homedir(), '.dsh')
const DATASET = resolve(__dirname, 'aime-baseline.json')

const K_MAX = 8
const PER_SAMPLE_TIMEOUT_MS = 360_000 // 6 min per headless run

const maxProblems = Number(process.argv[2] ?? Infinity)
const maxSamples = Number(process.argv[3] ?? K_MAX)
const runTag = process.argv[4] ?? new Date().toISOString().replace(/[:.]/g, '-')

const dataset = JSON.parse(readFileSync(DATASET, 'utf8'))
const problems = dataset.problems.slice(0, maxProblems)
const kSamples = Math.min(K_MAX, maxSamples)

/** Extract the LAST \boxed{...} integer from a headless run's output. */
function extractBoxed(text) {
  const matches = [...String(text).matchAll(/\\boxed\s*\{\s*([^}]*)\s*\}/g)]
  if (matches.length === 0) return { answer: null, extracted: false }
  const raw = matches[matches.length - 1][1].replace(/[, ]/g, '')
  if (!/^-?\d+$/.test(raw)) return { answer: null, extracted: false }
  return { answer: Number(raw), extracted: true }
}

function promptFor(statement) {
  return [
    'Solve the following mathematics competition problem.',
    'You may use the run_python tool to perform computations and verify your work.',
    'Give your final answer as a single integer inside \\boxed{...}.',
    '',
    `Problem: ${statement}`,
  ].join('\n')
}

function runSample(statement) {
  const prompt = promptFor(statement)
  try {
    return execFileSync('pnpm', ['dsh', '--profile', 'headless', prompt], {
      cwd: CLONE_ROOT,
      env: { ...process.env, DSH_HOME },
      timeout: PER_SAMPLE_TIMEOUT_MS,
      encoding: 'utf8',
      maxBuffer: 128 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (error) {
    return `__ERROR__ ${error.message ?? error}`
  }
}

/** Coarse 4-way failure classification from observable signals. */
function classify(problem, sample) {
  if (sample.correct) return 'correct'
  if (!sample.extracted) return 'no_compliant_answer' // 交不出合规答案
  if (sample.answer < 0 || sample.answer > 999) return 'out_of_range' // 越界(作弊/不合规)
  // wrong but compliant: cannot auto-split 计算错/漏约束/完全不会 without the reasoning trace
  return 'wrong_answer'
}

const results = []
for (const p of problems) {
  const samples = []
  for (let k = 1; k <= kSamples; k++) {
    const out = runSample(p.statement)
    const boxed = extractBoxed(out)
    const sample = {
      k,
      answer: boxed.answer,
      extracted: boxed.extracted,
      correct: boxed.extracted && boxed.answer === p.answer,
      outputTail: String(out).slice(-2000),
    }
    sample.class = classify(p, sample)
    samples.push(sample)
    process.stdout.write(`[${p.id}] k=${k}/${kSamples} extracted=${boxed.extracted} answer=${boxed.answer} correct=${sample.correct}\n`)
  }
  results.push({ id: p.id, source: p.source, answer: p.answer, samples })
  // Incremental write so a long run survives interruption.
  writeFileSync(resolve(__dirname, `baseline-results-${runTag}.json`), JSON.stringify({ summary: { runTag, kSamples, inProgress: true }, results }, null, 2))
}

function passAtK(k) {
  const solved = results.filter(r => r.samples.slice(0, k).some(s => s.correct)).length
  return { solved, total: results.length, value: results.length ? solved / results.length : 0 }
}

const summary = { runTag, kSamples, problems: results.length, passAtK: {}, classification: {} }
for (const k of [1, 4, 8]) {
  if (k > kSamples) continue
  summary.passAtK[k] = passAtK(k)
}

const counts = {}
for (const r of results) {
  // per-problem failure class = worst/most informative of its samples (any correct -> correct)
  const anyCorrect = r.samples.some(s => s.correct)
  let cls = anyCorrect ? 'correct' : r.samples[r.samples.length - 1].class
  counts[cls] = (counts[cls] ?? 0) + 1
}
summary.classification = counts

const outPath = resolve(__dirname, `baseline-results-${runTag}.json`)
writeFileSync(outPath, JSON.stringify({ summary, results }, null, 2))

console.log('\n===== BASELINE SUMMARY =====')
console.log(JSON.stringify(summary, null, 2))
console.log(`\nresults written to ${outPath}`)
