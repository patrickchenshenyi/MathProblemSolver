/**
 * Phase 4 evaluation harness.
 *
 * Configs (plan §4):
 *   A  one direct solve          — single model + run_python, no team
 *   B  N independent direct solves — same prompt, N samples (pass@N)
 *   C  the team                  — coordinator prompt on the shared task board
 *
 * Usage:
 *   node run-phase4.mjs --config A --dataset aime --k 1 [--problems 3]
 *   node run-phase4.mjs --config C --dataset aimo3 --k 1 --ids aimo3-ref-01,aimo3-ref-05
 *   [--tag <name>]
 *
 * Per run it records: extracted answer, correctness, wall time, and token usage
 * summed from every session log written during that run (teammates included).
 * Results are appended to phase4-results-<tag>.json so an interrupted run keeps
 * its data.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import zlib from 'node:zlib'

const __dirname = dirname(fileURLToPath(import.meta.url))
// 自包含默认值：harness/ 与 eval/ 在仓库内同级；用环境变量可指向工坊实例。
const CLONE_ROOT = process.env.AIMO_HARNESS ?? resolve(__dirname, '..', 'harness')
const DSH_HOME = process.env.DSH_HOME ?? join(homedir(), '.dsh')
const SESSIONS_ROOT = join(DSH_HOME, 'sessions')
let PER_RUN_TIMEOUT_MS = 30 * 60_000
const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])
const USAGE_FIELDS = ['inputTokens', 'outputTokens', 'cacheReadTokens', 'reasoningTokens']

const options = new Map()
for (let i = 2; i < process.argv.length; i += 2) options.set(process.argv[i].replace(/^--/, ''), process.argv[i + 1])
const config = (options.get('config') ?? 'A').toUpperCase()
const datasetName = options.get('dataset') ?? 'aime'
const k = Number(options.get('k') ?? 1)
const limit = options.get('problems') === undefined ? Infinity : Number(options.get('problems'))
const wantedIds = options.get('ids') === undefined ? null : new Set(options.get('ids').split(','))
const tag = options.get('tag') ?? `p4-${config}-${datasetName}`
const timeoutMin = options.get('timeout-min') === undefined ? 30 : Number(options.get('timeout-min'))
if (!Number.isFinite(timeoutMin) || timeoutMin < 1) throw new Error('--timeout-min must be a positive number')
PER_RUN_TIMEOUT_MS = timeoutMin * 60_000

if (!['A', 'B', 'C'].includes(config)) throw new Error(`unknown --config ${config} (expected A, B or C)`)

function loadDataset(name) {
  if (name === 'aime') {
    const raw = JSON.parse(readFileSync(resolve(__dirname, 'aime-baseline.json'), 'utf8'))
    return raw.problems.map(p => ({ id: p.id, answer: p.answer, statement: p.statement, source: p.source }))
  }
  if (name === 'aimo3') {
    const raw = JSON.parse(readFileSync(resolve(__dirname, 'aimo3-reference.json'), 'utf8'))
    return raw.problems.map(p => ({
      id: p.id,
      answer: p.answer,
      statement: p.statement,
      source: p.source,
      quality: p.statement_quality,
    }))
  }
  throw new Error(`unknown --dataset ${name} (expected aime or aimo3)`)
}

function sessionSnapshot() {
  const seen = new Map()
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (entry.name === 'session.jsonl.zstd') seen.set(path, statSync(path).mtimeMs)
    }
  }
  try {
    walk(SESSIONS_ROOT)
  } catch {
    /* no sessions yet */
  }
  return seen
}

/** Decode a multi-frame zstd session log (Node's zstd API stops at the first frame). */
function decodeFrames(buffer) {
  const starts = []
  let index = 0
  while ((index = buffer.indexOf(ZSTD_MAGIC, index)) !== -1) {
    starts.push(index)
    index += 4
  }
  starts.push(buffer.length)
  let text = ''
  for (let i = 0; i < starts.length - 1; i++) {
    try {
      text += zlib.zstdDecompressSync(buffer.subarray(starts[i], starts[i + 1])).toString('utf8')
    } catch {
      /* a false magic match: skip that slice */
    }
  }
  return text
}

/** Sum token usage from every session log written since `before`. */
function usageSince(before) {
  const totals = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, reasoningTokens: 0, sessions: 0 }
  let current
  try {
    current = sessionSnapshot()
  } catch {
    return totals
  }
  for (const [path] of current) {
    let mtime = 0
    try {
      mtime = statSync(path).mtimeMs
    } catch {
      continue
    }
    if (mtime <= (before.get(path) ?? 0)) continue
    let text
    try {
      text = decodeFrames(readFileSync(path))
    } catch {
      continue
    }
    totals.sessions += 1
    for (const field of USAGE_FIELDS) {
      for (const match of text.matchAll(new RegExp(`"${field}":(\\d+)`, 'g'))) totals[field] += Number(match[1])
    }
  }
  return totals
}

/**
 * Extract a run's final answer.
 * Team runs answer through the acceptance tool, whose verdict line carries the
 * accepted integer even when the closing message never repeats `\boxed{...}` —
 * so the verdict is a first-class source, not a prose guess.
 */
function extractAnswer(text) {
  const matches = [...String(text).matchAll(/\\boxed\s*\{\s*([^}]*)\s*\}/g)]
  const last = matches[matches.length - 1]
  if (last !== undefined) {
    const raw = last[1].replace(/[, ]/g, '')
    if (/^-?\d+$/.test(raw)) return { answer: Number(raw), source: 'boxed' }
  }
  const verdicts = [...String(text).matchAll(/accepted:\s*(\d+)/g)]
  if (verdicts.length > 0) {
    return { answer: Number(verdicts[verdicts.length - 1][1]), source: 'verdict' }
  }
  return { answer: null, source: 'none' }
}

