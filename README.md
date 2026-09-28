# AIMO Math Solver

基于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）的数学题求解器：
**deepseek-v4-pro + Python/sympy 工具 + 可判定验收器 + 多 agent 协作**，目标是解 AIME / AIMO3 型整数答案题。

**定位**：前沿方案的技术验证（研究 OpenAI / Anthropic / DeepSeek 的验证器、搜索、agent 协作、形式化路线并落地实测）。**不参加 Kaggle、不做生产部署、不以公开题刷分为目标**——公开题答案已在网上，联网工具会泄露答案。

本仓库**自包含**：DSH 源码、本项目插件、沙箱镜像定义、profile 配置、评测工程、设计文档都在里面。
`git clone` + 一个 API key 即可重建（详见「一键重建」）。

---

## 目录

| 路径 | 内容 |
|---|---|
| `harness/` | DSH 源码 **0.1.1-rc.2**（vendored 快照）+ 本项目 5 个插件（`packages/aimo/*`） |
| `project/setup.sh` | 一键重建脚本（构建 harness → 沙箱镜像 → 初始化 `DSH_HOME` → 建插件符号链接 → 校验组合） |
| `project/config/cordis.patch.yml` | profile patch：禁用 base 代码运行时 + 加载 7 个插件行 |
| `project/docker/` | 模型代码沙箱镜像（`Dockerfile` + `bootstrap.py`，预装 sympy / numpy / mpmath） |
| `project/docs/` | 8 篇设计文档（蓝图 / 实现计划 / 验收器 / 部署 / 差距分析 / Lean 方案 / 改进计划） |
| `project/research/` | 第三方研究资料（4 篇方法拆解 + AIMO3 参考题 PDF，署名见 `THIRD_PARTY.md`） |
| `eval/` | 评测工程：Phase 0–4 的 runner、数据集、结果 JSON、运行日志、prompt、报告 |
| `eval/notes/` | 求解过程中的独立复算脚本与推导笔记（支撑评测结论的可复现附件） |
| `archive/verifier-v0/` | 已废弃的验收器 v0（L0+L1+L2 三级瀑布），仅存档 |
| `scripts/sync-from-workshop.sh` | 从工坊实例同步插件/配置/文档/评测到本仓库（避免再次分叉） |

---

## 前置

- Node.js 20+（推荐 22 LTS）
- pnpm
- Docker（Linux: Docker Engine；macOS/Windows: Docker Desktop）
- 一个 DeepSeek API key（有额度）

## 一键重建

```sh
./project/setup.sh
```

依次执行：检查前置 → `harness/` 内 `pnpm install && pnpm run build` → 构建沙箱镜像 `aimo-python-runtime:latest`
→ 初始化 `DSH_HOME`（写 profile patch、提示输入 API key、建 7 个插件符号链接）→ 打印已挂载的插件组合。

然后启动：

```sh
cd harness && pnpm dsh web
```

默认 `http://127.0.0.1:3080`。

### 与工坊实例共存

`DSH_HOME` 与端口都可覆盖，因此本仓库可以和开发用的工坊实例并行跑，互不影响：

```sh
cd harness && DSH_HOME=~/.dsh-build pnpm dsh web --port 3081 --no-open
```

## 手动重建（等价步骤）

```sh
# 1) 构建 harness
cd harness && pnpm install && pnpm run build

# 2) 沙箱镜像
docker build -t aimo-python-runtime:latest ../project/docker

# 3) 配置 DSH_HOME
mkdir -p ~/.dsh/profiles/web ~/.dsh/profiles/node_modules/@deepseek-ai
cp ../project/config/cordis.patch.yml ~/.dsh/profiles/web/cordis.patch.yml
#    + 写 ~/.dsh/.credentials.yaml（见下）
#    + 建 7 个插件符号链接（照 setup.sh 的 link 段）

# 4) 启动
pnpm dsh web
```

### API key

key **不入库**。写入 `~/.dsh/.credentials.yaml`：

```yaml
version: 1

refs:
  DEEPSEEK_API_KEY: sk-你的key
```

## 跑评测

`eval/` 里的 runner 默认指向**仓库内**的 `harness/` 与 `~/.dsh`，可用环境变量改指工坊实例：

```sh
# 基线：AIME pass@k（headless profile）
node eval/run-baseline.mjs 3 4                 # 前 3 题 × 4 次采样

# Phase 4 三配置对照：A 单模型直解 / B 独立直解 ×N / C 团队
node eval/run-phase4.mjs --config C --dataset aimo3 --k 1 --ids aimo3-ref-02 --tag p2-C

# 汇总各配置
node eval/aggregate-configs.mjs p2-A p2-B p2-C

# 由 PDF 重建 AIMO3 题集（需 pip install pypdf）
python3 eval/build-aimo3-dataset.py
```

指向别的 checkout / home：

