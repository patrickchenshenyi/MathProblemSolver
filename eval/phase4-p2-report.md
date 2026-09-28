# AIMO3 Reference Problem 2 —— A/B/C 三组 pass@3 基准报告

> 题面：500×500 方格剖分为整数边矩形、周长互异，求最大 k 的余数（答案 **520**；公开题，AIMO2 "RECTIL" 的 AIMO3 参考复刻）。
> 运行：`node run-phase4.mjs --config {A,B,C} --dataset aimo3 --k 3 --ids aimo3-ref-02 --timeout-min 60 --tag p2-{A,B,C}`
> 判据（v5.5 导向）：能力与耗时优先，token 不计；C 的价值 = 在 A/B 失败处成功（或显著更快）。

## 结果（占位，基准运行中逐项填充）

| 配置 | k | 正确/总 | pass@k | 逐次墙钟 | 备注 |
|---|---|---|---|---|---|
| A 单模型直解 | 1 | 1/1 ✅ | — | 379 s | 检索 + 推理；完整构造+面积反证 |
| A | 2 | ? | | | |
| A | 3 | ? | | | |
| B 独立直解 ×3 | 1..3 | ? | | | |
| C 团队 ×3 | 1..3 | ? | | | |

## 观察与结论（占位）

- 口径警告（监控笔记 Round 3/6/7）：模型大量使用 web_search/bash 检索公开解答（HF AIMO3_CoT、RECTIL 原题）；三组工具面一致故对照公平，但"解对"含检索成分。纯推理对照需禁 web-search/bash 重跑。
- 参照点：单模型 k=1 已 379s 解出——**团队要证明价值，需更快或更稳，而非仅解出**。
- 详细监控：`eval/phase4-p2-monitoring-notes.md`；汇总命令：`node aggregate-configs.mjs p2-A p2-B p2-C`。
