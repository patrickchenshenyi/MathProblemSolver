# Kaggle AIMO3（AI Mathematical Olympiad Progress Prize 3）冠军、亚军及其它方案综述

> 整理时间：2026 年
> 主要依据：Kaggle 内部接口取到的**最终私榜原始数据**、各队 **writeup 正文**、以及**提交 notebook 的源码**；辅以 arXiv 论文、Zenodo 预印本、官方公告。
> 文中所有"核验"结论均由本地实际抓取/比对得出，证据等级见第 9 节。

---

## 0. 一句话结论

**这是一场"一个模型 + 一个 notebook 家族"的比赛。** 前 7 名里至少 4 支（#1 / #2 / #3 / #7）明确建立在 Andreas Bisiadis 与 Parthenos（`nihilisticneuralnet`）的公开 notebook 之上；所有人用的都是同一个基座模型 `gpt-oss-120b`，且**获奖方案全部没有微调**。冠军提交的 notebook 与 Parthenos 的公开 notebook 逐格比对后，17 个单元格中 16 个完全一致，**唯一差异是 `temperature` 由 0.5 改成 1.0**。

---

## 1. 比赛与规则背景（决定了所有人方案的形态）

- 主办：XTX Markets / AIMO Prize；平台：Kaggle；奖池约 220 万美元。
- 规模：4138 支队 / 4065 名选手 / 3450+ 次提交。
- 任务：**50 道原创 IMO 级数学题**，答案必须是 5 位以内的非负整数（`[0, 99999]`，格式为 `\boxed{}`）。
- 计算约束：**单卡 H100 80GB、5 小时（17400 秒）墙钟、断网**；提交物必须是 Kaggle notebook。
- 模型约束：运行时使用的模型必须在 **2026-03-15 之前发布**（这条规则直接促成了第 5.3 节的"软克隆"操作）。
- 排行榜：public 集与 private 集不相交，**最终名次由 private 集决定**；分数相同按**最早提交时间**破平。
- 附加奖（Extra Prizes）：Math Corpus Prize（最佳数据集）、Write-Up Prizes（最佳技术写作）、Longest Leader Prize、Hardest Problem Prize。
- 官方事后自述的原因分析：gpt-oss-120b "性能极强但极难训练"，导致大量提交退化为围绕它的 harness 与 prompt 工程，榜单因此高度挤成一团。

---

## 2. 最终私榜（前 7）与获奖情况

| 名次 | 队伍 | 私榜分 | 提交时间 | 说明 |
|---|---|---|---|---|
| 1 | **Exalted Joseph** | 44.0 | 2026-03-02 | 获奖；最早提交，破平取胜 |
| 2 | **varianceofx** | 44.0 | 2026-03-24 | 获奖 |
| 3 | **SKobayak** | 44.0 | 2026-03-26 | 获奖（Shuhei Kobayakawa，日本） |
| 4 | taku | 44.0 | 2026-04-09 | 未获奖，无 writeup |
| 5 | **TAMU-TACO** | 43.5 | 2026-01-16 | 获奖（Peiran Li、Fangzhou Lin，Texas A&M） |
| 6 | Man Penguin | 43.5 | 2026-01-31 | 未获奖，无 writeup |
| 7 | **yemao ye** | 43.5 | 2026-02-04 | 获奖 |

奖金发给 #1 / #2 / #3 / #5 / #7。

**两个关键读法：**

1. **44.0 有四支队并列**，名次完全由提交时间决定 —— 冠军 03-02 的提交时间本身就是夺冠要素之一。
2. **43.5 是一大片**（第 5 名一直延伸到 20 名开外都是 43.5）。分数分布极度挤压，说明这届的区分度主要来自运气与提交时机，而非方案质量差异。

---

## 3. 冠军：Exalted Joseph（Kaggle `theexaltedone`）

**方案性质：纯推理工程。gpt-oss-120b 原生权重 + vLLM + 常驻 Jupyter 沙箱 + 熵加权自洽，零微调、零训练数据。**

### 3.1 技术要点（已从提交 notebook 源码逐条核验）

**模型与服务**
- `gpt-oss-120b`（MoE，约 117B 总参 / 约 12B 激活），模型来源 Kaggle Model `danielhanchen/gpt-oss-120b`，**未做任何微调**（安装了 unsloth/trl 但从未 import）。
- vLLM 0.11.2，关键启动参数：`kv_cache_dtype = fp8_e4m3`、`context_tokens = 65536`、`gpu_memory_utilization = 0.96`、`max_num_seqs = 256`、prefix caching、async scheduling。
- 使用原生 **OpenAI Harmony** 对话格式（`openai_harmony`），推理强度设为 `ReasoningEffort.HIGH`。
- `enableInternet = false`（断网，无外部工具/API）。