```sh
AIMO_HARNESS=/path/to/deepseek-harness-aimo DSH_HOME=~/.dsh-build node eval/run-phase4.mjs --config A
```

> 数据集：`eval/aime-baseline.json`（AIME 题）、`eval/aimo3-reference.json`（AIMO3 参考题，由 `project/research/AIMO3_Reference_Problems.pdf` 抽取，
> 每题带 `statement_quality` 标记，`needs-review` 者不可直接信）。**不考虑训练集污染**——本项目不追求评测纯度，追求机制验证。

---

## 架构

```
     ┌──────────────────── dsh web (127.0.0.1:3080) ────────────────────┐
     │  agent-team（16 人池 + 共享任务 DAG）                            │
     │                                                                  │
     │   coordinator(Lead) ──播种任务──> 任务板 ──claim_next_task──> solver ×N
     │        │                              ▲                        │
     │        │ 监控 / 唤醒 / 终验            │ 提交即校验             │ submit_task
     │        ▼                              │                        ▼
     │   submit_final_answer ──> aimo-verifier（L0 格式+范围）   critic（独立复核，只报告）
     └───────────────────────────────┬──────────────────────────────────┘
                                     │ ctx.codeRuntime
                                     ▼
                     aimo-code-runtime-docker ──> aimo-python-runtime 容器
                     （--network none / --read-only / tmpfs / 内存·CPU·pids 限额）
```

### 5 个本项目插件

| 包 | 目录 | 作用 |
|---|---|---|
| `@deepseek-ai/dsh-aimo-verifier` | `packages/aimo/verifier` | `submit_final_answer`（L0：`\boxed{}` 取整数 + 范围可配）+ `submit_task`（owner/CAS 校验、成果投递 Lead、自动终止同组副本） |
| `@deepseek-ai/dsh-aimo-team-roles` | `packages/aimo/team-roles` | 按角色硬裁剪工具面（lead/solver/critic，未知角色 fail-closed）；deny 即对模型不可见 |
| `@deepseek-ai/dsh-aimo-pool` | `packages/aimo/pool` | `claim_next_task`（自助取活 + 副本上限 + 分组与 verifier 同源）+ `decompose_task`（父任务 fold 自动完成） |
| `@deepseek-ai/dsh-aimo-python` | `packages/aimo/python` | 临时 `run_python` 工具（M0 解锁；被容器运行时取代） |
| `@deepseek-ai/dsh-aimo-code-runtime-docker` | `packages/aimo/code-runtime-docker` | `ctx.codeRuntime` 的容器后端，替换 base 的 worker-thread 实现 |

另加载 DSH 自带的 `agent-team` / `tool-agent-team`（任务 DAG + mailbox），共 7 行 insert，见 `project/config/cordis.patch.yml`。

---

## 现状与结论（截至 2026-09-28）

| 事项 | 状态 | 证据 |
|---|---|---|
| M0 基线（单模型 + `run_python`，AIME pass@k + 失败分类） | ✅ | `eval/baseline-results-*.json` |
| M1 验收器（v0：L0+L1+L2） | ⚠️ 已被重写取代 | `archive/verifier-v0/` |
| M1 验收器（现版：L0 格式/范围 + `submit_task` 机制校验） | ✅ | `packages/aimo/verifier` |
| M1.5 Python 容器运行时 | ✅ | `packages/aimo/code-runtime-docker` |
| M2 任务 DAG + 持久化 | ✅ | agent-team task board |
| M3 1 coordinator + 3~8 子 agent | ✅ | `eval/phase2-livecheck-summary.txt`（3/3） |
| 角色工具硬裁剪 / 池调度 / 父任务 fold / 成果分享 | ✅ | `eval/{team-roles,pool,fold,share}-toolcheck.log` |
| M4 提交即校验（Lean） | ⏳ 未实现 | 计划见 `project/docs/Lean_Verification_Plan.md` |
| Phase 4 三配置对照评测 | ⏳ 进行中 | `eval/phase4-*.json`、`eval/phase4-pilot-report.md` |

**核心结论（`project/docs/Gap_Analysis.md`）**：瓶颈不在协作基础设施，而在**缺一个强验收器**。
整数答案题的可判定验收只有 L0 格式/范围，太弱，因此多 agent 团队必然退化成"采样 + 聚合"——
Phase 4 试点里团队配置在可解题上**没有正确率收益，却付出 6–11× token**，这是结构性必然，不是调参问题。
唯一实质杠杆是把 Lean 用在**中间子任务推导的验收**（`submit_task` 的 `lean` 字段）。

### 口径纪律（避免自欺）

- **"编译通过 ≠ 定理成立"**、**"已验证 ≠ 已解决"**。
- 团队解出的题若用了 `web_search` 检索公开解答，其"解对"含检索成分；A/B/C 组工具面一致故对照公平，但纯推理对照需禁 web 工具重跑。
- token 不计入判据（2026-09-27 定），能力与墙钟优先——但团队要证明价值，须**更快或更稳**，而非仅解出。

