# Deep Improvement Plan —— 多 Agent 协作升级

> **版本：v5.5**
> **日期：2026-09-27**
> **状态：Phase 0 / 1 / 2 已完成，Phase 3 完成 T3/T9/T4/T5（剩 T10），Phase 4 评测进行中**
> **定位：** 让多 agent 协作真正提升解题能力，而不是"N 个独立解题对话"。正确性验收最终交给 Lean 形式化证明；工程上先跑通流程，再补缺口。

---

## 0. 目标与原则

- **核心目标**：提升解题能力——**解出单模型解不出的难题**；**token 成本不计，解题能力与墙钟是第一考量**（2026-09-27 定）。
- **项目定位（2026-09-27 再定）**：做**前沿技术方案的实践**——研究 OpenAI/Anthropic/DeepSeek 的数学突破方案（验证器/搜索/agent 协作/形式化）并落地验证，**不以公开题基准评测为目标**：公开题答案已上网，联网工具会泄露答案，无法反映"遇到新题"的真实能力（半年前 DeepSeek 网页推理模式是无联网的）。
- **正确性验收**：最终交给 Lean 形式化证明（T2；step-by-step 实施步骤见 `MyProject/Lean_Verification_Plan.md`）。
- **工程顺序**：先跑通流程，再补缺口。
- **总流程**：收到题目即播种任务、成员自助取活、首完成即仲裁（"全资源直接干"的成本导向已被 Phase 4 试点数据挑战，见 §4.5）。
- **差距分析**：与 OpenAI/Anthropic 一线方案的差距与优先级见 `MyProject/Gap_Analysis.md`（总纲：瓶颈是缺强验收器，Lean 中间步骤验收是唯一实质杠杆）。

### 0.1 当前进度速览

| 阶段 / 事项 | 状态 | 证据 |
|---|---|---|
| Phase 0 验收器重写（`submit_task` / `submit_final_answer`） | ✅ 完成 | 单测+lint+build 过；基线冒烟 2/2；实例 B 已加载 |
| Phase 1 角色工具硬裁剪（`aimo-team-roles`） | ✅ 完成 | 实测三条拒绝路径全生效 → `eval/team-roles-livecheck.log` |
| Phase 2 协调 prompt（全资源直接干）+ 配置落地 | ✅ 完成 | 三题 3/3 全对 → `eval/phase2-livecheck-summary.txt` |
| Phase 3-T3 首完成自动终止 | ✅ 完成 | 三题 3/3；`submit_task` 返回 `siblings terminated: task-1, task-3` → `eval/phase3-t3-livecheck-summary.txt` |
| Phase 3-T9 池调度（`claim_next_task` 自助取活 + 唤醒纪律） | ✅ 完成 | 三题 3/3；定向验证四条路径（认领/新建副本）→ `eval/pool-toolcheck.log`；会话日志 `created and claimed` 15 次、`claimed` 17 次、`no work` 12 次 → `eval/phase3-t9-livecheck-summary.txt` |
| Phase 3-T4 父任务 fold 自动完成（`decompose_task` + fold 扫描） | ✅ 完成 | 定向验证 ×3：分解 → 子任务全部 submit → 父任务 rev5 自动 completed、rev6 带审计注记 `[folded: all subtasks completed]` → `eval/fold-toolcheck.log` |
| Phase 3-T5 成果分享（板上 `[result]` 注记 + 按任务订阅定向投递） | ✅ 完成 | 定向验证：提交方返回 `resultOnBoard: true` / `sharedWith: ["solver-1"]`，父任务 owner 收到成果消息，板上可见注记 → `eval/share-toolcheck.log` |
| Phase 3 剩余：T10 critic 写回 | ⏳ 待办 | 见 §5.3 |
| Phase 4 评测（骨架 + 三配置对照） | ⏳ 进行中 | 数据集与 harness 已建（§4）；试点运行产生首批数据 |
| T2 Lean 验证 | 不排期（只留接口） | 见 §5.3 |

---

## 1. 验收设计

系统里只有两处验收，其余环节不设验证：

### 1.1 `submit_final_answer()` —— 最终答案验收（只有 coordinator 用）

- 作用：校验**最终答案的格式与范围**（原 L0）。
- **可配置**：插件 Config 的 `answerMin` / `answerMax`（已在 profile patch 显式配置，见 §5.4）；默认 `\boxed{}` 取整数、范围 0–99999（同时覆盖 AIME 3 位与 AIMO3 的 5 位 `mod 10^5` 答案）。
- 正确性本身由认领根节点任务的子 agent 在 `submit_task()` 时确认（未来 = Lean 证明）。
- 只有 Lead 持有该工具（`aimo-team-roles` 对其他角色 deny）。

### 1.2 `submit_task()` —— 任务提交（每个 solver 用）