**启动期优化**
- 先把 65GB 权重**预读进 Linux page cache**（notebook 自带输出记录：26 个文件 / 100.40 秒），再起 vLLM（128.49 秒就绪）。
- 卸载 keras / tensorflow / scikit-learn 等无关包腾内存；tiktoken 编码文件指向本地以支持离线。

**工具（Tool-Integrated Reasoning）**
- **16 个常驻 `jupyter_client` kernel 池**，一次借用、用后 `%reset -f`；跨轮保持解释器状态（变量、函数、中间数学对象都在）。
- 单次执行 6 秒超时，stdout/stderr/报错回灌为 tool message。
- 若模型代码最后一行不是 `print(...)`，自动包裹成 print。

**采样与推理循环**
- 每题 **8 路并行**（线程池 16 worker）、`temperature = 1.0`、`min_p = 0.02`、`top_logprobs = 5`、最多 128 轮、`seed = 42`，每路种子 `(42 + i)²`。
- **8 路使用完全相同的 system prompt** —— 多样性只来自采样随机性，没有任何 prompt 层面的多样化。
- **流式提前截断**：生成过程中监视末尾 token，一旦出现 `}` 就用正则抓 `\boxed{...}`，命中立刻停止生成长度。

**答案抽取**
- 主正则 `\\boxed\s*\{\s*([0-9,]+)\s*\}`（去逗号），另有一个 `final answer is N` 的散文兜底；取**最后一次**匹配；不在 `[0, 99999]` 内则丢弃。

**聚合：熵加权自洽（不是纯多数投票）**
```python
weight = 1.0 / max(entropy, 1e-9)   # entropy = 整段生成的每 token 平均 Shannon 熵（top-5 logprobs）
answer_weights[answer] += weight    # 按答案累加权重，取权重和最大者
```
注意：熵是在**整段生成**上求平均，没有做尾部窗口化。

**时间调度**
```python
time_left       = notebook_limit - elapsed_global            # notebook_limit = 17400s
reserved_time   = problems_left_others * base_problem_timeout # base = 300s
budget          = clamp(time_left - reserved_time, 300, 900)  # high = 900s
```
即"每题预留 300 秒给剩余题目，当前题在 300–900 秒之间取值"，并在流式循环内检查 deadline 以自我中止。

**提前停止**：任一答案累计达到 `early_stop = 4` 票，即触发 stop_event 取消其余 future。

### 3.2 冠军 notebook 与 Parthenos notebook 的逐格比对（本次核验的核心发现）

| 项 | 冠军 `theexaltedone/aimol` | Parthenos `nihilisticneuralnet/44-50-aimo3-gpt-oss-120b` |
|---|---|---|
| 标题 | `AimoL-` | `[44/50] AIMO3: gpt-oss 120b`（当前 v2） |
| 版本 | **仅 1 个版本（v1）** | v2（v1 标题为 `[44/50] LET ME (over)COOK!!!`） |
| 创建时间 | **2026-03-02T23:30:50Z** | v1：**2026-01-12T17:23:47Z**（run id 291499043） |
| 单元格数 / 总字符 | 17 / 32197 | 17 / 32197 |
| 社区投票 | 8 | 2959 |

**逐格 diff 结果：17 格中 16 格字节级完全一致，唯一差异出现在配置单元格：**

```diff
     gpu_memory_utilization = 0.96
-    temperature = 0.5      # Parthenos 当前公开版
+    temperature = 1.0      # 冠军提交版
     min_p = 0.02
```

**佐证链：**
- 冠军 notebook 的创建时间 `2026-03-02T23:30:50Z` 与他私榜的提交时间戳 `2026-03-02T23:30:55.78Z` 只差 5 秒 —— 说明**公开的这份 notebook 就是他提交的最终作品**。
- Parthenos 的 v1 早于冠军约 **7 周**。
- 冠军自己的 writeup 正文第一段就写着：*"Based on the work of Parthenos"*。

**结论：冠军在技术上使用的是 Parthenos 的方案，其个人没有可归因的算法创新。** 复制公开 notebook **不违规**（AIMO 在"更严格规则"审查后仍授予第一），且 writeup 有署名致谢。

### 3.3 writeup 与代码不一致之处（需要警惕）

writeup 的 "Adaptive Runtime Scheduling" 一节声称：未用时间会"按题目难度、验证复杂度、推理深度、生成稳定性动态重分配"。**但提交 notebook 中并不存在这样的逻辑** —— 代码只有上面那条固定的"预留 + 截断"规则。Kaggle 讨论区当时就有人公开提问"这段逻辑在哪实现"，未获回复。

---

## 4. 亚军：varianceofx

> 身份说明：`varianceofx` 是 Kaggle 用户名，公开材料中**未见其真实姓名**，本综述不作推测。请勿与第 6.3 节《AIMO3: a collection of delightful side quests》的作者 **Chan Kha Vu（`chankhavu`）** 混淆 —— 那是另一支队（私榜 41），两人并非同一队伍。

