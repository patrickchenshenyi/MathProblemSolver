# Phase 4 —— 试点评测报告（首批真实数据）

> 日期：2026-09-27 · 状态：试点完成（A/C 已出数据，B 运行中）
> 工具：`eval/run-phase4.mjs`；数据集 `eval/aime-baseline.json`（15 题）、`eval/aimo3-reference.json`（10 题）
> 配置：**A** 单模型直解 · **B** N 次独立直解（pass@N） · **C** 本设计团队（coordinator + 任务板/池/fold/分享）

## 1. 试点范围与结果

| 集 | 配置 | 题量 | k | pass@k | input tokens/次 | 墙钟/次 | 相对成本 |
|---|---|---|---|---|---|---|---|
| AIME（易） | **A** 单模型直解 | 3 | 1 | **3/3 = 100%** | 28,507 | 8 s | 1.0× |
| AIME（易） | **C** 团队 | 3 | 1 | **3/3 = 100%** | 170,067 | 33 s | **6.0×** |
| AIMO3（难） | **A** 单模型直解 | 2 | 1 | **2/2 = 100%** | 51,006 | 191 s | 1.0× |
| AIMO3（难） | **B** 3 次独立直解 | 2 | 3 | **2/2 = 100%** | 36,653 | 320 s | 0.72×/次 |
| AIMO3（难） | **C** 团队 | 2 | 1 | **2/2 = 100%** | 576,087 | 466 s | **11.3×** |

按"拿到一个正确解"的总成本粗算（难题组）：A ≈ 51k（1 次）、B ≈ 110k（3 次）、**C ≈ 576k（1 次团队运行）**——C 比 B 的 3 次独立尝试还贵 5 倍，且正确率相同。

逐题（AIME 用 1983-01/1984-01/1985-02；AIMO3 用 ref-01 SWEETS、ref-05 锦标赛）：

- A：5/5 全对，逐题 7–9 s（易）、~150–230 s（难）
- B（难题 ×3 次）：6/6 全对，44–652 s/次（ref-05 一次直解用了 652 s，说明它是真难题）
- C：5/5 全对，逐题 29–38 s（易）、349 s 与 583 s（难）
- C 的 token 构成（难题）：output 902k、cacheRead 23.5M、reasoning 645k —— 团队在难题上烧掉约 115 万 input token

## 2. 结论（诚实）

**在这 5 道题上，团队没有带来任何正确率收益，却付出 6–11× 的 token 与 2.4–4× 的墙钟。**
单模型（deepseek-v4-pro）既能秒掉易题，也能独立做对这两道 AIMO3 难题。

原因分析：

1. **能力层面**：这些题没有超出单次上下文的能力边界——团队擅长的"并行搜索 / 分解 / 交叉验证"没有用武之地。
2. **验收层面**：Lean 尚未上线，团队的多 agent 结构无法把"更多算力"转化为"更强的正确性保证"；角色裁剪、首完成终止、fold、分享这些都是**协作基础设施**，不是**正确性增益**。
3. **成本层面**："全资源直接干"（Phase 2 的决定）在每道题上都会派满 ≤3 副本 + critic，即使题目只需一次推导——这正是 11× 成本的来源。**试点数据开始挑战那个决定**：至少在"单模型已能做对"的题目上，全资源开干是纯浪费。
4. **过程可观测性缺陷（已修）**：团队解对题后，最终消息里常常**不写字面 `\boxed{}`**（只报 `submit_final_answer verdict: accepted: 50`），导致外部判分第一次把 ref-01 误判为 `no_compliant_answer`。已做两处修正：① 评测器把工具 verdict 作为一等答案来源（并支持 `--rescore` 不花模型调用重新打分）；② coordinator prompt 增加强制条款——报告最后一行必须是字面 `\boxed{<answer>}`。

## 3. 下一步建议

1. **全量跑**：AIME 15 题 × A/C（k=1）+ AIMO3 10 题 × A/B/C（k=3）。AIME 便宜（每题 ~30 s），AIMO3 每题 3–10 min，整体数小时，建议后台常驻。
2. **成本侧实验**（比继续堆 agent 更值钱）：把"全资源直接干"改成**按需扩张**——默认 1 个 solver；仅当（a）无进展轮次超阈值、（b）critic 报错、（c）`claim_next_task` 显示无人接手时，才扩张副本/分解。用同一套题对比"全资源 vs 按需"的 pass@k 与 token。
3. **寻找团队真正的主场**：需要"单次上下文装不下"的题目（长链推导、大规模枚举、需要分而治之），或等 Lean 上线后让"多 agent + 形式化验收"成为正确性优势。
4. **数据集补齐**：`aimo3-reference.json` 的 P6 题面记号错乱（`needs-review`），用前需人工校订；P3/P7/P9 有轻微空格损伤。

## 4. 产物

- harness：`eval/run-phase4.mjs`（`--config A|B|C --dataset aime|aimo3 --k n [--problems n|--ids …] [--tag t]`，另支持 `--rescore <tag>`）
- 结果：`eval/phase4-results-pilot-A.json`、`phase4-results-pilot-C-aime.json`、`phase4-results-pilot-C-aimo3.json`（B 进行中）
- 逐次运行日志：`eval/phase4-pilot-*-<题号>-k<n>.log`
- 数据集生成：`eval/build-aimo3-dataset.py` → `eval/aimo3-reference.json`（含 `statement_quality`）