- 作用：提交**任务成果**（说明 + 数据/公式，`lean` 字段为未来证明占位）。
- 现在做四件事：owner/CAS 校验并置 completed → 成果作为 durable 消息发给 Lead → **自动终止同组副本（T3）** → 返回 `siblingsTerminated`。
- 未来：成果附带 Lean 证明，`submit_task()` 负责验证（T2）。**现在不要求也不验证 Lean。**
- **已接受的缺口**：提交只做机制校验，成果对错不验证；Lean 上线前正确性由最终 L0 + 评测 ground truth 兜底。

### 1.3 为什么不需要仲裁

- Lean 能验证的内容正确答案唯一，通过验收即正确。
- 首个通过的任务即最终结果：**由系统自动终止其余副本**（T3：`submit_task` 成功时插件以 Lead 权限 `interrupt` 副本 owner 并 `delete` 副本任务）——不依赖任何 agent 记得去做。

---

## 2. 角色与池

- **池共 16 个 agent（含 coordinator）**：由 `agent-team` 的 `maxMembers: 16` 强制（已在 profile patch 配置）。
- **每个逻辑子任务最多 3 个副本**：协调者只**播种 1 个任务**；副本由空闲成员调用 `claim_next_task` 自行创建（工具自动命名 `<logical-name> #<k>`），上限由 `maxCopiesPerGroup: 3` 强制。
- **coordinator（Lead）**：播种任务、派工、监控、唤醒空闲成员、重派、`submit_final_answer()` 终验、汇总。
- **solver**：`claim_next_task` 自助取活（认领就绪任务或新建副本）→ 计算 → `submit_task()`；完成后可再取（≤2 次）。
- **critic**：独立复核、只能报告（无提交工具、无权 edit 任务描述）。
- **角色裁剪已代码强制**（`aimo-team-roles`），详见 §3 第 3 行。

---

## 3. 解题流程（全资源直接干）—— 每项能力的实现方式

> 不做"先小做、不行再加码"：收到题目立刻分解并派满资源，难度由结果自然体现。

| # | 流程能力 | 具体实现机制 | 代码 / 工具位置 | 状态 |
|---|---|---|---|---|
| 1 | **立刻分解成子任务 DAG** | Lead 调 `team_task_create`，用 `blocked_by` 建边；图的完整性由 agent-team 强制校验（blocker 缺失/重复边/自环/成环都拒绝，对应 `TEAM_TASK_NOT_FOUND` / `TEAM_INVALID_ARGUMENT` / `TEAM_TASK_DEPENDENCY_CYCLE`）；`ready = status==='pending' && blockedBy.every(completed)` 在读取时派生，不落盘。**"怎么拆"的决策在 prompt 层**，代码只提供 DAG 原语 | `experimental/agent-team/src/{task-board,task-graph}.ts`；工具 `team_task_create`；决策见 `eval/coordinator-prompt.md` STEP 1 | 原语已实现；决策是 prompt 层 |
| 2 | **全资源投入**（≤3 策略副本 + 1 critic） | `spawn_teammate(context='fresh')` 创建可续跑子 agent；池上限在 roster 层强制（`TEAM_MEMBER_LIMIT`）；协调者只播种任务，**副本由成员用 `claim_next_task` 自助创建**（工具按 `<logical-name> #<k>` 命名并立即认领，上限 `maxCopiesPerGroup`）；名字前缀（`solver-` / `critic-`）是角色裁剪的输入 | `agent-team/src/roster.ts`、`tool-agent-team` 的 `spawn_teammate`、`packages/aimo/pool/src/{plan.ts,index.ts}` | spawn/池上限/副本上限：代码强制；派几个 agent：prompt |
| 3 | **角色纪律**（谁不能提交/完成） | `aimo-team-roles` 插件监听 `agent/created` → 按名字前缀 `classifyRole`（未知角色 fail-closed）→ `policyFor` → ① `agent.ctx.tools.restrict({deny})` 让工具整体**不可见**；② `agent.ctx.tools.guard` 单调拒绝 `team_task_update action=complete` | `packages/aimo/team-roles/src/{roles.ts,index.ts}` | ✅ 已实现并实测 |
| 4 | **首完成即仲裁 + 终止其余副本** | `submit_task` 内部顺序：owner/CAS `updateTask(complete)` → 成果 durable 消息发 Lead → `selectSiblingCopies` 按 subject 的 ` #<n>` 后缀分组 → **以 Lead 身份**调 agent-team 服务 API：`interrupt(副本 owner)` + `updateTask(delete)` → 返回 `siblingsTerminated`。清理失败只告警，不影响提交结果 | `packages/aimo/verifier/src/index.ts`、`siblings.ts` | ✅ 已实现并实测 |
| 5 | **递归分解 + 父任务完成** | 分解：`decompose_task(task_id, subtasks)` 一次调用完成"建子任务 + 给父任务写 `[fold-parent depth=<n>]` 标记 + 设 `blockedBy=子任务`"，并强制宽度（≤`maxChildren`）与深度（≤`maxDepth`）上限；fold：插件在每次 `team/task` 事件后扫描——**in_progress 且带标记、且全部 blocker 已 completed** 的父任务自动置 completed（Lead 权限 + CAS，支持级联 5 轮），并在任务描述追加 `[folded: all subtasks completed]` 审计注记。标记是必要的：任务只有 blocker 全完成才能被 claim，所以"in_progress + 有 blocker"本身不足以证明它被分解过 | `packages/aimo/pool/src/{fold.ts,index.ts}`；事件源 `agent-team/src/journal.ts` 的 `team/task` | ✅ 已实现（含审计注记） |
| 6 | **分享（成果 / 发现 / 范围）** | `submit_task` 成功时自动做两件事：① **板上注记**——把 `[result] <summary>\n<data>` 追加到该任务描述（截断 2000 字符），任何读板的成员（尤其 critic）都能看到证据；② **定向投递**——把成果作为 durable 消息（quiet，不唤醒）发给"真正需要它的人"：依赖该组的任务 owner（父/消费者）+ 同一父任务下的兄弟子任务 owner，排除提交者本人、同组 losing copies 与 lead（lead 已单独收到）。发现：critic 用 `send_message` 报 Lead，由 Lead 决定 reopen/重派/自己 edit | `packages/aimo/verifier/src/share.ts`（纯函数）+ `index.ts`；mailbox：`agent-team/src/mailbox.ts` | ✅ 已实现 |
| 7 | **防卡死**（预算 / 换策略 / 止损） | 全部为 prompt 常数：每 solver 提交 ≤3 次、协调轮次 ≤20；"换策略"= 建新副本任务（下一个 ` #<n>`）+ spawn 新 solver；没有代码强制 | `eval/coordinator-prompt.md` STEP 3/5/6 | prompt 层（数值校准 = T7） |
| 8 | **终验最终答案** | Lead 调 `submit_final_answer` → `validateAnswer` 纯函数：取最后一个 `\boxed{}`、去逗号/空格、要求非负整数、落在 Config 范围内 | `packages/aimo/verifier/src/{index.ts,answer.ts}`；范围见 §5.4 | ✅ 已实现并实测（三题 accepted） |