**方案性质：同样零训练，站在 Parthenos + Andreas Bisiadis 的 notebook 之上，做了 7 处针对性修改。**

他的 writeup 开头明确给 Parthenos 记功：*"核心基础设施 —— GPT-OSS 120B + vLLM、常驻 Jupyter 沙箱池、多路并行推理循环、基于熵的打分概念 —— 都源自 Parthenos 的设计。"*

### 4.1 七处改动（按他自己的重要性排序）

**① 强化 system prompt（他判断收益最大的一处）**
原 prompt 没有任何答案范围约束。AIMO3 的题常需要模运算：模型可能正确解出 20 位数，然后**把原始大整数放进 `\boxed{}` 而直接判零分**。他加入：

```
The final answer MUST be a non-negative integer in [0, 99999].
If your raw answer exceeds 99999, the problem is asking for something modular
(e.g., the last five digits, or the answer mod 10^5). Re-read the problem
statement carefully before boxing your answer.
```
并补充 `\boxed{}` 之前的 4 问自检清单（是否满足全部约束 / 是否与简单特例一致 / 是否在 [0,99999] / 是否用独立路径验证过）和常见陷阱清单。

**② 压缩库说明 prompt**
把约 200 token 的多段 `preference_prompt` 压成一行（math / numpy / sympy / mpmath 各自用途）。在 8 路 × 128 轮 × 50 题的规模上累积可观。

**③ 尾部窗口熵（Tail-Windowed Entropy）**
原版对**整段**生成求平均熵；他改为只对**最后 256 token** 求平均。理由是：开头的熵高是因为模型在探索（"让我试试…"），不反映对最终答案的置信度；最后 256 token 才是模型"下结论"的地方。

**④ 答案抽取收紧**
**完全删掉 `"final answer is N"` 散文兜底** —— 因为它在中间步骤频繁误触发（如"base case 的答案是 42，但让我推广一下…"），在流式生成时会过早锁定错误答案。只保留 `\boxed{}`，并支持 `\boxed{42,000}`（逗号）与 `\boxed{ 42 }`（空格），取最后一次匹配。

**⑤ 集成选择：从"熵主导"改为"投票主导"**（他认为与 Parthenos 差异最大的一处）

| | 公式 |
|---|---|
| Parthenos（原版） | `score = Σ (1/entropy)` —— 纯熵加权 |
| varianceofx | `score = vote_share × k + confidence × w₁ + consensus × w₂` |

核心理由：**纯熵加权会被"单个非常自信但答错"的样本劫持** —— 若某答案熵为 0.05，权重就是 20，足以掀翻 4 票的多数答案。他用权重位次把投票数放在第一位，熵只作打破平局之用。

> ⚠️ 细节不一致：writeup 正文写的是 `vote_share × 2.0 + confidence × 0.3 + consensus × 0.5`，而他提交的 notebook（我抓到的 v12）里是 `vote_share × 3.0 + confidence × 0.1 + consensus × 0.3`，旁边还有注释 "Increased vote_share weight from 2.0 to 3.0"。说明 writeup 记录的是较早一版，**以代码为准**。

**⑥ 用中位数熵替代平均熵**算每答案置信度，避免被单个偶然低熵样本带偏。

**⑦ 更强的提前停止**
除了"4 票一致就停"，还增加"领头答案已不可能被反超就停"：
```python
def _can_remaining_change_winner(valid_answers, attempts_completed):
    remaining = self.cfg.attempts - attempts_completed
    counts = Counter(valid_answers); top_two = counts.most_common(2)
    return (top_two[1][1] + remaining) > top_two[0][1]
```
领跑 4 票、次名 1 票、还剩 2 路时 `1+2=3 < 4` → 立刻停，把时间省给真正需要的题。

### 4.2 配置与结论

| 项 | 值 |
|---|---|
| GPU / 模型 | 1× H100 80GB / GPT-OSS-120B，FP8 KV-cache，65536 上下文 |
| 采样 | 8 路并行、16 个 Jupyter kernel、T=1.0、min_p=0.02、熵窗口 96 token（代码值） |
| 每题耗时 | 约 300–400 秒；全程约 4–5 小时 |
| 训练 | 无 |

**他试过但明确无效的：** 降温度（多样性变差）、把 attempts 提到 8 以上（边际收益递减）、微调（单位时间收益不如推理工程）、**给不同 attempt 用不同 system prompt 做多样性**（无提升，只增加复杂度）。

**他的两条总结：** (1) 在 120B 规模上 prompt 工程依然极其重要 —— 一句模运算提醒就消除了一整类零分；(2) 基于熵的置信度打分听起来高级，但作为主信号很脆弱，投票数才是更稳健的聚合器。

---

## 5. 其他获奖队伍

### 5.1 第 3 名 SKobayak（Shuhei Kobayakawa）

