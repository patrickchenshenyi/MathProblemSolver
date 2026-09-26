# 构建 math problem solver 项目 —— 引导提示词（供另一个 dsh 会话使用）

> 用法：把本文件**全文**粘贴给一个新的 dsh 会话（该会话需能访问下面列出的路径），作为它的任务指令。
> 该会话看不到你之前的任何对话，所以本文件必须**自包含**。请让它先读"必读文件"，再按"分步任务"逐步执行。
> 每一步都有"交付物 / 验收标准 / 交付前自查"，完成一步就停下汇报，等确认后再进行下一步（除非你在消息里明确说"连续执行到第 N 步"）。

---

## 0. 角色与总体目标

你是一名在 DeepSeek Harness（DSH）上开发插件的工程师。你的任务是**从零搭建一个"数学题求解器"项目**的最小闭环，目标题是 AIME/AIMO 型**整数答案题**（答案为一个非负整数，落在 `[0, 99999]`）。

这是一个**个人技术验证项目**：不参赛、不追求生产级，重点是把"模型 + Python 工具 + 强验收器 +（后期）多 agent"这条链路跑通，并做到每步可验证、可复现、可还原。

---

## 1. 三个路径 + 两个实例（务必分清）

| 路径 | 角色 | 规则 |
|---|---|---|
| `/Users/shenyichen/Artificial Intelligence/Project/DeepSeek_Harness/deepseek-harness/` | **原 checkout**（只读，运行中的实例 A 由此构建） | 完全不碰 |
| `/Users/shenyichen/Artificial Intelligence/Project/DeepSeek_Harness/deepseek-harness-aimo/` | **工坊 clone**（你在这里写插件） | 见下方"红线" |
| `/Users/shenyichen/Artificial Intelligence/Project/AIMO/` | **项目工作区**（计划/文档/评测集） | 只读参考 + 存放项目产出 |

术语约定：下文所有"checkout 根 / clone 根"均指**工坊 clone**（`deepseek-harness-aimo/`）；"工坊实例 B" = 用 `DSH_HOME=~/.dsh-build`、`--port 3081` 起的那个独立 dsh web；你（本会话）跑在实例 A（`127.0.0.1:3080`）里，**重启 B 不影响你自己**。

### 红线（违反即失败）

1. **绝不修改 DSH 既有包（`packages/**` 里任何已存在的源码）。** 你只在工坊 clone 里"新增"自己的包 + 少量共享配置文件的**追加**（`tsconfig.host.json` 的 reference、`tsconfig.base.json` 的路径映射）。
2. 所有对 clone 的改动，先 `git switch -c aimo-plugins` 建分支再做（clone 是你的沙箱，此条是从保险起见）。
3. 改**工坊实例**的 patch（`~/.dsh-build/profiles/web/cordis.patch.yml`）**不会热加载**，每次改动后必须重启工坊实例 B 才生效。
4. 运行 dsh 相关命令时，**cwd 必须是工坊 clone 根**（`@deepseek-ai/*` 的解析依赖这一点）。
5. 验收器是**可信代码**（你写的，确定性的 sympy/mpmath 校验），**禁止用"让模型判断对错"（LLM-as-judge）当验收器**。

---

## 1.5 工坊实例（独立 clone）的搭建与重启

**一次性准备**（若还没搭好，先做这四步）：

```sh
git clone \
  "/Users/shenyichen/Artificial Intelligence/Project/DeepSeek_Harness/deepseek-harness" \
  "/Users/shenyichen/Artificial Intelligence/Project/DeepSeek_Harness/deepseek-harness-aimo"

cd "/Users/shenyichen/Artificial Intelligence/Project/DeepSeek_Harness/deepseek-harness-aimo"
pnpm install && pnpm run build

mkdir -p ~/.dsh-build
cp ~/.dsh/.credentials.yaml ~/.dsh-build/.credentials.yaml
```

**启动 / 重启工坊实例 B**（用后台任务跑，记下 job id）：