| 9 | **池调度：空闲成员找活 + 唤醒**（T9） | 取活：`claim_next_task` 一次调用确定性完成——① 认领 ready 且无主的任务；② 否则在活跃子问题副本数 < `maxCopiesPerGroup` 时新建副本并认领；③ 都没有则返回 `none`（保持空闲）。唤醒：任务变 ready **不会**唤醒任何人、`wait_agent` 也不唤醒，所以由 Lead 在每次醒来时做派工检查——`list_agents` 找 idle/inactive 成员 + `team_task_list` 看是否还有活，用 `followup_task` 让该成员去 `claim_next_task` | `packages/aimo/pool/src/{plan.ts,index.ts}`；唤醒纪律在 `eval/coordinator-prompt.md` STEP 5 | 取活：✅ 代码强制（纯函数 + 单测）；唤醒时机：prompt 层 |

**三个必须知道的实现约束**（都来自运行时本身，不是设计选择）：

1. **`interrupt` 是 Lead-only**（`roster.ts` 抛 `TEAM_LEAD_REQUIRED`）——所以第 4 步的终止只能由插件以 Lead 身份调服务 API，owner 无法用 `interrupt_agent` 工具亲手执行。这是"owner 触发、系统代劳"这一实现的根本原因。
2. **`edit` 任务描述需要 owner 或 Lead**（`task-board.ts` 的 `authorizeOwner()`）——critic 两者都不是，只能报告（T10）。
3. **任务变 ready 不会唤醒任何人**，`wait_agent` 也只观察不唤醒——空闲 agent 的再派工完全依赖 Lead 显式 `followup_task`（T9）。

---

## 4. 评测

### 4.1 数据集

| 集 | 文件 | 题量 | 答案 | 说明 |
|---|---|---|---|---|
| 易 | `eval/aime-baseline.json` | 15（AIME 1983–2001） | 0–999 | sanity 检查（已知训练集污染，不追求评测纯度） |
| 难 | `eval/aimo3-reference.json` | 10（AIMO3 Reference Bench，2025-11） | 5 位 `mod 10^5` | 由 `eval/build-aimo3-dataset.py` 从 PDF 抽取（pypdf layout 模式）；`statement_quality` 标注题面质量——**P6 记号错乱（needs-review，用前需人工校订）**，P3/P7/P9 有少量空格损伤，其余 clean |

### 4.2 三配置对照