**方案性质：基于 ZaynYu 的公开 notebook（`40/50 GPT-OSS-120B TIR DynamicTime KernelPool`），`gpt-oss-120b` 原样 + Python 工具 + 8 路多数投票；真正贡献是"系统性错误分析驱动的 prompt 设计"。**

**他的方法论（这是本届最值得学习的一环）：**
- 自建 **1120 条回答的离线验证集**：10 道官方参考题 × 32 次 + 50 道社区共享难题 × 16 次 = 320 + 800。
- 把完整回答文本、题目上下文、最终答案正误整理成统一表，再用**比 gpt-oss-120b 更强的 LLM 交叉标注失败原因**。注意他特意同时提供 gpt-oss-120b 的**正确回答范例**，以防强模型给出 gpt-oss-120b 根本执行不了的"高级解法建议"。
- **刻意不使用 public LB 作为主要指标**：他假设 50 题里大约 5 题几乎无解、10 题摇摆、35 题稳对，只看 LB 会过拟合到那 10 道摇摆题上。

**由此得出的三段式 prompt 改动：**
1. 要求**用 Python 做验证**（来自正确回答里反复出现的模式）；
2. 要求**显式抽取并检查题目里的约束**（来自"忽略约束"这一高频错误）；
3. 要求**提前缩小搜索空间**（来自"写了大循环跑不完"这一高频错误）。

| 类目 | prompt 要点 |
|---|---|
| System | "世界级数学解题者"、答案是非负整数 `[0,99999]`、只返回 `\boxed{}` 中的已验证答案、先抽约束再判结构再定计划、符号推理不够时用 Python 验证、"绝不猜测"、定稿前对所有约束做校验 |
| Tool | 有状态 Jupyter、必须 `print()`、打印验证所需中间量、对照所有约束验证候选、**除非搜索空间有界或已剪枝否则不要暴力枚举**、大循环前先估复杂度 |
| Preference | 六步协议（抽约束 → 先做归约：奇偶/模/界/对称/不变量/单调性 → Python 只用于校验与剪枝后搜索 → 检索前先说明剪枝规则 → 输出前校验整数/范围/约束 → 只返回 `\boxed{}`） |

**试过且无效甚至更差的：** 用日语推理、强制"先草稿后定稿"的两步自纠、受论文启发的 complexity-based consistency、**把并行路数从 8 提到 16**（简单题提前完成、精度反而略降、总体错误增加）。

### 5.2 第 4 名 taku（44.0）
无公开 writeup，无法分析。

### 5.3 第 5 名 TAMU-TACO（Peiran Li、Fangzhou Lin，Texas A&M）

**方案性质：唯一一支把比赛重新定义为"顺序资源分配问题"的队伍。** 不训练新模型，只用 `gpt-oss-120b`。

**核心论点：** 系统一次只看到一道隐藏题目，有 5 小时总预算，且**无法预知后面的题是难是易** —— 因此花在当前题上的每一秒既可能帮忙也可能伤害全局。花太多时间在一道极难的题上，会损失后面几道本可解出的题；花太少又会切断"接近解出"的难题。

**最终锁定的四个耦合参数：**
```text
high_problem_timeout = 900
base_problem_timeout = 300
early_stop           = 4
attempts             = 8
```
（与冠军/亚军的取值一致 —— 说明这几个值在社区里已收敛为共识。）

**方法论亮点：** 自建 `AutoResearchAgent` —— 一个 human-in-the-loop 的实验引擎：构造 AIMO3-like 本地测试集、**对难题在题目序列中的位置做压力测试**、重复实验并记录分数与系统指标，最终由人圈定搜索空间并拍板。他们的结论是"私榜稳健性主要由难题在题目序列中的分布决定"。

### 5.4 第 7 名 yemao ye

**方案性质：同样基于 Andreas Bisiadis + Parthenos 的公开 notebook，走"极度保守"路线。** 简洁 IMO 风格 prompt + 严格 `\boxed{}` 格式 + 最多 8 路独立尝试 + Python 计算与验证 + 反熵加权聚合 + 基于频率的早停 + 每题预算控制。

他的结论与其他人相反相成：**最终版本刻意选择简单与稳定**，试过的更复杂 prompt 与熵变体都没能稳住。他还放出了去 Kaggle 依赖的本地版 notebook。

---

## 6. 其他更有意思的方案

### 6.1 Andreas Bisiadis 的"祖先 notebook" —— 社区公认的"真正的冠军"

`andreasbis/aimo-3-gpt-oss-120b-with-tools`（1000+ upvote），是 #1/#2/#3/#7 的共同起点。官方公告专门致谢，称"他的 notebook 是许多其他 notebook（包括许多顶尖 notebook）的基础"，并提到社区大量 Kaggler 称他为 **"real champion"**。

**方法（纯推理，零训练）：** vLLM 0.11.2、Harmony + ReasoningEffort.HIGH、极简 prompt、16 个常驻 Jupyter kernel、pass@8、`temperature=1.0 / min_p=0.02`、4 票早停、`1/熵`加权投票、FP8 E4M3 KV cache、prefix caching、上下文先 65536 后提到 81920 以消除截断失败。