```sh
cd "/Users/shenyichen/Artificial Intelligence/Project/DeepSeek_Harness/deepseek-harness-aimo"
DSH_HOME=~/.dsh-build pnpm dsh web --port 3081 --no-open
```

- 重启 = 杀掉该后台任务再重跑上面这条；**这只影响实例 B，不影响你所在的实例 A（3080）**。
- 实例 B 的 home 是独立的 `~/.dsh-build`：profile、会话、凭据都不和 `~/.dsh` 共享。
- **插件 patch 写进实例 B 自己的 profile**：`~/.dsh-build/profiles/web/cordis.patch.yml`（**不是** `~/.dsh/...`，那是实例 A 的）。
- 更轻的验证（不起常驻 web）：`DSH_HOME=~/.dsh-build pnpm dsh --profile headless "任务"`（一次性、无端口）；`DSH_HOME=~/.dsh-build pnpm dsh --profile web --dump-config`（只看组合）。

---

## 2. 必读文件（开工前先读，按顺序）

1. `AIMO/MyProject/Project_Blueprint.md` —— 项目计划与全部已定稿决策（**最高优先级**）。
2. `AIMO/MyProject/强验收器实现.md` —— 验收器 L0/L1/L2 的实现说明（含代码骨架与设计原则）。
3. `AIMO/MyProject/项目规划建议.md` —— 架构设计原则（先造验收器、DAG 外化、失败预算）。
4. `AIMO/Related_Works/` 下四份研究文档（了解背景与"为什么这样设计"，不必逐字精读）。
5. DSH 开发文档（以下相对路径均相对**工坊 clone** 根）：
   - `docs/cookbook/adding-a-package.md`（方案 A-正式 的建包清单，**最重要**）
   - `docs/cookbook/adding-a-tool.md`（工具的完整契约）
   - `docs/user/develop/basic/index.md`（最小插件 + 加载）
   - `docs/user/develop/basic/publish.md`（bundle/profile/加载顺序，理解 patch 层）
   - `packages/core/tools/README.md`（工具注册 / Code Mode / 执行管线）
   - `packages/experimental/agent-team/README.md`（Step 6/7 用）
   - `docs/subsystems/code-runtime.md`（Step 5 用）

读完请先确认以下事实并写进你的第一次汇报：工坊 clone 的 `git status`、`pnpm --version`/`node --version`、原 checkout 是否未被改动、`~/.dsh-build/profiles/web/` 是否已初始化。

---

## 3. 已定稿决策（**不要重新讨论，直接照做**）

- 问题类型：整数答案题（不是证明 / 形式化）。
- 技术栈：Python + sympy（不是 Lean）。
- 目标形态："答对整数"（AIMO 打分口径），不是"可读证明"。
- 预算与模型：API 调用，可多模型混用（用现有运行实例已配好的 deepseek-v4-pro 即可，不必重配）。
- 验收器范围：**本期 L0 + L1 + L2**；L3/L4 不实现。**实施顺序先 L0**（先把插件整体架构立起来，预留 L1/L2 扩展点）。
- 插件工程：**方案 A-正式**——workspace 包（cookbook `adding-a-package.md`），不是独立 npm bundle；开发在独立 clone（`deepseek-harness-aimo`）上进行。
- 评测基线：**AIME 题**；不考虑训练集污染。

---

## 4. 通用交付规范（每一步都遵守）

每一步结束前，逐项确认：

1. `pnpm run typecheck`（或至少 `pnpm run build`）通过，无新增错误。
2. `git status` 显示**只新增/修改了约定文件**，未触碰任何既有 `packages/**` 源码；把改动清单写进汇报。
3. 任何涉及 patch 的改动：先用 `DSH_HOME=~/.dsh-build pnpm dsh --profile web --dump-config | grep <插件名>` 验证插件"已进入组合"（不重启）。要真正生效，重启**工坊实例 B**（杀后台任务再重跑启动命令）——这只影响 B，不影响你所在的实例 A，所以你可以放心重启、放心在 UI 里自测。
4. 用"验收标准"逐条自测并给出**可观察证据**（命令输出、测试通过数、UI 截图/文字），不要只写"应该没问题"。
5. 完成后**停下汇报**，报告模板见文末；除非指令要求连续执行，否则等确认再下一步。