| 配置 | 做法 | 含义 |
|---|---|---|
| **A** 单模型直解 | 一个 headless 直解（`run_python` 可用），k=1 | pass@1 基线 |
| **B** N 个独立 solver | 同一提示跑 N 次、互不通信 | pass@N 上限对照（成本 = N 倍单次） |
| **C** 本设计团队 | coordinator prompt + 任务板/池自助取活/fold/分享 | 本设计（一次团队运行 = pass@1） |

### 4.3 指标与口径

- **pass@k**：A/B 按各自采样数；C 的 pass@1 与 B 的 pass@N 在近似 token 预算下对比。
- **token 成本**：从**每次运行期间写入的会话日志**（多帧 zstd，逐帧解码）累加 `inputTokens / outputTokens / cacheReadTokens / reasoningTokens`，**包含所有 teammate 会话**——这是团队成本可比的唯一真实口径。
- **墙钟时间**、平均 agent 数、完成率。
- **失败分类**（沿用 M0 四类）：`correct` / `wrong_answer`（计算错）/ `no_compliant_answer`（交不出合规）/ `out_of_range`。
- **判据（2026-09-27 修订：能力与耗时优先，token 成本不计）**：C 必须在 **A/B 解不出的题**上解出来（或显著更快解出）；在 A/B 已能解对的题上，成本差异不作为否决项。**团队的主场 = 单模型解不出的难题**（如 AIMO3 P2：历史上最新 DeepSeek 推理模式 3 次全炸上下文）。

### 4.4 骨架与产物

- 运行：`node eval/run-phase4.mjs --config A|B|C --dataset aime|aimo3 --k <n> [--problems <n> | --ids id1,id2] [--tag <t>]`
- 产物：每次运行落 `phase4-<tag>-<题号>-k<n>.log`；结果与汇总落 `phase4-results-<tag>.json`（增量写，可中断续跑）。
- 题面质量与训练集污染都在数据集文件里显式记录，避免把"抽取出错"或"背过题"误读成能力。

### 4.5 试点结果（首批真实数据，2026-09-27）

| 集 | 配置 | 题量 | pass@k | input tokens/次 | 墙钟/次 | 相对成本 |
|---|---|---|---|---|---|---|
| AIME（易） | A 单模型直解 | 3 | 3/3 | 28,507 | 8 s | 1.0× |
| AIME（易） | C 团队 | 3 | 3/3 | 170,067 | 33 s | **6.0×** |
| AIMO3（难） | A 单模型直解 | 2 | 2/2 | 51,006 | 191 s | 1.0× |
| AIMO3（难） | B 3 次独立直解 | 2 | 2/2 | 36,653 | 320 s | 0.72×/次 |
| AIMO3（难） | C 团队 | 2 | 2/2 | 576,087 | 466 s | **11.3×** |

按"拿到一个正确解"的总成本（难题组）：A ≈ 51k（1 次）、B ≈ 110k（3 次独立）、**C ≈ 576k（1 次团队运行）**——C 比 B 的三次独立尝试还贵 5 倍，正确率相同。

**结论（诚实）**：这 5 道题上团队**没有正确率收益**，却付出 6–11× token。原因：题目未超出单次上下文能力；Lean 未上线，协作基础设施（角色裁剪/首完成终止/fold/分享）不构成正确性增益；"全资源直接干"在单模型已能解对的题上是纯浪费。**试点数据开始挑战 Phase 2 的"全资源直接干"决定**——建议改成"按需扩张"（默认 1 个 solver，仅在无进展/critic 报错时扩张），并用同一套题对比成本与 pass@k。

**过程中修掉的两个真实缺陷**：① 团队解对后最终消息常不写字面 `\boxed{}`（只报 `submit_final_answer verdict: accepted: N`），评测器首轮把 ref-01 误判为 `no_compliant_answer` → 评测器改为把工具 verdict 当作一等答案来源，并新增 `--rescore` 免模型调用重打分；② coordinator prompt 增加强制条款：报告最后一行必须是字面 `\boxed{<answer>}`。

完整报告：`eval/phase4-pilot-report.md`。

> **P2 基准已取消（2026-09-27）**：A/B/C × pass@3 跑到 1/9（A k=1 ✅ 520/379s）即停止——监控发现模型大量使用 web_search/bash 检索公开解答（P2 = 公开题 AIMO2 RECTIL，答案与解答已在网络），对照无法反映真实解题能力。数据与监控笔记保留（`eval/phase4-results-p2-A.json`、`phase4-p2-monitoring-notes.md`）；若将来要测"新题能力"，须**禁联网工具**并用**非公开题集**。

---

## 5. 技术细节

### 5.1 复用 DSH 已有机制（不重造）