---

## 同步 / 合并上游

`harness/` 是 DSH 的 **vendored 快照，不是 fork**（无 `.git`、无上游历史）。因此：

- **从工坊实例同步**（日常迭代的主要路径）：

  ```sh
  ./scripts/sync-from-workshop.sh          # 默认读 ../DeepSeek_Harness/deepseek-harness-aimo 与 ../AIMO
  ./scripts/sync-from-workshop.sh --check  # 只预览差异，不写入
  ```

  脚本会同步 5 个插件源码、`tsconfig.base.json` / `tsconfig.host.json` / `pnpm-lock.yaml`、
  `project/docs/`、`project/research/`、`eval/`，并剔除构建产物与 `.github/`。

- **合并 DSH 上游新版**：把本仓库当工作树，手工把上游对应版本的改动套进来，然后
  `cd harness && pnpm install && pnpm run build && pnpm run typecheck`，再跑一次冷启动验收。
  快照版本记录在 `harness/package.json` 的 `version`（当前 `0.1.1-rc.2`，对应上游提交 `b150a551b8`）。

- **`harness/.github/` 已从本仓库剔除**（上游 CI / issue 管理 / 文档站点工作流，与本地重建无关）。
  副作用只有一处：`pnpm run test:issue-management` 会失败（它直接指向 `.github/issue-management/policy.test.mjs`）。
  其余上游脚本均不读 `.github`（已逐个核对）。

- **上游发布门禁不适用于本仓库**：`pnpm run constraints` **必然失败**（实测，工坊实例与全新 clone 一致）。
  原因是这些包是 private 工坊包，与"可发布成员"规则天然冲突：
  `private: true`、缺 `publishConfig.access: "public"`、且 `peerDependencies` 指向 `experimental` 包；
  另外 `verifier` / `team-roles` / `pool` 的版本按角色包独立演进（`0.2.0-rc.0` / `0.1.0-rc.0`）而根包是 `0.1.1-rc.2`。
  这些在打包前的快照上同样成立——本次未改动的 `python`、`code-runtime-docker` 也报同样的错。
  `hygiene` / `doc-sync` 同理面向上游 CI，都不是本仓库的验收路径。

- **本仓库的验收路径**：`./scripts/verify-cold-clone.sh`
  （`pnpm install --frozen-lockfile` → `build` → `typecheck` → `--dump-config` 断言 code-runtime 已禁用、5 个插件各挂载 1 次）。

## 推送到远程

本仓库目前**没有 remote**（只有本地历史）。要发布：

```sh
git remote add origin git@github.com:<you>/aimo-solver.git   # 建议私有仓库
git push -u origin main
```

- **凭据不入库**：API key 只存在于 `$DSH_HOME/.credentials.yaml`（已被 `.gitignore` 排除）。
- 首次 push 体积：`.git` 约 19 MB、工作树约 89 MB、8025 个文件（`harness/` 是完整 DSH 源码快照）。
  若嫌大，可改走"上游 clone + 补丁"的形态（见上一节的取舍说明）。
- 发布前的可信验收：`./scripts/verify-cold-clone.sh`
  （clone → `pnpm install --frozen-lockfile` → `build` → `typecheck` → `--dump-config` 断言 5 个插件挂载）。

## 已知限制

- **验收器只判定格式与范围，从不判定数学正确性**（确定性纯函数，不做 LLM judge）。正确性目前由子 agent 自证 + 评测 ground truth 兜底，未来交给 Lean。
- 角色隔离是**代码层 deny 工具面 + prompt 层纪律**的组合；`submit_task` 不验证成果对错。
- Lean（T2）只留接口（`lean` 字段、预留 `submit_proof` 工具名），未接线。
- 评测的模型采样由 API 决定，pass@k 是"尽力可复现"而非逐位可复现。

## 文档路径映射

文档正文写于打包之前，其中的旧路径对应关系如下：

| 正文里的路径 | 本仓库位置 |
|---|---|
| `MyProject/*.md` | `project/docs/` |
| `MyProject/eval/` | `eval/` |
| `MyProject/docker/` | `project/docker/` |
| `MyProject/archive/verifier-v0/` | `archive/verifier-v0/` |
| `Related_Works/*` | `project/research/` |
| 工坊实例的 `deepseek-harness-aimo/work/` | `eval/notes/aimo3-ref-02/` |

文档正文为保持原始记录未改写；与当前实现的差异以 `project/docs/README.md` 的状态表为准。

## 许可

本项目代码 MIT（见 `LICENSE`）。`harness/` 内的 DSH 源码为 MIT（`harness/LICENSE`）。
第三方研究资料与题集的来源与许可见 `THIRD_PARTY.md`。