---

## 5. 分步任务

### Step 0 —— 工坊环境搭建（preflight）

**目标**：搭好工坊 clone + 实例 B，确认能构建、能看清 profile 组成、原 checkout 保持不动。

**动作**
1. 读 §2 全部必读文件。
2. 按 §1.5 搭好工坊 clone（clone + `pnpm install && pnpm run build` + 复制凭据）。
3. `cd <工坊 clone 根>`，`git switch -c aimo-plugins` 建分支。
4. 起工坊实例 B（`DSH_HOME=~/.dsh-build pnpm dsh web --port 3081 --no-open`，后台任务），确认能起来、实例 A 不受影响。
5. `DSH_HOME=~/.dsh-build pnpm dsh --profile web --dump-config | grep -E "session-persistence|subagent|agent-team"`，确认 session 持久化（应为 `session-persistence-jsonl`）与 subagent provider 是否已在 base bundle 中。

**交付物**：环境勘察报告（版本、git 基线、clone build 结果、实例 B 起没起来、profile 组成、原 checkout 是否仍干净）。

**验收标准**
- [ ] 工坊 clone `pnpm run build` 成功；原 checkout 未被改动（`git status` 干净）。
- [ ] 实例 B 在 `3081` 端口可用；实例 A（3080）不受影响。
- [ ] 已建分支 `aimo-plugins`；已确认 session 持久化与 subagent provider 状态（供 Step 6 用）。

**交付前自查**：`git branch --show-current` 输出 `aimo-plugins`；dump-config 有 `session-persistence-jsonl`；`curl -s http://127.0.0.1:3081` 能访问且 `http://127.0.0.1:3080` 也仍能访问。

---

### Step 1 —— M0：最小 `run_python` 工具 + AIME 基线

**目标**：让模型能执行 Python，并在 AIME 题上量出**基线 pass@k + 错误分类**。

**动作**
1. 建第一个 A-正式包 `packages/aimo/python/`（包名 `@deepseek-ai/dsh-aimo-python`），实现一个极简工具 `run_python`：
   - `defineTool`，参数 `code: string`（必填）、`timeout_seconds: number`（可选，默认 30）；
   - execute 用 `subprocess-local` 直跑 `python3 -c <code>`（或临时文件 + `python3 <file>`），返回 stdout/stderr/退出码；
   - 输出 schema 用对象（`{ stdout, stderr, exitCode }`），render 成文本。
   - 说明：这是**临时的**（M1.5 会被 `code-runtime-docker` 替代/强化），保持 ~40 行，不要过度设计。
2. 按 cookbook `adding-a-package.md` 补齐 `package.json`/`tsconfig.json`/`README.md`，改 `tsconfig.host.json`（加 reference）与 `tsconfig.base.json`（加路径映射，参照 `experimental/agent-team` 的显式条目写法）。
3. 在 `~/.dsh-build/profiles/web/cordis.patch.yml` 加一行 `insert`（`name: '@deepseek-ai/dsh-aimo-python'`），重启工坊实例 B，验证工具出现。
4. 准备 ~15 道 AIME 整数答案题（题目 + 标准答案，存到 `AIMO/MyProject/eval/aime-baseline.json`，注明来源）。
5. 写一个可复现的基线脚本（可参考 `examples/headless-agent`，或用 harness 的 llm seam 直接调 deepseek-v4-pro + 该工具的 loop）：每道题采样 k ∈ {1, 4, 8} 次，抽 `\boxed{}` 答案，算 pass@k。
6. 对失败样本**分类**：计算错 / 漏约束 / 交不出合规答案 / 完全不会，汇总成表。

**交付物**：`packages/aimo/python/` 包；可用的 `run_python` 工具；`eval/aime-baseline.json`；一份基线报告（pass@k 数值 + 错误分类表）。

