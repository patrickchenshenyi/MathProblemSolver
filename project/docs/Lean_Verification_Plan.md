# Lean 形式化验证实施方案（step-by-step）

> 版本：v1.0 · 日期：2026-09-27 · 状态：待实施（对应 `Deep_Improvement_Plan.md` 的 T2）
> 定位：把验收从「格式检查（L0）」升级为「**L0 + Lean 内核证明检查**」——这是本项目从"协作基础设施"迈向"正确性保证"的关键一跳。
> 红线不变：判定正确性的是机器内核，模型只是证明/答案的提供者，禁止 LLM-as-judge。

---

## 0. 原则

1. **Lean 只做验收，不做求解。** 我们不追求 AlphaProof 式的"在 Lean 里搜索证明"（那需要训练/RL 管线）；Lean 是最终答案的**裁判**。
2. **验证的是"答案满足题面"**：把题面形式化为一组前提，把"答案 = N"形式化为结论，内核证明 `前提 ⊢ 答案 = N`。
3. **命题起草（statement formalization）是真正的瓶颈**——把自然语言题目翻译成 Lean 命题比证明更难，且翻错 = 验证了另一道题。必须人审 + 用已知答案做 sanity check。
4. **交互循环要快**：证明失败的 kernel 报错（行号 + 消息）是修复循环的燃料，必须原样回灌给模型。
5. 复用现有接口预留（T2）：`submit_task` 的 `lean` 字段、`VerificationBackend` 抽象、`submit_proof` 保留名、L0+Lean 级联。

---

## Phase L0 —— 环境与最小通路（目标：容器里跑通一个定理的检查）

**L0.1 工具链镜像**
- 新建 Docker 镜像 `aimo-lean-runtime`：基于 `python:3.13-slim` + elan + Lean 4（固定版本，如 4.17）+ mathlib4（固定 commit）。
- **把 `lake build` 的编译产物（.olean 缓存）预置进镜像**——否则每次启动冷编译 mathlib 要几分钟到几十分钟。目标：`lake env lean` 在容器里 < 2s 起步。
- 沿用 `code-runtime-docker` 的隔离参数：`--network none --read-only --memory --cpus --pids-limit --tmpfs`（见 `MyProject/docker/` 与 SUMMARY §3 的既有模式）。

**L0.2 验证后端接口（`VerificationBackend` 落成代码）**
- 在 `packages/aimo/verifier/src/` 新增 `lean-backend.ts`：
  ```ts
  interface LeanCheckInput  { declarations: string   // 前提/定义（题面形式化 + 引理库）
                              target: string         // 目标命题，如 "answer = 60"
                              proof?: string }       // 可选：模型提交的证明脚本
  interface LeanCheckOutput { ok: boolean
                              errors: Array<{ line: number; message: string }> }
  ```
- 实现：把 `declarations + proof` 拼成临时 .lean 文件，`lean --run`/`lake env lean` 子进程执行（或走 fd-1 JSON-lines 协议，同 `bootstrap.py` 哲学），**防御性解析输出**（把 Lean 输出当不可信输入）。
- 失败时返回全部 kernel 错误（行号 + 消息），不吞细节。

**L0.3 验收标准（可执行的 smoke）**
- 通过：`example : 2 + 2 = 4 := by norm_num` → `ok: true`；
- 拒绝：`example : 2 + 2 = 5 := by norm_num` → `ok: false` + 可解析的错误行；
- 拒绝：`theorem t : False := by sorry` → `ok: false`（**`sorry`/未完成证明一律不过**，检查 `#print axioms` 为空）；
- 性能记录：容器内单文件检查延迟（目标 < 5s 含启动）。

---

## Phase L1 —— 与提交链接轨（目标：答案必须"有证明"才算完成）

**L1.1 `submit_task` 的 `lean` 字段启用**
- 成果结构 `{说明, 数据/公式, lean: {declarations, target, proof}}`（把 v4.1 留空的 `lean: null` 槽位启用）。
- 流程变为：owner/CAS 校验 → **Lean 检查**（`lean-backend`）→ 通过才 `complete`；不通过返回全部 kernel 错误、任务状态不动。这一步与 L0 门槛完全同构——只是"验收对象"从整数格式升级为证明。
- 配置开关：`aimo-verifier` 加 `config.leanEnabled`（默认 false；Phase L4 后对形式化题集开 true），保证未形式化的题仍走旧路径。

**L1.2 `submit_final_answer` 终态：L0 + 答案绑定**
- 题目形式化库里的每道题带 `answer_binding`（`⊢ answer = 60` 的命题）。
- `submit_final_answer` 先做 L0 格式/范围，再查该题的绑定命题是否已在板上被某个 `submit_task` 的 Lean 证明验证过 → 双闸通过才 accepted。
- 启用保留名 `submit_proof(problem_id, lean)` 作为便捷提交路径（同 `run_code` 先例：名字先占坑）。

**L1.3 验收标准**：一题端到端——好证明 accepted；含 `sorry` 的证明被拒；结论改成错误答案被拒（如把 target 写错数字）。

---

## Phase L2 —— 命题起草（statement formalization，最大瓶颈，人工为主）