- `agent-team` 任务板：claim 单所有权、revision CAS、`blocked_by` DAG、`maxMembers` 池上限（`packages/experimental/agent-team/src/{task-board,task-graph,roster}.ts`）。
- durable mailbox：`send_message`（quiet）/ `followup_task`（wakeup）（`mailbox.ts` + `tool-agent-team`）。
- subagent spawn/fork：`spawn_teammate(context=fresh|fork)`。
- `tools.restrict` / `tools.guard`：按角色裁剪工具（`core/tools/src/index.ts`）。
- `interrupt_agent`：Lead-only 打断（本次由插件以 Lead 权限代用服务 API）。
- `run_python` / `run_code`（docker 沙箱）：计算工具。

### 5.2 本项目已实现的改动

| # | 改动 | 代码位置 | 阶段 |
|---|---|---|---|
| 1 | 删 `verify_answer`/`submit_answer`，新增 `submit_task`、`submit_final_answer`（L0 + Config 范围） | `packages/aimo/verifier/src/{index.ts,answer.ts}` | Phase 0 |
| 2 | 成果消息落档（durable 消息发 Lead）+ `lean` 字段占位 | 同上 | Phase 0 |
| 3 | 角色硬裁剪插件（`restrict` + `guard`，名字前缀判角色） | `packages/aimo/team-roles/src/{roles.ts,index.ts}` | Phase 1 |
| 4 | coordinator prompt 全资源直接干 + solver/critic 模板 | `MyProject/eval/coordinator-prompt.md` | Phase 2 |
| 5 | 配置落地：`agent-team.maxMembers:16`、`aimo-verifier.answerMin/Max` | `~/.dsh-build/profiles/{web,headless}/cordis.patch.yml` | Phase 2 |
| 6 | 首完成自动终止：`siblings.ts` 分组 + Lead 权限 interrupt/delete | `packages/aimo/verifier/src/{index.ts,siblings.ts}` | Phase 3-T3 |
| 7 | 池调度工具 `claim_next_task`（认领就绪任务 / 新建副本并认领 / 返回 none）+ 副本上限 Config | `packages/aimo/pool/src/{plan.ts,index.ts}` | Phase 3-T9 |
| 8 | 分解与 fold：`decompose_task` 工具 + `fold.ts` 纯规则 + 事件驱动的 fold 扫描 | `packages/aimo/pool/src/{fold.ts,index.ts}` | Phase 3-T4 |
| 9 | 成果分享：`share.ts` 纯规则（接收者选择 + 板上注记）接入 `submit_task` | `packages/aimo/verifier/src/{share.ts,index.ts}` | Phase 3-T5 |

### 5.3 待办清单（统一编号；旧 v3 的 E1–E7 已并入本表）

| # | 待办 | 说明 | 状态 |
|---|---|---|---|
| T1 | **硬强制** | 角色级已代码强制；**残留**：solver 仍可绕过 `submit_task` 直接 raw `complete`（"必须带成果提交"仍是 prompt 纪律） | 部分完成 |
| T2 | **Lean 验证** | 实施步骤已定稿：`MyProject/Lean_Verification_Plan.md`（L0 镜像+`lean-backend` → L1 与 `submit_task` 链接轨 → L2 题面形式化库（人审+sanity）→ L3 证明修复循环 → L4 L0+Lean 级联+评测；铁律：`#print axioms` 为空、结论必须绑定题面命题）。**定位修正（差距分析结论）：Lean 优先用于中间子任务推导的验收（proof-sketch 思想），而非只验最终整数答案**。接口预留：成果 `lean` 字段、`submit_proof` 保留名、`VerificationBackend` + lean4 后端 | 待实施（方案已定稿） |
| T3 | **首完成自动终止** | 插件在 `submit_task` 成功时 interrupt + delete 同组副本 | ✅ 完成 |
| T4 | **父任务 fold 自动完成** | ✅ 已实现：`decompose_task` 建子任务并给父任务打 `[fold-parent depth=<n>]` 标记 + 设 `blockedBy`；插件在 `team/task` 事件后扫描并自动完成"标记 + 全部子任务已完成"的父任务（Lead 权限 + CAS + 级联） | ✅ 完成 |
| T5 | **按任务订阅消息投递** | ✅ 已实现：`submit_task` 成功时①把 `[result]` 注记写到板上（critic 等读板可见）②按 DAG 关系定向投递——依赖该组的 owner + 同父兄弟子任务 owner（排除提交者/copies/lead）；纯函数 `selectShareRecipients` + `resultNote` + 单测 | ✅ 完成 |
| T6 | **答案类型扩展** | 无解/存在性/证明题等，留到 Lean 版 | 待办 |
| T7 | **预算数值校准** | 初值：每 solver 提交 ≤3 次、协调轮次 ≤20；实测校准后可考虑硬编码进插件 | 待办 |
| T8 | **成果落档方式** | ✅ 已决：durable 消息发 Lead，不改 agent-team 核心 | ✅ 完成 |
| T9 | **池调度唤醒**（原 E5） | ✅ 已实现：`claim_next_task` 让成员自助取活——① 认领 ready 无主任务 ② 活跃子问题副本数 < 上限时新建副本并认领 ③ 返回 `none`（纯函数 `planNextClaim` + 单测）；唤醒纪律（Lead 每次醒来做派工检查 + `followup_task`）留在 prompt | ✅ 完成 |
| T10 | **critic 发现写回任务** | `edit` 需 owner/Lead，critic 无权 → 现在只报告给 Lead；若要写回需扩展权限或由插件代写 | 待办 |
| T11 | **按需扩张（P0）** | 把"全资源直接干"默认改为：1 个 solver 起步，仅在无进展轮次超阈值 / critic 报错 / `claim_next_task` 无人接手时扩张副本与分解；与"全资源"在同题集上对比 pass@k 与墙钟 | 待办 |
| T12 | **难题集（P1）** | 收集/构造"单次上下文装不下"的题（长链推导、大规模枚举、分而治之；含 AIMO3 ref P2——最新 DeepSeek 推理模式 3 次全炸上下文），作为团队主场评测集 | 待办 |
| T13 | **critic 升级（P3）** | critic 增加反例搜索 + 独立重证（RH 式 validator），并保留 loser 副本的中间成果供复用（Prove2Me 启示） | 待办 |
| T14 | **评测严谨化（P4）** | 多次运行报方差；失败样本诊断标注；口径纪律（"已验证 ≠ 已解决"、"编译通过 ≠ 定理成立"）；read-back 防题面漂移 | 待办 |