**最讽刺的数据点：谱系源头本人最终私榜只有 41.5（第 546 名）。** 这恰好量化了本届"提交即买彩票"的成分。

**他公开的失败清单（含金量很高）：** 微调、RAG、in-context 范例检索、**用 Nvidia 官方 Eagle3 投机解码（实测慢约 25%）**、熵剪枝把 pass@12/16 压回 8、推理轨迹截断（会破坏 prefix cache）、MCTS + 过程奖励模型、往 MoE router 注入 Gumbel 噪声、额外的 DSL/证明器工具。另有大量 serving 层面的坑：vLLM 0.17 上必须用 Marlin MoE backend 才能在 `gpu_memory_utilization=0.99` 下避免 CUDA OOM（Triton 差 46MB 就炸）、`performance_mode="throughput"` 比 `interactivity` 快约 10%、cu128 轮子优于 cu130、`VLLM_USE_V2_MODEL_RUNNER` 会导致推理能力崩塌、把同一套 pipeline 移植到 Qwen3.5-35B-A3B 直接失败（显存 77.5GB 但 GPU 利用率 0%）。

### 6.2 SakanaAI —— 唯一把后训练真正做成的路线

writeup：*Pushing the Limits: Post-Training High-Capability Models under Strict Inference*。

- **数据**：FishMath SFT 数据集，**23,257 条已验证正确的推理轨迹 / 5,621 道题**，约 29% 含 Python 工具调用。轨迹由 Kimi-K2.5（65.3%）、DeepSeek-V3.2-Speciale（18.5%）、GLM-5、GLM-4.7 等**更强的开源模型蒸馏生成**；题目来自 Nemotron-Math-v2（专挑原数据集中正确轨迹 ≤4 条的"硬题"）与 Crystal-Math-Preview（答案已重写为整数的验证版）。
- **训练**：对 `gpt-oss-120b` 做 SFT，22,287 条轨迹、65,536 上下文、10 epoch、global batch 256、有效 token 曝光约 10.37B、AdamW + cosine、峰值 lr 8e-6。

**结论非常反直觉：**

| 推理模式 | 训练轮数 | pass@1 | Maj@8 | Pass@16 |
|---|---|---|---|---|
| TIR | Base | 72.61 | 77.86 | **92.28** |
| TIR | 2 epoch | 68.60 | 75.88 | 87.02 |
| TIR | 5 epoch | 70.88 | 76.85 | 88.77 |
| TIR | **10 epoch** | **73.38** | **78.62** | 90.88 |

- **2/5 epoch 全面掉分，只有 10 epoch 才略微超过基座** —— 顶配模型上的 SFT 需要"长期反复暴露于少量已验证难题轨迹"才见效。
- **pass@16 覆盖率基座最高** —— 说明 SFT 提升的是"平均正确率与投票可靠性"，而**不是**扩大可解空间。
- 推理侧：温度升高会同时拉长输出、**降低投机解码接受率**，因此精度与延迟强耦合；RL 模型太慢只能跑 T≤0.8，反而不如能跑 T=1.0 的 SFT 模型。public 最高分：RL 44、SFT 43。
- 他们试过 Self-Aggregation Refinement 与 GenSelect，能超过多数投票但对上下文截断极其敏感，最终**没有采用**。

### 6.3 Chan Kha Vu & yeoyunsianggeremie：《AIMO3: a collection of delightful side quests》

一篇 8 万多字符的"支线任务"合集，技术密度最高：

- **"软克隆"以绕过模型截止规则**：Nemotron-Cascade-2-30B-A3B（hybrid Mamba-MoE）发布于 2026-03-19，晚于 3-15 截止日，不能直接用；但它的架构与截止前发布的 Nemotron-3-Nano-30B-A3B 完全一致，于是对后者做**逐层线性蒸馏（layer-wise linear distillation）**得到 Cascade 2 权重，从而"洗白"成合规模型。
- **FP8 选择性量化**：hybrid Mamba 的状态对数值精度极敏感，他们的量化配方号称零质量损失。
- **修好了 vLLM 的一个开源难题**：Hybrid-Mamba 模型同时启用 prefix caching 与投机解码时会发生 **"mamba cache poisoning"**（被拒绝的投机 token 会污染共享的 Mamba 状态）；他们用 per-request "ghost" Mamba state 解决，并向上游提了 PR。
- **训练 Eagle-3 speculator**：K=7 时平均接受 3.55 个 token。
- **但最终提交极其朴素**：8 路 rollout + Python 工具 + 熵加权多数投票。私榜 **41**；本地验证 33.0 → 34.6（gpt-oss-120b 基线为 33.0）。
- **试过但没调好**：用 LLM-as-judge 做 pairwise 自验证，去填"早完成与晚完成 rollout 之间"的 GPU 空泡。
- **一个重要反驳**：他们直言**"verifier 路线在单卡 H100 上根本放不下 —— 120GB 的 MXFP4 权重只剩约 60GB 给 KV cache"**，这直接回应了 6.4 节论文"应该上 verifier"的建议。