**验收标准**
- [ ] 模型在 Web UI 里能调 `run_python` 且拿到真实 Python 输出（有 stdout 证据）。
- [ ] 基线脚本可复现（同一 seed 重跑得到相同 pass@k）。
- [ ] 报告含 pass@1/4/8 与四类错误的计数，且每道题有"答案是否被正确抽取"的标记。

**交付前自查**：`pnpm run typecheck` 通过；`DSH_HOME=~/.dsh-build pnpm dsh --profile web --dump-config | grep aimo-python` 命中；`run_python` 对一段 `print(1+1)` 返回 `2`；错误分类计数之和 = 失败样本总数。

**停点**：把基线结果汇报出来（**尤其报告 deepseek-v4-pro 在 AIME 上的 pass@1 是否 >0**；若几乎全 0，说明模型/工具链有更基础的问题，先停下定位）。

---

### Step 2 —— M1-L0：验收器包骨架 + L0 逻辑 + 自测集

**目标**：立起"验收器 cordis 插件"的整体架构，实现 L0（答案校验），并在架构上预留 L1/L2 扩展点。

**动作**
1. 建包 `packages/aimo/verifier/`（包名 `@deepseek-ai/dsh-aimo-verifier`），按 cookbook 补齐。
2. 架构分层（**这是本步的核心，直接决定 L1/L2 好不好加**）：
   - `src/levels/` 目录：`l0.ts`（本期实现）、`l1.ts`、`l2.ts`（占位，导出明确接口，先返回"未实现"或空）；
   - `src/engine.ts`：一个 `verify(problemId, candidate, levels) -> Verdict` 的纯函数入口，按 level 顺序累加判定，返回结构化结果（`{ ok, level, failures[], reason }`），**不依赖任何 UI/模型**；
   - `src/index.ts`：cordis 插件，只做"工具注册 + 把 engine 接进来"。
3. 实现 L0（`l0.ts`）：抽 `\boxed{}` → 去逗号/空格 → 校验整数且在 `[0,99999]`；失败给出明确 reason。逻辑对齐 `AIMO/MyProject/强验收器实现.md` §1。
4. 注册两个工具（对齐 `强验收器实现.md` §6）：
   - `verify_answer(problem_id, candidate)`：模型可直接调，返回结构化判定；
   - `submit_answer(problem_id, candidate)`：内部跑 `engine.verify`，**只有通过才返回"已接受"**（这是将来的提交门槛；本期门槛= L0 通过）。
5. 写自测集 `tests/verifier.test.ts`（或 node 测试脚本），**三类样本**：
   - 正确（合法整数答案）→ ACCEPT；
   - 错误（越界、非整数、无 boxed）→ REJECT；
   - 作弊（如 `\boxed{答案见上一题}`、空字符串、`\boxed{-3}`）→ REJECT。
6. 构建、加载（在 `~/.dsh-build/profiles/web/cordis.patch.yml` insert `@deepseek-ai/dsh-aimo-verifier`）、重启工坊实例 B、dump-config 验证。

**交付物**：`packages/aimo/verifier/` 包（含 engine/levels 分层）；`verify_answer` + `submit_answer` 两个工具；自测集全绿。

**验收标准**
- [ ] `engine.verify` 是纯函数，L1/L2 可在不改 `index.ts` 的情况下作为新 level 接入（用代码结构证明：新增 level 只需改 `levels/` + engine 的 level 列表）。
- [ ] 自测集三类全部通过（正确→ACCEPT，错误→REJECT，作弊→REJECT）。
- [ ] 两个工具在 Web UI 可见；`submit_answer` 对越界答案返回拒绝。

**交付前自查**：`pnpm run typecheck && pnpm run build` 通过；自测集 100% 通过；`DSH_HOME=~/.dsh-build pnpm dsh --profile web --dump-config | grep aimo-verifier` 命中；`git status` 仅新增约定文件。

**停点**：汇报架构分层 + 自测结果，确认"engine/levels 分层"是否满足后续 L1/L2 扩展（这一步错了后面返工大）。

