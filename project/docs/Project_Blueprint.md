# math problem solver 项目计划

> 修订于 2026-09-19（五稿）：验收器范围定稿 L0+L1+L2；已定稿问题类型 / 技术栈 / 目标形态 / 预算模型；基线改用 AIME；开发环境定为"独立 clone + 独立 DSH_HOME + 独立端口"的工坊实例；§8 增补 API key 池。依据对 DSH checkout 的核对与研究文档（`MyProject/项目规划建议.md`；`Related_Works/` 下 `2026-AI数学突破方法拆解.md`、`AIMO3-方案综述.md`、`AI数学Agent协作机制与Prove2Me详解.md`、`flt-navier-stokes-evaluation-layer.md`、`AIMO3_Reference_Problems.pdf`）补全。

## 总体目标

以做出 Kaggle AIMO 类型的题目为目标，但不参加 Kaggle，不需要考虑 Kaggle 的约束（断网 / 5 小时 / 单卡 / 限定模型 / notebook 提交）。
关注于技术验证，不用于实际生产。

## 一条总原则（放最前面）

**验收器的强度决定自治程度，先造验收器，再堆 agent。**
个人项目的瓶颈不是并发数，而是"能否让机器判定一条提交是否正确、且判定独立于任何模型说法"。
因此验收器（见 §5）是第一优先级，必须在多 agent 之前完成（M1 在 M3 之前）。

---

## 项目模块

### 1. 总体架构

- 基于 deepseek harness（Cordis）实现，所有功能均作为 cordis 插件提供。
- "不修改运行中的 harness" 的操作化定义：
  - 不修改 DSH 既有包（`packages/**`）的源码；
  - 只新增自己的包/插件，走 cookbook `adding-a-package.md` 的正式流程（独立 package.json / tsconfig / README + `pnpm run build`），不再依赖 scratch-plugin 的绝对路径 hack；
  - 加载方式：`cordis.yml` 的 `insert` 或 `dsh plugin add` 装进 profile，重启 / rebuild 后生效。
- 开发环境：在**独立 clone**（`deepseek-harness-aimo`）+ 独立 `DSH_HOME`（`~/.dsh-build`）+ 独立端口（`3081`）上开发与重启（"工坊实例"）；原 checkout（`deepseek-harness/`）只读不动。详见"插件工程"一节。
- 现实约束：插件的运行时 `@deepseek-ai/*` import 依赖 clone 的 tsconfig paths 映射（按进程 cwd 生效），开发期必须从 clone 根 `pnpm dsh web` 启动。
- 复用优先：agent 协作、任务 DAG、持久化直接用 `experimental/agent-team` 与 `subagent` 家族，不自造通信 / DAG 基础设施。

### 2. 工具调用

- 使用 deepseek-v4-pro 原生工具调用（`tools.mode: native`，DSH 默认，已可用）。
- Python 代码执行（sympy / numpy / math）：实现一个 `code-runtime-docker` provider，注册在 `ctx.codeRuntime`（`language: python`、`isolation: container`）：
  - `docker run` 隔离（内存 / CPU / pids 上限、`--network none`、`--read-only`、tmpfs），使用预装 sympy / numpy 的镜像；
  - 复用 `code-runtime-python` 的 fd 3 JSON-lines wire protocol，返回 `{ value, logs, error? }`；
  - 双超时（docker `--stop-timeout` + runtime 层的 `computeMs` / `maxWallMs` 语义）；
  - 防御性：把模型代码 / 入站帧当敌对输入处理（照抄 worker-thread 后端的校验哲学）。
  - 说明：DSH 已内置 Python Code Mode renderer，provider 到位后，模型侧 `run_code` 工具与 SDK 生成免费获得。
- M0 阶段的临时方案：先用一个最小 `run_python` 工具（`defineTool` + `subprocess-local` 直跑 `python3 -c`）把"模型能跑 Python"解锁，M1.5 再用 `code-runtime-docker` 硬化（先能用、再隔离）。
- MCP 服务器：暂不需要。DSH 的 mcp 是 client（消费外部 MCP 工具）；自己的工具用 cordis 插件（`defineTool`）即可。MCP 仅在未来需要对接外部工具生态（如第三方 Lean 工具）时再引入。

### 3. Skills

- DSH 有 skills 子系统（`skill-filesystem` + `tool-skill`），数学 skills 可直接提供。
- 克制使用，仅两类值得做：
  1. 格式 / 约束合规类（消除"会做但交不出合规答案"的零分，如"答案须模 10^5"）；
  2. 专用工具的操作性知识（sympy / Lean 惯用法）。
- 每个 skill 必须经固定验证集实测（加了是否提升 pass@k），无收益就删。

### 4. Agents

