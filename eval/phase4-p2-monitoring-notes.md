# P2 基准监控笔记（goal rounds 累积观察）

## Round 3（首轮 A 直解运行中，~5 分钟）
- 会话事件类型显示：`web/deepseek-search-llm-request ×6`、`tool/call` 含 `bash` + `curl`。
- 模型在用 web 搜索并尝试拉取 HuggingFace `UR-xiaoyang/AIMO3_CoT` 数据集行数据——即**检索公开参考解答**（AIMO3 参考题与解答是公开的）。
- 评估口径含义：A/B/C 三组在同一个 headless profile 下跑，工具面一致（bash/web-search/run_python 均可用），因此**三组对照仍然公平**；但"解对"需要区分"推理得出"与"检索到公开解答"。最终报告应如实标注此观察，并在需要"纯推理能力"口径时，考虑禁掉 web-search/bash 重跑对照。

## Round 4（~6 分钟）
- 工具调用分布（累计 16 次）：`bash ×10`（含 curl 拉 HF 数据集）、`web_search ×2`、`job_output ×2`、`run_python ×1`、`todo_write ×1` —— 检索导向明显。
- 累计 token：input 32.6k、output 41.0k、cacheRead 482k、reasoning 36.2k（首轮仍在 turn 1）。

## Round 6（~6 分钟）
- 模型正在下载 PDF 并用 pypdf 解析（`/tmp` venv），web_search 查询 "AIMO2 RECTIL 500x500 rectangle distinct perimeters 520"——**该题即 AIMO2 公开题 RECTIL（P2 是其 AIMO3 参考复刻），答案与解答已在公开网络**。首轮直解大概率走"找到原题 → 读答案"路径。
- 对报告的含义加重：在**公开题**上，检索能力压过推理能力；要测"团队 vs 单模型"的推理增量，需(a)如实标注检索路径，(b)另跑禁 web-search/bash 的纯推理对照。

## Round 7（~7 分钟）
- 运行推进到 turn 1 / 20 steps（948 事件），最后一个工具结果的文本尾部出现 "accepted: 520"——模型已通过检索途径拿到答案值 520，正在收尾（写最终 \boxed{} 或继续验证）。

## Round 8 —— A k=1 落盘 ✅
- **A 直解第 1 次：CORRECT，answer 520，379 s，input 49.1k / output 64.4k，来源 boxed。**
- 最终输出是一份完整的构造+反证（下半部 249 对矩形 + 上半部构造给出下界 520；面积/半周长函数 f(s) 论证 k=521 不可能——与官方解法同构）。
- 意义：用户历史上"最新 DeepSeek 推理模式 3 次全炸上下文"的 P2，当前 deepseek-v4-pro + 工具（web 检索 + bash + run_python）在 ~6.3 分钟解出。三组对照的参照点已经建立：单模型直接能解。
- k=2 已启动（elapsed ~18s）。

## Round 12（k=2 运行中）
- k=2 首个工具调用即 `web_search`——检索导向从第一秒开始（与 k=1 同模式）。