> 旧编号对照：E0（删 L1/L2）= Phase 0 ✅；**E1（副本 `X#1..3` 命名）= 已由 T3 升级为代码契约**；E2（fold）= T4；E3（订阅投递）= T5；E4（`submit_artifact`）= 已被 `submit_task` 取代；**E5（池调度）= T9**；E6（角色裁剪）= Phase 1 ✅；E7（Lean 后端）= T2。

### 5.4 配置说明（用户可改参数）

**结论：不需要单独 config 文件。** 所有配置都写在 profile patch（`~/.dsh-build/profiles/{web,headless}/cordis.patch.yml`），改完重启实例即生效（patch 不热加载）。DSH 的插件配置本来就走 patch 层，一个文件集中管理、可 git 版本化；若将来参数多到 patch 臃肿，再抽 `aimo.config.yml` 由小插件读入（暂不做）。

| 参数 | 位置（cordis.patch.yml） | 默认 | 改法 |
|---|---|---|---|
| 答案范围/格式 | `aimo-verifier` 的 `config.answerMin` / `config.answerMax` | 0–99999 | 改两个数字；完全自定义格式可 import 导出的 `validateAnswer` 自写工具 |
| agent 池大小 | `agent-team` 的 `config.maxMembers` | 16 | 改数字（含 coordinator） |
| 每子问题副本上限 | `aimo-pool` 的 `config.maxCopiesPerGroup` | 3 | 改数字（成员自助新建副本时由工具强制） |
| 分解宽度/深度上限 | `aimo-pool` 的 `config.maxChildren` / `config.maxDepth` | 5 / 3 | 改数字（`decompose_task` 时强制） |
| 取活方式 | 工具 `claim_next_task`（`aimo-pool`）；协调者只播种任务，不建副本 | 播种 + 自助 | 改 `eval/coordinator-prompt.md` STEP 1/2/5 |
| 提交重试 / 全局轮次止损 | coordinator prompt 的预算常数 | 提交 ≤3 次；轮次 ≤20 | 改 prompt（T7 后可硬编码） |
| 工具呈现模式 | 环境变量 `DSH_TOOLS_MODE` | both（实例 B） | 改环境变量后重启 |
| docker 沙箱资源上限 | `aimo-code-runtime-docker` 的 config（image/memory/computeMs/…） | 见 SUMMARY §3 | 改 patch 中该插件 config |

**改动生效三步**：改 patch → 重启实例（kill 3081 进程 → `DSH_HOME=~/.dsh-build DSH_TOOLS_MODE=both pnpm dsh web --port 3081 --no-open`）→ `DSH_HOME=~/.dsh-build pnpm dsh --profile web --dump-config | grep aimo` 确认。

---

## 6. 实施计划（含实施细节）

> 依赖：Phase 0 → 1 → 2 → 3 → 4 顺序执行。**0/1/2 已完成，3 部分完成（T3 ✓）。**