- 模仿 OpenAI / Anthropic：中心编排 + 子 agent，角色按功能分派（proposer / solver / verifier / writer），显式失败预算（预留约一半 agent 允许失败）。
- 实现：用 `subagent` 家族（spawn / fork + `tool-subagent`）+ `experimental/agent-team`（roster / mailbox / task DAG），不重写。
- 通信规则：分享 = 提交，验收 = 校验，发现 = 检索；避免自由聊天式通信。
- Prove2Me：走 Lean 形式化路线才引入 Prove2Me 本身；走整数答案路线只抄其架构（DAG + 提交即校验 + milestones），验收器用 sympy / 数值校验替代 Lean。
- 规模：先做"1 coordinator + 3~8 子 agent + 强验收器"的最小闭环，不堆 swarm。

### 5. 验收器（最高优先级）——最终实现范围：L0 + L1 + L2

- 目标：机器可判定"提交正确 / 错误 / 作弊"，判定独立于模型说法、可复现。
- **本期实现（L0–L2）**：
  - L0 答案校验（整数范围 / 格式）；
  - L1 约束满足校验（把题目所有约束编码成 sympy 谓词验证候选答案；固定题集下约束谓词**手写**作 ground truth）；
  - L2 数值 / 符号交叉验证（sympy 恒等 + 高精度数值验证 + 反例搜索 + 独立重证比对）。
- **不在本期范围（未来可选）**：
  - L3 分步证明检查；
  - L4 形式化（Lean 4 + Mathlib + 公理审计 + comparator / read-back + 独立内核）。
- 交付判据：验收器能对"正确 / 错误 / 作弊（答案越界、不满足约束、硬编码蒙对）"给出可靠判定。
- 实施顺序：先实现 **L0**，专注把"验收器 cordis 插件"的整体架构立起来（工具注册 + 提交门槛 + 自测集），并在架构上预留 L1/L2 的扩展点；随后逐级补 L1、L2。
- 实现细节见 `MyProject/强验收器实现.md`。

### 6. 持久化与可恢复（新增）

- 中间状态全部落盘（DSH session 日志 + agent-team 的 durable mailbox / task），崩溃 / 超时可恢复续跑。
- 长周期任务的状态外化：DAG 存盘，不存进某个 agent 的脑子里。
- ⚠️ 前置检查（M2/M3 之前）：`agent-team` 是 experimental，且需要"durable session 持久化 + continuable-subagent"服务才会激活，缺一个就静默不挂载。确认方法：`dsh --dump-config`（或 `pnpm dsh --dump-config`）检查是否存在 `session-persistence-jsonl`（base bundle 默认已含）与 subagent provider；未挂则先补 profile。

### 7. 评测与度量（新增）

- 基线用 **AIME 题**（不用 AIMO 真题）；本个人项目以技术验证为目标，**不考虑训练集污染**问题（unseen 题集难找，且不追求评测纯度）。
- 报 pass@k、多 seed、可复现；不做单次分数判断。
- M0 的产出 = 基线 pass@k + 失败样本分类（计算错 / 漏约束 / 交不出合规答案 / 完全不会），据此决定 L1/L2 里哪一档最值钱。
- 借鉴 SKobayak：建"失败样本 → 交叉标注失败原因 → 针对性改进"的循环。

### 8. 模型与预算（新增）

- 预算与模型已定稿：**API 调用，可多模型混用**。保持模型可换（llm seam 多 provider），不把 harness 绑死单一模型；deepseek-v4-pro 是否够强需实测验证。
- token 预算 / 限流是第一约束（参考量级：FLT 约 60 亿 token、RH 约 3100 万 token）。
- **并发限流（已确认，本期免做）**：DeepSeek 限流策略是**只按并发量**（v4-pro 默认 500、v4-flash 2500，按账号、两模型独立），**不限制 TPM/RPM**。本项目峰值并发 ~9（1 coordinator + 3~8 子 agent），远低于 500，故**不需要 key 池、不需要限流网关**；429 重试已由 DSH 内置（`llm-retry`）。预留升级口：将来若扩到上百 agent 或频繁 429，用 `DEEPSEEK_BASE_URL` 指到一个并发限流网关即可（不改 DSH）。详见 `Implementation_Plan.md` Step 7。

---

## 里程碑

| 里程碑 | 目标 | DSH 落地 |
|---|---|---|
| M0 | 基线：单模型 + 临时 `run_python`，在 AIME 题上测 pass@k + 错误分类 | 临时 `defineTool`（subprocess 版 run_python）+ 原生调用 |
| M1 | 验收器 L0+L1+L2 + 自测集 | verifier 插件 + 作为提交门槛 |
| M1.5 | Python 执行 | `code-runtime-docker` provider |
| M2 | 任务 DAG + 持久化 | agent-team task board |
| M3 | 1 coordinator + 3~8 子 agent | subagent + agent-team `spawnTeammate` |
| M4 | 提交即校验的通信 | agent-team mailbox + verifier 门槛 |
| —（不在本期） | 形式化 L3 / L4 | 不实现，留作未来可选 |

## 插件工程：构建 / 加载 / 卸载（方案 A-正式，在独立 clone 上进行）

