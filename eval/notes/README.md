# eval/notes —— 求解过程中的独立复算材料

本目录是从工坊实例（`deepseek-harness-aimo/work/`）回收的求解草稿与推导笔记。
它们不是评测脚本，而是**支撑评测结论的可复现附件**：多 agent 试点里出现的
"已验证答案"到底是怎么被独立算出来的。

> 笔记正文里出现的 `work/xxx.py` 路径，指的是**本目录**（`eval/notes/aimo3-ref-02/`）；
> 打包时按 `work/` → `eval/notes/aimo3-ref-02/` 映射落位，正文为保持原始记录未改写。

## 内容

| 文件 | 作用 |
|---|---|
| `derive_count.py` / `derive_count_s8.py` / `derive_count_results.md` | AIMO3 `aimo3-21818`（$2^{20}$ 名选手 20 轮锦标赛，求 $k \bmod 10^5$）的组合计数推导与验证结果 |
| `brute_small.py` / `brute_small_task3.py` / `brute_small_solver7.py` / `brute_analogue.py` + `*_out.txt` | 把 RECTIL 型问题缩到小参数后的**穷举 ground truth**；`brute_small_task3_notes.md` 是 task-3 的说明 |
| `valuation.py` / `explore.py` / `verify_independent.py` / `analogue_out.txt` | 探索与独立复核脚本 |

## 口径提醒

这些脚本的作用是**独立于模型说法**地给出小参数或等价问题的真值。它们支持
`eval/phase4-p2-report.md` 里"520"这类结论，但**不构成对大参数原题的完整证明**：
见 `project/docs/Gap_Analysis.md` §"已验证 ≠ 已解决"。