| 阶段 | 实施细节 | 验收标准 |
|---|---|---|
| **Phase 0** 验收器重写 ✅ | ① 旧实现归档 `MyProject/archive/verifier-v0/` → ② 删 `engine.ts`、`levels/`、`constraints/` → ③ 新增 `answer.ts`（`validateAnswer` 纯函数）→ ④ 重写 `index.ts`（`submit_final_answer` + `submit_task`）→ ⑤ 更新 tests/README/package.json/tsconfig → ⑥ `pnpm install && pnpm run build:lib:host` → ⑦ 基线冒烟 → ⑧ 重启实例 B | 单测/lint/build 过；基线 2/2；实例 B HTTP 200 |
| **Phase 1** 角色裁剪 ✅ | ① 新建 `team-roles` 包（`roles.ts` 纯策略 + `index.ts` restrict/guard + invariant）→ ② 注册 tsconfig.host/base → ③ 两个 patch 追加 insert → ④ install/单测/lint/build → ⑤ 重启实例 B → ⑥ headless 实测留档 | 三条拒绝路径生效；任务 completed revision 3 |
| **Phase 2** 协调 prompt ✅ | ① 重写 `coordinator-prompt.md`（全资源直接干 + solver/critic 模板）→ ② patch 落地池上限与答案范围 → ③ 重启 + `--dump-config` 验证 → ④ `run-phase2-check.mjs` 三题实测 | 三题 3/3；并行派工/首完成/终验均发生 |
| **Phase 3** 池与自动化 ⏳ | **① T3 ✅**：`siblings.ts` 分组 + Lead 权限 interrupt/delete（实测 3/3）→ **② T9 ✅**：`claim_next_task` + 协调者只播种、成员自助取活（三题 3/3 + 定向验证）→ **③ T4 ✅**：`decompose_task` + `fold.ts` + 事件驱动 fold 扫描（定向验证 ×3）→ **④ T5 ✅**：`share.ts` 板上 `[result]` 注记 + 定向投递（定向验证）→ ⑤ **T10**：critic 发现写回（扩展权限或插件代写） | T10 的单测 + 一次实测日志 |
| **Phase 4** 评测 ⏳ | ① 数据集：`eval/aime-baseline.json`（易 15 题）+ `eval/aimo3-reference.json`（难 10 题，由 `build-aimo3-dataset.py` 从 PDF 生成并标注题面质量）→ ② `eval/run-phase4.mjs`：三配置（A 直解 / B N 独立 / C 团队）× 数据集 × k，逐次落日志与结果 JSON → ③ token 成本从会话日志（多帧 zstd 逐帧解码）累加，含 teammate 会话 → ④ 试点运行 → ⑤ 全量运行（AIME 15×1 + AIMO3 10×3，预期数小时，建议后台常驻） | 试点跑通且指标可复算；全量结果落盘并可对照判据 |
| **不排期** Lean（T2） | `submit_task` 验 Lean：`lean` 字段启用、lean4 后端、`submit_proof` 启用、L0+Lean 级联 | 接口就绪且 Phase 0–4 稳定后启动 |

---

## 7. 变更记录