插件作为**工坊 clone（`deepseek-harness-aimo/`）**内的 workspace 包实现（cookbook `docs/cookbook/adding-a-package.md`）。**原 checkout（`deepseek-harness/`）只读不动**——所有开发、构建、重启都在 clone 里，从而彻底不影响运行中的原版 dsh。

### 一次性准备

```sh
# 1. clone 工坊 checkout（与原件并列）
git clone \
  "/Users/shenyichen/Artificial Intelligence/Project/DeepSeek_Harness/deepseek-harness" \
  "/Users/shenyichen/Artificial Intelligence/Project/DeepSeek_Harness/deepseek-harness-aimo"

# 2. 装依赖并构建（第一次较慢）
cd "/Users/shenyichen/Artificial Intelligence/Project/DeepSeek_Harness/deepseek-harness-aimo"
pnpm install && pnpm run build

# 3. 复制凭据到工坊实例的独立 home
mkdir -p ~/.dsh-build
cp ~/.dsh/.credentials.yaml ~/.dsh-build/.credentials.yaml
```

### 启动 / 重启工坊实例 B

```sh
cd "/Users/shenyichen/Artificial Intelligence/Project/DeepSeek_Harness/deepseek-harness-aimo"
DSH_HOME=~/.dsh-build pnpm dsh web --port 3081 --no-open
```

重启 = 杀掉该后台进程后重跑上面这条；实例 A（`127.0.0.1:3080`）完全不受影响。

### 会改动的文件（都在 clone 里，原 checkout 零改动）

- 新建包目录 `packages/aimo/verifier/`（建议新建 `aimo` group 聚合本项目插件；也可复用 `experimental`）；
- `tsconfig.host.json`：`references` 加 `{ "path": "./packages/aimo/verifier" }`（每个包一行，必须）；
- `tsconfig.base.json`：为包名加一条路径映射（显式条目，参照 `experimental/agent-team` 的写法）或按 cookbook 在 `@deepseek-ai/dsh-*` 通配里加 `./packages/aimo/*/src` 候选；
- `knip.json`：一般不用动。

> 包目录/命名、package.json 不变量（`private: true`、`type: module`、`main: lib/index.js`、`types: lib/types/index.d.ts`、`@deepseek-ai/cordis` 同时进 peerDependencies 与 devDependencies 等）以 cookbook §1 为准；加完跑 `pnpm run typecheck` 验证路径映射正确。

### 构建新版

```sh
cd "/Users/shenyichen/Artificial Intelligence/Project/DeepSeek_Harness/deepseek-harness-aimo"
pnpm install                            # 注册新包（workspace link 进 node_modules）
pnpm run build                          # 构建（产出新包的 lib/）
pnpm run typecheck && pnpm run lint     # 类型 + lint
# 收尾完整校验：pnpm run doc-sync && pnpm run constraints && pnpm run hygiene
```

日常迭代只需 `pnpm run build`（或 `pnpm run typecheck`）。

### 加载到工坊实例 B

在**工坊实例的 web profile** 的 patch 层加一行（路径 `~/.dsh-build/profiles/web/cordis.patch.yml`，**不是** `~/.dsh/...`）：

```yaml
- insert:
    - id: aimo-verifier
      name: '@deepseek-ai/dsh-aimo-verifier'
```

然后重启工坊实例 B。**改 patch 不会热加载，必须重启**。加载后用 `DSH_HOME=~/.dsh-build pnpm dsh --profile web --dump-config | grep aimo` 确认已挂载。

### 卸载 / 还原

- 仅停用：删掉 `~/.dsh-build/profiles/web/cordis.patch.yml` 里那行 `insert`，重启工坊实例 B。
- 彻底移除：删 clone 里的 `packages/aimo/verifier/`，`git checkout -- tsconfig.host.json tsconfig.base.json`，再 `pnpm install && pnpm run build`。
- 还原原版 dsh：**原 checkout 从未被改动，无需任何还原**；想让 clone 回到干净态，`git switch <原分支>` + `git clean -fd packages/aimo` 即可。

## 已定稿决策

- 问题类型：整数答案题（不是证明 / 形式化）。
- 技术栈：Python + sympy（不是 Lean）。
- 目标形态："答对整数"（AIMO 打分口径），不是"可读证明"。
- 预算与模型：API 调用，可多模型混用。
- 评测基线：AIME 题；不考虑训练集污染。
- 插件工程路线：方案 A-正式（workspace 包，cookbook `adding-a-package.md`），开发在独立 clone（`deepseek-harness-aimo`）+ 工坊实例（`DSH_HOME=~/.dsh-build`、端口 `3081`）上进行。详见下文"插件工程"一节。

## 仍待定（仅小项，不阻塞）

- 包 group 归属（新建 `packages/aimo/` 或复用 `experimental`）。
- 评测题集的具体构成（哪些 AIME 题、多少道）。
- Docker 镜像的依赖清单与资源上限。