function classify(problem, answer) {
  if (answer !== null && answer === problem.answer) return 'correct'
  if (answer === null) return 'no_compliant_answer'
  if (answer < 0 || answer > 99999) return 'out_of_range'
  return 'wrong_answer'
}

const coordinator = readFileSync(resolve(__dirname, 'coordinator-prompt.md'), 'utf8')
function promptFor(problem) {
  if (config === 'C') return `${coordinator}\n\nProblem: ${problem.statement}`
  return [
    'Solve the following mathematics competition problem.',
    'You may use the run_python tool to perform computations and verify your work.',
    'Give your final answer as a single integer inside \\boxed{...}.',
    '',
    `Problem: ${problem.statement}`,
  ].join('\n')
}

const all = loadDataset(datasetName)
const selected = (wantedIds === null ? all : all.filter(p => wantedIds.has(p.id))).slice(0, limit)

// `--rescore <tag>`: re-derive answers from the saved logs of an earlier run
// (e.g. after fixing extraction) without spending any model calls.
const rescoreTag = options.get('rescore')
if (rescoreTag !== undefined) {
  const path = resolve(__dirname, `phase4-results-${rescoreTag}.json`)
  const saved = JSON.parse(readFileSync(path, 'utf8'))
  for (const record of saved.results) {
    let text = ''
    try {
      text = readFileSync(resolve(__dirname, `phase4-${rescoreTag}-${record.id}-k${record.sample}.log`), 'utf8')
    } catch {
      continue
    }
    const extracted = extractAnswer(text)
    record.answer = extracted.answer
    record.answerSource = extracted.source
    record.correct = extracted.answer === record.truth
    record.class = classify({ answer: record.truth }, extracted.answer)
  }
  const rescored = {
    ...saved,
    inProgress: false,
    rescoredAt: new Date().toISOString(),
    summary: aggregate(saved.results),
  }
  writeFileSync(path, JSON.stringify(rescored, null, 2))
  console.log(`rescored ${saved.results.length} run(s) from saved logs -> ${path}`)
  console.log(JSON.stringify(rescored.summary, null, 2))
  process.exit(0)
}
const resultsPath = resolve(__dirname, `phase4-results-${tag}.json`)
const results = []

console.log(`Phase 4: config=${config} dataset=${datasetName} k=${k} problems=${selected.length} tag=${tag}`)

for (const problem of selected) {
  for (let sample = 1; sample <= k; sample++) {
    const before = sessionSnapshot()
    const startedAt = Date.now()
    let output
    try {
      output = execFileSync('pnpm', ['dsh', '--profile', 'headless', promptFor(problem)], {
        cwd: CLONE_ROOT,
        env: { ...process.env, DSH_HOME },
        timeout: PER_RUN_TIMEOUT_MS,
        encoding: 'utf8',
        maxBuffer: 256 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (error) {
      output = `__ERROR__ ${error.message ?? error}`
    }
    const seconds = Math.round((Date.now() - startedAt) / 1000)
    const extracted = extractAnswer(output)
    const answer = extracted.answer
    const usage = usageSince(before)
    const record = {
      config,
      dataset: datasetName,
      id: problem.id,
      sample,
      truth: problem.answer,
      answer,
      answerSource: extracted.source,
      correct: answer === problem.answer,
      class: classify(problem, answer),
      seconds,
      usage,
    }
    results.push(record)
    writeFileSync(
      resultsPath,
      JSON.stringify({ tag, config, dataset: datasetName, k, inProgress: true, results }, null, 2),
    )
    writeFileSync(
      resolve(__dirname, `phase4-${tag}-${problem.id}-k${sample}.log`),
      output,
    )
    console.log(
      `[${problem.id}] k=${sample}/${k} answer=${answer} truth=${problem.answer} ${record.correct ? 'CORRECT' : record.class}`
      + ` ${seconds}s tokens=${usage.inputTokens + usage.outputTokens}/${usage.cacheReadTokens}c`,
    )
  }
}

function aggregate(records) {
  const problems = [...new Set(records.map(r => r.id))]
  const passAt = (n) => {
    const solved = problems.filter(id => records.filter(r => r.id === id).slice(0, n).some(r => r.correct)).length
    return { solved, total: problems.length, value: problems.length === 0 ? 0 : solved / problems.length }
  }
  const classes = {}
  for (const record of records) classes[record.class] = (classes[record.class] ?? 0) + 1
  const sum = (field) => records.reduce((total, r) => total + r.usage[field], 0)
  return {
    runs: records.length,
    passAtK: passAt(k),
    classification: classes,
    tokens: {
      input: sum('inputTokens'),
      output: sum('outputTokens'),
      cacheRead: sum('cacheReadTokens'),
      reasoning: sum('reasoningTokens'),
      perRunAvg: records.length === 0 ? 0 : Math.round(sum('inputTokens') / records.length),
    },
    seconds: {
      total: records.reduce((total, r) => total + r.seconds, 0),
      perRunAvg: records.length === 0 ? 0 : Math.round(records.reduce((t, r) => t + r.seconds, 0) / records.length),
    },
  }
}

const summary = { tag, config, dataset: datasetName, k, summary: aggregate(results), results }
writeFileSync(resultsPath, JSON.stringify(summary, null, 2))
console.log('\n===== PHASE 4 SUMMARY =====')
console.log(JSON.stringify(summary.summary, null, 2))
console.log(`\nwritten to ${resultsPath}`)