| 版本 | 日期 | 变更 |
|---|---|---|
| v1.0 | 2026-09-27 | 初版：三杠杆、角色硬裁剪、coordinator 元策略、DAG + 仲裁、分阶段落地（含 L1/L2 设计，已废） |
| v2.0 | 2026-09-27 | 探针式升档；Agent 池；子任务契约（概念已废）；分享协议；防卡死；Lean 接口（过程稿，已精简） |
| v3.0 | 2026-09-27 | 删除 L1/L2；Lean 只留接口；新增待决清单与 Step-by-step 计划（过程稿，已精简） |
| **v4.0** | 2026-09-27 | **按修正案精简**：验收重写为 `submit_final_answer()` + `submit_task()`；删除 `verify_answer`/`submit_answer`、自检脚本、仲裁、契约等废案；池 16、每任务 ≤3 agent；评测改 AIME pass@1 + AIMO3 参考题 pass@3 |
| **v4.1** | 2026-09-27 | 成果结构定稿；格式配置落点（插件 Config + 校验钩子）；首完成终止动作序列；pass@3 采样口径；失败样本分类存档；T8 成果落档 |
| **v4.2** | 2026-09-27 | **Phase 0 实施完成**：`answer.ts` + 两工具；删 L1/L2/constraints；T8 定稿；构建/lint/单测/基线全过；实例 B 重启加载 |
| **v4.3** | 2026-09-27 | **Phase 1 实施完成**：`packages/aimo/team-roles/`（纯策略 + restrict/guard），注册 tsconfig 与两个 profile；三条拒绝路径实测生效；T1 更新为"角色级已强制，残留 solver 绕过 submit_task" |
| **v4.4** | 2026-09-27 | **Phase 2 实施完成**：§3 改为"全资源直接干"；§6 补实施细节；新增 §5.4 配置说明；三题实测 3/3（含 AIMO3 P1 的 3 子任务 ×3 副本并行） |
| **v4.5** | 2026-09-27 | **Phase 3-T3 实施完成**：`submit_task` 成功自动终止同组副本（`siblings.ts` + Lead 权限 interrupt/delete），coordinator 不再手动终止；三题 3/3；证据 `eval/phase3-t3-livecheck-summary.txt` |
| **v5.0** | 2026-09-27 | **按进度整理**：新增 §0.1 进度速览；§3 每项能力补"具体如何实现"（机制 + 代码位置 + 状态）与三个运行时约束；待办统一为 T1–T10 并给出旧 E1–E7 对照（**E5 = T9 池调度唤醒**）；§5.2 改为"已实现改动"清单；修正 critic 无权 edit 任务描述的缺口（prompt 已改，记为 T10） |
| **v5.1** | 2026-09-27 | **Phase 3-T9 实施完成**：新建 `packages/aimo/pool/`（`claim_next_task`：认领就绪任务 / 新建副本并认领 / 返回 none；纯函数 `planNextClaim` + 8 组单测；Config `maxCopiesPerGroup: 3`）；协调者改为**只播种**、成员自助取活、Lead 派工唤醒（prompt 更新）；三题实测 3/3；定向验证四条路径（`eval/pool-toolcheck.log`）；会话日志统计 `created and claimed` 15 次 → T9 完成（剩余 T4/T5/T10） |
| **v5.2** | 2026-09-27 | **Phase 3-T4 实施完成**：`aimo-pool` 新增 `fold.ts` 纯规则（`[fold-parent depth=<n>]` 标记 + 可折叠任务选择 + 单测）与 `decompose_task` 工具（建子任务、打标记、设 `blockedBy`；宽度 ≤ `maxChildren`=5、深度 ≤ `maxDepth`=3）；`session/event` 驱动的 fold 扫描在子任务全完成时自动完成父任务（Lead 权限 + CAS + 级联 ≤5 轮）+ 板上审计注记；定向验证 ×3 → `eval/fold-toolcheck.log`；剩余 T5/T10 |
| **v5.3** | 2026-09-27 | **Phase 3-T5 实施完成**：`aimo-verifier` 新增 `share.ts` 纯规则（`selectShareRecipients`：依赖该组的 owner + 同父兄弟子任务 owner，排除提交者/copies/lead；`resultNote` 含 2000 字符截断）+ 单测；`submit_task` 成功时把 `[result]` 注记写到板上（critic 等读板可见）并定向投递成果消息，输出新增 `resultOnBoard`/`sharedWith`；critic prompt 改为从板上读注记；定向验证：提交方 `on board: true; shared with: solver-1`，父任务 owner 实收两条成果消息 → `eval/share-toolcheck.log`；剩余 T10 |
| **v5.4** | 2026-09-27 | **Phase 4 试点完成**：新增 `eval/build-aimo3-dataset.py` → `aimo3-reference.json`（AIMO3 10 题，含 `statement_quality`，P6 需人工校订）与 `eval/run-phase4.mjs`（A/B/C 三配置、token 成本从会话日志累加、`--rescore` 重打分）；试点 5 题：A 与 C 均 100%，但 C 成本 6.0×（易）/11.3×（难）→ **团队无正确率收益**，数据开始挑战"全资源直接干"；修正两处真实缺陷（评测器答案来源 + prompt 强制字面 `\boxed{}`）；报告 `eval/phase4-pilot-report.md` |
| **v5.5** | 2026-09-27 | **导向修订 + Lean 方案定稿**：§0/§4 判据改为"**能力与耗时优先、token 成本不计**"——C 必须在 A/B 解不出的题上胜出；新增 `MyProject/Lean_Verification_Plan.md`（L0–L4 step-by-step，含铁律与风险表）；启动 AIMO3 P2 的 A/B/C pass@3 基准（`--timeout-min` 已可配）与 OpenAI/Anthropic 方案差距分析 |
| **v5.6** | 2026-09-27 | **差距分析落定**：新增 `MyProject/Gap_Analysis.md`（一线方案可迁移成分、维度差距、P0–P4 优先级、Prove2Me/flt 评估层启示；总纲"瓶颈=缺强验收器"）；§5.3 新增 T11 按需扩张 / T12 难题集 / T13 critic 升级 / T14 评测严谨化；T2 定位修正为"Lean 优先验中间步骤" |
| **v5.7** | 2026-09-27 | **项目重新定位 + 停止基准**：§0 定位改为"前沿技术方案实践，不以公开题基准评测为目标"（公开题答案上网、联网工具泄露答案）；取消 P2 基准（已跑 A k=1 ✅ 520/379s，其余 8 次停止）；保留 `run-phase4.mjs`/`aggregate-configs.mjs` 与监控笔记，标注"将来测新题须禁联网 + 用非公开题集" |

---

*一句话总结：两个提交函数（`submit_task` 提交任务成果并自动终止同组副本、`submit_final_answer` 终验最终答案格式），一个 16 agent 的池——收到题目即播种任务、成员自助取活（`claim_next_task`）、需要时递归分解（`decompose_task`，父任务自动 fold）；角色权限、首完成终止、池调度与 fold 均已代码化，剩余待办集中在订阅投递（T5）、critic 写回（T10）与 Lean（T2）。*