### 6.4 负结果论文：arXiv:2603.27844《Model Capability Dominates》

Natapong Nitarach 用 23+ 个实验、3 个模型、4 个模型家族、单卡 H100 / 5 小时约束做了系统消融：

- **所有 prompt 层面的干预全部失败。** 想通过给不同 voter 分配不同推理策略（Diverse Prompt Mixer）来去相关，结果反而更差（2+2+2+2 四策略均分只有 36，最差）。
- **高温采样本身已经完成了去相关**：用矩估计法算出的误差相关系数 ρ，8 个可计算点**全部为负**，说明已经没有可利用的相关性空间。
- **模型能力完全主导**：gpt-oss-120b 在 N=8、T=1.0、熵加权投票下 21 次运行平均 39.3/50（最好 42）；同样 N=8 下 gpt-oss-20b 只有 31.0。这个 **8 分差距是任何 prompt 优化（±2 分）的 4 倍**。
- **选择损失 ≠ prompt 损失**：最佳多数投票 42 与 pass@20≈45.5 之间的差距，来自"正确答案已在池中但被更常见的错误答案投掉"，即**选择器**的问题。要填这个坑需要 verifier-based selector，prompt 工程做不到。
- 提出"**提交即买彩票**"的统计框架（13 次基线运行，均值 39.7、标准差约 2，目标是 44）。

> 注：该论文 v1/v2 之间存在口径差异（ar5iv 版写"17 分能力差距"，当前摘要写"8 分"），引用时需注意版本。

### 6.5 其他"野路子"

| 方案 | 内容 | 结果 |
|---|---|---|
| **OctoMath**（Zenodo 预印本） | 神经符号路由：用 LinUCB contextual bandit 把题分派给确定性算法或神经网络，配离线 Ollama 包以规避断网限制 | 声称在受限 CPU 环境下比硬跑 DeepSeek-R1-Distill-Qwen-7B 快 **19,825×**；作者自陈是概念验证，不追求 SOTA |
| **MoE 专家剪枝** | 统计 16,685,152 token 的 router 频率（BF16 与 MXFP4 路由已验证一致），动态阈值 0.995/0.99/0.985/0.98 或固定 top-120/100/80，并做 router bias 修正 `b_r → b_r + ln(k/n_j)` | gpt-oss-120b 剪到 74B（39–57GB），AIME25 保持甚至提升，**但在 AIMO 参考集上反而变差**（70–90% vs 90%） |
| **EAGLE-3 投机解码** | 为 gpt-oss-120b 训 draft head；改用 teacher top-1 硬蒸馏、**把 Python 工具输出排除出 loss**，才在 8×H800 上撑到 40K+ 上下文 | 与 6.1 节 Bisiadis 的"官方 Eagle3 反而慢 25%"形成对照 |
| **GLM-4.7 1-bit GGUF** | llama.cpp 在单卡 H100 跑，工具调用可用 | 15.34 tok/s，2520 秒生成 38,662 token 仍无解，判定不可行 |
| **"运气论"** | notebook 直接取名《AIMO3: Skills optional, Luck required》 | 与 44.0 四队并列、源头作者排 546 相互印证 |
| **负结果文化** | 《A Practitioner's Plateau: Sixteen Falsified Modifications》、对 1,788 条自身正确轨迹做 LoRA 微调的失败记录、《Chasing 47/50: 60+ Experiments》等 | 这届最有价值的公共产出之一 |

### 6.6 AIMO Proof Pilot（后续评测）

因为 AIMO3 暴露了"一个模型 + 一堆 harness、分数挤成一团、无法做 post-mortem"的问题，官方紧接着办了邀请制评测：

- **规则变化**：写**完整 IMO 式证明**而非数字答案；**人工**按 IMO 7 分制评分；**只允许完全开源模型**（中间 checkpoint、训练协议、训练数据都要公开，如 OLMo 系）；每队 3 节点 ×8×H200 = 全场 168 张 H200（日本 NII 提供，Fields Model grants）。
- **冠军：Yi-Chia Chen，29/42**（她同时获得 MathCorpus Prize，作品是 CrystalMath / `ycchen/Crystal-Math-Preview`）。
- 对照组反差极大：**gpt-oss-120b 只有 1/42、OLMo 3 32B Think 1/42、Qwen3.6 35B-A3B 2/42**；而 GPT-5.5 Pro 41/42、Claude Opus 4.8（Claude Code 终端）33/42、DeepSeek V4 Flash 27/42。
- 评分可信度副产品：每个输出由 2–4 名人类专家独立评分，同时让三个前沿模型也全量评分，**与人类最终分完全一致率 82%–87%**，允许 1 分内误差则 95%–99%。

