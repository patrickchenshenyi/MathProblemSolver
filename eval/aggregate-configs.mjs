/**
 * Merge several phase4 result files into one comparison table.
 * Usage: node aggregate-configs.mjs <tag1> [tag2 ...]
 * Reads eval/phase4-results-<tag>.json for each tag and prints a Markdown
 * comparison (pass@k, per-problem detail, wall time, tokens, classes).
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const tags = process.argv.slice(2)
if (tags.length === 0) {
  console.error('usage: node aggregate-configs.mjs <tag1> [tag2 ...]')
  process.exit(1)
}

const rows = []
for (const tag of tags) {
  let data
  try {
    data = JSON.parse(readFileSync(resolve(__dirname, `phase4-results-${tag}.json`), 'utf8'))
  } catch (error) {
    console.error(`# skip ${tag}: cannot read phase4-results-${tag}.json (${error instanceof Error ? error.message : error})`)
    continue
  }
  rows.push({ tag, data })
}

if (rows.length === 0) {
  console.error('no readable result files; nothing to aggregate')
  process.exit(1)
}

console.log('# 配置对照汇总')
console.log(`> ${rows.map(r => `${r.data.config}`).join(' / ')} · 生成于 ${new Date().toISOString()}\n`)

console.log('| tag | 配置 | 题集 | k | 正确/总 | pass@k | 墙钟/次 | input tokens/次 | 分类 |')
console.log('|---|---|---|---|---|---|---|---|---|')
for (const { tag, data } of rows) {
  const { summary, results } = data
  const solved = results.filter(r => r.correct).length
  const classes = Object.entries(summary.classification).map(([name, count]) => `${name}×${count}`).join(', ')
  console.log(
    `| ${tag} | ${data.config} | ${data.dataset} | ${data.k} | ${solved}/${results.length} | ${summary.passAtK.value} | ${summary.seconds.perRunAvg} s | ${summary.tokens.perRunAvg} | ${classes} |`,
  )
}

console.log('\n## 逐题明细\n')
for (const { tag, data } of rows) {
  console.log(`### ${tag} (${data.config} / ${data.dataset}, k=${data.k})\n`)
  console.log('| 题 | 采样 | 答案 | 真值 | 结果 | 来源 | 墙钟 | input tokens |')
  console.log('|---|---|---|---|---|---|---|---|')
  for (const r of data.results) {
    console.log(
      `| ${r.id} | ${r.sample} | ${r.answer ?? '—'} | ${r.truth} | ${r.correct ? '✅' : r.class} | ${r.answerSource ?? '—'} | ${r.seconds} s | ${r.usage.inputTokens} |`,
    )
  }
  console.log()
}