**L2.1 题目形式化库（ground truth，人手写）**
- 目录 `packages/aimo/verifier/lean/problems/`（新资产，类比被删掉的 `constraints/*.py`，但性质不同：**这是"题面"的形式化，一次性建成、可长期复用**，不是每题一次性的"答案检查"）。
- 每道题一个文件，三段式：
  ```lean
  import Mathlib
  -- ① 题面前提（把自然语言条件全部编码）
  variable (x y z w : ℝ)
  def P1_hyp (x y z w : ℝ) : Prop :=
    x > 1 ∧ y > 1 ∧ z > 1 ∧ w > 0 ∧
    Real.logb x w = 24 ∧ Real.logb y w = 40 ∧ Real.logb (x*y*z) w = 12
  -- ② 答案绑定
  def P1_expected : ℕ := 60
  -- ③ 目标命题（验收器检查的对象）
  theorem P1_main (x y z w : ℝ) : P1_hyp x y z w → Real.logb z w = P1_expected := by
    sorry -- 由求解 agent 补齐并替换
  ```
- **每道题必须通过"已知答案 sanity"**：模型/人工用已知答案跑一遍绑定命题可证明性；对不上 = 翻译错了。
- 首期范围（人工成本可控）：AIME 5 题（1983-01、1985-02、1986-02、1991-01、1993-01）→ 扩展 AIMO3 中形式化友好的题（P2 这类组合/构造题需要自定义结构，难度大，**后置**；P3/P7 几何题依赖 mathlib 几何库，量力而行）。

**L2.2 半自动起草流水线（降低人工成本）**
- 让模型对照题面起草 `P_hyp`，人审 + `#check` + sanity 验证；接受/拒绝记录存档（错误翻译样本也是资产）。

**L2.3 验收标准**：AIME 5 题全部通过 sanity；每题的 hyp 覆盖题面每个约束（人审 checklist）。

---

## Phase L3 —— 证明修复循环（proof repair loop，求解侧）

**L3.1 循环协议（写进 solver prompt）**
1. solver 调 `run_python`/自己的推理推出答案 N；
2. 起草 Lean 证明（含中间引理与战术块：`norm_num / linarith / omega / ring / nlinarith / simp / interval_cases` 起步）；
3. `submit_task(lean=...)` → kernel 报错（行号+消息）原样回灌；
4. 修复并重提（预算：**3 次提交**，与现有提交预算一致）；仍失败 → 释放任务、报告失败分类。

**L3.2 防作弊两条铁律**
- 最终证明 **`#print axioms` 必须为空**（禁 `sorry`、禁 `axiom`）；
- 结论必须是题目绑定命题的实例（由验收器检查 target 形状，禁止"证明一个无关命题然后宣称答案"）。

**L3.3 验收标准**：AIME 5 题上，给定人工答案的前提下模型能补齐证明（衡量"证明生成"能力）；记录修复循环收敛率（第 1/2/3 次提交通过的分布）。

---

## Phase L4 —— 全量级联 + 评测（目标：把验收强度真正转化成能力）

**L4.1 终态验收链**
```
solver 提交 (answer, proof)
  → L0 格式/范围（submit_final_answer 侧）
  → Lean kernel：前提 ⊢ answer = expected，axioms 为空
  → 通过 → task completed（submit_task 的门槛同构）
```
未形式化的题：仍走 L0-only 路径（配置开关）。

**L4.2 评测（与 Phase 4 同一骨架）**
- 题集：已形式化的 AIME 5 题 + 后续扩展题。
- 指标：答案正确率（外部 ground truth）、证明通过率、修复循环收敛率、墙钟。
- 对照：A（直解，无证明义务）/ C（团队 + Lean 门槛）。
- **关键预期**：加了 Lean 门槛后，团队"第一个提交即胜"的仲裁才第一次有了**真正确性判据**——这是"验收器强度决定自治程度"总原则的兑现点，也是本项目与 OpenAI/Anthropic 路线对齐的验收组件。

---

## 5. 风险与边界（诚实清单）

| 风险 | 缓解 |
|---|---|
| **命题起草翻错**（验证了另一道题） | 人审 + 已知答案 sanity；起草样本存档 |
| mathlib 缺件（组合/几何） | 本地自定义定义 + 引理库；先做代数/数论题，几何后置 |
| Lean 编译慢 | 只验证**最终命题**，不做逐步证明检查；.olean 缓存预置镜像 |
| 模型不会写 Lean | 修复循环 + 战术块 starter + 少量示例（few-shot 题面库）；实在不行该题标记"暂不可形式化验证" |
| 内核通过 ≠ 答案对（前提翻译错时） | 唯一解是 L2 的人审；这是形式化路线的固有成本 |

## 6. 与现有接口的映射（T2 预留项兑现）

| 预留项 | 落地 |
|---|---|
| 成果 `lean` 字段（现在 null） | Phase L1 启用为 `{declarations, target, proof}` |
| `VerificationBackend` 抽象 | Phase L0 的 `lean-backend.ts`（先 python 谓词占位、再 lean4 后端） |
| `submit_proof` 保留名 | Phase L1.2 启用 |
| L0+Lean 级联 | Phase L4.1 |
| 解题成果链落盘为 Lean 化素材 | 题面库 + 证明库目录统一管理 |

## 7. 时间估算（单人节奏）

| Phase | 内容 | 估时 |
|---|---|---|
| L0 | 镜像 + 后端接口 + smoke | 1–2 周 |
| L1 | 提交链接轨 | 1 周 |
| L2 | 题面库（AIME 5 题起步） | 2–4 周 |
| L3 | 修复循环 | 2 周 |
| L4 | 级联 + 评测 | 1–2 周 |

*一句话：L0/L1 是工程活（快），L2 是翻译活（慢但一次性资产），L3 让模型学会写证明，L4 让"验收强度决定自治程度"第一次兑现。*