---

### Step 3 —— M1-L1：约束满足校验

**目标**：加入 L1——把题目的全部约束编译成 sympy 谓词，验证候选答案。

**动作**
1. 在 `levels/l1.ts` 实现：`verify(problemId, candidate) -> failures[]`。约束谓词是**人手写的 ground truth**（不是模型生成），每道题一个谓词函数。
2. 为基线题集（至少 5 道）逐题手写约束谓词，存 `eval/constraints/<problemId>.py` 或内联在 TS 里（选一种，说明理由），并给每道题配"正确样例 + 一个只过 L0 但违反约束的错误样例"的单测。
3. 验收器的 sympy 执行是**可信代码**，用普通 `python3` 子进程跑即可（**不要**为此提前做 `code-runtime-docker`，那是给模型代码用的）。
4. 把 L1 接进 `engine.verify` 的 level 列表；`submit_answer` 门槛升级为"L0 + L1 都通过"。

**交付物**：`levels/l1.ts`；≥5 道题的约束谓词 + 单测；engine 已级联 L1。

**验收标准**
- [ ] 一个"答案在范围内但不满足某条约束"的提交被 REJECT，且 failure 明确指出是哪条约束。
- [ ] 每道题的约束谓词有单测，正确样例 ACCEPT、错误样例 REJECT。

**交付前自查**：新增单测全绿；`submit_answer` 对"漏约束"类作弊返回拒绝；约束谓词完全由确定性 sympy 判定（无模型参与）。

---

### Step 4 —— M1-L2：数值 / 符号交叉验证

**目标**：加入 L2 的四个独立检查，完成本期验收器全量。

**动作**
1. `levels/l2.ts` 实现四类检查（对齐 `强验收器实现.md` §3）：
   - (a) sympy 恒等验证（`simplify(lhs - rhs) == 0`）；
   - (b) mpmath 高精度数值验证（两边各算 50~100 位比对）；
   - (c) 反例搜索（"最小性/唯一性"类主动暴力搜）；
   - (d) 独立重证（另一模型/确定性算法重算，比对答案）。
2. 至少 (a)(c) 落地为自动化检查并接进 engine；(b)(d) 可先做但注明触发条件。
3. 扩展自测集：加"计算错但格式对"的样本，验证 L2 能抓出 L0/L1 抓不出的错。

**交付物**：`levels/l2.ts`；engine 级联 L0+L1+L2；扩展后的自测集。

**验收标准**
- [ ] 存在一个"L0/L1 通过、但 L2 判错"的用例且被正确 REJECT（证明 L2 有增量价值）。
- [ ] 反例搜索对"最小性"类题能抓到更小的合法解（若有）。

**交付前自查**：全自测集绿；`engine.verify` 输出结构稳定（`{ok, level, failures[], reason}` 语义不变）。

**停点**：汇报"L0+L1+L2 验收器"整体验收结果（用 §6 的验收器测试集口径）。

---

### Step 5 —— M1.5：`code-runtime-docker`（Python 容器后端）

**目标**：把"模型跑 Python"从临时 `run_python` 升级为容器隔离的 code-runtime provider。

**前置**：到达本步前先汇报 Step 4 成果，确认再做（本步是独立工作，可与 Step 6 解耦）。

**动作**
1. 建包 `packages/aimo/code-runtime-docker/`，实现 `ctx.codeRuntime` 的 provider：`language: 'python'`、`isolation: 'container'`（对齐 `docs/subsystems/code-runtime.md` 的 `CodeRunRequest/CodeRunResult`）。
2. 用 `docker run --rm --network none --read-only --memory=<上限> --cpus=<上限> --pids-limit=<上限> --tmpfs /tmp` 跑一个预装 sympy/numpy/mpmath 的镜像（Dockerfile 存 `AIMO/MyProject/docker/`）。
3. 返回 `{ value, logs, error? }`；实现**双超时**（docker `--stop-timeout` + 程序级 wall 超时）；把模型输出当**敌对输入**校验（照抄 worker-thread 后端的防御哲学）。
4. 验证：跑死循环 / 大内存分配 / 联网尝试（应被 `--network none` 挡掉）三类恶意样例，确认不拖垮宿主。
5. 用 `code-runtime-docker` 替换临时 `run_python`（`tools` Code Mode 的 Python renderer 已内置，provider 一到位 `run_code` 与 SDK 生成即生效，见 `core/tools` README）。