---

## 7. 从这届比赛能学到什么（元层面）

1. **模型能力 > 一切推理侧技巧。** 这是本届最一致的经验（6.4 节论文用实验量化，各家 harness 也都在同一量级徘徊）。真正把分数往上顶的只有两条路：换更强的模型，或者**后训练**（6.2 节 SakanaAI）。
2. **有效的改进往往小得反直觉。** 亚军认为最大收益是"提醒模型答案要模 10^5"；季军认为最大收益来自对 1120 条失败样本的系统性标注；第 5 名干脆认为这是个资源分配问题。反过来，所有"更复杂"的东西（多样性 prompt、verifier、RAG、投机解码、MCTS+PRM）基本都被作者本人报告为无效或负收益。
3. **harness 是公共品，护城河极浅。** 一个公开 notebook 决定了前 7 名中至少 4 席。官方也把"提交集中于少数共享 notebook"列为本届两大异常之一。
4. **单次提交的分数噪声很大。** 44.0 四队并列靠提交时间破平；谱系源头排第 546；官方承认私榜存在"彩票效应"。**任何基于单次 AIMO 分数的方案优劣判断都不可靠** —— 这也是 AIMO Proof Pilot 改用人工作为最终裁决的原因。
5. **prompt 工程的天花板在"格式/约束合规"，不在"更聪明"。** 两处最大收益（模运算提醒、约束检查清单）本质都是消除"会做但交不出合规答案"的零分，而不是让模型变聪明。

---

## 8. 几个需要澄清的常见误解

- **"冠军做出了创新方案"** —— 不成立。冠军 notebook 与 Parthenos 公开 notebook 17 格中 16 格完全一致，唯一差异是 `temperature`。冠军的可归因贡献接近零。
- **"这届冠军方案就是最优方案"** —— 不成立。私榜 4 队同为 44.0，冠军仅凭 03-02 的最早提交时间胜出。
- **"获奖方案都做了微调"** —— 不成立。#1/#2/#3/#7 全部零训练。唯一做后训练的是 SakanaAI（未进前 7 的奖金名单）。
- **"writeup 写了就等于代码里有"** —— 不成立。冠军 writeup 的 "Adaptive Runtime Scheduling" 在提交代码中并不存在。**看方案要看 notebook 源码，而不是 writeup 的叙述。**

---

## 9. 证据等级与不确定性

**已核验（本地实际抓取/比对）**
- 最终私榜全部 3451 行原始数据、前 7 名分数与提交时间戳、破平规则。
- 冠军 notebook 源码（`theexaltedone/aimol`，仅 v1，创建于 2026-03-02T23:30:50Z）、其全部配置项、熵加权与预算代码。
- 冠军 vs Parthenos 的逐格 diff（16/17 完全一致，唯一差异 `temperature`）。
- Parthenos v1 的标题（`[44/50] LET ME (over)COOK!!!`）与创建时间（2026-01-12T17:23:47Z）。
- 冠军、亚军、季军、第 5 名、第 7 名的 writeup 正文与作者署名。
- 亚军提交 notebook（v12）源码中的聚合公式 `vote_share*3.0 + confidence*0.1 + consensus*0.3`。
- SakanaAI 训练配置与全部评测表格；side-quests 与 TAMU-TACO 全文；Proof Pilot 官方结果表。

**证据强度有限 / 未能确认**
- 我比对的是冠军版 vs **Parthenos 当前公开的 v2**，**未能取到 v1 的源码正文**（Kaggle 内部接口返回 403）。因此"冠军复制的是 v1 还是 v2 再改温度"无法区分；但无论哪种，结论（近乎逐字复制）不变。
- 冠军 Kaggle 账号 `theexaltedone` 的 HF 账号是 `SWIFTx-AI`（依据：其 writeup 的 "Huggingface Codebase" 链接指向 `huggingface.co/buckets/SWIFTx-AI/data`，该 bucket 约 201GB / 41 个文件）。**bucket 内容未能读取**，无法确认里面放的是什么。
- 冠军的 public LB 分数无法确认（官方已把 public 榜清零）。
- 官方"六个 Extra Prize 得主"与 Proof Pilot 实际只有六支队参与之间存在数量不一致，未能解决。
- 各队 notebook 的 upvote 数、部分讨论帖正文（权限限制）未能取到。

---

## 10. 附录：来源与复现方式

### 10.1 官方与一手链接