**交付物**：`packages/aimo/code-runtime-docker/` + Dockerfile；替换后的 Python 执行链路。

**验收标准**
- [ ] 死循环在预算内被终止、OOM 不拖垮宿主、`--network none` 下无法联网（有证据）。
- [ ] 模型侧 `run_code` 可用且返回 `{value, logs, error}`。
- [ ] 明确记录资源上限值与超时值。

**交付前自查**：三类恶意样例全部被隔离；正常 sympy 计算返回正确 `value`。

---

### Step 6 —— M2：agent-team 前置确认 + 任务 DAG + 提交门槛

**目标**：把验收器接成 agent-team 的"提交即校验"门槛，并把计划外化成任务 DAG。

**动作**
1. 确认前置（Step 0 已查）：session 持久化 + continuable subagent provider 都在（`DSH_HOME=~/.dsh-build pnpm dsh --profile web --dump-config`）。
2. 用 `experimental/agent-team`（`ctx.agentTeams`）做共享任务板：一道题 = 一个 task，`blockedBy` 表达子目标依赖，形成 DAG。
3. 把 `submit_answer` 接成门槛：**只有 `engine.verify` 全过，才允许把对应 task 置为 `completed`**（复刻 Prove2Me"提交 = 机器验收通过才被接受"）。验收不过只写失败原因，不改 task 状态。
4. 单进程内先验证：一个 task 的提交被拒后，状态保持 pending/in_progress。

**交付物**：DAG 化的任务板 + 验收器门槛；一个"提交被拒"的可复现演示。

**验收标准**
- [ ] 提交非法答案时 task 不被置 completed，且有失败原因可查。
- [ ] task DAG 的依赖关系（`blockedBy`）能正确表达"子目标完成后主目标才 ready"。

**交付前自查**：dump-config 确认 agent-team 激活；手动跑一遍"提交→拒绝→重试→通过"全流程。

---

### Step 7 —— M3/M4：最小多 agent 闭环

**目标**：1 个 coordinator + 3~8 个按功能分派的子 agent，通过共享产物（提交 + 验收）协作解一道题。

**动作**
1. **并发限流：本期不需要专门实现**（依据见本步末尾"并发限流说明"）。DeepSeek 当前**只按并发量限流**（v4-pro 默认 500、按账号，两模型独立，**无 TPM/RPM 限制**），本项目峰值并发 ~9，余量 ~50 倍；429 重试已由 DSH 内置（`llm-retry` 指数退避）。只需确认重试生效、预留升级口，**不写额外代码**。
2. 用 `subagent` 家族 + `agent-team` 的 `spawnTeammate` 建角色（proposer / solver / verifier / writer），**按功能给不同工具与可见数据**，不搞"身份表演"。
3. 通信主通道 = 提交到共享任务板 + 机器验收；**禁止自由聊天式通信**（对齐 `AI数学Agent协作机制与Prove2Me详解.md` §2）。
4. 显式失败预算：预留约一半子 agent 允许失败，失败不报错、不进死循环。
5. 端到端跑通**一道** AIME 题：coordinator 拆子目标 → solver 解 → verifier 验收 → 汇总出 `\boxed{}` 答案。

**交付物**：可复现的多 agent 单题闭环 + 一条完整运行日志。

**验收标准**
- [ ] 验收器能抓出 solver 的错并让其重试（有日志证据）。
- [ ] 至少解对一道 AIME 题，且答案由验收器通过、非模型自述。

**交付前自查**：日志里能区分"哪些提交通过 / 哪些被拒"；无死循环；崩溃可续跑（重启后状态从落盘恢复）。

#### 并发限流说明（本期不做专门实现，仅预留升级口）

- **DeepSeek 限流策略（官网口径）**：只按**并发量**限流，v4-pro 默认 500、v4-flash 2500，按账号、两模型独立；**不限制 TPM、RPM**。
- **本项目峰值并发 ~9**（1 coordinator + 3~8 子 agent，每个 agent 请求串行），远低于 500 → **不需要 key 池**（同账号多 key 共享配额）、**不需要限流网关**。
- **429 重试已内置**：`dsh-llm-retry` 在 agent 边界做指数退避 + 抖动重试（默认 5 次）。Step 0 的 dump-config 里确认它在 base bundle 即可，无需自写。
- **预留升级口（唯一要记住的）**：若将来扩到上百 agent、或实测频繁 429，用 `DEEPSEEK_BASE_URL=http://127.0.0.1:<port>` 指到一个"并发限流网关"（只控制放行并发数、超限回 429 交给内置重试），**不改 DSH 任何代码**。届时再实现，当前不写。

---

## 6. 整体完成定义（全部步骤达成后）

- [ ] `pnpm run build` 全绿；`git status` 只含约定新增文件，既有 `packages/**` 源码零改动。
- [ ] 验收器（L0+L1+L2）对 §验收器测试集（正确/错误/作弊）三类全部判定正确。
- [ ] 模型在容器隔离下跑 Python，恶意样例被隔离。
- [ ] 一条端到端链路跑通：coordinator 拆题 → solver 用工具解题 → 提交 → 验收器把关 → 汇总 `\boxed{}` 答案。
- [ ] 全程可还原：`git switch <原分支>` + `pnpm install && pnpm run build` 能重建原版 DSH。

---

## 7. 已知坑（务必注意，都是踩过的）

1. **patch 不热加载**：改 `~/.dsh-build/profiles/web/cordis.patch.yml` 后必须重启工坊实例 B。
2. **cwd 依赖**：一切 dsh 命令从**工坊 clone 根**跑，否则 `@deepseek-ai/*` 解析失败。
3. **凭据不共享**：实例 B 的 home 是独立的 `~/.dsh-build`，模型调用需要 key——已通过 `cp ~/.dsh/.credentials.yaml ~/.dsh-build/.credentials.yaml` 复制（§1.5）。若模型报鉴权错误，先查这里。
4. **patch 位置**：插件 patch 写进 `~/.dsh-build/profiles/web/cordis.patch.yml`（实例 B 的 profile），**不是** `~/.dsh/...`（那是实例 A 的）。
5. **`experimental/agent-team` 是 `private: true` 且路径映射是显式条目**（不靠 `@deepseek-ai/dsh-*` 通配）；建新包加路径映射时照抄它的写法，加完立刻 `pnpm run typecheck`。
6. **agent-team 静默不激活**：缺 durable session 持久化或 continuable subagent 就不挂载，先用 dump-config 确认。
7. **`code-runtime-python` 只有协议、没有执行路径**：容器后端要自己实现执行（Step 5）；但 `tools` 的 Python renderer 已内置，provider 一到 `run_code` 就免费。
8. **验收器是确定性代码**：约束谓词手写作 ground truth，禁止 LLM-as-judge；L0–L2 验答案不验推理（范围边界）。
9. **模型生成代码/输出一律当敌对输入**：校验、限制、超时、断网、只读挂载都要有。
10. **实例隔离**：你跑在实例 A（3080），工坊改动/重启都作用于实例 B（3081）。**永远不要重启 3080 那个实例**；只有涉及 3080 的操作才需要请人类处理。

---

## 8. 每步结束的报告模板

```
## Step N 完成汇报
- 交付物清单（文件路径）
- 验收标准逐条核对结果（[x]/[ ] + 证据）
- 交付前自查结果（命令输出摘要）
- git 改动清单（git status / diff --stat）
- 遗留问题 / 下一步依赖
- 是否继续下一步？（等确认）
```