| 内容 | 链接 |
|---|---|
| AIMO3 获奖公告 | https://aimoprize.com/updates/2026-06-24-aimo-3-winners-announced |
| AIMO3 启动说明（规则背景） | https://aimoprize.com/updates/2025-11-19-third-progress-prize-launched |
| Proof Pilot 结果 | https://aimoprize.com/updates/2026-07-07-aimo-proof-pilot-winners-announced |
| 冠军 writeup | https://www.kaggle.com/competitions/ai-mathematical-olympiad-progress-prize-3/writeups/1st-place-solution-for-the-aimo3-competition |
| 冠军 notebook | https://www.kaggle.com/code/theexaltedone/aimol |
| 亚军 writeup | https://www.kaggle.com/competitions/ai-mathematical-olympiad-progress-prize-3/writeups/2nd-place-solution-ai-mathematical-olympiad-prog |
| 亚军 notebook / HF 适配版 | https://www.kaggle.com/code/varianceofx/let-me-improve-this-cooking ・ https://huggingface.co/varianceofx/aimo3-2nd-place-solver-adapted |
| 季军 writeup | https://www.kaggle.com/competitions/ai-mathematical-olympiad-progress-prize-3/writeups/3rd-place-solution-for-the-aimo3-competition |
| 第 5 名 TAMU-TACO writeup | https://www.kaggle.com/competitions/ai-mathematical-olympiad-progress-prize-3/writeups/aimo3-tamu-taco-solution |
| 第 7 名 yemao ye writeup | https://www.kaggle.com/competitions/ai-mathematical-olympiad-progress-prize-3/writeups/7th-place-solution-for-the-aimo3-competition |
| Andreas Bisiadis 基线 notebook / 仓库 | https://www.kaggle.com/code/andreasbis/aimo-3-gpt-oss-120b-with-tools ・ https://github.com/AndreasBis/AIMO3-Solution |
| Parthenos notebook | https://www.kaggle.com/code/nihilisticneuralnet/44-50-aimo3-gpt-oss-120b |
| SakanaAI writeup / 模型 / 数据 | https://www.kaggle.com/competitions/ai-mathematical-olympiad-progress-prize-3/writeups/pushing-the-limits-post-training-high-capability ・ https://huggingface.co/SakanaAI/gpt-oss-120b-sft-aimo3-fishmath ・ https://huggingface.co/datasets/SakanaAI/FishMath-SFT-Data |
| side quests writeup | https://www.kaggle.com/competitions/ai-mathematical-olympiad-progress-prize-3/writeups/aimo3-a-collection-of-delightful-side-quests |
| 能力主导论文 | https://arxiv.org/abs/2603.27844 ・ https://github.com/nat-nischw/model-capability-dominates-lessons-aimo3 |
| OctoMath | https://zenodo.org/records/20329074 |

### 10.2 数据如何取得（可复现）

Kaggle 的 writeup、notebook、榜单页面都是**前端渲染**的，直接 curl 只能拿到空壳（仅有 `<title>` 与 `<meta>` 标签可读）。本综述的数据通过以下途径取得：

1. **Writeup 正文**：POST `https://www.kaggle.com/api/i/discussions.WriteUpsService/GetWriteUpBySlug`，body 为 `{"slug": "<slug>", "competitionName": "ai-mathematical-olympiad-progress-prize-3"}`；正文在返回体的 `message.rawMarkdown` 字段。写up 正文也可从其论坛主题取（`discussions.DiscussionsService/GetForumTopicById`，参数名是 `forumTopicId`）。
2. **Notebook 源码**：`GET https://www.kaggle.com/api/v1/kernels/pull/<owner>/<slug>`（需 Kaggle API 凭据，`blob.source` 是 notebook JSON）。
3. **榜单**：POST `https://www.kaggle.com/api/i/competitions.LeaderboardService/GetLeaderboard`，body `{"competitionId": 118448}`，返回 `privateLeaderboard` 与 `teams`。
4. **Notebook 版本历史**：POST `https://www.kaggle.com/api/i/kernels.KernelsService/ListKernelVersions`，body `{"kernelId": <id>}`。
5. **HuggingFace**：`huggingface.co` 在部分网络环境下不可达，可改用镜像 `hf-mirror.com`（含 `/api/models`、`/api/datasets`、`/<repo>/raw/main/README.md` 与全文检索 `/search/full-text?q=`）。

> 上述接口均需账号凭据。第 1、3、4 项是 Kaggle 未公开文档的内部 gRPC-gateway 接口，方法名可从 `https://www.kaggle.com/static/assets/app.js` 中检索得到；接口可能随时变更。

---

## 11. 结语

如果只从这届比赛带走三句话：

1. **方法是公共品，模型才是护城河。** 前 7 名共享同一个 notebook 谱系、同一个基座模型、同一套参数（8 路 / T=1.0 / 4 票早停 / 900-300 秒预算）；真正拉开差距的是模型本身与后训练（第 6.2 节）。
2. **最大的收益往往来自"消除零分"，而不是"变得更聪明"。** 一句模运算提醒、一份约束清单，比任何花哨的 verifier 都值钱。
3. **不要相信任何单次提交的名次，也不要只读 writeup 不读代码。** 前者是彩票，后者可能写着代码里根本没有的"自适应调度"。
